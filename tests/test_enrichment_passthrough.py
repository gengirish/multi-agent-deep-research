"""
Tests that enrichment does not lose what the retriever attached.

`enrich_sources` returns a freshly built dict that *replaces* the retriever's
output in workflow state, so any key it does not copy is gone for the rest of
the run. That has now cost two things: `errors`, which let a broken channel hide
behind an empty one, and `research_loop`, whose loss made an A/B sweep unable to
tell whether the iterative retriever had run at all — the comparison table
showed "1 search query issued" for both arms because the trace was missing, not
because the loop had not looped.

Run:  pytest tests/test_enrichment_passthrough.py
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from agents import enrichment as enrichment_module


@pytest.fixture
def agent(monkeypatch):
    """An enricher with no model, so enrichment is heuristic and offline."""
    monkeypatch.setattr(enrichment_module, "create_retriever_llm", lambda: None)
    return enrichment_module.DataEnrichmentAgent()


def _sources(**extra):
    base = {
        "web": [{"title": "A report", "url": "https://example.com/a", "snippet": "body"}],
        "papers": [{"title": "A paper", "url": "https://arxiv.org/abs/2401.00001"}],
        "news": [{"title": "News", "url": "https://reuters.com/x", "snippet": "body"}],
        "query": "how big is the market",
    }
    base.update(extra)
    return base


def test_the_research_loop_trace_survives_enrichment(agent):
    """The regression: without this, an A/B sweep cannot tell whether the loop
    ran, and reports both arms as having issued one query."""
    trace = {
        "iterations": 2,
        "queries": ["q", "follow up", "another"],
        "gaps": ["no pricing data"],
        "stopped_because": "sufficient",
        "merged_source_count": 30,
        "final_source_count": 12,
    }
    out = agent.enrich_sources(_sources(research_loop=trace))

    assert out.get("research_loop") == trace


def test_retrieval_errors_survive_enrichment(agent):
    """The first key this stage lost. A broken channel must not be able to hide
    behind an empty one."""
    errors = {"papers": "arXiv: HTTPError: HTTP 429"}
    out = agent.enrich_sources(_sources(errors=errors))

    assert out.get("errors") == errors


def test_an_unknown_future_key_survives_enrichment(agent):
    """Copying unknown keys rather than enumerating them is the point: the next
    key added upstream should not need a change here."""
    out = agent.enrich_sources(_sources(some_future_key={"a": 1}))

    assert out.get("some_future_key") == {"a": 1}


def test_enrichment_still_rebuilds_the_channels(agent):
    """Passthrough must not shadow the enriched lists with the raw ones."""
    out = agent.enrich_sources(_sources())

    assert len(out["web"]) == 1
    assert len(out["news"]) == 1
    assert out["query"] == "how big is the market"
    assert out["metadata"]["enrichment_applied"] is True
    # Enrichment adds fields the raw source did not carry.
    assert "domain_score" in out["web"][0] or "metadata" in out["web"][0]


def test_empty_passthrough_values_are_not_carried(agent):
    """An empty errors dict means no channel failed; carrying it would make
    `if sources.get("errors")` checks downstream read as a failure."""
    out = agent.enrich_sources(_sources(errors={}))

    assert not out.get("errors")
