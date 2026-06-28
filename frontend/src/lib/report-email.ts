/**
 * Builds the HTML body for the "send research report" email.
 *
 * Design intent: a premium *editorial briefing*, not a transactional dark-mode
 * card. This matches the Chronicle brand system (light surface, professional
 * navy + blue, Plus Jakarta Sans, flat design) and reads as a newsletter the
 * recipient can forward to investors, partners, or subscribers.
 *
 * Why light, not dark:
 *   - The brand system lists "dark mode by default" as an anti-pattern.
 *   - Light templates degrade far more gracefully across clients. Dark-mode
 *     auto-invert (iOS Mail, Outlook on Mac) mangles dark palettes; a light
 *     template stays legible even when a client re-tints it.
 *
 * Email-client constraints worth knowing:
 *   - Outlook ignores <style> and most modern layout (flex/grid). All layout
 *     uses tables + inline styles. Web fonts only load in Apple Mail / a few
 *     others, so every font declaration has a full system fallback stack.
 *   - Gmail clips messages over ~102KB. We trim very long reports below.
 */

import { escapeHtml } from "./html-escape";
import { renderMarkdownToHtml } from "./markdown";

const BRAND = "Chronicle";
const BRAND_TAGLINE = "AI research copilot for founders";
const PUBLICATION = "Research Briefing";
const APP_URL = (
  process.env.NEXT_PUBLIC_APP_URL || "https://deep-research.intelliforge.tech"
)
  .trim()
  .replace(/<[^>]*>/g, "");

// Gmail clips messages above ~102KB. Keep the rendered report well under that
// so the recipient sees the whole thing inline. The "View full report" CTA
// always points back to the Chronicle viewer for the un-clipped version.
const MAX_REPORT_CHARS = 60_000;

// ---------------------------------------------------------------------------
// Brand palette (light / editorial) — mirrors design-system/chronicle/MASTER.md
// ---------------------------------------------------------------------------
const C = {
  ink: "#0f172a", // primary navy — headings
  body: "#334155", // slate — body copy
  muted: "#64748b", // muted slate — meta / captions
  faint: "#94a3b8", // faint — fine print
  accent: "#0369a1", // CTA / links — professional blue
  accentSoft: "#e0f2fe", // accent tint — chips / rules
  line: "#e2e8f0", // hairline borders
  lineSoft: "#eef2f6", // soft fills
  surface: "#ffffff", // card surface
  page: "#eef2f6", // page background
  panel: "#f8fafc", // inset panels
};

// Editorial headline stack: serif for gravitas (renders everywhere), with a
// clean sans fallback. Body uses Plus Jakarta Sans where available.
const SERIF = "'Georgia','Times New Roman',Cambria,serif";
const SANS =
  "'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

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

/** Rough reading-time estimate from the raw markdown. */
function readingTimeMinutes(md: string): number {
  const words = (md.match(/\b[\w'-]+\b/g) || []).length;
  return Math.max(1, Math.round(words / 200));
}

function formatIssueDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/** Initials for the monogram in the masthead, e.g. "Girish Hiremath" -> "GH". */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "C";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "";
  return (first + last).toUpperCase() || "C";
}

export function buildReportEmail(
  input: BuildReportEmailInput,
): BuildReportEmailOutput {
  const queryShort = input.query.length > 80
    ? input.query.slice(0, 77) + "…"
    : input.query;
  const subject = `${BRAND} ${PUBLICATION}: ${queryShort}`;

  const { md, truncated } = truncateMarkdown(input.reportMarkdown);
  const reportHtml = renderMarkdownToHtml(md);
  const issueDate = formatIssueDate(new Date());
  const minutes = readingTimeMinutes(input.reportMarkdown);

  // ---- Editor's note (optional) -------------------------------------------
  const noteHtml = input.note
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 28px;">
         <tr>
           <td style="padding:18px 20px;background:${C.panel};border:1px solid ${C.line};border-left:3px solid ${C.accent};border-radius:10px;">
             <div style="font-family:${SANS};font-size:11px;font-weight:700;color:${C.accent};text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;">
               Note from ${escapeHtml(input.senderName)}
             </div>
             <div style="font-family:${SANS};font-size:15px;color:${C.ink};line-height:1.6;white-space:pre-wrap;">
               ${escapeHtml(input.note)}
             </div>
           </td>
         </tr>
       </table>`
    : "";

  const truncatedNoticeHtml = truncated
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 24px;">
         <tr>
           <td style="padding:12px 16px;background:${C.accentSoft};border-radius:8px;font-family:${SANS};font-size:13px;color:${C.ink};line-height:1.55;">
             You're reading an excerpt. <a href="${escapeHtml(input.shareUrl)}" style="color:${C.accent};font-weight:600;text-decoration:underline;">Open the full briefing</a> for every source, chart, and the complete reasoning trail.
           </td>
         </tr>
       </table>`
    : "";

  const preheader = input.note
    ? `${input.senderName} shared a Chronicle research briefing with you.`
    : `${minutes} min read · A Chronicle research briefing on "${queryShort}"`;

  // ---- Masthead metric chips ----------------------------------------------
  const metaRow = `${escapeHtml(issueDate)}&nbsp;&nbsp;·&nbsp;&nbsp;${minutes} min read&nbsp;&nbsp;·&nbsp;&nbsp;Ref ${escapeHtml(
    input.jobId.slice(0, 8),
  )}`;

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title>${escapeHtml(BRAND)} ${escapeHtml(PUBLICATION)}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');

  /* Report typography — light/editorial. Inlined fallbacks below catch clients
     that strip <style>. */
  .chronicle-report h1, .chronicle-report h2, .chronicle-report h3,
  .chronicle-report h4, .chronicle-report h5 {
    color: ${C.ink}; margin: 30px 0 12px; line-height: 1.3; font-weight: 700;
    font-family: ${SANS}; letter-spacing: -0.01em;
  }
  .chronicle-report h1 { font-size: 24px; }
  .chronicle-report h2 {
    font-size: 19px; padding-bottom: 8px; border-bottom: 1px solid ${C.line};
  }
  .chronicle-report h3 { font-size: 16px; }
  .chronicle-report p  { margin: 0 0 16px; color: ${C.body}; }
  .chronicle-report a  { color: ${C.accent}; text-decoration: underline; }
  .chronicle-report ul, .chronicle-report ol { margin: 0 0 16px; padding-left: 22px; color: ${C.body}; }
  .chronicle-report li { margin: 0 0 8px; }
  .chronicle-report strong { color: ${C.ink}; font-weight: 700; }
  .chronicle-report blockquote {
    margin: 18px 0; padding: 12px 18px; border-left: 3px solid ${C.accent};
    background: ${C.panel}; color: ${C.body}; border-radius: 0 8px 8px 0;
  }
  .chronicle-report code {
    background: ${C.lineSoft}; padding: 2px 6px; border-radius: 4px;
    font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 13px; color: ${C.ink};
  }
  .chronicle-report pre {
    background: ${C.ink}; color: #e2e8f0; padding: 14px 16px; border-radius: 8px;
    overflow-x: auto; margin: 0 0 16px;
  }
  .chronicle-report pre code { background: transparent; color: inherit; padding: 0; }
  .chronicle-report table {
    border-collapse: collapse; width: 100%; margin: 0 0 16px;
    font-size: 13px; color: ${C.body};
  }
  .chronicle-report th, .chronicle-report td {
    border: 1px solid ${C.line}; padding: 9px 12px; text-align: left;
  }
  .chronicle-report th { background: ${C.panel}; color: ${C.ink}; font-weight: 600; }
  .chronicle-report hr { border: 0; border-top: 1px solid ${C.line}; margin: 24px 0; }
  .chronicle-report img { max-width: 100%; height: auto; border-radius: 8px; }

  @media (max-width: 600px) {
    .px { padding-left: 22px !important; padding-right: 22px !important; }
    .headline { font-size: 26px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${C.page};font-family:${SANS};color:${C.body};-webkit-font-smoothing:antialiased;">
<span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;mso-hide:all;">${escapeHtml(preheader)}</span>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${C.page};">
  <tr>
    <td align="center" style="padding:36px 16px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="640" style="max-width:640px;background:${C.surface};border:1px solid ${C.line};border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,0.06);">

        <!-- Accent rule -->
        <tr><td style="height:4px;background:${C.accent};font-size:0;line-height:0;">&nbsp;</td></tr>

        <!-- Masthead -->
        <tr>
          <td class="px" style="padding:26px 36px 22px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td style="vertical-align:middle;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td style="vertical-align:middle;padding-right:12px;">
                        <div style="width:40px;height:40px;background:${C.ink};border-radius:9px;text-align:center;">
                          <span style="display:inline-block;line-height:40px;font-family:${SERIF};font-size:18px;font-weight:700;color:#ffffff;">C</span>
                        </div>
                      </td>
                      <td style="vertical-align:middle;">
                        <div style="font-family:${SANS};font-size:17px;font-weight:700;letter-spacing:0.14em;color:${C.ink};text-transform:uppercase;">${escapeHtml(BRAND)}</div>
                        <div style="font-family:${SANS};font-size:12px;color:${C.muted};margin-top:2px;">${escapeHtml(BRAND_TAGLINE)}</div>
                      </td>
                    </tr>
                  </table>
                </td>
                <td align="right" style="vertical-align:middle;">
                  <div style="display:inline-block;padding:6px 12px;background:${C.accentSoft};border-radius:999px;font-family:${SANS};font-size:10px;font-weight:700;letter-spacing:0.1em;color:${C.accent};text-transform:uppercase;">${escapeHtml(PUBLICATION)}</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr><td class="px" style="padding:0 36px;"><div style="border-top:1px solid ${C.line};font-size:0;line-height:0;">&nbsp;</div></td></tr>

        <!-- Title block -->
        <tr>
          <td class="px" style="padding:28px 36px 4px;">
            <div style="font-family:${SANS};font-size:11px;font-weight:700;color:${C.accent};text-transform:uppercase;letter-spacing:0.1em;margin-bottom:12px;">In this briefing</div>
            <h1 class="headline" style="margin:0 0 16px;font-family:${SERIF};font-size:30px;line-height:1.22;font-weight:700;color:${C.ink};letter-spacing:-0.01em;">
              ${escapeHtml(input.query)}
            </h1>
            <div style="font-family:${SANS};font-size:13px;color:${C.muted};letter-spacing:0.01em;margin-bottom:24px;">
              ${metaRow}
            </div>
          </td>
        </tr>

        <!-- Editor note + excerpt notice -->
        <tr>
          <td class="px" style="padding:0 36px;">
            ${noteHtml}
            ${truncatedNoticeHtml}
          </td>
        </tr>

        <!-- Report body -->
        <tr>
          <td class="chronicle-report px" style="padding:4px 36px 8px;font-family:${SANS};font-size:15px;line-height:1.7;color:${C.body};">
            ${reportHtml}
          </td>
        </tr>

        <!-- CTA -->
        <tr>
          <td class="px" style="padding:18px 36px 30px;">
            <div style="border-top:1px solid ${C.line};padding-top:26px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td bgcolor="${C.accent}" style="border-radius:8px;">
                    <a href="${escapeHtml(input.shareUrl)}" style="display:inline-block;padding:13px 26px;font-family:${SANS};font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">Read the full briefing&nbsp;&rarr;</a>
                  </td>
                </tr>
              </table>
              <div style="font-family:${SANS};font-size:13px;color:${C.muted};margin-top:14px;line-height:1.55;">
                The live version includes every source, credibility scoring, and interactive charts.
              </div>
            </div>
          </td>
        </tr>

        <!-- Sender attribution -->
        <tr>
          <td class="px" style="padding:18px 36px;background:${C.panel};border-top:1px solid ${C.line};">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td style="vertical-align:middle;padding-right:12px;width:36px;">
                  <div style="width:36px;height:36px;background:${C.ink};border-radius:50%;text-align:center;">
                    <span style="display:inline-block;line-height:36px;font-family:${SANS};font-size:13px;font-weight:700;color:#ffffff;">${escapeHtml(initials(input.senderName))}</span>
                  </div>
                </td>
                <td style="vertical-align:middle;font-family:${SANS};font-size:13px;color:${C.muted};line-height:1.5;">
                  Shared by <strong style="color:${C.ink};font-weight:700;">${escapeHtml(input.senderName)}</strong><br />
                  <span style="color:${C.faint};">${escapeHtml(input.senderEmail)}</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td class="px" style="padding:20px 36px 24px;border-top:1px solid ${C.line};font-family:${SANS};font-size:12px;color:${C.faint};line-height:1.6;">
            This briefing was generated and sent via a verified ${escapeHtml(BRAND)} account. Every send is rate-limited and tied to a real user — if this looks like spam, just reply and we'll investigate.
          </td>
        </tr>
      </table>

      <div style="font-family:${SANS};font-size:11px;color:${C.faint};margin-top:18px;line-height:1.6;">
        <a href="${escapeHtml(APP_URL)}" style="color:${C.muted};text-decoration:none;font-weight:600;">${escapeHtml(BRAND)}</a> by IntelliForge AI · Hyderabad, India<br />
        AI research copilot for founders
      </div>
    </td>
  </tr>
</table>
</body>
</html>`;

  const text =
    `${BRAND.toUpperCase()} — ${PUBLICATION.toUpperCase()}\n` +
    `${issueDate} · ${minutes} min read\n\n` +
    `IN THIS BRIEFING\n${input.query}\n` +
    (input.note ? `\nNote from ${input.senderName}:\n${input.note}\n` : "") +
    `\nRead the full briefing (sources, charts, citations):\n${input.shareUrl}\n\n` +
    `----------------------------------------\n${md}\n----------------------------------------\n\n` +
    `Shared by ${input.senderName} <${input.senderEmail}> via ${BRAND}.\n` +
    `${APP_URL}\n`;

  return { subject, html, text, preheader };
}
