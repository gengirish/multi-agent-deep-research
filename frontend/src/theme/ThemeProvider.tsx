"use client";

/**
 * Theme state for the app: "light", "dark", or "system".
 *
 * The resolved theme is written to <html data-theme="..."> and every colour in
 * the stylesheets reads from tokens that are redefined under that attribute.
 * Nothing else should branch on theme at runtime.
 *
 * Three states rather than two on purpose: "system" is the default and keeps
 * following the OS after the user changes it, which a plain boolean cannot
 * express once it has been persisted.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "chronicle:theme";

interface ThemeContextValue {
  /** What the user chose, including "system". */
  preference: ThemePreference;
  /** What is actually rendered right now. Never "system". */
  resolved: ResolvedTheme;
  setPreference: (next: ThemePreference) => void;
  /** Flip between light and dark, leaving "system" behind. */
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function systemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

function readStored(): ThemePreference {
  if (typeof window === "undefined") return "system";
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (raw === "light" || raw === "dark" || raw === "system") return raw;
  } catch {
    // Private mode / blocked storage. Fall through to the system default.
  }
  return "system";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Start from the same value the inline script in <head> used, so the first
  // client render matches the server-painted DOM and React does not warn.
  const [preference, setPreferenceState] = useState<ThemePreference>("system");
  const [systemResolved, setSystemResolved] = useState<ResolvedTheme>("dark");

  // Hydrate from storage after mount. Reading localStorage during render would
  // desync server and client HTML.
  useEffect(() => {
    setPreferenceState(readStored());
    setSystemResolved(systemTheme());
  }, []);

  // Keep following the OS while the preference is "system".
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => setSystemResolved(mq.matches ? "light" : "dark");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const resolved: ResolvedTheme =
    preference === "system" ? systemResolved : preference;

  // Single writer for the attribute the CSS keys off.
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", resolved);
    // Tells the browser to theme form controls, scrollbars and the like.
    root.style.colorScheme = resolved;
  }, [resolved]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Storage unavailable — the choice still applies for this session.
    }
  }, []);

  const toggle = useCallback(() => {
    setPreference(resolved === "dark" ? "light" : "dark");
  }, [resolved, setPreference]);

  const value = useMemo(
    () => ({ preference, resolved, setPreference, toggle }),
    [preference, resolved, setPreference, toggle],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}
