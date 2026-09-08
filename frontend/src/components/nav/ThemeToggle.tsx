"use client";

/**
 * Three-state theme control: light / system / dark.
 *
 * A segmented radiogroup rather than a two-state switch, because "system" is a
 * real preference — a switch cannot express "keep following the OS" once the
 * user has picked something. Icons are inline SVG (never emoji) so they inherit
 * currentColor and stay crisp at any size.
 */

import React from "react";
import { useTheme, type ThemePreference } from "../../theme/ThemeProvider";
import "./ThemeToggle.css";

const SunIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none"
       stroke="currentColor" strokeWidth="2" strokeLinecap="round"
       strokeLinejoin="round" aria-hidden="true" focusable="false">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
  </svg>
);

const MonitorIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none"
       stroke="currentColor" strokeWidth="2" strokeLinecap="round"
       strokeLinejoin="round" aria-hidden="true" focusable="false">
    <rect x="2" y="3" width="20" height="14" rx="2" />
    <path d="M8 21h8M12 17v4" />
  </svg>
);

const MoonIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none"
       stroke="currentColor" strokeWidth="2" strokeLinecap="round"
       strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);

const OPTIONS: { value: ThemePreference; label: string; icon: React.FC }[] = [
  { value: "light", label: "Light", icon: SunIcon },
  { value: "system", label: "System", icon: MonitorIcon },
  { value: "dark", label: "Dark", icon: MoonIcon },
];

export const ThemeToggle: React.FC<{ className?: string }> = ({ className }) => {
  const { preference, resolved, setPreference } = useTheme();

  return (
    <div
      className={`theme-toggle${className ? ` ${className}` : ""}`}
      role="radiogroup"
      aria-label="Colour theme"
    >
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const active = preference === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            // Announce what "System" currently resolves to, so a screen reader
            // user is not left guessing which theme is actually applied.
            aria-label={
              value === "system" ? `System theme (currently ${resolved})` : `${label} theme`
            }
            className={`theme-toggle__btn${active ? " theme-toggle__btn--active" : ""}`}
            onClick={() => setPreference(value)}
            // Only the selected control is in the tab order; arrow keys move
            // within a radiogroup, matching native radio behaviour.
            tabIndex={active ? 0 : -1}
            onKeyDown={(e) => {
              if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
              e.preventDefault();
              const i = OPTIONS.findIndex((o) => o.value === preference);
              const next =
                e.key === "ArrowRight"
                  ? OPTIONS[(i + 1) % OPTIONS.length]
                  : OPTIONS[(i - 1 + OPTIONS.length) % OPTIONS.length];
              setPreference(next.value);
            }}
          >
            <Icon />
            <span className="theme-toggle__label">{label}</span>
          </button>
        );
      })}
    </div>
  );
};
