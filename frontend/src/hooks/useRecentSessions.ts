"use client";

import { useEffect, useState } from "react";
import { listConversations } from "../services/conversationsService";
import type { ConversationLog } from "../types/dto";

interface State {
  sessions: ConversationLog[];
  loading: boolean;
  error: Error | null;
}

/**
 * Fetches the N most recent research sessions. Used by the sidebar and the
 * command palette.
 */
export function useRecentSessions(limit = 5): State {
  const [state, setState] = useState<State>({
    sessions: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    let active = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    listConversations(limit, 0)
      .then((sessions) => {
        if (active) setState({ sessions, loading: false, error: null });
      })
      .catch((err) => {
        if (active)
          setState({
            sessions: [],
            loading: false,
            error: err instanceof Error ? err : new Error("Failed to load"),
          });
      });
    return () => {
      active = false;
    };
  }, [limit]);

  return state;
}
