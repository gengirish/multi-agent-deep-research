"use client";

import React, { useMemo } from "react";
import { ResearchData } from "../types/dto";
import { Icon } from "./icons";
import "./TrustPanel.css";

interface Props {
  data: ResearchData;
}

interface TrustStats {
  scores: number[];
  avg: number | null;
  high: number;
  medium: number;
  low: number;
  totalSources: number;
  contradictions: string[];
}

const computeTrust = (data: ResearchData): TrustStats => {
  const scores: number[] = [];
  const cred = (data.credibility || {}) as Record<string, any>;

  ["web", "papers", "news"].forEach((k) => {
    const arr = cred[k];
    if (Array.isArray(arr)) {
      arr.forEach((item: any) => {
        if (typeof item?.score === "number") scores.push(item.score);
      });
    }
  });

  if (Array.isArray(cred.scores)) {
    cred.scores.forEach((s: any) => {
      if (typeof s?.score === "number") scores.push(s.score);
    });
  }

  // Fallback: enriched source domain scores
  if (scores.length === 0) {
    Object.values(data.sources || {}).forEach((arr: any) => {
      if (Array.isArray(arr)) {
        arr.forEach((s: any) => {
          if (typeof s?.domain_score === "number") scores.push(s.domain_score);
        });
      }
    });
  }

  const totalSources = Object.values(data.sources || {}).reduce(
    (acc: number, arr: any) => acc + (Array.isArray(arr) ? arr.length : 0),
    0
  );

  const avg =
    scores.length > 0
      ? scores.reduce((a, b) => a + b, 0) / scores.length
      : null;

  const contradictionsRaw = (data.analysis || {})?.contradictions;
  const contradictions: string[] = Array.isArray(contradictionsRaw)
    ? contradictionsRaw.map((c: any) => String(c)).filter(Boolean)
    : [];

  return {
    scores,
    avg,
    high: scores.filter((s) => s >= 0.8).length,
    medium: scores.filter((s) => s >= 0.5 && s < 0.8).length,
    low: scores.filter((s) => s < 0.5).length,
    totalSources,
    contradictions,
  };
};

const band = (avg: number | null) => {
  if (avg === null) return { label: "Unscored", tone: "neutral" as const };
  if (avg >= 0.8) return { label: "High confidence", tone: "high" as const };
  if (avg >= 0.6) return { label: "Moderate confidence", tone: "mid" as const };
  return { label: "Low confidence", tone: "low" as const };
};

export const TrustPanel: React.FC<Props> = ({ data }) => {
  const stats = useMemo(() => computeTrust(data), [data]);

  // Nothing meaningful to show — don't render an empty shell.
  if (stats.totalSources === 0 && stats.scores.length === 0) return null;

  const confidence = band(stats.avg);
  const pct = stats.avg !== null ? Math.round(stats.avg * 100) : null;
  const scored = stats.scores.length;
  const total = scored || 1;
  const seg = (n: number) => `${(n / total) * 100}%`;

  return (
    <section
      className={`trust-panel tone-${confidence.tone}`}
      role="region"
      aria-label="Trust and verifiability"
    >
      <div className="trust-panel__head">
        <span className="trust-panel__badge">
          <Icon name="shield" size={18} />
        </span>
        <div>
          <h2 className="trust-panel__title">Trust &amp; verifiability</h2>
          <p className="trust-panel__subtitle">
            How defensible this report is — at a glance.
          </p>
        </div>
        <span className={`trust-pill tone-${confidence.tone}`}>
          {confidence.label}
        </span>
      </div>

      <div className="trust-panel__grid">
        <div className="trust-stat trust-stat--confidence">
          <div className="trust-stat__value">
            {pct !== null ? `${pct}%` : "—"}
          </div>
          <div className="trust-stat__label">Avg source credibility</div>
        </div>

        <div className="trust-stat">
          <div className="trust-stat__value">{stats.totalSources}</div>
          <div className="trust-stat__label">
            Sources analyzed
            {scored > 0 && scored !== stats.totalSources && (
              <span className="trust-stat__hint"> · {scored} scored</span>
            )}
          </div>
        </div>

        <div className="trust-stat">
          <div
            className={`trust-stat__value ${
              stats.contradictions.length > 0 ? "is-flagged" : "is-clear"
            }`}
          >
            {stats.contradictions.length}
          </div>
          <div className="trust-stat__label">Contradictions flagged</div>
        </div>
      </div>

      {scored > 0 && (
        <div className="trust-quality">
          <div className="trust-quality__bar" aria-hidden="true">
            <span
              className="seg seg--high"
              style={{ width: seg(stats.high) }}
            />
            <span
              className="seg seg--mid"
              style={{ width: seg(stats.medium) }}
            />
            <span className="seg seg--low" style={{ width: seg(stats.low) }} />
          </div>
          <div className="trust-quality__legend">
            <span className="lg lg--high">High {stats.high}</span>
            <span className="lg lg--mid">Medium {stats.medium}</span>
            <span className="lg lg--low">Low {stats.low}</span>
          </div>
        </div>
      )}

      {stats.contradictions.length > 0 ? (
        <div className="trust-contradictions">
          <h3 className="trust-contradictions__title">
            <Icon name="alert" size={15} />
            Disputed across sources
          </h3>
          <ul className="trust-contradictions__list">
            {stats.contradictions.slice(0, 5).map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
          {stats.contradictions.length > 5 && (
            <p className="trust-contradictions__more">
              +{stats.contradictions.length - 5} more in the full report
            </p>
          )}
        </div>
      ) : (
        <div className="trust-clear">
          <Icon name="check-circle" size={15} />
          No contradictions detected across the analyzed sources.
        </div>
      )}
    </section>
  );
};
