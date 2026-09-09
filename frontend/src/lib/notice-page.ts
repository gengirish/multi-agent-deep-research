/**
 * Standalone HTML shell for the pages a *recipient* lands on from an email —
 * unsubscribe confirmations and double opt-in confirmations.
 *
 * These are plain route-handler responses rather than React pages on purpose:
 * they are reached by a redirect out of a mail client, often with no session
 * and sometimes in an in-app browser, so they must render with zero JS, zero
 * hydration and no external stylesheet. All CSS is inline for that reason.
 *
 * Light-only by design. This is the same decision as `report-email.ts`: the
 * page is an extension of the email that produced it, and a light surface
 * survives client/browser dark-mode inversion far more gracefully.
 */

import { escapeHtml } from "./html-escape";

const BRAND = "Chronicle";

const APP_URL = (
  process.env.NEXT_PUBLIC_APP_URL || "https://deep-research.intelliforge.tech"
)
  .trim()
  .replace(/<[^>]*>/g, "")
  .replace(/\/$/, "");

export interface NoticePageOptions {
  /** Browser tab title, e.g. "Unsubscribed". */
  title: string;
  heading: string;
  /** Pre-escaped HTML for the body copy. Callers MUST escape interpolations. */
  bodyHtml: string;
  ctaHref?: string;
  ctaLabel?: string;
}

export function renderNoticePage({
  title,
  heading,
  bodyHtml,
  ctaHref,
  ctaLabel,
}: NoticePageOptions): string {
  const href = ctaHref ?? APP_URL;
  const label = ctaLabel ?? `Go to ${BRAND}`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="robots" content="noindex" />
<title>${escapeHtml(title)} · ${escapeHtml(BRAND)}</title>
</head>
<body style="margin:0;padding:0;background:#eef2f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
  <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:32px 16px;box-sizing:border-box;">
    <div style="width:100%;max-width:480px;background:#ffffff;border:1px solid #dbe2ea;border-radius:16px;padding:40px 36px;text-align:center;box-shadow:0 1px 3px rgba(15,23,42,0.06);">
      <div style="font-size:14px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:#0369a1;">${escapeHtml(BRAND)}</div>
      <h1 style="margin:18px 0 12px;font-size:22px;line-height:1.3;font-weight:700;color:#0f172a;">${escapeHtml(heading)}</h1>
      <div style="font-size:15px;line-height:1.6;color:#334155;">
        ${bodyHtml}
      </div>
      <div style="margin-top:28px;">
        <a href="${escapeHtml(href)}" style="display:inline-block;font-size:14px;font-weight:600;color:#0369a1;text-decoration:none;">${escapeHtml(label)} &rarr;</a>
      </div>
    </div>
  </div>
</body>
</html>`;
}

/** Route-handler response wrapper for a notice page. */
export function noticeResponse(options: NoticePageOptions): Response {
  return new Response(renderNoticePage(options), {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // These pages are per-token and must never be cached by a CDN.
      "Cache-Control": "no-store",
    },
  });
}

export { APP_URL as NOTICE_APP_URL, BRAND as NOTICE_BRAND };
