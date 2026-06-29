/**
 * Subscriber list + unsubscribe data-access layer.
 *
 * This is the single shared contract for the newsletter audience feature:
 *   - API routes (subscribers CRUD, unsubscribe) call these helpers.
 *   - The broadcast route uses `getActiveSubscribers` + `buildUnsubscribeUrl`
 *     to fan a report out to a list with per-recipient unsubscribe links.
 *
 * Multi-tenant: every row is scoped by `ownerId` (the Chronicle user who owns
 * the list). Callers MUST pass the authenticated user's id as ownerId — never
 * trust a client-supplied owner.
 */

import { randomBytes } from "crypto";
import { prisma } from "./prisma";

// Mirror of the Prisma `SubscriberStatus` enum. Declared locally (rather than
// imported from "@prisma/client") so this module type-checks even if the
// generated client is momentarily stale during a fresh build — the generated
// enum is the same string-literal union, so the values stay in sync.
export type SubscriberStatus = "ACTIVE" | "UNSUBSCRIBED";

const APP_URL = (
  process.env.NEXT_PUBLIC_APP_URL || "https://deep-research.intelliforge.tech"
)
  .trim()
  .replace(/<[^>]*>/g, "")
  .replace(/\/$/, "");

/**
 * Sentinel ownerId for the single, public Chronicle newsletter list. Public
 * sign-ups (landing page, shared report pages) all land here, and the
 * owner-facing management + broadcast surfaces operate on this same list — so
 * there's exactly one newsletter, not one per user. The column has no FK to
 * User, so a fixed non-cuid string is safe.
 */
export const GLOBAL_NEWSLETTER_OWNER_ID = "newsletter__global";

/**
 * Who may view/manage the global subscriber list and broadcast to it.
 *
 * Configure `NEWSLETTER_ADMIN_EMAILS` (comma-separated) to lock this down once
 * more than one person can sign in — otherwise any authenticated user could
 * read subscriber emails (PII). When the env is unset we default to "open",
 * which is the right behaviour for a single-operator deployment but should be
 * tightened before opening signups to the public.
 */
const NEWSLETTER_ADMINS = (process.env.NEWSLETTER_ADMIN_EMAILS || "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

export function isNewsletterAdmin(email?: string | null): boolean {
  if (NEWSLETTER_ADMINS.length === 0) return true; // single-operator default
  return !!email && NEWSLETTER_ADMINS.includes(email.toLowerCase());
}

/** Opaque token for one-click unsubscribe links. 48 hex chars. */
export function generateUnsubscribeToken(): string {
  return randomBytes(24).toString("hex");
}

/** Public URL a recipient hits to remove themselves from a list. */
export function buildUnsubscribeUrl(token: string): string {
  return `${APP_URL}/api/unsubscribe?token=${encodeURIComponent(token)}`;
}

export interface SubscriberView {
  id: string;
  email: string;
  name: string | null;
  status: SubscriberStatus;
  createdAt: Date;
}

export interface ActiveRecipient {
  id: string;
  email: string;
  name: string | null;
  unsubscribeToken: string;
}

export interface AddSubscriberResult {
  subscriber: SubscriberView;
  /** True when this call (re)created or reactivated the row vs. it already being active. */
  created: boolean;
}

/** All subscribers for an owner, newest first. */
export async function listSubscribers(
  ownerId: string,
): Promise<SubscriberView[]> {
  const rows = await prisma.subscriber.findMany({
    where: { ownerId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      name: true,
      status: true,
      createdAt: true,
    },
  });
  return rows;
}

/** Count of ACTIVE subscribers for an owner. */
export async function countActiveSubscribers(ownerId: string): Promise<number> {
  return prisma.subscriber.count({
    where: { ownerId, status: "ACTIVE" },
  });
}

/**
 * Add (or reactivate) a subscriber. Idempotent on (ownerId, email):
 *   - new email            → create ACTIVE row with a fresh token
 *   - existing UNSUBSCRIBED → flip back to ACTIVE, keep token
 *   - existing ACTIVE       → no-op, return existing (created: false)
 *
 * Email is lower-cased + trimmed so the unique constraint is case-insensitive
 * in practice.
 */
export async function addSubscriber(
  ownerId: string,
  emailRaw: string,
  name?: string,
): Promise<AddSubscriberResult> {
  const email = emailRaw.trim().toLowerCase();
  const cleanName = name?.trim() || null;

  const existing = await prisma.subscriber.findUnique({
    where: { ownerId_email: { ownerId, email } },
    select: { id: true, email: true, name: true, status: true, createdAt: true },
  });

  if (existing) {
    if (existing.status === "ACTIVE") {
      // Update name if a new one was provided, but it's still "not created".
      if (cleanName && cleanName !== existing.name) {
        const updated = await prisma.subscriber.update({
          where: { id: existing.id },
          data: { name: cleanName },
          select: {
            id: true,
            email: true,
            name: true,
            status: true,
            createdAt: true,
          },
        });
        return { subscriber: updated, created: false };
      }
      return { subscriber: existing, created: false };
    }
    // Reactivate a previously unsubscribed contact.
    const reactivated = await prisma.subscriber.update({
      where: { id: existing.id },
      data: { status: "ACTIVE", name: cleanName ?? existing.name },
      select: {
        id: true,
        email: true,
        name: true,
        status: true,
        createdAt: true,
      },
    });
    return { subscriber: reactivated, created: true };
  }

  const created = await prisma.subscriber.create({
    data: {
      ownerId,
      email,
      name: cleanName,
      unsubscribeToken: generateUnsubscribeToken(),
    },
    select: {
      id: true,
      email: true,
      name: true,
      status: true,
      createdAt: true,
    },
  });
  return { subscriber: created, created: true };
}

/** Add an email to the single public Chronicle newsletter list (instant). */
export async function addPublicSubscriber(
  email: string,
  name?: string,
): Promise<AddSubscriberResult> {
  return addSubscriber(GLOBAL_NEWSLETTER_OWNER_ID, email, name);
}

/** Hard-delete a subscriber the owner owns. Returns true if a row was removed. */
export async function deleteSubscriber(
  ownerId: string,
  id: string,
): Promise<boolean> {
  // deleteMany scopes by ownerId so a user can't delete another user's row.
  const res = await prisma.subscriber.deleteMany({
    where: { id, ownerId },
  });
  return res.count > 0;
}

/** ACTIVE recipients (with tokens) for a broadcast. */
export async function getActiveSubscribers(
  ownerId: string,
): Promise<ActiveRecipient[]> {
  return prisma.subscriber.findMany({
    where: { ownerId, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true, name: true, unsubscribeToken: true },
  });
}

/**
 * Flip a subscriber to UNSUBSCRIBED by their opaque token. Returns the email
 * on success (for a friendly confirmation page), or null if the token is
 * unknown. Idempotent — unsubscribing an already-unsubscribed token still
 * returns the email so repeated clicks don't error.
 */
export async function unsubscribeByToken(
  token: string,
): Promise<string | null> {
  if (!token) return null;
  const row = await prisma.subscriber.findUnique({
    where: { unsubscribeToken: token },
    select: { id: true, email: true, status: true },
  });
  if (!row) return null;
  if (row.status !== "UNSUBSCRIBED") {
    await prisma.subscriber.update({
      where: { id: row.id },
      data: { status: "UNSUBSCRIBED" },
    });
  }
  return row.email;
}
