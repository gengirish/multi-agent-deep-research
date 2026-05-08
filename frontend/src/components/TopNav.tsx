"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import "./TopNav.css";

interface TopNavProps {
  variant?: "landing" | "app";
}

interface NavItemProps {
  href: string;
  label: string;
}

const NavItem: React.FC<NavItemProps> = ({ href, label }) => {
  const pathname = usePathname();
  const isActive = pathname === href || pathname?.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      className={`topnav__link${isActive ? " active" : ""}`}
    >
      {label}
    </Link>
  );
};

export const TopNav: React.FC<TopNavProps> = ({ variant = "app" }) => {
  return (
    <header className={`topnav topnav--${variant}`} role="banner">
      <div className="topnav__inner">
        <Link href="/" className="topnav__brand" aria-label="Chronicle home">
          <span className="topnav__logo" aria-hidden="true">
            <svg viewBox="0 0 64 64" width="28" height="28">
              <defs>
                <linearGradient id="topnav-grad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#6366f1" />
                  <stop offset="1" stopColor="#0ea5e9" />
                </linearGradient>
              </defs>
              <rect width="64" height="64" rx="14" fill="url(#topnav-grad)" />
              <path
                d="M20 22 L20 42 M20 22 L32 22 M20 32 L30 32 M40 22 L44 42 L48 22"
                stroke="white"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            </svg>
          </span>
          <span className="topnav__brandname">Chronicle</span>
        </Link>

        <nav className="topnav__nav" aria-label="Primary">
          <NavItem href="/research" label="Research" />
          <NavItem href="/visualizations" label="Visualizations" />
          <NavItem href="/about" label="About" />
          <a
            className="topnav__link"
            href="https://github.com/gengirish/multi-agent-deep-research"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub
          </a>
          <Link href="/research" className="topnav__cta">
            Try a query
          </Link>
        </nav>
      </div>
    </header>
  );
};
