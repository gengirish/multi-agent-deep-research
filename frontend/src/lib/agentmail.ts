/**
 * AgentMail client wrapper for Chronicle transactional email.
 *
 * Why a wrapper?
 *   The AgentMail SDK requires an `inboxId` for sending, but we only carry a
 *   sender address (`alerts@intelliforge.tech`) in env. We resolve the address
 *   to an inboxId once via `inboxes.list()` and memoize the result on the
 *   module — Vercel keeps modules warm across requests on the same Lambda, so
 *   the lookup is a cold-start cost only.
 *
 * Graceful degradation:
 *   If `AGENTMAIL_API_KEY` is unset (local dev, preview without secrets, etc.)
 *   `sendEmail()` returns `false` instead of throwing. The auth-email layer
 *   sees that and falls back to console-logging the link, so devs are never
 *   blocked by missing credentials.
 */

import { AgentMailClient } from "agentmail";

const DEFAULT_SENDER = "alerts@intelliforge.tech";
const FROM_EMAIL = (process.env.AGENTMAIL_FROM_EMAIL || DEFAULT_SENDER).toLowerCase();

let _client: AgentMailClient | null = null;
let _cachedInboxId: string | null = null;
let _cachedInboxLookupPromise: Promise<string | null> | null = null;

function getClient(): AgentMailClient | null {
  if (_client) return _client;
  const apiKey = process.env.AGENTMAIL_API_KEY;
  if (!apiKey) return null;
  _client = new AgentMailClient({ apiKey });
  return _client;
}

async function resolveSenderInboxId(): Promise<string | null> {
  if (_cachedInboxId) return _cachedInboxId;

  // Dedupe concurrent cold-start resolutions: many simultaneous requests on a
  // fresh Lambda would otherwise each issue an inboxes.list() call.
  if (_cachedInboxLookupPromise) return _cachedInboxLookupPromise;

  const client = getClient();
  if (!client) return null;

  _cachedInboxLookupPromise = (async () => {
    try {
      // Page through inboxes once until we find FROM_EMAIL. Most accounts
      // have a small handful, so the first page is typically enough.
      let pageToken: string | undefined;
      do {
        const page = await client.inboxes.list({ pageToken, limit: 100 });
        const match = page.inboxes.find(
          (i) => (i.email ?? "").toLowerCase() === FROM_EMAIL,
        );
        if (match) {
          _cachedInboxId = match.inboxId;
          return _cachedInboxId;
        }
        pageToken = page.nextPageToken;
      } while (pageToken);

      // eslint-disable-next-line no-console
      console.warn(
        `[agentmail] sender inbox ${FROM_EMAIL} not found — emails will fall back to console log`,
      );
      return null;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[agentmail] inbox lookup failed:", err);
      return null;
    } finally {
      _cachedInboxLookupPromise = null;
    }
  })();

  return _cachedInboxLookupPromise;
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * Send a transactional email through AgentMail. Returns true on success.
 * Returns false (without throwing) if AgentMail is unconfigured or fails —
 * callers should treat that as "send did not happen" and degrade gracefully
 * (e.g. log the reset link to console for local dev).
 */
export async function sendEmail(opts: SendEmailOptions): Promise<boolean> {
  const client = getClient();
  if (!client) return false;

  const inboxId = await resolveSenderInboxId();
  if (!inboxId) return false;

  try {
    await client.inboxes.messages.send(inboxId, {
      to: [opts.to],
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    });
    return true;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[agentmail] send to ${opts.to} failed:`, err);
    return false;
  }
}

export function getSenderEmail(): string {
  return FROM_EMAIL;
}
