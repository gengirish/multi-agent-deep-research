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

export type SubscriberStatus = "PENDING" | "ACTIVE" | "UNSUBSCRIBED";

export interface Subscriber {
  id: string;
  email: string;
  name: string | null;
  status: SubscriberStatus;
  /** Lower-cased segment labels. Normalized server-side. */
  tags: string[];
  /** Capture surface: landing | report | newsletter | manual | import. */
  source: string | null;
  createdAt: string;
}

/** One segment with its membership counts across the whole list. */
export interface Segment {
  tag: string;
  total: number;
  active: number;
}

export interface SubscriberList {
  subscribers: Subscriber[];
  segments: Segment[];
}

export interface AddSubscriberResult {
  subscriber: Subscriber;
  created: boolean;
}

export interface ImportResult {
  ok: true;
  added: number;
  updated: number;
  skippedCount: number;
  skipped: Array<{ line: number; value: string; reason: string }>;
  activeTotal: number;
}

export interface BroadcastResult {
  ok: true;
  sentCount: number;
  recipientCount: number;
  segment: string | null;
  message: string;
}

async function parseJson(res: Response): Promise<any> {
  return res.json().catch(() => ({}));
}

/**
 * `GET /api/subscribers` → subscribers plus the segment index.
 *
 * `tag` filters the returned subscribers to one segment; the segment counts
 * always describe the whole list, so the filter UI keeps every option visible
 * while a filter is applied.
 */
export async function listSubscribers(tag?: string): Promise<SubscriberList> {
  const qs = tag ? `?tag=${encodeURIComponent(tag)}` : "";
  const res = await fetch(`/api/subscribers${qs}`, {
    method: "GET",
    cache: "no-store",
    credentials: "same-origin",
  });
  const json = await parseJson(res);
  if (!res.ok) {
    throw new Error(json.error || `Could not load subscribers (${res.status})`);
  }
  return {
    subscribers: Array.isArray(json.subscribers) ? json.subscribers : [],
    segments: Array.isArray(json.segments) ? json.segments : [],
  };
}

/** `POST /api/subscribers` → create (or return existing) subscriber. */
export async function addSubscriber(
  email: string,
  name?: string,
  tags?: string[],
): Promise<AddSubscriberResult> {
  const trimmedName = name?.trim();
  const cleanTags = (tags ?? []).map((t) => t.trim()).filter(Boolean);
  const res = await fetch("/api/subscribers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({
      email: email.trim(),
      ...(trimmedName ? { name: trimmedName } : {}),
      ...(cleanTags.length ? { tags: cleanTags } : {}),
    }),
  });
  const json = await parseJson(res);
  if (!res.ok) {
    throw new Error(json.error || `Could not add subscriber (${res.status})`);
  }
  return json as AddSubscriberResult;
}

/** `PATCH /api/subscribers/{id}` → replace a subscriber's segments. */
export async function updateSubscriberTags(
  id: string,
  tags: string[],
): Promise<Subscriber> {
  const res = await fetch(`/api/subscribers/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({
      tags: tags.map((t) => t.trim()).filter(Boolean),
    }),
  });
  const json = await parseJson(res);
  if (!res.ok) {
    throw new Error(json.error || `Could not update segments (${res.status})`);
  }
  return json.subscriber as Subscriber;
}

/** `POST /api/subscribers/import` → bulk-add a CSV of contacts. */
export async function importSubscribers(
  csv: string,
  tags?: string[],
): Promise<ImportResult> {
  const cleanTags = (tags ?? []).map((t) => t.trim()).filter(Boolean);
  const res = await fetch("/api/subscribers/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({
      csv,
      ...(cleanTags.length ? { tags: cleanTags } : {}),
    }),
  });
  const json = await parseJson(res);
  if (!res.ok) {
    throw new Error(json.error || `Import failed (${res.status})`);
  }
  return json as ImportResult;
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
  segment?: string,
): Promise<BroadcastResult> {
  const trimmedNote = note?.trim();
  const trimmedSegment = segment?.trim();
  const res = await fetch(
    `/api/reports/${encodeURIComponent(jobId)}/broadcast`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        ...(trimmedNote ? { note: trimmedNote } : {}),
        ...(trimmedSegment ? { segment: trimmedSegment } : {}),
      }),
    },
  );
  const json = await parseJson(res);
  if (!res.ok) {
    throw new Error(json.error || `Broadcast failed (${res.status})`);
  }
  return json as BroadcastResult;
}
