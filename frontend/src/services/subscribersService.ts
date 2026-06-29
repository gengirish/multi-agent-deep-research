/**
 * Subscribers Service
 *
 * Typed fetch wrappers for the newsletter "audience" endpoints. These are
 * same-origin Next.js route handlers (NOT the Python backend), so we call the
 * relative `/api/...` paths directly instead of going through `http.ts` /
 * `NEXT_PUBLIC_API_URL`.
 *
 * Every wrapper throws `Error(json.error || fallback)` on a non-ok response so
 * callers can surface a single, human-readable message.
 */

export type SubscriberStatus = "ACTIVE" | "UNSUBSCRIBED";

export interface Subscriber {
  id: string;
  email: string;
  name: string | null;
  status: SubscriberStatus;
  createdAt: string;
}

export interface AddSubscriberResult {
  subscriber: Subscriber;
  created: boolean;
}

export interface BroadcastResult {
  ok: true;
  sentCount: number;
  recipientCount: number;
  message: string;
}

async function parseJson(res: Response): Promise<any> {
  return res.json().catch(() => ({}));
}

/** `GET /api/subscribers` → list of subscribers. */
export async function listSubscribers(): Promise<Subscriber[]> {
  const res = await fetch("/api/subscribers", {
    method: "GET",
    cache: "no-store",
    credentials: "same-origin",
  });
  const json = await parseJson(res);
  if (!res.ok) {
    throw new Error(json.error || `Could not load subscribers (${res.status})`);
  }
  return Array.isArray(json.subscribers) ? json.subscribers : [];
}

/** `POST /api/subscribers` → create (or return existing) subscriber. */
export async function addSubscriber(
  email: string,
  name?: string,
): Promise<AddSubscriberResult> {
  const trimmedName = name?.trim();
  const res = await fetch("/api/subscribers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({
      email: email.trim(),
      ...(trimmedName ? { name: trimmedName } : {}),
    }),
  });
  const json = await parseJson(res);
  if (!res.ok) {
    throw new Error(json.error || `Could not add subscriber (${res.status})`);
  }
  return json as AddSubscriberResult;
}

/** `DELETE /api/subscribers/{id}` → remove a subscriber. */
export async function deleteSubscriber(id: string): Promise<void> {
  const res = await fetch(`/api/subscribers/${encodeURIComponent(id)}`, {
    method: "DELETE",
    credentials: "same-origin",
  });
  const json = await parseJson(res);
  if (!res.ok) {
    throw new Error(json.error || `Could not remove subscriber (${res.status})`);
  }
}

/** `POST /api/reports/{jobId}/broadcast` → email a briefing to all subscribers. */
export async function broadcastReport(
  jobId: string,
  note?: string,
): Promise<BroadcastResult> {
  const trimmedNote = note?.trim();
  const res = await fetch(
    `/api/reports/${encodeURIComponent(jobId)}/broadcast`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(trimmedNote ? { note: trimmedNote } : {}),
    },
  );
  const json = await parseJson(res);
  if (!res.ok) {
    throw new Error(json.error || `Broadcast failed (${res.status})`);
  }
  return json as BroadcastResult;
}
