"""Detect when a research run silently fell back to a degraded stage.

Every agent in the pipeline is defensive: on an LLM or provider failure the
analyzer and insight generator return canned mock text, the credibility agent
returns its 0.5 failure constant for the LLM half of the score, and a failed
retrieval channel returns an empty list. Each of those paths keeps the run
alive — which is the right call — but the response still comes back HTTP 200
looking like a healthy report.

This module inspects a finished result and names the stages that degraded, so
callers (the API, the UI, the eval harness) can say so out loud instead of
presenting canned text as analysis.
"""

from __future__ import annotations

from typing import Any, Dict, List

MOCK_ANALYSIS_MARKER = "Mock analysis - LLM not configured"
MOCK_INSIGHTS_MARKER = "Mock insights - LLM not configured"

# The value _llm_credibility returns on every failure path. If every source
# lands on exactly this, no source was actually scored by a model.
CREDIBILITY_FAILURE_CONSTANT = 0.5


def detect_degradation(result: Dict[str, Any]) -> List[str]:
    """Return a list of human-readable degradation notes, empty if fully live.

    Pure inspection — no side effects, and safe on partial or error results.
    """
    notes: List[str] = []

    analysis = result.get("analysis") or {}
    if MOCK_ANALYSIS_MARKER in (analysis.get("raw_analysis") or ""):
        notes.append(
            "analyzer: returned mock analysis — key findings, claims and "
            "contradictions are placeholder text, not derived from the sources"
        )

    insights = result.get("insights") or {}
    if MOCK_INSIGHTS_MARKER in (insights.get("raw_insights") or ""):
        notes.append(
            "insight: returned mock insights — hypotheses and trends are "
            "placeholder text"
        )

    credibility = result.get("credibility") or {}
    llm_scores = [
        item["llm_score"]
        for bucket in ("web", "papers", "news")
        for item in (credibility.get(bucket) or [])
        if isinstance(item, dict) and item.get("llm_score") is not None
    ]
    if llm_scores and set(llm_scores) == {CREDIBILITY_FAILURE_CONSTANT}:
        notes.append(
            "credibility: every source scored the LLM failure constant "
            "(0.5) — scores are heuristic-only, so the High/Medium/Low "
            "labels are not model judgements"
        )

    sources = result.get("sources") or {}
    empty_channels = [
        channel
        for channel in ("web", "papers", "news")
        if isinstance(sources.get(channel), list) and not sources[channel]
    ]
    if empty_channels:
        notes.append(
            "retrieval: no results from " + ", ".join(empty_channels)
        )

    return notes
