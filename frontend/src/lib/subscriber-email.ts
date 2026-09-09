/**
 * Newsletter lifecycle emails (as opposed to `auth-email.ts`, which handles
 * account emails, and `report-email.ts`, which builds the briefing itself).
 *
 * Currently one message: the double opt-in confirmation.
 *
 * Design note — this template is LIGHT, matching `report-email.ts` rather than
 * the dark shell in `auth-email.ts`. The confirmation is the recipient's first
 * impression of the newsletter, so it should look like the newsletter. Light
 * templates also survive client dark-mode auto-inversion far better.
 *
 * Layout is tables + inline styles only: Outlook strips <style> and ignores
 * flex/grid, and every font stack has a full system fallback because web fonts
 * load in almost no mail client.
 */

import { escapeHtml } from "./html-escape";
import { sendEmail } from "./agentmail";
import { buildConfirmUrl, CONFIRM_TOKEN_TTL_HOURS } from "./subscribers";

const BRAND = "Chronicle";
const BRAND_TAGLINE = "AI research copilot for founders";
const APP_URL = (
  process.env.NEXT_PUBLIC_APP_URL || "https://deep-research.intelliforge.tech"
)
  .trim()
  .replace(/<[^>]*>/g, "")
  .replace(/\/$/, "");

const FONT_STACK =
  "'Plus Jakarta Sans','Segoe UI',-apple-system,BlinkMacSystemFont,Roboto,Helvetica,Arial,sans-serif";

const INK = "#0f172a";
const INK_SOFT = "#475569";
const INK_FAINT = "#94a3b8";
const RULE = "#e2e8f0";
const ACCENT = "#1d4ed8";

function shell({
  preheader,
  bodyHtml,
}: {
  preheader: string;
  bodyHtml: string;
}): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(BRAND)}</title>
</head>
<body style="margin:0;padding:0;background:#eef2f6;font-family:${FONT_STACK};color:${INK};">
<span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;mso-hide:all;">${escapeHtml(preheader)}</span>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#eef2f6;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;background:#ffffff;border:1px solid ${RULE};border-radius:16px;overflow:hidden;">
        <tr>
          <td style="padding:28px 32px 22px;border-bottom:1px solid ${RULE};">
            <div style="font-size:19px;font-weight:700;letter-spacing:-0.01em;color:${INK};">${escapeHtml(BRAND)}</div>
            <div style="font-size:13px;color:${INK_FAINT};margin-top:3px;">${escapeHtml(BRAND_TAGLINE)}</div>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;font-size:15px;line-height:1.65;color:${INK_SOFT};">
            ${bodyHtml}
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px;border-top:1px solid ${RULE};font-size:12px;line-height:1.6;color:${INK_FAINT};">
            You received this because this address was entered at
            <a href="${escapeHtml(APP_URL)}" style="color:${INK_SOFT};text-decoration:underline;">${escapeHtml(APP_URL.replace(/^https?:\/\//, ""))}</a>.
            If that wasn't you, ignore this email &mdash; without a confirmation
            click you will never hear from us again, and the address is removed
            automatically once the link expires.
          </td>
        </tr>
      </table>
      <div style="font-size:11px;color:#94a3b8;margin-top:16px;">
        Chronicle by IntelliForge AI &middot; Hyderabad, India
      </div>
    </td>
  </tr>
</table>
</body>
</html>`;
}

function ctaButton(label: string, href: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0;">
  <tr>
    <td bgcolor="${ACCENT}" style="border-radius:8px;">
      <a href="${escapeHtml(href)}" style="display:inline-block;padding:13px 26px;font-family:${FONT_STACK};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">${escapeHtml(label)}</a>
    </td>
  </tr>
</table>`;
}

/**
 * Send the double opt-in confirmation. Returns whether the mail actually went
 * out; callers must NOT surface that to the requester (it would leak whether
 * an address exists), but the route logs the link in dev when it's false so a
 * developer without AgentMail credentials can still complete the flow.
 */
export async function sendSubscribeConfirmationEmail(
  email: string,
  token: string,
  name?: string | null,
): Promise<boolean> {
  const link = buildConfirmUrl(token);
  const greeting = name?.trim() ? `Hi ${escapeHtml(name.trim())},` : "Hi,";

  const bodyHtml = `
    <p style="margin:0 0 16px;color:${INK};font-size:17px;font-weight:600;">One click and you're in.</p>
    <p style="margin:0 0 16px;">${greeting}</p>
    <p style="margin:0 0 16px;">Confirm this address and you'll get the ${escapeHtml(BRAND)} briefing &mdash; founder-grade market research with every claim cited to a source you can click.</p>
    ${ctaButton("Confirm subscription", link)}
    <p style="margin:0 0 12px;font-size:13px;color:${INK_FAINT};">Or paste this link into your browser:</p>
    <p style="margin:0 0 24px;font-size:13px;word-break:break-all;background:#f1f5f9;padding:11px 13px;border-radius:6px;color:${INK_SOFT};">${escapeHtml(link)}</p>
    <p style="margin:0;font-size:13px;color:${INK_FAINT};">This link expires in ${CONFIRM_TOKEN_TTL_HOURS} hours. We only mail you the briefing, and every issue has a one-click unsubscribe.</p>
  `;

  const text =
    `${name?.trim() ? `Hi ${name.trim()},\n\n` : "Hi,\n\n"}` +
    `Confirm your subscription to the ${BRAND} briefing:\n${link}\n\n` +
    `This link expires in ${CONFIRM_TOKEN_TTL_HOURS} hours. ` +
    `If you didn't sign up, ignore this email and you'll hear nothing further.\n`;

  return sendEmail({
    to: email,
    subject: `Confirm your ${BRAND} subscription`,
    html: shell({
      preheader: `One click to confirm your ${BRAND} briefing subscription.`,
      bodyHtml,
    }),
    text,
  });
}
