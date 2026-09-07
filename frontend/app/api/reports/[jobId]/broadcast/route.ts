import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { broadcastReportSchema } from "@/lib/validations";
import { sendEmail } from "@/lib/agentmail";
import { buildReportEmail } from "@/lib/report-email";
import {
  getActiveSubscribers,
  buildUnsubscribeUrl,
  isNewsletterAdmin,
  GLOBAL_NEWSLETTER_OWNER_ID,
} from "@/lib/subscribers";
import { rateLimit } from "@/lib/rate-limit";
import { errorResponse, serverError } from "@/lib/api-utils";
import { getServiceIdentity } from "@/lib/service-auth";

export const runtime = "nodejs";

// Broadcasts fan one report out to an owner's entire active subscriber list, so
// they're heavier than a single send. Tighter per-user budget accordingly.
const PER_USER_LIMIT = 5;
// Dry runs are cheap and read-only, so they get a looser, separate budget.
const DRY_RUN_LIMIT = 20;
const WINDOW_MS = 10 * 60 * 1000;

const APP_URL = (
  process.env.NEXT_PUBLIC_APP_URL || "https://deep-research.intelliforge.tech"
)
  .trim()
  .replace(/<[^>]*>/g, "")
  .replace(/\/$/, "");

interface RouteContext {
  params: { jobId: string };
}

export async function POST(req: Request, { params }: RouteContext) {
  try {
    // Two ways in: a browser session cookie, or a service token presented by
    // the MCP connector (scheduled jobs cannot hold a cookie). The service
    // path grants one fixed operator identity, never an arbitrary user.
    const service = getServiceIdentity(req);
    const session = service ?? (await getSession());
    if (!session?.sub) {
      return errorResponse("Sign in to broadcast research reports.", 401);
    }
    // A service token is already the operator, so the admin allowlist applies
    // only to interactive sessions.
    if (!service && !isNewsletterAdmin(session.email)) {
      return errorResponse(
        "You don't have access to broadcast to the newsletter list.",
        403,
      );
    }

    const jobId = (params.jobId ?? "").trim();
    if (!jobId || jobId.length > 64) {
      return errorResponse("Invalid report id.", 400);
    }

    const body = await req.json().catch(() => null);
    const parsed = broadcastReportSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(
        parsed.error.issues[0]?.message ?? "Invalid input",
        400,
      );
    }
    const { note, dryRun } = parsed.data;

    // Per-user rate limit only — broadcasts are owner-scoped and already gated
    // by the small subscriber list, so a per-IP guard adds little here.
    //
    // Dry runs get their own bucket. They send no mail, but they do hit the
    // database, so they are still capped — just not out of the send budget. A
    // model looping dry runs must not be able to 429 the real send that
    // follows it.
    const limitKey = dryRun
      ? `broadcast:dryrun:${session.sub}`
      : `broadcast:user:${session.sub}`;
    const limitMax = dryRun ? DRY_RUN_LIMIT : PER_USER_LIMIT;
    if (!rateLimit(limitKey, limitMax, WINDOW_MS)) {
      return errorResponse(
        dryRun
          ? "Too many broadcast previews. Try again in a few minutes."
          : "You've hit the broadcast limit. Try again in a few minutes.",
        429,
      );
    }

    // Load report. SQLAlchemy owns writes — we only read here.
    const report = await prisma.researchResult.findUnique({
      where: { jobId },
      select: {
        jobId: true,
        query: true,
        status: true,
        result: true,
        userId: true,
      },
    });

    if (!report) {
      return errorResponse("Report not found.", 404);
    }

    const isReady =
      report.status === "success" ||
      report.status === "complete" ||
      report.status === "completed";
    if (!isReady) {
      return errorResponse(
        report.status === "error"
          ? "This report failed to generate, so there's nothing to broadcast."
          : `Report is not ready yet (status: ${report.status}). Try again once the run finishes.`,
        409,
      );
    }

    // Authorization: the broadcasting user must own the report. Anonymous
    // (userId is null) reports are broadcastable by the signed-in viewer
    // ("if you can see it you can share it"), but a report owned by a
    // *different* user can never be broadcast.
    if (report.userId && report.userId !== session.sub) {
      return errorResponse(
        "You can only broadcast reports from your own account.",
        403,
      );
    }

    const resultObj = (report.result ?? {}) as Record<string, unknown>;
    const reportMarkdown =
      typeof resultObj.report === "string" ? (resultObj.report as string) : "";
    if (!reportMarkdown.trim()) {
      return errorResponse(
        "This report has no markdown body to broadcast.",
        422,
      );
    }

    const subscribers = await getActiveSubscribers(GLOBAL_NEWSLETTER_OWNER_ID);
    if (subscribers.length === 0) {
      return errorResponse(
        "The newsletter has no active subscribers yet. Add some on the Audience page.",
        400,
      );
    }

    // Idempotency. Sending email cannot be undone, and an unattended caller
    // (a retried scheduled run, a model that calls the tool twice) must not be
    // able to mail the list again. One successful broadcast per report, ever.
    // Checked for every caller, not just service tokens — a double-click in
    // the UI is the same mistake.
    const priorBroadcast = await prisma.broadcast.findFirst({
      where: { jobId, status: { in: ["sent", "partial"] } },
      select: { id: true, createdAt: true, sentCount: true },
      orderBy: { createdAt: "desc" },
    });
    if (priorBroadcast) {
      return NextResponse.json(
        {
          ok: false,
          error: "already_broadcast",
          message:
            `This report was already broadcast to ${priorBroadcast.sentCount} ` +
            `subscribers on ${priorBroadcast.createdAt.toISOString()}. ` +
            `Reports can only be broadcast once.`,
          broadcastAt: priorBroadcast.createdAt.toISOString(),
          sentCount: priorBroadcast.sentCount,
        },
        { status: 409 },
      );
    }

    // Dry run: report exactly what a real send would do, and send nothing.
    // This is what an agent calls before asking for confirmation.
    if (dryRun) {
      return NextResponse.json({
        ok: true,
        dryRun: true,
        recipientCount: subscribers.length,
        query: report.query,
        message:
          `Would send "${report.query}" to ${subscribers.length} active ` +
          `subscriber(s). Nothing was sent. Call again with confirm to send.`,
      });
    }

    const shareUrl = `${APP_URL}/r/${encodeURIComponent(jobId)}`;
    const senderName = session.name || session.email || "A Chronicle user";
    const senderEmail = session.email || "noreply@intelliforge.tech";

    // Subject is identical for every recipient, so capture it from the first
    // built email and reuse for the audit row.
    let subject = "";
    let sentCount = 0;

    // Send sequentially — subscriber lists are small and we'd rather not hammer
    // the provider with a burst of parallel sends.
    for (const sub of subscribers) {
      const built = buildReportEmail({
        query: report.query,
        reportMarkdown,
        shareUrl,
        jobId,
        senderName,
        senderEmail,
        note,
        unsubscribeUrl: buildUnsubscribeUrl(sub.unsubscribeToken),
      });
      if (!subject) subject = built.subject;

      const ok = await sendEmail({
        to: sub.email,
        subject: built.subject,
        html: built.html,
        text: built.text,
      });
      if (ok) sentCount += 1;
    }

    // Audit row. Chronicle owns the Broadcast table outright (unlike the
    // read-only ResearchResult), so it's safe to write here.
    await prisma.broadcast.create({
      data: {
        ownerId: session.sub,
        jobId,
        subject,
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
      message: `Briefing sent to ${sentCount} of ${subscribers.length} subscribers.`,
    });
  } catch (err) {
    return serverError(err, "POST /api/reports/:jobId/broadcast");
  }
}
