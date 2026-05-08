"use client";

import { useEffect } from "react";

interface Handlers {
  onOpenPalette?: () => void;
  onShowHelp?: () => void;
  onCloseAll?: () => void;
  onGoTo?: (target: "research" | "history" | "visualizations" | "settings" | "about" | "home") => void;
  onNewResearch?: () => void;
}

/**
 * Global keyboard shortcuts. Skips firing while focus is in an editable field
 * so we don't hijack typing.
 *
 * Shortcuts:
 *   Cmd/Ctrl+K     → open command palette
 *   ?              → show keyboard shortcut help
 *   ESC            → close any open overlay (handled by caller via onCloseAll)
 *   N              → new research
 *   G then R/H/V/S/A/Home → navigate to /research, /history, /visualizations,
 *                          /settings, /about, /
 */
export function useGlobalShortcuts(handlers: Handlers) {
  useEffect(() => {
    let leaderActive = false;
    let leaderTimer: ReturnType<typeof setTimeout> | null = null;

    function isInEditable(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
      if (target.isContentEditable) return true;
      const role = target.getAttribute("role");
      if (role === "textbox" || role === "combobox") return true;
      return false;
    }

    function clearLeader() {
      leaderActive = false;
      if (leaderTimer) {
        clearTimeout(leaderTimer);
        leaderTimer = null;
      }
    }

    function onKeyDown(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;

      // Cmd/Ctrl+K — palette (works even from inside fields)
      if (meta && e.key.toLowerCase() === "k") {
        e.preventDefault();
        handlers.onOpenPalette?.();
        return;
      }

      // ESC — close overlays (works even from inside fields)
      if (e.key === "Escape") {
        handlers.onCloseAll?.();
        clearLeader();
        return;
      }

      if (isInEditable(e.target)) return;

      // ? — help overlay
      if (e.key === "?" && !meta) {
        e.preventDefault();
        handlers.onShowHelp?.();
        return;
      }

      // N — new research
      if (e.key.toLowerCase() === "n" && !meta) {
        e.preventDefault();
        handlers.onNewResearch?.();
        return;
      }

      // G as leader for "Go to" shortcuts
      if (e.key.toLowerCase() === "g" && !meta && !leaderActive) {
        e.preventDefault();
        leaderActive = true;
        leaderTimer = setTimeout(clearLeader, 1500);
        return;
      }

      if (leaderActive) {
        const key = e.key.toLowerCase();
        const map: Record<
          string,
          "research" | "history" | "visualizations" | "settings" | "about" | "home"
        > = {
          r: "research",
          h: "history",
          v: "visualizations",
          s: "settings",
          a: "about",
          i: "home",
        };
        if (map[key]) {
          e.preventDefault();
          handlers.onGoTo?.(map[key]);
        }
        clearLeader();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      if (leaderTimer) clearTimeout(leaderTimer);
    };
  }, [handlers]);
}
