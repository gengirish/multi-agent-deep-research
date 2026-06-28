import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { sendReportSchema } from "@/lib/validations";
import { sendEmail } from "@/lib/agentmail";
import { buildReportEmail } from "@/lib/report-email";
import { rateLimit } from "@/lib/rate-limit";
import { errorResponse, serverError, getClientIp } from "@/lib/api-utils";

export const runtime = "nodejs";

// Two-tier rate limit:
//   per-user — 10 sends / 5 minutes (protects against an abusive signed-in user)
//   per-IP   — 30 sends / 5 minutes (catches multiple accounts behind one IP)
const PER_USER_LIMIT = 10;
const PER_IP_LIMIT = 30;
const WINDOW_MS = 5 * 60 * 1000;

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
    const session = await getSession();
    if (!session?.sub) {
      return errorResponse(
        "Sign in to email research reports.",
        401,
      );
    }

    const jobId = (params.jobId ?? "").trim();
    if (!jobId || jobId.length > 64) {
      return errorResponse("Invalid report id.", 400);
    }

    const body = await req.json().catch(() => null);
    const parsed = sendReportSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(
        parsed.error.issues[0]?.message ?? "Invalid input",
        400,
      );
    }
    const { to, note } = parsed.data;

    // Rate limits — return 429 so the dialog can surface "slow down" instead
    // of pretending the send happened.
    const ip = getClientIp(req);
    if (!rateLimit(`sendreport:user:${session.sub}`, PER_USER_LIMIT, WINDOW_MS)) {
      return errorResponse(
        "You've hit the send limit. Try again in a few minutes.",
        429,
      );
    }
    if (!rateLimit(`sendreport:ip:${ip}`, PER_IP_LIMIT, WINDOW_MS)) {
      return errorResponse("Rate limit exceeded.", 429);
    }

    // Load report. The ResearchResult model is declared in schema.prisma but
    // SQLAlchemy owns writes — we only read here.
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
    // SQLAlchemy writes "success" on completion, "error" on failure, and
    // "running"/"queued" while in flight. Accept "success" or any legacy
    // "complete*" string so the route survives a future rename.
    const isReady =
      report.status === "success" ||
      report.status === "complete" ||
      report.status === "completed";
    if (!isReady) {
      return errorResponse(
        report.status === "error"
          ? "This report failed to generate, so there's nothing to email."
          : `Report is not ready yet (status: ${report.status}). Try again once the run finishes.`,
        409,
      );
    }

    // Authorization: owner OR anonymous-public report. Anonymous (userId is
    // null) reports are already publicly viewable via /r/[id], so a signed-in
    // user being able to email them mirrors the "if you can see it, you can
    // share it" model. Reports owned by a *different* user are private.
    if (report.userId && report.userId !== session.sub) {
      return errorResponse(
        "You can only email reports from your own account.",
        403,
      );
    }

    // The report JSONB shape from the LangGraph pipeline: { report: string, ... }
    const resultObj = (report.result ?? {}) as Record<string, unknown>;
    const reportMarkdown =
      typeof resultObj.report === "string" ? (resultObj.report as string) : "";
    if (!reportMarkdown.trim()) {
      return errorResponse(
        "This report has no markdown body to send.",
        422,
      );
    }

    const shareUrl = `${APP_URL}/r/${encodeURIComponent(jobId)}`;
    const senderName = session.name || session.email || "A Chronicle user";
    const senderEmail = session.email || "noreply@intelliforge.tech";

    const { subject, html, text } = buildReportEmail({
      query: report.query,
      reportMarkdown,
      shareUrl,
      jobId,
      senderName,
      senderEmail,
      note,
    });

    const sent = await sendEmail({ to, subject, html, text });
    if (!sent) {
      // AgentMail not configured or send failed. Log + tell the user, but
      // don't 500 — they can copy the share link manually.
      // eslint-disable-next-line no-console
      console.warn(
        `[sendreport] AgentMail send failed jobId=${jobId} to=${to} user=${session.sub}`,
      );
      return errorResponse(
        "We couldn't send the email right now. Try again, or copy the share link to send manually.",
        502,
      );
    }

    return NextResponse.json({
      ok: true,
      message: `Report sent to ${to}.`,
    });
  } catch (err) {
    return serverError(err, "POST /api/reports/:jobId/email");
  }
}
