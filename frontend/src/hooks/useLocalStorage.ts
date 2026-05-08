"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * SSR-safe localStorage hook. Returns the stored value on the client and
 * the initial value during server render to avoid hydration mismatches.
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T
): [T, (value: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(initialValue);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw !== null) {
        setValue(JSON.parse(raw) as T);
      }
    } catch {
      // ignore parse errors
    } finally {
      setHydrated(true);
    }
  }, [key]);

  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const resolved =
          typeof next === "function" ? (next as (p: T) => T)(prev) : next;
        if (typeof window !== "undefined") {
          try {
            window.localStorage.setItem(key, JSON.stringify(resolved));
          } catch {
            // ignore quota errors
          }
        }
        return resolved;
      });
    },
    [key]
  );

  // Caller can opt to read `hydrated` if they need to avoid flash of initial.
  void hydrated;

  return [value, set];
}
