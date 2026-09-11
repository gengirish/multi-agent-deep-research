/**
 * Conversations Service
 * Handles fetching research conversation history
 */

import { ConversationDetail, ConversationLog } from "../types/dto";
import { get } from "./http";

/**
 * List conversations with pagination
 */
export async function listConversations(
  limit = 50,
  offset = 0
): Promise<ConversationLog[]> {
  return get<ConversationLog[]>(
    `/api/conversations?limit=${limit}&offset=${offset}`
  );
}

/**
 * Get conversation details by ID
 */
export async function getConversation(
  conversationId: string
): Promise<ConversationDetail> {
  return get<ConversationDetail>(`/api/conversations/${conversationId}`);
}

/**
 * Format a conversation timestamp for display.
 *
 * The API sends `created_at.isoformat()` — ISO 8601 with no zone suffix, e.g.
 * "2026-09-11T08:58:11.336904". Two things that shape this function:
 *
 *  * Rows written before the move to Postgres carry the old file-storage
 *    format, "YYYYMMDD_HHMMSS_mmmmmm", so both shapes are accepted.
 *  * `created_at` is stored UTC (Postgres `now()` into a naive column), but
 *    JS reads an offset-less date-time as *local* time. Left alone that
 *    silently shifts every row by the viewer's UTC offset — 5.5h in IST — so
 *    the zone is made explicit before parsing.
 *
 * Never throws, and never renders "Invalid Date": an unparseable value falls
 * back to an em dash, because a history row with a bad date is still a row
 * worth showing.
 */
export function formatTimestamp(timestamp: string): string {
  const date = parseTimestamp(timestamp);
  if (!date) return "\u2014";

  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** "YYYYMMDD_HHMMSS" with optional trailing microseconds. */
const LEGACY_COMPACT = /^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/;

/** An explicit zone: trailing "Z", or a "+05:30"/"-0800" offset. */
const HAS_ZONE = /(?:Z|[+-]\d{2}:?\d{2})$/i;

function parseTimestamp(timestamp: string): Date | null {
  const raw = (timestamp ?? "").trim();
  if (!raw) return null;

  const legacy = LEGACY_COMPACT.exec(raw);
  if (legacy) {
    const [, y, mo, d, h, mi, s] = legacy;
    const date = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s));
    // Date.UTC normalises out-of-range parts rather than rejecting them, so
    // "20261301_999999" would quietly become a real date in 2027. Confirm the
    // fields survived the round trip; a plausible wrong date is worse than none.
    const roundTrips =
      date.getUTCFullYear() === +y &&
      date.getUTCMonth() === +mo - 1 &&
      date.getUTCDate() === +d &&
      date.getUTCHours() === +h &&
      date.getUTCMinutes() === +mi &&
      date.getUTCSeconds() === +s;
    return roundTrips ? valid(date) : null;
  }

  // Assume UTC unless the payload says otherwise.
  return valid(new Date(HAS_ZONE.test(raw) ? raw : `${raw}Z`));
}

function valid(date: Date): Date | null {
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
