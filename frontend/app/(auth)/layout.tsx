import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import "../../src/components/auth/AuthShell.css";

export const metadata: Metadata = {
  title: "Account",
  robots: { index: false, follow: false },
};

const ChronicleMark = () => (
  <svg
    viewBox="0 0 64 64"
    width="26"
    height="26"
    aria-hidden="true"
    className="auth__brand-mark"
  >
    <defs>
      <linearGradient id="auth-brand-grad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#6366f1" />
        <stop offset="1" stopColor="#0ea5e9" />
      </linearGradient>
    </defs>
    <rect width="64" height="64" rx="14" fill="url(#auth-brand-grad)" />
    <path
      d="M20 22 L20 42 M20 22 L32 22 M20 32 L30 32 M40 22 L44 42 L48 22"
      stroke="white"
      strokeWidth="4"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  </svg>
);

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="auth">
      <div className="auth__bg" aria-hidden="true">
        <div className="auth__glow auth__glow--a" />
        <div className="auth__glow auth__glow--b" />
        <div className="auth__grid" />
      </div>

      <Link href="/" className="auth__brand" aria-label="Chronicle home">
        <ChronicleMark />
        <span>Chronicle</span>
      </Link>

      <main className="auth__card" role="main">
        {children}
      </main>

      <p className="auth__footer">
        Chronicle &middot; AI research copilot for founders
      </p>
    </div>
  );
}
