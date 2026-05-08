"use client";

import React, { useState } from "react";
import { Sidebar } from "../../src/components/Sidebar";
import { TopNav } from "../../src/components/TopNav";

export default function AppShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Sidebar's onQuerySelect is a legacy prop chain from the previous Vite
  // app. The new flow uses URL-based ?q= deep links from the landing page,
  // so this is a no-op stub kept for sidebar API compatibility.
  const handleQuerySelect = (_q: string) => {};

  return (
    <div
      className={`app-container ${sidebarOpen ? "sidebar-open" : ""}`}
      role="main"
    >
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <Sidebar
        onQuerySelect={handleQuerySelect}
        isOpen={sidebarOpen}
        onToggle={setSidebarOpen}
      />

      <TopNav variant="app" />

      <main id="main-content" className="app-main">
        {children}
      </main>

      <footer className="app-footer" role="contentinfo">
        <p>
          Chronicle &middot; AI research copilot for founders &middot;{" "}
          <a
            href="https://intelliforge.tech"
            target="_blank"
            rel="noopener noreferrer"
            style={{ marginLeft: 6 }}
          >
            IntelliForge AI
          </a>
        </p>
      </footer>
    </div>
  );
}
