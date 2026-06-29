"use client";

import { useEffect, useState } from "react";
import "./InstallPrompt.css";

/**
 * Add-to-home-screen UX.
 *
 *  - Chromium / Android: captures the `beforeinstallprompt` event and shows a
 *    branded banner whose button triggers the native install dialog.
 *  - iOS Safari: there is no `beforeinstallprompt`, so we show a short
 *    "Share → Add to Home Screen" hint instead.
 *  - Hidden when already installed (standalone) or recently dismissed.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "chronicle:pwa-install-dismissed";
const SNOOZE_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

function recentlyDismissed(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const ts = Number(raw);
    return Number.isFinite(ts) && Date.now() - ts < SNOOZE_MS;
  } catch {
    return false;
  }
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari exposes this non-standard flag when launched from home screen.
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const iOSDevice = /iphone|ipad|ipod/i.test(ua);
  // iPadOS 13+ reports as Mac; detect by touch points.
  const iPadOS =
    navigator.platform === "MacIntel" &&
    (navigator as unknown as { maxTouchPoints?: number }).maxTouchPoints! > 1;
  return iOSDevice || iPadOS;
}

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isStandalone() || recentlyDismissed()) return;

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    };

    const onInstalled = () => {
      setVisible(false);
      setDeferred(null);
      try {
        localStorage.setItem(DISMISS_KEY, String(Date.now()));
      } catch {
        /* ignore */
      }
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);

    // iOS never fires beforeinstallprompt — show the manual hint after a short
    // delay so it doesn't fight with first paint.
    let iosTimer: ReturnType<typeof setTimeout> | undefined;
    if (isIos()) {
      iosTimer = setTimeout(() => {
        setShowIosHint(true);
        setVisible(true);
      }, 2500);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
      if (iosTimer) clearTimeout(iosTimer);
    };
  }, []);

  const dismiss = () => {
    setVisible(false);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice.catch(() => undefined);
    setDeferred(null);
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="pwa-install" role="dialog" aria-label="Install Chronicle">
      <div className="pwa-install__icon" aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192.png" alt="" width={40} height={40} />
      </div>
      <div className="pwa-install__body">
        <p className="pwa-install__title">Install Chronicle</p>
        {showIosHint ? (
          <p className="pwa-install__text">
            Tap the Share icon, then <strong>Add to Home Screen</strong> to
            install Chronicle as an app.
          </p>
        ) : (
          <p className="pwa-install__text">
            Add it to your home screen for one-tap access and an app-like,
            full-screen experience.
          </p>
        )}
      </div>
      <div className="pwa-install__actions">
        {!showIosHint && (
          <button type="button" className="pwa-install__btn" onClick={install}>
            Install
          </button>
        )}
        <button
          type="button"
          className="pwa-install__dismiss"
          onClick={dismiss}
          aria-label="Dismiss install prompt"
        >
          {showIosHint ? "Got it" : "Not now"}
        </button>
      </div>
    </div>
  );
}
