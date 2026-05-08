"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppSidebar } from "../../src/components/nav/AppSidebar";
import { AppTopBar } from "../../src/components/nav/AppTopBar";
import { CommandPalette } from "../../src/components/nav/CommandPalette";
import { ShortcutsHelp } from "../../src/components/nav/ShortcutsHelp";
import { useGlobalShortcuts } from "../../src/hooks/useGlobalShortcuts";
import { useLocalStorage } from "../../src/hooks/useLocalStorage";
import { useMediaQuery } from "../../src/hooks/useMediaQuery";
import "./layout.css";

export default function AppShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const isMobile = useMediaQuery("(max-width: 900px)");
  const [collapsed, setCollapsed] = useLocalStorage<boolean>(
    "chronicle:sidebar-collapsed",
    false
  );
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    if (typeof navigator !== "undefined") {
      setIsMac(/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent));
    }
  }, []);

  // Close mobile drawer when viewport leaves mobile range
  useEffect(() => {
    if (!isMobile) setMobileNavOpen(false);
  }, [isMobile]);

  const closeAll = useCallback(() => {
    setPaletteOpen(false);
    setShortcutsOpen(false);
    setMobileNavOpen(false);
  }, []);

  useGlobalShortcuts({
    onOpenPalette: () => {
      setShortcutsOpen(false);
      setPaletteOpen(true);
    },
    onShowHelp: () => {
      setPaletteOpen(false);
      setShortcutsOpen(true);
    },
    onCloseAll: closeAll,
    onNewResearch: () => router.push("/research"),
    onGoTo: (target) => {
      const map: Record<typeof target, string> = {
        research: "/research",
        history: "/history",
        visualizations: "/visualizations",
        settings: "/settings",
        about: "/about",
        home: "/",
      };
      router.push(map[target]);
    },
  });

  const containerClass = [
    "app-shell",
    collapsed && !isMobile ? "app-shell--collapsed" : "",
    isMobile ? "app-shell--mobile" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={containerClass} role="main">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <AppSidebar
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed((c) => !c)}
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
      />

      <div className="app-shell__main">
        <AppTopBar
          onOpenMobileNav={() => setMobileNavOpen(true)}
          onOpenPalette={() => {
            setShortcutsOpen(false);
            setPaletteOpen(true);
          }}
          onShowShortcuts={() => {
            setPaletteOpen(false);
            setShortcutsOpen(true);
          }}
          isMac={isMac}
        />

        <main id="main-content" className="app-shell__content">
          {children}
        </main>

        <footer className="app-shell__footer" role="contentinfo">
          <span>
            Chronicle · AI research copilot for founders ·{" "}
            <a
              href="https://intelliforge.tech"
              target="_blank"
              rel="noopener noreferrer"
            >
              IntelliForge AI
            </a>
          </span>
        </footer>
      </div>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
      />
      <ShortcutsHelp
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
      />
    </div>
  );
}
