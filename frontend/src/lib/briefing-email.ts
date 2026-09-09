/**
 * Unsubscribe-footer injection for externally-composed briefings.
 *
 * The daily briefing arrives at POST /api/newsletter/broadcast as ready-made
 * HTML built by an outside scheduled job. Chronicle does not rewrite that body
 * — but every recipient must still get their own one-click unsubscribe link,
 * so the send loop stamps one in per recipient just before handing the mail to
 * the provider.
 *
 * Kept out of the route handler so the placement rules (before </body> when the
 * body is a full document, appended when it's a fragment) are unit-testable
 * without standing up a request.
 */

import { escapeHtml } from "./html-escape";

// Matches the muted footer type used by the report emails, but written inline:
// an externally-composed body carries no stylesheet we can hook into.
const FOOTER_STYLE = [
  "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif",
  "font-size:12px",
  "color:#6b7280",
  "line-height:1.6",
  "margin-top:24px",
  "text-align:center",
].join(";");

export interface InjectUnsubscribeInput {
  /** The briefing body exactly as composed upstream. */
  html: string;
  /** Optional plaintext alternative. Left undefined if the caller sent none. */
  text?: string;
  /** Per-recipient unsubscribe URL from buildUnsubscribeUrl(). */
  unsubscribeUrl: string;
}

export interface InjectUnsubscribeOutput {
  html: string;
  text?: string;
}

/** The footer markup for one recipient. Exported for assertions in tests. */
export function buildUnsubscribeFooterHtml(unsubscribeUrl: string): string {
  const href = escapeHtml(unsubscribeUrl);
  return (
    `<div style="${FOOTER_STYLE}">` +
    "You're receiving this because you subscribed to the Chronicle briefing. " +
    `<a href="${href}" style="color:#6b7280;text-decoration:underline;">Unsubscribe</a>.` +
    "</div>"
  );
}

/** The plaintext equivalent of the footer. */
export function buildUnsubscribeFooterText(unsubscribeUrl: string): string {
  return `\n\n---\nUnsubscribe: ${unsubscribeUrl}\n`;
}

/**
 * Returns the briefing with a per-recipient unsubscribe footer added.
 *
 * The HTML footer goes immediately before the closing </body> tag when the
 * body is a full document, so it lands inside the rendered page rather than
 * after it. A fragment (no </body>) simply gets the footer appended.
 *
 * The input is never otherwise modified, and `text` stays undefined when the
 * caller supplied none — an empty string would suppress the provider's own
 * plaintext fallback.
 */
export function injectUnsubscribeFooter(
  input: InjectUnsubscribeInput,
): InjectUnsubscribeOutput {
  const footer = buildUnsubscribeFooterHtml(input.unsubscribeUrl);

  // Last closing tag wins: a body containing the literal text "</body>" earlier
  // (in an escaped code sample, say) must not divert the real footer.
  const closingBody = input.html.toLowerCase().lastIndexOf("</body>");
  const html =
    closingBody === -1
      ? input.html + footer
      : input.html.slice(0, closingBody) +
        footer +
        input.html.slice(closingBody);

  const text =
    input.text === undefined
      ? undefined
      : input.text + buildUnsubscribeFooterText(input.unsubscribeUrl);

  return { html, text };
}
