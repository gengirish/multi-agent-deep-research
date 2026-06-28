"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession, type SessionUser } from "../../hooks/useSession";
import "./UserMenu.css";

function initialFor(user: SessionUser): string {
  const source = (user.name && user.name.trim()) || user.email || "?";
  const first = source.trim().charAt(0);
  return first ? first.toUpperCase() : "?";
}

function displayNameFor(user: SessionUser): string {
  if (user.name && user.name.trim()) return user.name.trim();
  return user.email;
}

export const UserMenu: React.FC = () => {
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const { user, loading, refresh } = useSession();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      const node = wrapperRef.current;
      if (node && !node.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const handleSignOut = useCallback(async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
      });
    } catch {
      // Network failures are non-fatal — the cookie is httpOnly so the
      // user can re-attempt logout. We still want to refresh local state.
    } finally {
      setOpen(false);
      await refresh();
      router.refresh();
      router.push("/");
      setSigningOut(false);
    }
  }, [refresh, router, signingOut]);

  // Loading skeleton: keeps layout stable while /api/auth/me is in flight.
  if (loading) {
    return (
      <div className="usermenu usermenu--loading" aria-hidden="true">
        <span className="usermenu__avatar usermenu__avatar--skeleton" />
      </div>
    );
  }

  if (!user) {
    const redirectTarget = pathname || "/";
    const href = `/sign-in?redirect=${encodeURIComponent(redirectTarget)}`;
    return (
      <Link href={href} className="usermenu__signin" aria-label="Sign in">
        Sign in
      </Link>
    );
  }

  const initial = initialFor(user);
  const name = displayNameFor(user);

  return (
    <div className="usermenu" ref={wrapperRef}>
      <button
        type="button"
        ref={triggerRef}
        className="usermenu__trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${name}`}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="usermenu__avatar" aria-hidden="true">
          {initial}
        </span>
      </button>

      {open && (
        <div
          className="usermenu__dropdown"
          role="menu"
          aria-label="Account menu"
        >
          <div className="usermenu__identity">
            <span className="usermenu__avatar usermenu__avatar--lg" aria-hidden="true">
              {initial}
            </span>
            <div className="usermenu__identity-text">
              <span className="usermenu__name">{name}</span>
              <span className="usermenu__email">{user.email}</span>
            </div>
          </div>

          <div className="usermenu__divider" role="separator" />

          <button
            type="button"
            className="usermenu__item"
            role="menuitem"
            onClick={handleSignOut}
            disabled={signingOut}
          >
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              aria-hidden="true"
              fill="none"
            >
              <path
                d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M10 17l-5-5 5-5M5 12h11"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span>{signingOut ? "Signing out…" : "Sign out"}</span>
          </button>
        </div>
      )}
    </div>
  );
};
