"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useRecentSessions } from "../../hooks/useRecentSessions";
import "./CommandPalette.css";

interface Props {
  open: boolean;
  onClose: () => void;
}

interface Command {
  id: string;
  label: string;
  hint?: string;
  group: "navigate" | "action" | "starter" | "recent";
  keywords: string;
  perform: () => void;
}

const STARTER_QUERIES = [
  "Market size and key players in AI coding assistants 2025",
  "Top pain points cited by SMB owners about accounting software",
  "Recent Series A rounds in vertical SaaS for healthcare",
  "Competitive landscape for AI customer support agents",
];

const GROUP_LABEL: Record<Command["group"], string> = {
  navigate: "Go to",
  action: "Actions",
  starter: "Starter queries",
  recent: "Recent research",
};

export const CommandPalette: React.FC<Props> = ({ open, onClose }) => {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const { sessions } = useRecentSessions(8);

  const commands = useMemo<Command[]>(() => {
    const navigateCommands: Command[] = [
      {
        id: "nav-research",
        label: "Research",
        hint: "G then R",
        group: "navigate",
        keywords: "research console workspace",
        perform: () => router.push("/research"),
      },
      {
        id: "nav-history",
        label: "History",
        hint: "G then H",
        group: "navigate",
        keywords: "history conversations sessions",
        perform: () => router.push("/history"),
      },
      {
        id: "nav-viz",
        label: "Visualizations",
        hint: "G then V",
        group: "navigate",
        keywords: "visualizations charts d3 analytics",
        perform: () => router.push("/visualizations"),
      },
      {
        id: "nav-settings",
        label: "Settings",
        hint: "G then S",
        group: "navigate",
        keywords: "settings preferences config",
        perform: () => router.push("/settings"),
      },
      {
        id: "nav-about",
        label: "About",
        hint: "G then A",
        group: "navigate",
        keywords: "about chronicle intelliforge",
        perform: () => router.push("/about"),
      },
      {
        id: "nav-home",
        label: "Landing page",
        hint: "G then I",
        group: "navigate",
        keywords: "home landing index marketing",
        perform: () => router.push("/"),
      },
    ];

    const actionCommands: Command[] = [
      {
        id: "action-new",
        label: "New research",
        hint: "N",
        group: "action",
        keywords: "new research query start fresh blank",
        perform: () => router.push("/research"),
      },
      {
        id: "action-github",
        label: "Open GitHub repo",
        group: "action",
        keywords: "github source code repo",
        perform: () => {
          window.open(
            "https://github.com/gengirish/multi-agent-deep-research",
            "_blank",
            "noopener,noreferrer"
          );
        },
      },
      {
        id: "action-intelliforge",
        label: "Visit IntelliForge AI",
        group: "action",
        keywords: "intelliforge agency studio",
        perform: () => {
          window.open("https://intelliforge.tech", "_blank", "noopener,noreferrer");
        },
      },
    ];

    const starterCommands: Command[] = STARTER_QUERIES.map((q, i) => ({
      id: `starter-${i}`,
      label: q,
      group: "starter",
      keywords: q.toLowerCase(),
      perform: () => router.push(`/research?q=${encodeURIComponent(q)}`),
    }));

    const recentCommands: Command[] = sessions.map((s) => ({
      id: `recent-${s.id}`,
      label: s.query || `Session ${s.id.slice(0, 8)}`,
      hint: s.id.slice(0, 8),
      group: "recent",
      keywords: (s.query || s.id).toLowerCase(),
      perform: () => router.push(`/history/${s.id}`),
    }));

    return [
      ...navigateCommands,
      ...actionCommands,
      ...starterCommands,
      ...recentCommands,
    ];
  }, [router, sessions]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter(
      (c) =>
        c.label.toLowerCase().includes(q) ||
        c.keywords.includes(q) ||
        (c.hint?.toLowerCase().includes(q) ?? false)
    );
  }, [commands, query]);

  const grouped = useMemo(() => {
    const groups: Record<Command["group"], Command[]> = {
      navigate: [],
      action: [],
      starter: [],
      recent: [],
    };
    filtered.forEach((c) => groups[c.group].push(c));
    return groups;
  }, [filtered]);

  // Reset state when opening
  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      // Focus on next tick so the input is mounted
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  // Keyboard nav within the palette
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const cmd = filtered[activeIndex];
        if (cmd) {
          cmd.perform();
          onClose();
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, filtered, activeIndex, onClose]);

  if (!open) return null;

  let runningIndex = 0;

  return (
    <div className="cmdk-backdrop" onClick={onClose} role="presentation">
      <div
        className="cmdk"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
      >
        <div className="cmdk__input-wrap">
          <span className="cmdk__icon" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <circle
                cx="11"
                cy="11"
                r="7"
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
          </span>
          <input
            ref={inputRef}
            className="cmdk__input"
            type="text"
            placeholder="Search or type a command…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search commands"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="cmdk__kbd">ESC</kbd>
        </div>

        <div className="cmdk__list" role="listbox">
          {filtered.length === 0 && (
            <div className="cmdk__empty">No results for &ldquo;{query}&rdquo;</div>
          )}
          {(["navigate", "action", "starter", "recent"] as const).map(
            (group) => {
              const items = grouped[group];
              if (items.length === 0) return null;
              return (
                <div className="cmdk__group" key={group}>
                  <div className="cmdk__group-label">{GROUP_LABEL[group]}</div>
                  {items.map((cmd) => {
                    const idx = runningIndex++;
                    const isActive = idx === activeIndex;
                    return (
                      <button
                        key={cmd.id}
                        type="button"
                        role="option"
                        aria-selected={isActive}
                        className={`cmdk__item${isActive ? " active" : ""}`}
                        onMouseEnter={() => setActiveIndex(idx)}
                        onClick={() => {
                          cmd.perform();
                          onClose();
                        }}
                      >
                        <span className="cmdk__item-label">{cmd.label}</span>
                        {cmd.hint && (
                          <kbd className="cmdk__item-hint">{cmd.hint}</kbd>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            }
          )}
        </div>

        <div className="cmdk__footer">
          <span>
            <kbd>↑↓</kbd> navigate
          </span>
          <span>
            <kbd>↵</kbd> select
          </span>
          <span>
            <kbd>?</kbd> shortcuts
          </span>
        </div>
      </div>
    </div>
  );
};
