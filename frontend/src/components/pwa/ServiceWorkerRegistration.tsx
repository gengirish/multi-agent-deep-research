"use client";

import { useEffect, useState } from "react";
import "./ServiceWorkerRegistration.css";

/**
 * Registers the service worker and surfaces an "update available" toast.
 *
 * Update flow (canonical): the SW does NOT skipWaiting on its own. When a new
 * version is installed and is waiting, we show a toast. Clicking "Reload" posts
 * SKIP_WAITING to the waiting worker; once it takes control (`controllerchange`)
 * we reload the page exactly once to pick up the new assets.
 */
export function ServiceWorkerRegistration() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;

    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });

    const trackWaiting = (reg: ServiceWorkerRegistration) => {
      if (reg.waiting && navigator.serviceWorker.controller) {
        setWaiting(reg.waiting);
      }
      reg.addEventListener("updatefound", () => {
        const installing = reg.installing;
        if (!installing) return;
        installing.addEventListener("statechange", () => {
          if (
            installing.state === "installed" &&
            navigator.serviceWorker.controller
          ) {
            setWaiting(installing);
          }
        });
      });
    };

    const register = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((reg) => {
          trackWaiting(reg);
          // Re-check for a new deploy whenever the tab regains focus.
          const onVisible = () => {
            if (document.visibilityState === "visible") reg.update();
          };
          document.addEventListener("visibilitychange", onVisible);
        })
        .catch((err) => {
          // eslint-disable-next-line no-console
          console.warn("[SW] registration failed", err);
        });
    };

    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
    }
  }, []);

  const reload = () => {
    if (!waiting) {
      window.location.reload();
      return;
    }
    waiting.postMessage({ type: "SKIP_WAITING" });
    // controllerchange listener will reload once the new SW activates.
  };

  if (!waiting) return null;

  return (
    <div className="sw-update" role="status" aria-live="polite">
      <span className="sw-update__text">A new version of Chronicle is available.</span>
      <div className="sw-update__actions">
        <button type="button" className="sw-update__btn" onClick={reload}>
          Reload
        </button>
        <button
          type="button"
          className="sw-update__dismiss"
          onClick={() => setWaiting(null)}
          aria-label="Dismiss update notification"
        >
          Later
        </button>
      </div>
    </div>
  );
}
