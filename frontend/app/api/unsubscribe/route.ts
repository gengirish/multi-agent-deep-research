import { NextResponse } from "next/server";
import { unsubscribeByToken } from "@/lib/subscribers";
import { escapeHtml } from "@/lib/html-escape";
import { serverError } from "@/lib/api-utils";

export const runtime = "nodejs";

const APP_URL = (
  process.env.NEXT_PUBLIC_APP_URL || "https://deep-research.intelliforge.tech"
)
  .trim()
  .replace(/<[^>]*>/g, "")
  .replace(/\/$/, "");

const BRAND = "Chronicle";

// Single light/editorial confirmation shell. Inline CSS only — this page is
// hit from an email client redirect, so keep it self-contained.
function unsubscribePage({
  heading,
  bodyHtml,
}: {
  heading: string;
  bodyHtml: string;
}): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Unsubscribed · ${escapeHtml(BRAND)}</title>
</head>
<body style="margin:0;padding:0;background:#eef2f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
  <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:32px 16px;box-sizing:border-box;">
    <div style="width:100%;max-width:480px;background:#ffffff;border:1px solid #dbe2ea;border-radius:16px;padding:40px 36px;text-align:center;box-shadow:0 1px 3px rgba(15,23,42,0.06);">
      <div style="font-size:14px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:#0369a1;">${escapeHtml(BRAND)}</div>
      <h1 style="margin:18px 0 12px;font-size:22px;line-height:1.3;font-weight:700;color:#0f172a;">${heading}</h1>
      <div style="font-size:15px;line-height:1.6;color:#334155;">
        ${bodyHtml}
      </div>
      <div style="margin-top:28px;">
        <a href="${escapeHtml(APP_URL)}" style="display:inline-block;font-size:14px;font-weight:600;color:#0369a1;text-decoration:none;">Go to ${escapeHtml(BRAND)} →</a>
      </div>
    </div>
  </div>
</body>
</html>`;
}

export async function GET(req: Request) {
  try {
    const token = new URL(req.url).searchParams.get("token") ?? "";
    const email = await unsubscribeByToken(token);

    let html: string;
    if (email) {
      html = unsubscribePage({
        heading: "You're unsubscribed",
        bodyHtml: `
          <p style="margin:0 0 12px;"><strong style="color:#0f172a;">${escapeHtml(email)}</strong> has been removed from this list.</p>
          <p style="margin:0;color:#64748b;">You won't receive any further briefings at this address.</p>
        `,
      });
    } else {
      // Don't confirm or deny that a token exists — just show a soft message.
      html = unsubscribePage({
        heading: "This link is no longer valid",
        bodyHtml: `
          <p style="margin:0;color:#64748b;">This unsubscribe link is no longer valid. If you're still receiving briefings you'd rather not get, use the unsubscribe link in the most recent email.</p>
        `,
      });
    }

    return new NextResponse(html, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (err) {
    return serverError(err, "GET /api/unsubscribe");
  }
}
