import { randomBytes, createHash } from "crypto";
import type { VerificationToken } from "@prisma/client";
import { escapeHtml } from "./html-escape";
import { sendEmail } from "./agentmail";

const APP_URL = (
  process.env.NEXT_PUBLIC_APP_URL || "https://deep-research.intelliforge.tech"
)
  .trim()
  .replace(/<[^>]*>/g, "");

const TOKEN_EXPIRY_MINUTES = 15;
const BRAND = "Chronicle";
const BRAND_TAGLINE = "AI research copilot for founders";

export type VerificationTokenType =
  | "EMAIL_VERIFY"
  | "PASSWORD_RESET"
  | "MAGIC_LINK";

export function generateToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function storeToken(
  identifier: string,
  rawToken: string,
  type: VerificationTokenType,
): Promise<void> {
  const { prisma } = await import("./prisma");
  const hashed = hashToken(rawToken);
  const expires = new Date(Date.now() + TOKEN_EXPIRY_MINUTES * 60 * 1000);

  // One outstanding token per (identifier, type). Prevents stale tokens
  // from accumulating after the user re-requests a fresh link.
  await prisma.verificationToken.deleteMany({
    where: { identifier, type },
  });

  await prisma.verificationToken.create({
    data: { identifier, token: hashed, type, expires },
  });
}

export async function consumeToken(
  identifier: string,
  rawToken: string,
  type: VerificationTokenType,
): Promise<VerificationToken | null> {
  const { prisma } = await import("./prisma");
  const hashed = hashToken(rawToken);
  const record = await prisma.verificationToken.findUnique({
    where: { identifier_token: { identifier, token: hashed } },
  });

  if (!record || record.type !== type || record.expires < new Date()) {
    return null;
  }

  await prisma.verificationToken.delete({ where: { id: record.id } });
  return record;
}

// ---------------------------------------------------------------------------
// HTML templates
// ---------------------------------------------------------------------------
//
// Single shared shell so the brand stays consistent across email types.
// Body content is built per-template; subject + plaintext fallback live with
// the send function so devs can grep them together with the trigger.

function emailShell({
  preheader,
  bodyHtml,
}: {
  preheader: string;
  bodyHtml: string;
}): string {
  // Inline CSS only — Gmail/Outlook strip <style>. Width 600px is the
  // de-facto cap for non-responsive clients.
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(BRAND)}</title>
</head>
<body style="margin:0;padding:0;background:#0b0d10;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#e6e8eb;">
<span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;mso-hide:all;">${escapeHtml(preheader)}</span>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#0b0d10;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;background:#121519;border:1px solid #1f242b;border-radius:16px;overflow:hidden;">
        <tr>
          <td style="padding:28px 32px;border-bottom:1px solid #1f242b;">
            <div style="font-size:18px;font-weight:700;letter-spacing:-0.01em;color:#fafafa;">${escapeHtml(BRAND)}</div>
            <div style="font-size:13px;color:#8a939c;margin-top:2px;">${escapeHtml(BRAND_TAGLINE)}</div>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;font-size:15px;line-height:1.6;color:#cfd3d8;">
            ${bodyHtml}
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px;border-top:1px solid #1f242b;font-size:12px;color:#6b7480;">
            You're receiving this because someone (hopefully you) requested it at
            <a href="${escapeHtml(APP_URL)}" style="color:#9aa3ad;text-decoration:underline;">${escapeHtml(APP_URL.replace(/^https?:\/\//, ""))}</a>.
            If it wasn't you, you can safely ignore this email.
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
}

function ctaButton(label: string, href: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
  <tr>
    <td bgcolor="#e6e8eb" style="border-radius:8px;">
      <a href="${escapeHtml(href)}" style="display:inline-block;padding:12px 22px;font-size:14px;font-weight:600;color:#0b0d10;text-decoration:none;border-radius:8px;">${escapeHtml(label)}</a>
    </td>
  </tr>
</table>`;
}

// ---------------------------------------------------------------------------
// Public senders
// ---------------------------------------------------------------------------

export async function sendPasswordResetEmail(
  email: string,
  name?: string,
): Promise<void> {
  const token = generateToken();
  await storeToken(email, token, "PASSWORD_RESET");

  const link = `${APP_URL}/reset-password?token=${token}&email=${encodeURIComponent(email)}`;
  const greeting = name ? `Hi ${escapeHtml(name)},` : "Hi,";
  const subject = `Reset your ${BRAND} password`;

  const bodyHtml = `
    <p style="margin:0 0 16px;">${greeting}</p>
    <p style="margin:0 0 16px;">We got a request to reset the password for your ${escapeHtml(BRAND)} account. Click the button below to choose a new one.</p>
    ${ctaButton("Reset password", link)}
    <p style="margin:0 0 12px;font-size:13px;color:#8a939c;">Or paste this link into your browser:</p>
    <p style="margin:0 0 24px;font-size:13px;word-break:break-all;background:#1a1f25;padding:10px 12px;border-radius:6px;color:#cfd3d8;">${escapeHtml(link)}</p>
    <p style="margin:0;font-size:13px;color:#8a939c;">This link expires in ${TOKEN_EXPIRY_MINUTES} minutes. If you didn't ask for a password reset, ignore this email — your password stays the same.</p>
  `;

  const text =
    `${name ? `Hi ${name},\n\n` : "Hi,\n\n"}` +
    `Reset your ${BRAND} password using this link:\n${link}\n\n` +
    `This link expires in ${TOKEN_EXPIRY_MINUTES} minutes. If you didn't request this, you can ignore this email.\n`;

  const sent = await sendEmail({
    to: email,
    subject,
    html: emailShell({
      preheader: `Reset your ${BRAND} password (expires in ${TOKEN_EXPIRY_MINUTES} min).`,
      bodyHtml,
    }),
    text,
  });

  if (!sent) {
    // Local dev / unconfigured AgentMail — surface the link so the flow stays
    // usable without an email provider.
    // eslint-disable-next-line no-console
    console.log(
      `\n=== [DEV] PASSWORD RESET LINK ===\nTo: ${email}\n${link}\n(expires in ${TOKEN_EXPIRY_MINUTES} minutes)\n===================================\n`,
    );
  }
}

export async function sendVerificationEmail(
  email: string,
  name: string,
): Promise<void> {
  const token = generateToken();
  await storeToken(email, token, "EMAIL_VERIFY");

  const link = `${APP_URL}/api/auth/verify?token=${token}&email=${encodeURIComponent(email)}&type=verify`;
  const subject = `Verify your ${BRAND} email`;

  const bodyHtml = `
    <p style="margin:0 0 16px;">Hi ${escapeHtml(name)},</p>
    <p style="margin:0 0 16px;">Welcome to ${escapeHtml(BRAND)}. Confirm this email address so we can keep your account secure and send you future research alerts.</p>
    ${ctaButton("Verify email", link)}
    <p style="margin:0 0 12px;font-size:13px;color:#8a939c;">Or paste this link into your browser:</p>
    <p style="margin:0 0 24px;font-size:13px;word-break:break-all;background:#1a1f25;padding:10px 12px;border-radius:6px;color:#cfd3d8;">${escapeHtml(link)}</p>
    <p style="margin:0;font-size:13px;color:#8a939c;">This link expires in ${TOKEN_EXPIRY_MINUTES} minutes.</p>
  `;

  const text =
    `Hi ${name},\n\n` +
    `Welcome to ${BRAND}. Verify your email with this link:\n${link}\n\n` +
    `This link expires in ${TOKEN_EXPIRY_MINUTES} minutes.\n`;

  const sent = await sendEmail({
    to: email,
    subject,
    html: emailShell({
      preheader: `Verify your ${BRAND} email (expires in ${TOKEN_EXPIRY_MINUTES} min).`,
      bodyHtml,
    }),
    text,
  });

  if (!sent) {
    // eslint-disable-next-line no-console
    console.log(
      `\n=== [DEV] EMAIL VERIFICATION LINK ===\nTo: ${email}\n${link}\n(expires in ${TOKEN_EXPIRY_MINUTES} minutes)\n=====================================\n`,
    );
  }
}
