/**
 * Service-to-service authentication for machine callers.
 *
 * The browser authenticates with the `chronicle-session` cookie, which a
 * server process on another host cannot present. The MCP connector on the
 * FastAPI backend needs to reach a small number of frontend routes (today:
 * broadcast), so those routes accept a bearer token instead.
 *
 * This is deliberately NOT a general-purpose auth path:
 *   - It is checked only by routes that opt in explicitly.
 *   - It grants exactly one identity (the configured operator), never an
 *     arbitrary user, so it cannot be used to act as someone else.
 *   - It is inert unless CHRONICLE_SERVICE_TOKEN is set, matching the
 *     fail-closed posture of the MCP gate in backend/main.py.
 */

import { timingSafeEqual } from "crypto";

/** Identity a valid service token maps to. */
export interface ServiceIdentity {
  sub: string;
  email: string;
  name: string;
}

const SERVICE_SUBJECT = "service__mcp-connector";

/** Constant-time compare that tolerates length mismatch without leaking it. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) {
    // Still burn a comparison so the failure cost does not depend on length.
    timingSafeEqual(ab, ab);
    return false;
  }
  return timingSafeEqual(ab, bb);
}

/**
 * Returns a ServiceIdentity when the request carries a valid service token,
 * otherwise null. Never throws — callers treat null as "not a service call"
 * and fall through to normal session auth.
 */
export function getServiceIdentity(req: Request): ServiceIdentity | null {
  const configured = (process.env.CHRONICLE_SERVICE_TOKEN || "").trim();
  // Fail closed: no token configured means no service access at all.
  if (configured.length < 24) return null;

  const header = req.headers.get("authorization") || "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) return null;

  const presented = match[1].trim();
  if (!presented || !safeEqual(presented, configured)) return null;

  // The operator identity a service call acts as. Falls back to the first
  // configured newsletter admin so audit rows attribute to a real person.
  const email =
    (process.env.NEWSLETTER_ADMIN_EMAILS || "").split(",")[0]?.trim() ||
    "operator@chronicle.local";

  return { sub: SERVICE_SUBJECT, email, name: "Chronicle scheduled job" };
}

export { SERVICE_SUBJECT };
