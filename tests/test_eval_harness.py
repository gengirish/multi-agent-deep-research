"""
Tests for the eval harness's A/B support.

Synthetic payloads throughout — no pipeline runs, no provider calls. What is
asserted is that the harness reports what actually happened: that both arms run
over the same queries, that loop metrics survive into the aggregate, and that
the comparison table's direction-of-improvement marks are right.

Run:  pytest tests/test_eval_harness.py
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

# Loaded by path: `eval` is not a package, and the name collides with the
# builtin, so a plain import would not find run_eval.
_spec = importlib.util.spec_from_file_location(
    "chronicle_run_eval", REPO_ROOT / "eval" / "run_eval.py"
)
run_eval = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(run_eval)


def _payload(report="# R\n\nA claim long enough to count as an assertion here.\n"
                    "[Src](https://a.com/1)\n",
             loop_trace=None, sources=None):
    web = sources if sources is not None else [{"url": "https://a.com/1", "title": "Src"}]
    body = {"web": web, "papers": [], "news": []}
    if loop_trace is not None:
        body["research_loop"] = loop_trace
    return {
        "sources": body,
        "analysis": {"contradictions": [], "key_claims": [], "summary": []},
        "insights": {},
        "credibility": {"overall_credibility": {"average_score": 0.8, "total_sources": 1}},
        "report": report,
        "status": "success",
    }


def _args(**overrides):
    base = dict(
        mode="local", api_url=None, timeout=60, check_urls=False, research_loop="env"
    )
    base.update(overrides)
    return SimpleNamespace(**base)


# -- score_run / aggregate ---------------------------------------------------

def test_a_single_shot_run_reports_no_loop():
    scored = run_eval.score_run("q", _payload(), 12.0, verify_urls=False)

    assert scored["research_loop"]["enabled"] is False
    assert scored["research_loop"]["iterations"] == 0


def test_a_loop_run_carries_its_trace_into_the_score():
    trace = {
        "iterations": 2,
        "queries": ["q", "follow up", "another"],
        "gaps": ["no pricing data"],
        "stopped_because": "sufficient",
        "merged_source_count": 30,
        "final_source_count": 12,
    }
    scored = run_eval.score_run("q", _payload(loop_trace=trace), 30.0, verify_urls=False)
    loop = scored["research_loop"]

    assert loop["enabled"] is True
    assert loop["iterations"] == 2
    assert loop["queries_issued"] == 3
    assert loop["gaps_identified"] == 1
    assert loop["stopped_because"] == "sufficient"
    # Compression is visible: 30 found, 12 kept. Without this a run that
    # gathered 30 and trimmed to 12 looks identical to one that found 12.
    assert (loop["sources_merged"], loop["sources_kept"]) == (30, 12)


def test_aggregate_summarizes_loop_activity():
    runs = [
        run_eval.score_run(
            "q1", _payload(loop_trace={"iterations": 2, "queries": ["a", "b", "c"],
                                       "stopped_because": "sufficient"}), 30.0, False
        ),
        run_eval.score_run(
            "q2", _payload(loop_trace={"iterations": 1, "queries": ["a", "b"],
                                       "stopped_because": "max_iterations"}), 20.0, False
        ),
    ]
    agg = run_eval.aggregate(runs)["research_loop"]

    assert agg["runs_with_loop"] == 2
    assert agg["mean_iterations"] == 1.5
    assert agg["mean_queries_issued"] == 2.5
    assert agg["stop_reasons"] == ["max_iterations", "sufficient"]


# -- execute_queries ---------------------------------------------------------

def test_each_arm_passes_its_flag_through_to_the_workflow(monkeypatch):
    seen = []

    def fake_run_local(query, research_loop=None):
        seen.append((query, research_loop))
        return _payload(), 5.0

    monkeypatch.setattr(run_eval, "run_local", fake_run_local)

    run_eval.execute_queries(["q1", "q2"], _args(), None, False, "single-shot")
    run_eval.execute_queries(["q1", "q2"], _args(), None, True, "iterative")

    assert seen == [("q1", False), ("q2", False), ("q1", True), ("q2", True)]


def test_a_failing_query_is_recorded_rather_than_dropped(monkeypatch):
    """Dropping the row would understate the failure rate."""
    def fake_run_local(query, research_loop=None):
        raise RuntimeError("provider 429")

    monkeypatch.setattr(run_eval, "run_local", fake_run_local)
    runs = run_eval.execute_queries(["q1"], _args(), None, None, None)

    assert len(runs) == 1
    assert runs[0]["status"] == "error"
    assert "429" in runs[0]["error"]


def test_arm_captures_do_not_overwrite_each_other(monkeypatch, tmp_path):
    monkeypatch.setattr(run_eval, "run_local", lambda q, research_loop=None: (_payload(), 5.0))

    run_eval.execute_queries(["a market question"], _args(), tmp_path, False, "single-shot")
    run_eval.execute_queries(["a market question"], _args(), tmp_path, True, "iterative")

    names = sorted(p.name for p in tmp_path.glob("*.json"))
    assert len(names) == 2, f"one capture per arm, got {names}"
    assert names[0].startswith("iterative-")
    assert names[1].startswith("single-shot-")


def test_workflows_are_reused_across_queries_within_an_arm(monkeypatch):
    """Constructing a workflow builds six agents; doing it per query would make
    the latency numbers describe the harness rather than the pipeline."""
    constructed = []

    class FakeWorkflow:
        def __init__(self, enable_research_loop=None):
            constructed.append(enable_research_loop)

        def run(self, query):
            return _payload()

    monkeypatch.setattr(run_eval, "_WORKFLOW_CACHE", {})
    monkeypatch.setitem(
        sys.modules,
        "orchestration.coordinator",
        SimpleNamespace(ResearchWorkflow=FakeWorkflow),
    )

    for query in ("q1", "q2", "q3"):
        run_eval.run_local(query, research_loop=True)
    run_eval.run_local("q4", research_loop=False)

    assert constructed == [True, False], "one workflow per arm, not per query"


# -- comparison table --------------------------------------------------------

def _arms(base_overrides, cand_overrides):
    def agg(**over):
        payload = {
            "runs": 3,
            "successful": 3,
            "latency_s": {"mean": 30.0},
            "sources_per_report": {"mean_total": 10.0, "mean_distinct_domains": 5.0},
            "citations": {"mean_per_report": 6.0, "grounding_rate": 0.80},
            "credibility": {"mean_average_score": 0.70},
            "analysis": {"mean_contradictions": 1.0},
            "report": {"mean_words": 800},
            "research_loop": {"mean_queries_issued": 1.0, "stop_reasons": []},
        }
        for path, value in over.items():
            node = payload
            parts = path.split(".")
            for part in parts[:-1]:
                node = node[part]
            node[parts[-1]] = value
        return payload

    return {
        "single-shot": {"aggregate": agg(**base_overrides)},
        "iterative": {"aggregate": agg(**cand_overrides)},
    }


def test_an_improvement_is_marked_as_one():
    arms = _arms({}, {"citations.grounding_rate": 0.92})
    table = "\n".join(run_eval.ab_comparison(arms))

    row = next(line for line in table.splitlines() if "grounding rate" in line)
    assert "+12.0 pp" in row
    assert "✅" in row


def test_a_regression_is_marked_as_one():
    arms = _arms({}, {"citations.grounding_rate": 0.65})
    table = "\n".join(run_eval.ab_comparison(arms))

    row = next(line for line in table.splitlines() if "grounding rate" in line)
    assert "-15.0 pp" in row
    assert "⚠️" in row


def test_slower_is_a_regression_even_though_the_number_went_up():
    """Latency is the one metric where more is worse; a naive comparison would
    congratulate the loop for taking twice as long."""
    arms = _arms({}, {"latency_s.mean": 60.0})
    table = "\n".join(run_eval.ab_comparison(arms))

    row = next(line for line in table.splitlines() if "Time to cited report" in line)
    assert "+30.00" in row
    assert "⚠️" in row


def test_extra_searches_are_reported_without_a_verdict():
    """More queries issued is the loop's cost, not a win or a loss on its own."""
    arms = _arms({}, {"research_loop.mean_queries_issued": 3.0})
    table = "\n".join(run_eval.ab_comparison(arms))

    row = next(line for line in table.splitlines() if "Search queries issued" in line)
    assert "+2.00" in row
    assert "✅" not in row and "⚠️" not in row


def test_uneven_arms_are_called_out():
    arms = _arms({}, {"successful": 2})
    table = "\n".join(run_eval.ab_comparison(arms))

    assert "not\nstrictly comparable" in table or "not strictly comparable" in table


def test_the_summary_includes_the_ab_table_only_in_ab_mode():
    runs = [run_eval.score_run("q", _payload(), 10.0, False)]
    payload = {
        "meta": {"timestamp": "t", "mode": "local", "query_count": 1},
        "multi_agent": {"runs": runs, "aggregate": run_eval.aggregate(runs)},
        "baseline": None,
    }
    assert "Retrieval A/B" not in run_eval.markdown_summary(payload)

    payload["arms"] = _arms({}, {})
    assert "Retrieval A/B" in run_eval.markdown_summary(payload)
