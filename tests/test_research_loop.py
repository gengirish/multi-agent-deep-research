"""
Tests for the iterative research loop.

Everything here runs offline: the retriever and the reflection model are both
fakes, so these assert loop *control flow* — how many searches it issues, what
it merges, when it stops — rather than search quality.

Run:  pytest tests/test_research_loop.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any, Dict, List

import pytest

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from agents.research_loop import IterativeResearchLoop, is_enabled


class FakeRetriever:
    """Records every query it is asked for and replays scripted results."""

    def __init__(self, script: Dict[str, Dict[str, Any]], default: Dict[str, Any] = None):
        self.script = script
        self.default = default if default is not None else {"web": [], "papers": [], "news": []}
        self.queries: List[str] = []

    def retrieve(self, query: str, max_results: int = 5) -> Dict[str, Any]:
        self.queries.append(query)
        result = self.script.get(query, self.default)
        # Deep-ish copy so the loop's provenance tagging cannot leak between calls.
        return {
            key: [dict(item) for item in value] if isinstance(value, list) else value
            for key, value in result.items()
        }


class FakeLLM:
    """Returns scripted reflection responses, one per invoke."""

    def __init__(self, responses: List[Any]):
        self.responses = list(responses)
        self.prompts: List[str] = []

    def invoke(self, prompt: str) -> Any:
        self.prompts.append(prompt)
        if not self.responses:
            raise AssertionError("FakeLLM was invoked more times than scripted")
        response = self.responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return response


def _reflection(sufficient: bool, gaps=None, queries=None) -> str:
    return json.dumps(
        {
            "sufficient": sufficient,
            "gaps": gaps or [],
            "follow_up_queries": queries or [],
        }
    )


def _source(url: str, title: str = "t", score: float = 0.5) -> Dict[str, Any]:
    return {"url": url, "title": title, "snippet": "body", "score": score}


def test_runs_single_pass_without_a_reflection_model():
    """No model means no reflection, which must degrade to the old behaviour."""
    retriever = FakeRetriever({"q": {"web": [_source("https://a.com")], "papers": [], "news": []}})
    loop = IterativeResearchLoop(retriever=retriever, llm=None, max_iterations=3)

    result = loop.run("q")

    assert retriever.queries == ["q"]
    assert len(result["web"]) == 1
    assert result["research_loop"]["stopped_because"] == "no reflection model"


def test_stops_immediately_when_sources_are_sufficient():
    retriever = FakeRetriever({"q": {"web": [_source("https://a.com")], "papers": [], "news": []}})
    llm = FakeLLM([_reflection(True)])
    loop = IterativeResearchLoop(retriever=retriever, llm=llm, max_iterations=3)

    result = loop.run("q")

    assert retriever.queries == ["q"], "a sufficient verdict must not trigger more searches"
    assert result["research_loop"]["sufficient"] is True
    assert result["research_loop"]["stopped_because"] == "sufficient"


def test_issues_follow_up_queries_and_merges_new_sources():
    retriever = FakeRetriever(
        {
            "q": {"web": [_source("https://a.com")], "papers": [], "news": []},
            "follow up": {"web": [_source("https://b.com")], "papers": [], "news": []},
        }
    )
    llm = FakeLLM([_reflection(False, ["no pricing data"], ["follow up"]), _reflection(True)])
    loop = IterativeResearchLoop(retriever=retriever, llm=llm, max_iterations=3)

    result = loop.run("q")

    assert retriever.queries == ["q", "follow up"]
    assert {s["url"] for s in result["web"]} == {"https://a.com", "https://b.com"}
    assert result["research_loop"]["gaps"] == ["no pricing data"]
    assert result["research_loop"]["iterations"] == 1


def test_follow_up_count_is_capped_regardless_of_what_the_model_asks_for():
    """Each follow-up costs three searches, so the cap is enforced locally."""
    retriever = FakeRetriever({}, default={"web": [], "papers": [], "news": []})
    retriever.script["q"] = {"web": [_source("https://a.com")], "papers": [], "news": []}
    llm = FakeLLM([_reflection(False, [], ["one", "two", "three", "four"]), _reflection(True)])
    loop = IterativeResearchLoop(retriever=retriever, llm=llm, max_iterations=2, max_follow_ups=2)

    loop.run("q")

    assert retriever.queries == ["q", "one", "two"]


def test_respects_the_iteration_cap():
    retriever = FakeRetriever({}, default={"web": [_source("https://a.com")], "papers": [], "news": []})
    llm = FakeLLM([_reflection(False, [], ["more"])] * 2)
    loop = IterativeResearchLoop(retriever=retriever, llm=llm, max_iterations=2, max_follow_ups=1)

    result = loop.run("q")

    assert len(llm.prompts) == 2, "reflection must run at most max_iterations times"
    assert result["research_loop"]["iterations"] == 2
    assert result["research_loop"]["stopped_because"] == "max_iterations"


def test_unparseable_reflection_stops_the_loop_rather_than_guessing():
    retriever = FakeRetriever({"q": {"web": [_source("https://a.com")], "papers": [], "news": []}})
    llm = FakeLLM(["I'm afraid I can't do that."])
    loop = IterativeResearchLoop(retriever=retriever, llm=llm, max_iterations=3)

    result = loop.run("q")

    assert retriever.queries == ["q"]
    assert result["research_loop"]["stopped_because"] == "reflection unavailable"


def test_reflection_survives_code_fences_and_surrounding_prose():
    retriever = FakeRetriever(
        {
            "q": {"web": [_source("https://a.com")], "papers": [], "news": []},
            "next": {"web": [_source("https://b.com")], "papers": [], "news": []},
        }
    )
    fenced = "Here is my assessment:\n```json\n" + _reflection(False, ["gap"], ["next"]) + "\n```\n"
    llm = FakeLLM([fenced, _reflection(True)])
    loop = IterativeResearchLoop(retriever=retriever, llm=llm, max_iterations=2)

    loop.run("q")

    assert retriever.queries == ["q", "next"]


def test_a_failing_reflection_call_does_not_break_the_run():
    retriever = FakeRetriever({"q": {"web": [_source("https://a.com")], "papers": [], "news": []}})
    llm = FakeLLM([RuntimeError("429 rate limited")])
    loop = IterativeResearchLoop(retriever=retriever, llm=llm, max_iterations=2)

    result = loop.run("q")

    assert len(result["web"]) == 1
    assert result["research_loop"]["stopped_because"] == "reflection unavailable"


def test_a_failing_retrieval_does_not_break_the_run():
    class BrokenRetriever:
        def retrieve(self, query, max_results=5):
            raise RuntimeError("tavily down")

    loop = IterativeResearchLoop(retriever=BrokenRetriever(), llm=None, max_iterations=1)
    result = loop.run("q")

    assert result["web"] == []
    assert "retriever" in result["errors"]


@pytest.mark.parametrize(
    "duplicate_url",
    [
        "https://www.a.com/page",       # www prefix
        "http://a.com/page",            # scheme
        "https://a.com/page/",          # trailing slash
        "https://a.com/page?utm_source=x",  # tracking parameter
    ],
)
def test_the_same_document_found_twice_is_stored_once(duplicate_url):
    retriever = FakeRetriever(
        {
            "q": {"web": [_source("https://a.com/page")], "papers": [], "news": []},
            "again": {"web": [_source(duplicate_url)], "papers": [], "news": []},
        }
    )
    llm = FakeLLM([_reflection(False, [], ["again"]), _reflection(True)])
    loop = IterativeResearchLoop(retriever=retriever, llm=llm, max_iterations=2)

    result = loop.run("q")

    assert len(result["web"]) == 1, f"{duplicate_url} should collapse onto the original"


def test_distinct_urls_are_not_collapsed():
    retriever = FakeRetriever(
        {
            "q": {"web": [_source("https://a.com/page?id=1")], "papers": [], "news": []},
            "again": {"web": [_source("https://a.com/page?id=2")], "papers": [], "news": []},
        }
    )
    llm = FakeLLM([_reflection(False, [], ["again"]), _reflection(True)])
    loop = IterativeResearchLoop(retriever=retriever, llm=llm, max_iterations=2)

    assert len(loop.run("q")["web"]) == 2


def test_compression_caps_the_channel_and_keeps_the_strongest_sources():
    many = [_source(f"https://a.com/{i}", score=i / 100) for i in range(30)]
    retriever = FakeRetriever({"q": {"web": many, "papers": [], "news": []}})
    loop = IterativeResearchLoop(
        retriever=retriever, llm=None, max_iterations=0, max_sources_per_channel=5
    )

    result = loop.run("q")

    assert len(result["web"]) == 5
    assert {s["url"] for s in result["web"]} == {f"https://a.com/{i}" for i in range(25, 30)}
    assert result["research_loop"]["merged_source_count"] == 30
    assert result["research_loop"]["final_source_count"] == 5


def test_sources_carry_the_query_that_found_them():
    retriever = FakeRetriever(
        {
            "q": {"web": [_source("https://a.com")], "papers": [], "news": []},
            "follow up": {"web": [_source("https://b.com")], "papers": [], "news": []},
        }
    )
    llm = FakeLLM([_reflection(False, [], ["follow up"]), _reflection(True)])
    loop = IterativeResearchLoop(retriever=retriever, llm=llm, max_iterations=2)

    by_url = {s["url"]: s for s in loop.run("q")["web"]}

    assert by_url["https://a.com"]["_query"] == "q"
    assert by_url["https://a.com"]["_iteration"] == 0
    assert by_url["https://b.com"]["_query"] == "follow up"
    assert by_url["https://b.com"]["_iteration"] == 1


def test_a_channel_that_recovers_is_no_longer_reported_as_broken():
    retriever = FakeRetriever(
        {
            # Web broke on the first pass but papers came back, so there is
            # something for the model to reflect on.
            "q": {
                "web": [],
                "papers": [_source("https://arxiv.org/abs/2401.00001")],
                "news": [],
                "errors": {"web": "Tavily: 429"},
            },
            "retry": {"web": [_source("https://a.com")], "papers": [], "news": []},
        }
    )
    llm = FakeLLM([_reflection(False, [], ["retry"]), _reflection(True)])
    loop = IterativeResearchLoop(retriever=retriever, llm=llm, max_iterations=2)

    result = loop.run("q")

    assert result["web"]
    assert "web" not in (result.get("errors") or {})


def test_nothing_retrieved_at_all_stops_the_loop():
    """With zero sources there is nothing to reflect on.

    A total retrieval failure is a provider problem — every channel down, or
    no keys configured — and spending more searches on a reworded query cannot
    fix it. The loop stops and lets the existing degraded-run reporting speak.
    """
    retriever = FakeRetriever(
        {"q": {"web": [], "papers": [], "news": [], "errors": {"web": "Tavily: 429"}}}
    )
    llm = FakeLLM([_reflection(False, [], ["retry"])])
    loop = IterativeResearchLoop(retriever=retriever, llm=llm, max_iterations=2)

    result = loop.run("q")

    assert retriever.queries == ["q"]
    assert llm.prompts == [], "reflection must not be called with an empty digest"
    assert result["research_loop"]["stopped_because"] == "reflection unavailable"


def test_is_enabled_defaults_to_off(monkeypatch):
    monkeypatch.delenv("RESEARCH_LOOP_ENABLED", raising=False)
    assert is_enabled() is False
    monkeypatch.setenv("RESEARCH_LOOP_ENABLED", "true")
    assert is_enabled() is True
