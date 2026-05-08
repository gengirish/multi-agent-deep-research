"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRecentSessions } from "../../hooks/useRecentSessions";
import "./AppSidebar.css";

interface Props {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  shortcut: string;
}

const Icon = {
  Research: () => (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="11"
        cy="11"
        r="6"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path
        d="m20 20-3.5-3.5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  ),
  History: () => (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
      <path
        d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 7v5l3 2"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  Visualizations: () => (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
      <path
        d="M4 20V10M10 20V4M16 20v-7M22 20H2"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  ),
  Settings: () => (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  About: () => (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M12 11v5M12 8v.01"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  ),
  Collapse: () => (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
      <path
        d="M14 6l-6 6 6 6"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  Expand: () => (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
      <path
        d="M10 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
};

const PRIMARY: NavItem[] = [
  { href: "/research", label: "Research", icon: <Icon.Research />, shortcut: "G R" },
  { href: "/history", label: "History", icon: <Icon.History />, shortcut: "G H" },
  {
    href: "/visualizations",
    label: "Visualizations",
    icon: <Icon.Visualizations />,
    shortcut: "G V",
  },
];

const SECONDARY: NavItem[] = [
  { href: "/settings", label: "Settings", icon: <Icon.Settings />, shortcut: "G S" },
  { href: "/about", label: "About", icon: <Icon.About />, shortcut: "G A" },
];

export const AppSidebar: React.FC<Props> = ({
  collapsed,
  onToggleCollapsed,
  mobileOpen,
  onCloseMobile,
}) => {
  const pathname = usePathname() ?? "";
  const { sessions, loading } = useRecentSessions(5);

  const renderItem = (item: NavItem) => {
    const isActive =
      pathname === item.href || pathname.startsWith(`${item.href}/`);
    return (
      <Link
        key={item.href}
        href={item.href}
        className={`appsb__nav-item${isActive ? " active" : ""}`}
        title={collapsed ? `${item.label} (${item.shortcut})` : undefined}
        onClick={onCloseMobile}
        aria-current={isActive ? "page" : undefined}
      >
        <span className="appsb__icon">{item.icon}</span>
        <span className="appsb__label">{item.label}</span>
        {!collapsed && (
          <kbd className="appsb__shortcut" aria-hidden="true">
            {item.shortcut}
          </kbd>
        )}
      </Link>
    );
  };

  return (
    <>
      {mobileOpen && (
        <div
          className="appsb__mobile-overlay"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      <aside
        className={[
          "appsb",
          collapsed ? "appsb--collapsed" : "",
          mobileOpen ? "appsb--mobile-open" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        aria-label="Workspace navigation"
      >
        <div className="appsb__primary">
          <Link
            href="/research"
            className="appsb__cta"
            title={collapsed ? "New research (N)" : undefined}
            onClick={onCloseMobile}
          >
            <span className="appsb__cta-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
                <path
                  d="M12 5v14M5 12h14"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <span className="appsb__cta-label">New research</span>
            {!collapsed && (
              <kbd className="appsb__shortcut" aria-hidden="true">
                N
              </kbd>
            )}
          </Link>

          <nav className="appsb__nav" aria-label="Primary">
            {PRIMARY.map(renderItem)}
          </nav>
        </div>

        {!collapsed && (
          <div className="appsb__recent">
            <div className="appsb__group-label">Recent</div>
            {loading && (
              <div className="appsb__recent-loading" aria-hidden="true">
                <div className="appsb__skel" />
                <div className="appsb__skel" />
                <div className="appsb__skel" />
              </div>
            )}
            {!loading && sessions.length === 0 && (
              <div className="appsb__recent-empty">
                Your recent research will appear here.
              </div>
            )}
            {!loading &&
              sessions.map((s) => {
                const isActive = pathname === `/history/${s.id}`;
                return (
                  <Link
                    key={s.id}
                    href={`/history/${s.id}`}
                    className={`appsb__recent-item${isActive ? " active" : ""}`}
                    title={s.query || s.id}
                    onClick={onCloseMobile}
                  >
                    {s.query || `Session ${s.id.slice(0, 8)}`}
                  </Link>
                );
              })}
          </div>
        )}

        <div className="appsb__footer">
          <nav className="appsb__nav" aria-label="Secondary">
            {SECONDARY.map(renderItem)}
          </nav>
          <button
            type="button"
            className="appsb__collapse-btn"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <Icon.Expand /> : <Icon.Collapse />}
            {!collapsed && (
              <span className="appsb__collapse-label">Collapse</span>
            )}
          </button>
        </div>
      </aside>
    </>
  );
};
