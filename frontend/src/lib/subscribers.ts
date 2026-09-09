/**
 * Subscriber list + unsubscribe data-access layer.
 *
 * This is the single shared contract for the newsletter audience feature:
 *   - API routes (subscribers CRUD, import, subscribe, confirm, unsubscribe)
 *     call these helpers.
 *   - The broadcast route uses `getActiveSubscribers` + `buildUnsubscribeUrl`
 *     to fan a report out to a list with per-recipient unsubscribe links.
 *
 * Three things are worth knowing before editing:
 *
 *  1. Double opt-in. A public sign-up lands as PENDING with an opaque
 *     `confirmToken`, and only becomes ACTIVE when the recipient clicks the
 *     link mailed to them. `getActiveSubscribers` filters on ACTIVE, so a
 *     PENDING row can never receive a broadcast. Rows the owner adds by hand
 *     or imports from CSV skip this — the owner is vouching for them.
 *
 *  2. Segments are plain lower-cased tags on the row (a Postgres text[]),
 *     not a join table. Broadcasting to a segment is `tags hasSome [tag]`.
 *
 *  3. Multi-tenant: every row is scoped by `ownerId`. Callers MUST pass the
 *     authenticated user's id as ownerId — never trust a client-supplied
 *     owner. Public sign-ups all share GLOBAL_NEWSLETTER_OWNER_ID.
 */

import { randomBytes } from "crypto";
import { prisma } from "./prisma";

// Mirror of the Prisma `SubscriberStatus` enum. Declared locally (rather than
// imported from "@prisma/client") so this module type-checks even if the
// generated client is momentarily stale during a fresh build — the generated
// enum is the same string-literal union, so the values stay in sync.
export type SubscriberStatus = "PENDING" | "ACTIVE" | "UNSUBSCRIBED";

/** Where an address came from. Attribution only — never affects delivery. */
export type SubscriberSource =
  | "landing"
  | "report"
  | "newsletter"
  | "manual"
  | "import";

const APP_URL = (
  process.env.NEXT_PUBLIC_APP_URL || "https://deep-research.intelliforge.tech"
)
  .trim()
  .replace(/<[^>]*>/g, "")
  .replace(/\/$/, "");

/**
 * Sentinel ownerId for the single, public Chronicle newsletter list. Public
 * sign-ups (landing page, /newsletter, shared report pages) all land here, and
 * the owner-facing management + broadcast surfaces operate on this same list —
 * so there's exactly one newsletter, not one per user. The column has no FK to
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

/**
 * Double opt-in is ON unless explicitly disabled. The escape hatch exists for
 * local development (where AgentMail is usually unconfigured, so a confirm
 * link would only ever reach the server console) — leave it on in production.
 */
export function isDoubleOptInEnabled(): boolean {
  const raw = (process.env.NEWSLETTER_DOUBLE_OPT_IN || "").trim().toLowerCase();
  return raw !== "false" && raw !== "0" && raw !== "off";
}

/** How long a confirmation link stays valid. Generous — it's a newsletter. */
export const CONFIRM_TOKEN_TTL_HOURS = 48;

/** Opaque token for one-click unsubscribe links. 48 hex chars. */
export function generateUnsubscribeToken(): string {
  return randomBytes(24).toString("hex");
}

/** Opaque token for a double opt-in confirmation link. 48 hex chars. */
export function generateConfirmToken(): string {
  return randomBytes(24).toString("hex");
}

/** Public URL a recipient hits to remove themselves from a list. */
export function buildUnsubscribeUrl(token: string): string {
  return `${APP_URL}/api/unsubscribe?token=${encodeURIComponent(token)}`;
}

/** Public URL a new sign-up hits to confirm their address. */
export function buildConfirmUrl(token: string): string {
  return `${APP_URL}/api/subscribe/confirm?token=${encodeURIComponent(token)}`;
}

// ---------------------------------------------------------------------------
// Tags / segments
// ---------------------------------------------------------------------------

export const MAX_TAGS_PER_SUBSCRIBER = 10;
export const MAX_TAG_LENGTH = 24;

/**
 * Canonical form for a segment label: lower-case, spaces collapsed to hyphens,
 * anything outside [a-z0-9._-] dropped. Returns "" for input that normalizes
 * away to nothing, which callers filter out.
 *
 * Normalizing at the data layer (rather than trusting the caller) is what lets
 * "Investors", "investors" and " investors " all resolve to one segment.
 */
export function normalizeTag(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9._-]/g, "")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, MAX_TAG_LENGTH);
}

/** Normalize, drop empties, de-duplicate, and cap a list of segment labels. */
export function normalizeTags(raw?: string[] | null): string[] {
  if (!raw || raw.length === 0) return [];
  const seen = new Set<string>();
  for (const value of raw) {
    if (typeof value !== "string") continue;
    const tag = normalizeTag(value);
    if (tag) seen.add(tag);
    if (seen.size >= MAX_TAGS_PER_SUBSCRIBER) break;
  }
  return [...seen].sort();
}

export interface SegmentCount {
  tag: string;
  total: number;
  active: number;
}

/**
 * Every segment on an owner's list with its membership counts, busiest first.
 * Aggregated in JS because Postgres array unnesting isn't expressible in the
 * Prisma query API and the list is small (hundreds, not millions).
 */
export async function listSegments(ownerId: string): Promise<SegmentCount[]> {
  const rows = await prisma.subscriber.findMany({
    where: { ownerId },
    select: { tags: true, status: true },
  });

  const counts = new Map<string, SegmentCount>();
  for (const row of rows) {
    for (const tag of row.tags) {
      const entry = counts.get(tag) ?? { tag, total: 0, active: 0 };
      entry.total += 1;
      if (row.status === "ACTIVE") entry.active += 1;
      counts.set(tag, entry);
    }
  }

  return [...counts.values()].sort(
    (a, b) => b.active - a.active || a.tag.localeCompare(b.tag),
  );
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export interface SubscriberView {
  id: string;
  email: string;
  name: string | null;
  status: SubscriberStatus;
  tags: string[];
  source: string | null;
  createdAt: Date;
}

export interface ActiveRecipient {
  id: string;
  email: string;
  name: string | null;
  unsubscribeToken: string;
}

// Shared projection so every caller returns the same shape to the client, and
// so secrets (confirmToken, unsubscribeToken) are never included by accident.
const SUBSCRIBER_SELECT = {
  id: true,
  email: true,
  name: true,
  status: true,
  tags: true,
  source: true,
  createdAt: true,
} as const;

/** All subscribers for an owner, newest first. Optionally one segment only. */
export async function listSubscribers(
  ownerId: string,
  options: { tag?: string } = {},
): Promise<SubscriberView[]> {
  const tag = options.tag ? normalizeTag(options.tag) : "";
  return prisma.subscriber.findMany({
    where: {
      ownerId,
      ...(tag ? { tags: { has: tag } } : {}),
    },
    orderBy: { createdAt: "desc" },
    select: SUBSCRIBER_SELECT,
  });
}

/** Count of ACTIVE subscribers for an owner, optionally within one segment. */
export async function countActiveSubscribers(
  ownerId: string,
  options: { tag?: string } = {},
): Promise<number> {
  const tag = options.tag ? normalizeTag(options.tag) : "";
  return prisma.subscriber.count({
    where: {
      ownerId,
      status: "ACTIVE",
      ...(tag ? { tags: { has: tag } } : {}),
    },
  });
}

/**
 * ACTIVE recipients (with tokens) for a broadcast, optionally narrowed to one
 * segment. PENDING rows are excluded by construction — an unconfirmed address
 * is never mailable.
 */
export async function getActiveSubscribers(
  ownerId: string,
  options: { segment?: string } = {},
): Promise<ActiveRecipient[]> {
  const segment = options.segment ? normalizeTag(options.segment) : "";
  return prisma.subscriber.findMany({
    where: {
      ownerId,
      status: "ACTIVE",
      ...(segment ? { tags: { has: segment } } : {}),
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true, name: true, unsubscribeToken: true },
  });
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export interface AddSubscriberResult {
  subscriber: SubscriberView;
  /** True when this call (re)created or reactivated the row vs. it already being active. */
  created: boolean;
}

export interface AddSubscriberOptions {
  tags?: string[];
  source?: SubscriberSource;
  /**
   * Merge the supplied tags into whatever the row already has (the default)
   * rather than replacing them. Public sign-ups merge so a returning reader
   * keeps the segments the owner assigned them.
   */
  mergeTags?: boolean;
}

/**
 * Add (or reactivate) a subscriber as ACTIVE. Idempotent on (ownerId, email):
 *   - new email             → create ACTIVE row with a fresh token
 *   - existing PENDING      → confirm it (the owner adding you by hand is
 *                             stronger evidence than a click-through)
 *   - existing UNSUBSCRIBED → flip back to ACTIVE, keep token
 *   - existing ACTIVE       → no-op, return existing (created: false)
 *
 * This is the *owner-driven* path (Audience page, CSV import). Public sign-ups
 * go through `addPublicSubscriber`, which honours double opt-in.
 *
 * Email is lower-cased + trimmed so the unique constraint is case-insensitive
 * in practice.
 */
export async function addSubscriber(
  ownerId: string,
  emailRaw: string,
  name?: string,
  options: AddSubscriberOptions = {},
): Promise<AddSubscriberResult> {
  const email = emailRaw.trim().toLowerCase();
  const cleanName = name?.trim() || null;
  const tags = normalizeTags(options.tags);
  const mergeTags = options.mergeTags !== false;

  const existing = await prisma.subscriber.findUnique({
    where: { ownerId_email: { ownerId, email } },
    // confirmedAt is not part of SUBSCRIBER_SELECT (clients never need it) but
    // we read it here so an already-confirmed row keeps its original date.
    select: { ...SUBSCRIBER_SELECT, confirmedAt: true },
  });

  if (existing) {
    const nextTags = mergeTags
      ? normalizeTags([...existing.tags, ...tags])
      : tags;
    const tagsChanged =
      nextTags.length !== existing.tags.length ||
      nextTags.some((t, i) => t !== existing.tags[i]);
    const nameChanged = !!cleanName && cleanName !== existing.name;
    const wasActive = existing.status === "ACTIVE";

    if (wasActive && !tagsChanged && !nameChanged) {
      return { subscriber: existing, created: false };
    }

    const updated = await prisma.subscriber.update({
      where: { id: existing.id },
      data: {
        status: "ACTIVE",
        name: cleanName ?? existing.name,
        ...(tagsChanged ? { tags: nextTags } : {}),
        // Confirming by owner action retires any outstanding opt-in token.
        confirmToken: null,
        confirmExpires: null,
        confirmedAt: existing.confirmedAt ?? new Date(),
        ...(options.source && !existing.source
          ? { source: options.source }
          : {}),
      },
      select: SUBSCRIBER_SELECT,
    });
    // "created" means the list gained a mailable address on this call.
    return { subscriber: updated, created: !wasActive };
  }

  const created = await prisma.subscriber.create({
    data: {
      ownerId,
      email,
      name: cleanName,
      status: "ACTIVE",
      tags,
      source: options.source ?? "manual",
      confirmedAt: new Date(),
      unsubscribeToken: generateUnsubscribeToken(),
    },
    select: SUBSCRIBER_SELECT,
  });
  return { subscriber: created, created: true };
}

export interface PublicSubscribeResult {
  /** What the row looks like after the call. */
  subscriber: SubscriberView;
  /**
   * "pending"   → a confirmation email should be sent with `confirmToken`
   * "active"    → already mailable, nothing to send (idempotent re-subscribe)
   * "confirmed" → double opt-in is disabled, so we activated immediately
   */
  outcome: "pending" | "active" | "confirmed";
  /** Present only when `outcome` is "pending". Mail this, never store it elsewhere. */
  confirmToken?: string;
}

/**
 * Public sign-up on the single Chronicle newsletter list.
 *
 * With double opt-in on (the default) this never produces a mailable address
 * by itself: new, previously-unsubscribed, and still-pending addresses all end
 * up PENDING with a fresh 48h token for the caller to mail. Re-subscribing an
 * address that is already ACTIVE is a silent no-op — we don't re-mail a
 * confirmation to someone who is already on the list, and (importantly) the
 * route's response is worded identically either way so the endpoint can't be
 * used to probe whether an address is subscribed.
 */
export async function addPublicSubscriber(
  emailRaw: string,
  name?: string,
  options: { tags?: string[]; source?: SubscriberSource } = {},
): Promise<PublicSubscribeResult> {
  const ownerId = GLOBAL_NEWSLETTER_OWNER_ID;
  const email = emailRaw.trim().toLowerCase();
  const cleanName = name?.trim() || null;
  const tags = normalizeTags(options.tags);
  const source = options.source ?? "landing";

  if (!isDoubleOptInEnabled()) {
    const { subscriber } = await addSubscriber(ownerId, email, name, {
      tags,
      source,
    });
    return { subscriber, outcome: "confirmed" };
  }

  const existing = await prisma.subscriber.findUnique({
    where: { ownerId_email: { ownerId, email } },
    select: { ...SUBSCRIBER_SELECT },
  });

  const confirmToken = generateConfirmToken();
  const confirmExpires = new Date(
    Date.now() + CONFIRM_TOKEN_TTL_HOURS * 60 * 60 * 1000,
  );

  if (existing) {
    if (existing.status === "ACTIVE") {
      // Already on the list. Update the name if they gave a better one, but
      // send nothing.
      if (cleanName && cleanName !== existing.name) {
        const updated = await prisma.subscriber.update({
          where: { id: existing.id },
          data: { name: cleanName },
          select: SUBSCRIBER_SELECT,
        });
        return { subscriber: updated, outcome: "active" };
      }
      return { subscriber: existing, outcome: "active" };
    }

    // PENDING (link lost or expired) or UNSUBSCRIBED (opting back in). Both
    // get a brand-new token — an old link must not survive a re-request.
    const updated = await prisma.subscriber.update({
      where: { id: existing.id },
      data: {
        status: "PENDING",
        name: cleanName ?? existing.name,
        tags: normalizeTags([...existing.tags, ...tags]),
        confirmToken,
        confirmExpires,
        confirmedAt: null,
      },
      select: SUBSCRIBER_SELECT,
    });
    return { subscriber: updated, outcome: "pending", confirmToken };
  }

  const created = await prisma.subscriber.create({
    data: {
      ownerId,
      email,
      name: cleanName,
      status: "PENDING",
      tags,
      source,
      confirmToken,
      confirmExpires,
      unsubscribeToken: generateUnsubscribeToken(),
    },
    select: SUBSCRIBER_SELECT,
  });
  return { subscriber: created, outcome: "pending", confirmToken };
}

export type ConfirmOutcome =
  | { status: "confirmed"; email: string }
  | { status: "already"; email: string }
  | { status: "expired" }
  | { status: "invalid" };

/**
 * Complete double opt-in by consuming a confirmation token.
 *
 * The token is single-use: it is cleared on success, so a second click reports
 * "already" rather than re-activating. An expired token leaves the row PENDING
 * and reports "expired", which the page turns into "ask us for a fresh link"
 * rather than a dead end.
 */
export async function confirmSubscriberByToken(
  token: string,
): Promise<ConfirmOutcome> {
  if (!token) return { status: "invalid" };

  const row = await prisma.subscriber.findUnique({
    where: { confirmToken: token },
    select: { id: true, email: true, status: true, confirmExpires: true },
  });

  if (!row) {
    // Either a bogus token or one already consumed. We can't tell them apart
    // (consumption clears the column), and both are safe to report as invalid.
    return { status: "invalid" };
  }

  if (row.status === "ACTIVE") {
    return { status: "already", email: row.email };
  }

  if (row.confirmExpires && row.confirmExpires < new Date()) {
    return { status: "expired" };
  }

  await prisma.subscriber.update({
    where: { id: row.id },
    data: {
      status: "ACTIVE",
      confirmToken: null,
      confirmExpires: null,
      confirmedAt: new Date(),
    },
  });
  return { status: "confirmed", email: row.email };
}

/** Replace a subscriber's segment tags. Returns null if the row isn't theirs. */
export async function setSubscriberTags(
  ownerId: string,
  id: string,
  tags: string[],
): Promise<SubscriberView | null> {
  // updateMany scopes by ownerId so a user can't retag another user's row;
  // Prisma's single-row update can only target a unique field.
  const res = await prisma.subscriber.updateMany({
    where: { id, ownerId },
    data: { tags: normalizeTags(tags) },
  });
  if (res.count === 0) return null;
  return prisma.subscriber.findUnique({
    where: { id },
    select: SUBSCRIBER_SELECT,
  });
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

export interface ImportRow {
  email: string;
  name?: string;
  tags?: string[];
}

export interface ImportSummary {
  /** Addresses that were not already on the list. */
  added: number;
  /** Addresses already present — name/tags may have been updated. */
  updated: number;
  /** Rows rejected by the parser or the email check, with their reasons. */
  skipped: Array<{ line: number; value: string; reason: string }>;
  /** Total ACTIVE subscribers after the import. */
  activeTotal: number;
}

/**
 * Bulk-add parsed CSV rows to an owner's list.
 *
 * Imported addresses land ACTIVE without a confirmation email: the owner is
 * asserting they already have consent for this list. That assertion is the
 * owner's to make and the import UI says so plainly — importing a purchased
 * list is a good way to get a sending domain blocked.
 *
 * Rows are applied sequentially. Lists here are hundreds of rows at most, and
 * serial writes keep the per-row error reporting honest — one bad row is
 * skipped rather than failing the batch.
 */
export async function importSubscribers(
  ownerId: string,
  rows: ImportRow[],
  options: { tags?: string[]; source?: SubscriberSource } = {},
): Promise<ImportSummary> {
  const sharedTags = normalizeTags(options.tags);
  const summary: ImportSummary = {
    added: 0,
    updated: 0,
    skipped: [],
    activeTotal: 0,
  };

  // De-duplicate within the file itself so a CSV listing the same address
  // twice counts once and doesn't report a spurious "updated".
  const seen = new Set<string>();

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const email = row.email.trim().toLowerCase();
    if (seen.has(email)) continue;
    seen.add(email);

    try {
      const { created } = await addSubscriber(ownerId, email, row.name, {
        tags: [...sharedTags, ...(row.tags ?? [])],
        source: options.source ?? "import",
      });
      if (created) summary.added += 1;
      else summary.updated += 1;
    } catch {
      // One unwritable row must not fail the batch — record it and continue.
      summary.skipped.push({
        line: i + 1,
        value: email,
        reason: "Could not be saved.",
      });
    }
  }

  summary.activeTotal = await countActiveSubscribers(ownerId);
  return summary;
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
      // Clear any outstanding opt-in token too: unsubscribing from a PENDING
      // state must not leave a live confirm link that could re-activate them.
      data: {
        status: "UNSUBSCRIBED",
        confirmToken: null,
        confirmExpires: null,
      },
    });
  }
  return row.email;
}
