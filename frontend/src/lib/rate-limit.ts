// In-memory sliding-window rate limiter.
//
// Each `key` (e.g. "signin:1.2.3.4") tracks the timestamps of recent calls.
// Stale timestamps outside the window are pruned on every call so the map
// can't grow unboundedly even when callers churn through unique keys.
//
// Limitations: state is per-process, so multiple serverless instances and
// horizontally-scaled deployments will each have their own bucket. Replace
// with Redis / Upstash before relying on this for security-critical limits.

const buckets = new Map<string, number[]>();

export function rateLimit(
  key: string,
  max: number,
  windowMs: number,
): boolean {
  const now = Date.now();
  const cutoff = now - windowMs;

  // Sweep all entries to evict expired timestamps. O(N) per call; acceptable
  // for the modest auth-route traffic this guard sees.
  for (const [k, timestamps] of buckets) {
    const fresh: number[] = [];
    for (const t of timestamps) {
      if (t > cutoff) fresh.push(t);
    }
    if (fresh.length === 0) {
      buckets.delete(k);
    } else if (fresh.length !== timestamps.length) {
      buckets.set(k, fresh);
    }
  }

  const current = buckets.get(key) ?? [];
  if (current.length >= max) {
    return false;
  }
  current.push(now);
  buckets.set(key, current);
  return true;
}
