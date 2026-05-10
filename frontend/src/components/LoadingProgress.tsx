"use client";

import React from "react";

interface Props {
  stage: string;
  progress: number;
}

const STAGE_LABELS: Record<string, { label: string; tone: "info" | "success" | "error" }> = {
  retrieval: { label: "Retrieving sources from web, papers, and news…", tone: "info" },
  enrichment: { label: "Enriching with metadata and sentiment…", tone: "info" },
  analysis: { label: "Analyzing findings and validating sources…", tone: "info" },
  insights: { label: "Generating insights and hypotheses…", tone: "info" },
  insight: { label: "Generating insights and hypotheses…", tone: "info" },
  report: { label: "Compiling final report…", tone: "info" },
  complete: { label: "Research complete.", tone: "success" },
  error: { label: "Something went wrong.", tone: "error" },
};

const ToneDot: React.FC<{ tone: "info" | "success" | "error" }> = ({ tone }) => {
  const color =
    tone === "success" ? "#22c55e" : tone === "error" ? "#ef4444" : "#818cf8";
  return (
    <span
      aria-hidden="true"
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: color,
        boxShadow: `0 0 0 0 ${color}66`,
        animation: tone === "info" ? "submit-spin 1s linear infinite" : "none",
        marginRight: 10,
        flexShrink: 0,
      }}
    />
  );
};

export const LoadingProgress: React.FC<Props> = ({ stage, progress }) => {
  const meta = STAGE_LABELS[stage] ?? { label: "Processing…", tone: "info" as const };

  return (
    <div
      className="loading-progress"
      role="status"
      aria-live="polite"
      aria-label="Research progress"
    >
      <div
        className="progress-bar-container"
        style={{
          height: 6,
          background: "rgba(148, 163, 184, 0.12)",
          borderRadius: 3,
          overflow: "hidden",
          marginBottom: 12,
        }}
      >
        <div
          className="progress-bar"
          style={{
            width: `${progress}%`,
            height: "100%",
            background: "linear-gradient(90deg, #818cf8, #38bdf8)",
            transition: "width 0.3s ease",
          }}
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          role="progressbar"
        >
          <span className="sr-only">{progress}% complete</span>
        </div>
      </div>
      <p
        className="progress-message"
        style={{
          margin: 0,
          display: "inline-flex",
          alignItems: "center",
          fontSize: "0.95rem",
          color: meta.tone === "error" ? "#fca5a5" : "#cbd5e1",
        }}
      >
        <ToneDot tone={meta.tone} />
        <span>{meta.label}</span>
      </p>
    </div>
  );
};
