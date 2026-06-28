import { randomBytes, createHash } from "crypto";
import type { VerificationToken } from "@prisma/client";
import { escapeHtml } from "./html-escape";

const APP_URL = (
  process.env.NEXT_PUBLIC_APP_URL || "https://deep-research.intelliforge.tech"
)
  .trim()
  .replace(/<[^>]*>/g, "");

const TOKEN_EXPIRY_MINUTES = 15;

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

export async function sendPasswordResetEmail(
  email: string,
  name?: string,
): Promise<void> {
  const token = generateToken();
  await storeToken(email, token, "PASSWORD_RESET");

  const link = `${APP_URL}/reset-password?token=${token}&email=${encodeURIComponent(
    email,
  )}`;
  const greeting = name ? `Hi ${escapeHtml(name)}` : "Hi";

  // TODO(agentmail): wire AgentMail send here. See hrms-intelliforge/src/lib/auth-email.ts
  // for the agentmail.inboxes.messages.send pattern (HR inbox, HTML body with
  // greeting + reset link + ${TOKEN_EXPIRY_MINUTES}-minute expiry note).
  // eslint-disable-next-line no-console
  console.log(
    `\n=== [DEV] PASSWORD RESET LINK ===\n${greeting},\n${link}\n(expires in ${TOKEN_EXPIRY_MINUTES} minutes)\n===================================\n`,
  );
}

export async function sendVerificationEmail(
  email: string,
  name: string,
): Promise<void> {
  const token = generateToken();
  await storeToken(email, token, "EMAIL_VERIFY");

  const link = `${APP_URL}/api/auth/verify?token=${token}&email=${encodeURIComponent(
    email,
  )}&type=verify`;
  const greeting = `Hi ${escapeHtml(name)}`;

  // TODO(agentmail): wire AgentMail send here. See hrms-intelliforge/src/lib/auth-email.ts
  // for the agentmail.inboxes.messages.send pattern (HR inbox, HTML body with
  // greeting + verify link + ${TOKEN_EXPIRY_MINUTES}-minute expiry note).
  // eslint-disable-next-line no-console
  console.log(
    `\n=== [DEV] EMAIL VERIFICATION LINK ===\n${greeting},\n${link}\n(expires in ${TOKEN_EXPIRY_MINUTES} minutes)\n=====================================\n`,
  );
}
