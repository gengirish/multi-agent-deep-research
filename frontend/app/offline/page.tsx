"use client";

import React from "react";

export default function OfflinePage() {
  const handleRetry = () => {
    if (typeof window !== "undefined") window.location.reload();
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        padding: 24,
        background: "#0b1220",
        color: "#e2e8f0",
        fontFamily: "var(--font-inter), system-ui, sans-serif",
        textAlign: "center",
      }}
    >
      <svg width="64" height="64" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M2 8.82a15 15 0 0120 0M5 12.859a10 10 0 0114 0M8.5 16.429a5 5 0 017 0M12 20h.01"
          stroke="#64748b"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <line
          x1="3"
          y1="3"
          x2="21"
          y2="21"
          stroke="#ef4444"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
      <h1 style={{ fontSize: "1.6rem", fontWeight: 700, margin: 0 }}>
        You&rsquo;re offline
      </h1>
      <p style={{ color: "#94a3b8", maxWidth: 420, lineHeight: 1.6 }}>
        Chronicle needs a network connection to run the multi-agent research
        pipeline. Check your connection and try again.
      </p>
      <button
        onClick={handleRetry}
        style={{
          marginTop: 8,
          padding: "10px 20px",
          borderRadius: 10,
          border: "1px solid rgba(129,140,248,0.3)",
          background:
            "linear-gradient(135deg, rgba(99,102,241,0.18), rgba(14,165,233,0.12))",
          color: "#f8fafc",
          cursor: "pointer",
          fontWeight: 600,
          fontSize: "0.95rem",
        }}
      >
        Try again
      </button>
    </main>
  );
}
