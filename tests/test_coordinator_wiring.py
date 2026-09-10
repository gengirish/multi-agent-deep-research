"""
Tests that the research loop and tracing are actually wired into the workflow.

The agents are all stubbed, so no provider is called and no quota is spent.
What is asserted is the wiring: that the flag routes retrieval through the
loop, that turning it off restores the single-shot path exactly, and that a
loop iteration lands in the visible agent trace.

Run:  pytest tests/test_coordinator_wiring.py
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any, Dict

import pytest

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from orchestration import coordinator as coordinator_module


class StubAgent:
    """Stands in for every agent the workflow constructs."""

    def __init__(self, *args, **kwargs):
        self.calls = []

    def retrieve(self, query, max_results=5):
        self.calls.append(query)
        return {"web": [{"url": f"https://x.com/{query}", "title": query}], "papers": [], "news": []}

    def enrich_sources(self, sources):
        return sources

    def evaluate_credibility(self, sources):
        return {"web": [], "papers": [], "news": [], "overall_credibility": {}}

    def analyze(self, sources):
        return {"summary": [], "contradictions": [], "credibility": [], "key_claims": []}

    def generate(self, analysis, query):
        return {"insights": [], "hypotheses": [], "trends": [], "reasoning_chains": []}

    def compile(self, query, sources, analysis, insights):
        return "# Report"


@pytest.fixture
def stubbed(monkeypatch):
    for name in (
        "ContextualRetrieverAgent",
        "DataEnrichmentAgent",
        "CriticalAnalysisAgent",
        "InsightGenerationAgent",
        "ReportBuilderAgent",
        "SourceCredibilityAgent",
        "EnhancedCredibilityAgent",
    ):
        monkeypatch.setattr(coordinator_module, name, StubAgent)
    monkeypatch.delenv("RESEARCH_LOOP_ENABLED", raising=False)
    return monkeypatch


def test_the_loop_is_off_unless_the_flag_is_set(stubbed):
    workflow = coordinator_module.ResearchWorkflow()
    assert workflow.research_loop is None


def test_the_env_flag_turns_the_loop_on(stubbed):
    stubbed.setenv("RESEARCH_LOOP_ENABLED", "true")
    workflow = coordinator_module.ResearchWorkflow()
    assert workflow.research_loop is not None


def test_an_explicit_argument_beats_the_env_flag(stubbed):
    """The eval harness needs to A/B both paths in one process."""
    stubbed.setenv("RESEARCH_LOOP_ENABLED", "true")
    assert coordinator_module.ResearchWorkflow(enable_research_loop=False).research_loop is None
    stubbed.setenv("RESEARCH_LOOP_ENABLED", "false")
    assert coordinator_module.ResearchWorkflow(enable_research_loop=True).research_loop is not None


def test_retrieval_goes_through_the_loop_when_enabled(stubbed):
    workflow = coordinator_module.ResearchWorkflow(enable_research_loop=True)

    seen: Dict[str, Any] = {}

    class StubLoop:
        def run(self, query):
            seen["query"] = query
            return {"web": [], "papers": [], "news": [], "research_loop": {"iterations": 2}}

    workflow.research_loop = StubLoop()
    state = {"query": "how big is the market", "step_count": 0}
    result = workflow._retriever_node(state)

    assert seen["query"] == "how big is the market"
    assert result["sources"]["research_loop"] == {"iterations": 2}


def test_retrieval_goes_straight_to_the_retriever_when_disabled(stubbed):
    workflow = coordinator_module.ResearchWorkflow(enable_research_loop=False)
    state = {"query": "how big is the market", "step_count": 0}

    result = workflow._retriever_node(state)

    assert workflow.retriever.calls == ["how big is the market"]
    assert "research_loop" not in result["sources"]


def test_loop_iterations_reach_the_visible_agent_trace(stubbed):
    """The product claims every agent step is visible and replayable; extra
    searches the loop runs must not be invisible."""
    workflow = coordinator_module.ResearchWorkflow(enable_research_loop=True)
    logged = []
    workflow.agent_logger.log_agent_action = lambda *args, **kwargs: logged.append((args, kwargs))

    workflow._on_research_loop_event("iteration", {"iteration": 1, "queries": ["follow up"]})

    assert logged
    args, kwargs = logged[0]
    assert args[0] == "retriever"
    assert args[1] == "research_loop_iteration"
    assert kwargs["output_data"]["queries"] == ["follow up"]


def test_a_retriever_failure_still_yields_an_empty_source_set(stubbed):
    workflow = coordinator_module.ResearchWorkflow(enable_research_loop=False)

    def boom(query, max_results=5):
        raise RuntimeError("tavily down")

    workflow.retriever.retrieve = boom
    result = workflow._retriever_node({"query": "q", "step_count": 0})

    assert result["sources"] == {"web": [], "papers": [], "news": [], "query": "q"}
    assert "Retrieval failed" in result["error"]
