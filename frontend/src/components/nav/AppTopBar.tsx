"use client";

import React from "react";
import Link from "next/link";
import { Breadcrumbs } from "./Breadcrumbs";
import "./AppTopBar.css";

interface Props {
  onOpenMobileNav: () => void;
  onOpenPalette: () => void;
  onShowShortcuts: () => void;
  isMac: boolean;
}

export const AppTopBar: React.FC<Props> = ({
  onOpenMobileNav,
  onOpenPalette,
  onShowShortcuts,
  isMac,
}) => {
  return (
    <header className="apptop" role="banner">
      <button
        type="button"
        className="apptop__hamburger"
        onClick={onOpenMobileNav}
        aria-label="Open navigation"
      >
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path
            d="M4 7h16M4 12h16M4 17h16"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      </button>

      <Link href="/" className="apptop__brand" aria-label="Chronicle home">
        <svg viewBox="0 0 64 64" width="22" height="22" aria-hidden="true">
          <defs>
            <linearGradient id="apptop-grad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#6366f1" />
              <stop offset="1" stopColor="#0ea5e9" />
            </linearGradient>
          </defs>
          <rect width="64" height="64" rx="14" fill="url(#apptop-grad)" />
          <path
            d="M20 22 L20 42 M20 22 L32 22 M20 32 L30 32 M40 22 L44 42 L48 22"
            stroke="white"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
        <span className="apptop__brandname">Chronicle</span>
      </Link>

      <Breadcrumbs />

      <div className="apptop__actions">
        <button
          type="button"
          className="apptop__search"
          onClick={onOpenPalette}
          aria-label="Open command palette"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <circle
              cx="11"
              cy="11"
              r="7"
              stroke="currentColor"
              strokeWidth="1.7"
              fill="none"
            />
            <path
              d="m20 20-3.5-3.5"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
            />
          </svg>
          <span className="apptop__search-label">Search Chronicle…</span>
          <kbd className="apptop__kbd">{isMac ? "⌘ K" : "Ctrl K"}</kbd>
        </button>

        <button
          type="button"
          className="apptop__icon-btn"
          onClick={onShowShortcuts}
          aria-label="Keyboard shortcuts"
          title="Keyboard shortcuts (?)"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <rect
              x="3"
              y="6"
              width="18"
              height="12"
              rx="2"
              stroke="currentColor"
              strokeWidth="1.7"
              fill="none"
            />
            <path
              d="M7 10h.01M11 10h.01M15 10h.01M7 14h10"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
    </header>
  );
};
