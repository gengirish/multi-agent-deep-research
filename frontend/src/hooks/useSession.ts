"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Shape of the authenticated user returned from `GET /api/auth/me`.
 * Mirrors the JWT claims surfaced by the middleware so callers only ever
 * see a consistent, sanitized object — never a raw token.
 */
export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  orgId: string | null;
  orgRole: string | null;
}

export interface SessionState {
  user: SessionUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

interface MeResponse {
  user?: SessionUser | null;
}

/**
 * Lightweight client-side session hook.
 *
 * Chronicle's auth model is auth-optional, so this hook never throws —
 * an anonymous visitor simply gets `{ user: null, loading: false }` once
 * the first `/api/auth/me` round-trip completes. Use `refresh()` after
 * sign-in / sign-up / sign-out to immediately re-sync UI state.
 */
export function useSession(): SessionState {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const load = useCallback(async (signal?: AbortSignal): Promise<void> => {
    try {
      const response = await fetch("/api/auth/me", {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
        signal,
      });
      if (!response.ok) {
        setUser(null);
        return;
      }
      const data = (await response.json()) as MeResponse;
      setUser(data.user ?? null);
    } catch (err) {
      // Aborted fetches are expected during unmount; swallow them.
      if ((err as { name?: string } | null)?.name === "AbortError") return;
      setUser(null);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    load(controller.signal).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => {
      controller.abort();
    };
  }, [load]);

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true);
    await load();
    setLoading(false);
  }, [load]);

  return { user, loading, refresh };
}
