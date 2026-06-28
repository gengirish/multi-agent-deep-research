/**
 * Builds the HTML body for the "send research report" email.
 *
 * The shell here intentionally mirrors the auth emails (auth-email.ts) — same
 * brand block, same dark surface, same footer. Inlined CSS only.
 *
 * Email-client constraints worth knowing:
 *   - Outlook ignores <style> and most modern layout (flex/grid). All layout
 *     uses tables + inline styles.
 *   - Dark-mode auto-invert (iOS Mail, Outlook on Mac) can mangle a dark
 *     palette. The body explicitly declares `color-scheme: dark` and uses
 *     `!important` on key surfaces so most clients leave it alone.
 *   - Gmail clips messages over ~102KB. We trim very long reports below.
 */

import { escapeHtml } from "./html-escape";
import { renderMarkdownToHtml } from "./markdown";

const BRAND = "Chronicle";
const BRAND_TAGLINE = "AI research copilot for founders";
const APP_URL = (
  process.env.NEXT_PUBLIC_APP_URL || "https://deep-research.intelliforge.tech"
)
  .trim()
  .replace(/<[^>]*>/g, "");

// Gmail clips messages above ~102KB. Keep the rendered report well under that
// so the recipient sees the whole thing inline. The "View full report" CTA
// always points back to the Chronicle viewer for the un-clipped version.
const MAX_REPORT_CHARS = 60_000;

export interface BuildReportEmailInput {
  query: string;
  reportMarkdown: string;
  shareUrl: string;
  jobId: string;
  senderName: string;
  senderEmail: string;
  note?: string;
}

export interface BuildReportEmailOutput {
  subject: string;
  html: string;
  text: string;
  preheader: string;
}

function truncateMarkdown(md: string): { md: string; truncated: boolean } {
  if (md.length <= MAX_REPORT_CHARS) {
    return { md, truncated: false };
  }
  // Truncate at the previous newline boundary so we don't cut mid-sentence.
  const slice = md.slice(0, MAX_REPORT_CHARS);
  const lastBreak = slice.lastIndexOf("\n\n");
  return {
    md: lastBreak > MAX_REPORT_CHARS * 0.7 ? slice.slice(0, lastBreak) : slice,
    truncated: true,
  };
}

export function buildReportEmail(
  input: BuildReportEmailInput,
): BuildReportEmailOutput {
  const queryShort = input.query.length > 80
    ? input.query.slice(0, 77) + "…"
    : input.query;
  const subject = `${BRAND} research: ${queryShort}`;

  const { md, truncated } = truncateMarkdown(input.reportMarkdown);
  const reportHtml = renderMarkdownToHtml(md);

  const truncatedNoticeHtml = truncated
    ? `<p style="margin:0 0 16px;padding:12px 14px;background:#1a1f25;border-left:3px solid #d97757;border-radius:6px;font-size:13px;color:#cfd3d8;">
         This email shows the first part of the report. <a href="${escapeHtml(input.shareUrl)}" style="color:#9aa3ad;text-decoration:underline;">Open the full version on Chronicle</a> for charts, every source, and the full reasoning trail.
       </p>`
    : "";

  const noteHtml = input.note
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 24px;">
         <tr>
           <td style="padding:14px 16px;background:#16191e;border:1px solid #1f242b;border-radius:10px;">
             <div style="font-size:12px;color:#8a939c;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:6px;">
               Note from ${escapeHtml(input.senderName)}
             </div>
             <div style="font-size:14px;color:#e6e8eb;line-height:1.55;white-space:pre-wrap;">
               ${escapeHtml(input.note)}
             </div>
           </td>
         </tr>
       </table>`
    : "";

  const preheader = input.note
    ? `${input.senderName} sent you a Chronicle research report.`
    : `Research report from Chronicle: "${queryShort}"`;

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="dark" />
<meta name="supported-color-schemes" content="dark light" />
<title>${escapeHtml(BRAND)} research report</title>
<style>
  /* Scoped report typography — inlined defaults below catch clients that strip <style>. */
  .chronicle-report h1, .chronicle-report h2, .chronicle-report h3,
  .chronicle-report h4, .chronicle-report h5 {
    color: #fafafa; margin: 24px 0 10px; line-height: 1.25; font-weight: 700;
  }
  .chronicle-report h1 { font-size: 22px; }
  .chronicle-report h2 { font-size: 18px; }
  .chronicle-report h3 { font-size: 16px; }
  .chronicle-report p  { margin: 0 0 14px; color: #cfd3d8; }
  .chronicle-report a  { color: #9aa3ad; text-decoration: underline; }
  .chronicle-report ul, .chronicle-report ol { margin: 0 0 14px; padding-left: 22px; color: #cfd3d8; }
  .chronicle-report li { margin: 0 0 6px; }
  .chronicle-report strong { color: #fafafa; }
  .chronicle-report blockquote {
    margin: 14px 0; padding: 8px 14px; border-left: 3px solid #2a3037;
    background: #161a1f; color: #cfd3d8;
  }
  .chronicle-report code {
    background: #1a1f25; padding: 2px 5px; border-radius: 4px;
    font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 13px;
  }
  .chronicle-report pre {
    background: #0f1216; padding: 12px 14px; border-radius: 8px; overflow-x: auto;
    border: 1px solid #1f242b; margin: 0 0 14px;
  }
  .chronicle-report table {
    border-collapse: collapse; width: 100%; margin: 0 0 14px;
    font-size: 13px; color: #cfd3d8;
  }
  .chronicle-report th, .chronicle-report td {
    border: 1px solid #1f242b; padding: 8px 10px; text-align: left;
  }
  .chronicle-report th { background: #16191e; color: #fafafa; }
  .chronicle-report hr { border: 0; border-top: 1px solid #1f242b; margin: 18px 0; }
</style>
</head>
<body style="margin:0;padding:0;background:#0b0d10;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#e6e8eb;">
<span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;mso-hide:all;">${escapeHtml(preheader)}</span>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#0b0d10;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="640" style="max-width:640px;background:#121519;border:1px solid #1f242b;border-radius:16px;overflow:hidden;">
        <tr>
          <td style="padding:24px 32px;border-bottom:1px solid #1f242b;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td style="vertical-align:middle;">
                  <div style="font-size:18px;font-weight:700;letter-spacing:-0.01em;color:#fafafa;">${escapeHtml(BRAND)}</div>
                  <div style="font-size:12px;color:#8a939c;margin-top:2px;">${escapeHtml(BRAND_TAGLINE)}</div>
                </td>
                <td align="right" style="vertical-align:middle;">
                  <a href="${escapeHtml(input.shareUrl)}" style="display:inline-block;padding:8px 14px;font-size:12px;font-weight:600;color:#0b0d10;background:#e6e8eb;text-decoration:none;border-radius:6px;">Open in Chronicle</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 32px 0;">
            <div style="font-size:12px;color:#8a939c;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;">Research query</div>
            <div style="font-size:18px;font-weight:600;color:#fafafa;line-height:1.4;margin-bottom:22px;">
              ${escapeHtml(input.query)}
            </div>
            ${noteHtml}
            ${truncatedNoticeHtml}
          </td>
        </tr>
        <tr>
          <td class="chronicle-report" style="padding:0 32px 8px;font-size:14px;line-height:1.65;color:#cfd3d8;">
            ${reportHtml}
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px 28px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 0;">
              <tr>
                <td bgcolor="#e6e8eb" style="border-radius:8px;">
                  <a href="${escapeHtml(input.shareUrl)}" style="display:inline-block;padding:12px 22px;font-size:14px;font-weight:600;color:#0b0d10;text-decoration:none;border-radius:8px;">View full report on Chronicle</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:18px 32px;border-top:1px solid #1f242b;font-size:12px;color:#6b7480;line-height:1.55;">
            Sent by <strong style="color:#9aa3ad;font-weight:600;">${escapeHtml(input.senderName)}</strong> &lt;${escapeHtml(input.senderEmail)}&gt; from their Chronicle account. If this looks like spam, reply and we'll investigate — every send is rate-limited and tied to a verified Chronicle user.
          </td>
        </tr>
      </table>
      <div style="font-size:11px;color:#4a525a;margin-top:16px;">
        Chronicle by IntelliForge AI · Hyderabad, India
      </div>
    </td>
  </tr>
</table>
</body>
</html>`;

  const text =
    `${BRAND} — research report\n` +
    `Query: ${input.query}\n` +
    (input.note ? `\nNote from ${input.senderName}:\n${input.note}\n` : "") +
    `\nOpen the live report (sources, charts, citations):\n${input.shareUrl}\n\n` +
    `---\n${md}\n---\n\n` +
    `Sent by ${input.senderName} <${input.senderEmail}> from Chronicle.\n` +
    `${APP_URL}\n`;

  return { subject, html, text, preheader };
}
