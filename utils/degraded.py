"""Detect when a research run silently fell back to a degraded stage.

Every agent in the pipeline is defensive: on an LLM or provider failure the
analyzer and insight generator return empty results, the credibility agent
scores from heuristics alone, the reporter assembles from a template, and a
failed retrieval channel returns nothing. Each of those paths keeps the run
alive — which is the right call — but the response still comes back HTTP 200
looking like a healthy report.

This module inspects a finished result and names the stages that degraded, so
callers (the API, the UI, the eval harness) can say so out loud instead of
presenting canned text as analysis.
"""

from __future__ import annotations

from typing import Any, Dict, List

# Marker every stage writes when it could not do its job. Carries the reason
# so the failure is attributable, and is deliberately not prose that could be
# mistaken for a finding.
UNAVAILABLE_PREFIX = "[unavailable]"

# Legacy markers — stages used to return fabricated placeholder findings on
# failure. Still recognised so rows persisted before that change are flagged.
MOCK_ANALYSIS_MARKER = "Mock analysis - LLM not configured"
MOCK_INSIGHTS_MARKER = "Mock insights - LLM not configured"

# The value _llm_credibility used to return on every failure path. It now
# returns None, but old rows still carry 0.5 across the board.
CREDIBILITY_FAILURE_CONSTANT = 0.5


# Provider errors can be multi-line JSON blobs; keep the marker readable.
MAX_REASON_CHARS = 220


def unavailable(stage: str, reason: str) -> str:
    """Build the marker a stage returns in place of fabricated content."""
    reason = " ".join(str(reason).split())
    if len(reason) > MAX_REASON_CHARS:
        reason = reason[: MAX_REASON_CHARS - 1].rstrip() + "…"
    return f"{UNAVAILABLE_PREFIX} {stage}: {reason}"


def _is_unavailable(text: str, legacy_marker: str) -> bool:
    return text.startswith(UNAVAILABLE_PREFIX) or legacy_marker in text


def _reason_from(text: str, stage: str, fallback: str) -> str:
    """Pull the reason out of a marker, or describe a legacy mock."""
    if not text.startswith(UNAVAILABLE_PREFIX):
        return fallback
    reason = text[len(UNAVAILABLE_PREFIX):].strip()
    prefix = f"{stage}:"
    if reason.startswith(prefix):
        reason = reason[len(prefix):].strip()
    return reason


def detect_degradation(result: Dict[str, Any]) -> List[str]:
    """Return a list of human-readable degradation notes, empty if fully live.

    Pure inspection — no side effects, and safe on partial or error results.
    """
    notes: List[str] = []

    analysis = result.get("analysis") or {}
    raw_analysis = analysis.get("raw_analysis") or ""
    if _is_unavailable(raw_analysis, MOCK_ANALYSIS_MARKER):
        notes.append(
            "analyzer: no analysis produced — "
            + _reason_from(raw_analysis, "analyzer", "returned legacy mock text")
            + ". Key findings, claims and contradictions are empty, not inferred."
        )

    insights = result.get("insights") or {}
    raw_insights = insights.get("raw_insights") or ""
    if _is_unavailable(raw_insights, MOCK_INSIGHTS_MARKER):
        notes.append(
            "insight: no insights produced — "
            + _reason_from(raw_insights, "insight", "returned legacy mock text")
        )

    credibility = result.get("credibility") or {}
    scored = [
        item
        for bucket in ("web", "papers", "news")
        for item in (credibility.get(bucket) or [])
        if isinstance(item, dict)
    ]
    if scored:
        llm_scores = [s["llm_score"] for s in scored if s.get("llm_score") is not None]
        model_scored = [s for s in scored if s.get("llm_scored")]
        legacy_pinned = bool(llm_scores) and set(llm_scores) == {
            CREDIBILITY_FAILURE_CONSTANT
        }
        if legacy_pinned or (not model_scored and not llm_scores):
            notes.append(
                "credibility: no source was scored by the model — scores are "
                "heuristic-only, so the High/Medium/Low labels are not model "
                "judgements"
            )

    report = result.get("report") or ""
    head = report[:400]
    if UNAVAILABLE_PREFIX in head:
        if "no sources were retrieved" in head:
            notes.append(
                "report: not generated — retrieval returned nothing, and a "
                "report written without sources would be ungrounded"
            )
        else:
            notes.append(
                "report: assembled from the template writer, not the report model"
            )

    sources = result.get("sources") or {}
    if sources and not (sources.get("metadata") or {}).get("enrichment_applied"):
        notes.append(
            "enrichment: sources were not enriched — metadata, dates and "
            "sentiment are missing"
        )

    errors = sources.get("errors") or {}
    for channel in ("web", "papers", "news"):
        items = sources.get(channel)
        if not isinstance(items, list) or items:
            continue
        reason = errors.get(channel)
        notes.append(
            f"retrieval: no results from {channel}"
            + (f" — {reason}" if reason else "")
        )

    return notes
