"use client";

import React from "react";
import "./ShortcutsHelp.css";

interface Props {
  open: boolean;
  onClose: () => void;
}

const SECTIONS: { title: string; items: { keys: string[]; label: string }[] }[] = [
  {
    title: "General",
    items: [
      { keys: ["⌘", "K"], label: "Open command palette" },
      { keys: ["?"], label: "Show this dialog" },
      { keys: ["ESC"], label: "Close any overlay" },
      { keys: ["N"], label: "New research" },
    ],
  },
  {
    title: "Navigate (G then…)",
    items: [
      { keys: ["G", "R"], label: "Research" },
      { keys: ["G", "H"], label: "History" },
      { keys: ["G", "V"], label: "Visualizations" },
      { keys: ["G", "S"], label: "Settings" },
      { keys: ["G", "A"], label: "About" },
      { keys: ["G", "I"], label: "Landing page" },
    ],
  },
  {
    title: "Inside the palette",
    items: [
      { keys: ["↑", "↓"], label: "Move selection" },
      { keys: ["↵"], label: "Run selected command" },
    ],
  },
];

export const ShortcutsHelp: React.FC<Props> = ({ open, onClose }) => {
  if (!open) return null;

  return (
    <div
      className="shortcuts-backdrop"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="shortcuts"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
      >
        <header className="shortcuts__head">
          <h2 className="shortcuts__title" id="shortcuts-title">
            Keyboard shortcuts
          </h2>
          <button
            type="button"
            className="shortcuts__close"
            onClick={onClose}
            aria-label="Close shortcuts"
          >
            ✕
          </button>
        </header>

        <div className="shortcuts__body">
          {SECTIONS.map((section) => (
            <section className="shortcuts__section" key={section.title}>
              <h3 className="shortcuts__section-title">{section.title}</h3>
              <ul className="shortcuts__list">
                {section.items.map((item) => (
                  <li className="shortcuts__row" key={item.label}>
                    <span className="shortcuts__label">{item.label}</span>
                    <span className="shortcuts__keys">
                      {item.keys.map((k, i) => (
                        <React.Fragment key={i}>
                          {i > 0 && (
                            <span className="shortcuts__plus">then</span>
                          )}
                          <kbd className="shortcuts__kbd">{k}</kbd>
                        </React.Fragment>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
};
