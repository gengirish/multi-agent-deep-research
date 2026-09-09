import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { newsletterBroadcastSchema } from "@/lib/validations";
import { sendEmail } from "@/lib/agentmail";
import { injectUnsubscribeFooter } from "@/lib/briefing-email";
import {
  getActiveSubscribers,
  buildUnsubscribeUrl,
  isNewsletterAdmin,
  normalizeTag,
  GLOBAL_NEWSLETTER_OWNER_ID,
} from "@/lib/subscribers";
import { rateLimit } from "@/lib/rate-limit";
import { errorResponse, serverError } from "@/lib/api-utils";
import { getServiceIdentity } from "@/lib/service-auth";

export const runtime = "nodejs";

// Same budgets as the report broadcast: a send fans out to the whole list, so
// it gets a tight allowance, while read-only dry runs get their own looser
// bucket so a model looping previews can't 429 the send that follows.
const PER_USER_LIMIT = 5;
const DRY_RUN_LIMIT = 20;
const WINDOW_MS = 10 * 60 * 1000;

/**
 * POST /api/newsletter/broadcast
 *
 * Sends an arbitrary, externally-composed briefing (the daily "IntelliForge
 * Morning Briefing") to the newsletter list. The sibling route,
 * /api/reports/[jobId]/broadcast, renders a Chronicle research report from the
 * database; this one takes the finished HTML from the caller, which is what a
 * scheduled job outside Chronicle needs.
 *
 * Everything else — auth, segmenting, send-once, the audit row, per-recipient
 * unsubscribe links — is the same machinery, deliberately.
 */
export async function POST(req: Request) {
  try {
    // Two ways in: a browser session cookie, or a service token presented by
    // the scheduled job (which cannot hold a cookie). The service path grants
    // one fixed operator identity, never an arbitrary user.
    const service = getServiceIdentity(req);
    const session = service ?? (await getSession());
    if (!session?.sub) {
      return errorResponse("Sign in to broadcast to the newsletter.", 401);
    }
    // A service token is already the operator, so the admin allowlist applies
    // only to interactive sessions.
    if (!service && !isNewsletterAdmin(session.email)) {
      return errorResponse(
        "You don't have access to broadcast to the newsletter list.",
        403,
      );
    }

    const body = await req.json().catch(() => null);
    const parsed = newsletterBroadcastSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(
        parsed.error.issues[0]?.message ?? "Invalid input",
        400,
      );
    }
    const { subject, html, text, dryRun, dedupeKey } = parsed.data;
    // "" (no segment) means the whole list. Normalized here so the value used
    // for filtering is byte-identical to the one recorded on the audit row —
    // the send-once check below compares against it.
    const segment = parsed.data.segment ? normalizeTag(parsed.data.segment) : "";
    const audience = segment ? `segment "${segment}"` : "the whole list";

    const limitKey = dryRun
      ? `newsletter-broadcast:dryrun:${session.sub}`
      : `newsletter-broadcast:user:${session.sub}`;
    const limitMax = dryRun ? DRY_RUN_LIMIT : PER_USER_LIMIT;
    if (!rateLimit(limitKey, limitMax, WINDOW_MS)) {
      return errorResponse(
        dryRun
          ? "Too many broadcast previews. Try again in a few minutes."
          : "You've hit the broadcast limit. Try again in a few minutes.",
        429,
      );
    }

    const subscribers = await getActiveSubscribers(GLOBAL_NEWSLETTER_OWNER_ID, {
      segment,
    });
    if (subscribers.length === 0) {
      return errorResponse(
        segment
          ? `No confirmed subscribers are tagged "${segment}". Tag some on the Audience page, or broadcast to the whole list.`
          : "The newsletter has no confirmed subscribers yet. Add some on the Audience page.",
        400,
      );
    }

    // Idempotency. Sending email cannot be undone, and an unattended caller (a
    // retried scheduled run, a job that fires twice) must not be able to mail
    // the list again. There is no report id here, so the caller's dedupeKey is
    // the send-once identity and is stored in Broadcast.jobId — the same column
    // the report route keys on, so one audit table covers both kinds of send.
    // Scoped by segment: the same issue may legitimately go to `investors`
    // today and `beta` next week, but never twice to the same audience.
    const priorBroadcast = await prisma.broadcast.findFirst({
      where: {
        jobId: dedupeKey,
        segment: segment || null,
        status: { in: ["sent", "partial"] },
      },
      select: { id: true, createdAt: true, sentCount: true },
      orderBy: { createdAt: "desc" },
    });
    if (priorBroadcast) {
      return NextResponse.json(
        {
          ok: false,
          error: "already_broadcast",
          message:
            `This briefing was already broadcast to ${priorBroadcast.sentCount} ` +
            `subscribers in ${audience} on ${priorBroadcast.createdAt.toISOString()}. ` +
            `Each dedupeKey can only be broadcast once per audience.`,
          broadcastAt: priorBroadcast.createdAt.toISOString(),
          sentCount: priorBroadcast.sentCount,
        },
        { status: 409 },
      );
    }

    // Dry run: report exactly what a real send would do, and send nothing.
    // This is what the scheduled job calls before committing to the send.
    if (dryRun) {
      return NextResponse.json({
        ok: true,
        dryRun: true,
        recipientCount: subscribers.length,
        segment: segment || null,
        message:
          `Would send "${subject}" to ${subscribers.length} confirmed ` +
          `subscriber(s) in ${audience}. Nothing was sent. Call again with ` +
          `dryRun false to send.`,
      });
    }

    let sentCount = 0;

    // Send sequentially — subscriber lists are small and we'd rather not hammer
    // the provider with a burst of parallel sends. Each recipient gets their
    // own unsubscribe link stamped into the body.
    for (const sub of subscribers) {
      const personalized = injectUnsubscribeFooter({
        html,
        text,
        unsubscribeUrl: buildUnsubscribeUrl(sub.unsubscribeToken),
      });

      const ok = await sendEmail({
        to: sub.email,
        subject,
        html: personalized.html,
        text: personalized.text,
      });
      if (ok) sentCount += 1;
    }

    // Audit row. Chronicle owns the Broadcast table outright (unlike the
    // read-only ResearchResult), so it's safe to write here.
    await prisma.broadcast.create({
      data: {
        ownerId: session.sub,
        jobId: dedupeKey,
        subject,
        segment: segment || null,
        recipientCount: subscribers.length,
        sentCount,
        status:
          sentCount === subscribers.length
            ? "sent"
            : sentCount === 0
              ? "failed"
              : "partial",
      },
    });

    if (sentCount === 0) {
      return errorResponse(
        "We couldn't send to any subscribers right now. Try again shortly.",
        502,
      );
    }

    return NextResponse.json({
      ok: true,
      sentCount,
      recipientCount: subscribers.length,
      segment: segment || null,
      message: `Briefing sent to ${sentCount} of ${subscribers.length} subscribers in ${audience}.`,
    });
  } catch (err) {
    return serverError(err, "POST /api/newsletter/broadcast");
  }
}
