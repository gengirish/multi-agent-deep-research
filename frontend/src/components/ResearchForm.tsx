"use client";

import React, { useEffect, useState } from "react";
import { VoiceInput } from "./VoiceInput";
import "./ResearchForm.css";

type InputMode = "text" | "voice";

interface Props {
  onSubmit: (query: string) => void;
  loading: boolean;
  disabled?: boolean;
  initialQuery?: string;
  onQueryChange?: (query: string) => void;
}

const TextIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
    <path
      d="M4 7V5h16v2M9 5v14M15 5v14M6 19h12"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const VoiceIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
    <rect
      x="9"
      y="3"
      width="6"
      height="12"
      rx="3"
      stroke="currentColor"
      strokeWidth="1.7"
    />
    <path
      d="M5 11a7 7 0 0 0 14 0M12 18v3"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
    />
  </svg>
);

const SearchIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
    <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.7" />
    <path
      d="m20 20-3.5-3.5"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
    />
  </svg>
);

export const ResearchForm: React.FC<Props> = ({
  onSubmit,
  loading,
  disabled = false,
  initialQuery = "",
  onQueryChange,
}) => {
  const [query, setQuery] = useState(initialQuery);
  const [inputMode, setInputMode] = useState<InputMode>("text");

  useEffect(() => {
    if (initialQuery) {
      setQuery(initialQuery);
    }
  }, [initialQuery]);

  const handleQueryChange = (value: string) => {
    setQuery(value);
    if (onQueryChange) {
      onQueryChange(value);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim() && !loading) {
      onSubmit(query);
    }
  };

  const handleVoiceCapture = (text: string) => {
    handleQueryChange(text);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="research-form"
      role="search"
      aria-label="Research query form"
    >
      <label htmlFor="query-input" className="form-label">
        What would you like to research?
      </label>

      <div
        className="input-mode-toggle"
        role="toolbar"
        aria-label="Input method selection"
      >
        <button
          type="button"
          className={`mode-button ${inputMode === "text" ? "active" : ""}`}
          onClick={() => setInputMode("text")}
          aria-pressed={inputMode === "text"}
          aria-label="Switch to text input mode"
          disabled={loading || disabled}
        >
          <span className="mode-icon" aria-hidden="true">
            <TextIcon />
          </span>
          <span className="mode-text">Type</span>
        </button>
        <button
          type="button"
          className={`mode-button ${inputMode === "voice" ? "active" : ""}`}
          onClick={() => setInputMode("voice")}
          aria-pressed={inputMode === "voice"}
          aria-label="Switch to voice input mode"
          disabled={loading || disabled}
        >
          <span className="mode-icon" aria-hidden="true">
            <VoiceIcon />
          </span>
          <span className="mode-text">Speak</span>
        </button>
      </div>

      {inputMode === "voice" && (
        <div className="voice-input-container">
          <VoiceInput
            onVoiceCapture={handleVoiceCapture}
            disabled={loading || disabled}
          />
          {query && (
            <div className="captured-query">
              <p className="captured-label">Captured query</p>
              <p className="captured-text">{query}</p>
            </div>
          )}
        </div>
      )}

      {inputMode === "text" && (
        <div className="text-input-container">
          <input
            id="query-input"
            type="text"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            placeholder="e.g., Market size and key players in AI coding assistants 2025"
            disabled={loading || disabled}
            aria-busy={loading}
            aria-describedby="query-hint"
            aria-required="true"
            className="query-input"
            autoComplete="off"
          />
          <p id="query-hint" className="form-hint">
            Tip — try a market, a competitor, or a specific customer segment.
          </p>
        </div>
      )}

      <button
        type="submit"
        disabled={loading || !query.trim() || disabled}
        aria-label={loading ? "Research in progress, please wait" : "Start research"}
        aria-busy={loading}
        className="submit-button"
      >
        {loading ? (
          <>
            <span className="submit-spinner" aria-hidden="true" />
            <span>Researching…</span>
          </>
        ) : (
          <>
            <SearchIcon />
            <span>Start research</span>
          </>
        )}
      </button>
    </form>
  );
};
