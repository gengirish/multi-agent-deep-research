import { unsubscribeByToken } from "@/lib/subscribers";
import { escapeHtml } from "@/lib/html-escape";
import { noticeResponse } from "@/lib/notice-page";
import { serverError } from "@/lib/api-utils";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const token = new URL(req.url).searchParams.get("token") ?? "";
    const email = await unsubscribeByToken(token);

    if (email) {
      return noticeResponse({
        title: "Unsubscribed",
        heading: "You're unsubscribed",
        bodyHtml: `
          <p style="margin:0 0 12px;"><strong style="color:#0f172a;">${escapeHtml(email)}</strong> has been removed from this list.</p>
          <p style="margin:0;color:#64748b;">You won't receive any further briefings at this address.</p>
        `,
      });
    }

    // Don't confirm or deny that a token exists — just show a soft message.
    return noticeResponse({
      title: "Link expired",
      heading: "This link is no longer valid",
      bodyHtml: `
        <p style="margin:0;color:#64748b;">This unsubscribe link is no longer valid. If you're still receiving briefings you'd rather not get, use the unsubscribe link in the most recent email.</p>
      `,
    });
  } catch (err) {
    return serverError(err, "GET /api/unsubscribe");
  }
}
