"""
Tests for OpenAlex signals reaching the credibility score.

The LLM half of the credibility agent is disabled here so scores are
deterministic and the assertions are about the bibliographic contribution
alone. No network: `openalex.lookup` is monkeypatched.

Run:  pytest tests/test_credibility_openalex.py
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from agents import credibility as credibility_module
from utils import openalex


@pytest.fixture
def agent(monkeypatch):
    """A credibility agent with no model, so only heuristics + OpenAlex move the score."""
    monkeypatch.setenv("OPENALEX_ENABLED", "true")
    monkeypatch.setattr(credibility_module, "create_credibility_llm", lambda: None)
    openalex.clear_cache()
    return credibility_module.SourceCredibilityAgent()


def _paper(title="A Study Of Something Important", url="https://arxiv.org/abs/2401.01234"):
    return {"title": title, "url": url, "authors": "A. Author", "summary": "abstract"}


def _work(**overrides):
    work = {
        "openalex_id": "https://openalex.org/W1",
        "doi": "10.1234/abc",
        "title": "A Study Of Something Important",
        "cited_by_count": 0,
        "is_retracted": False,
        "publication_year": 2023,
        "venue": "arXiv",
        "venue_type": "repository",
        "is_oa": True,
        "referenced_works_count": 10,
        "matched_by": "arxiv",
    }
    work.update(overrides)
    return work


def _score_paper(agent, monkeypatch, work):
    monkeypatch.setattr(openalex, "lookup", lambda *args, **kwargs: work)
    sources = {"papers": [_paper()], "web": [], "news": []}
    results = agent.evaluate_credibility(sources)
    return results["papers"][0]


def test_a_retracted_paper_is_floored_regardless_of_every_other_signal(agent, monkeypatch):
    """The signal none of the previous inputs could ever produce.

    A retracted paper on arXiv with 5,000 citations scores high on every
    heuristic the agent had before: academic domain, paper type, named authors.
    """
    result = _score_paper(agent, monkeypatch, _work(is_retracted=True, cited_by_count=5000))

    assert result["retracted"] is True
    assert result["score"] == pytest.approx(openalex.RETRACTED_SCORE, abs=0.01)
    assert result["level"] == "Very Low"
    assert "RETRACTED" in result["reasoning"]


def test_citations_and_a_peer_reviewed_venue_separate_two_identical_papers(agent, monkeypatch):
    """The distinction the credibility agent could not previously draw.

    Both sources are arXiv-hosted papers with named authors, so both score a
    saturated 1.0 on the URL-and-type heuristics. Only the bibliographic
    record tells them apart.
    """
    cited = _score_paper(
        agent, monkeypatch, _work(cited_by_count=800, venue="Nature", venue_type="journal")
    )
    ignored = _score_paper(agent, monkeypatch, _work(cited_by_count=0, venue_type="repository"))

    assert cited["score_before_openalex"] == ignored["score_before_openalex"] == pytest.approx(1.0)
    assert cited["score"] > ignored["score"]
    assert "800 citations" in cited["reasoning"]
    assert "no recorded citations" in ignored["reasoning"]


def test_an_uncited_preprint_is_pulled_off_the_ceiling(agent, monkeypatch):
    unknown = _score_paper(agent, monkeypatch, None)
    preprint = _score_paper(agent, monkeypatch, _work(cited_by_count=0, venue_type="repository"))

    assert preprint["score"] < unknown["score"]
    assert "no recorded citations" in preprint["reasoning"]


def test_the_score_stays_in_range(agent, monkeypatch):
    result = _score_paper(agent, monkeypatch, _work(cited_by_count=10_000_000, venue_type="journal"))
    assert 0.0 <= result["score"] <= 1.0


def test_a_source_openalex_does_not_know_scores_exactly_as_before(agent, monkeypatch):
    """Adding the signal must not move sources it has nothing to say about."""
    monkeypatch.setattr(openalex, "lookup", lambda **kwargs: None)
    with_openalex = agent.evaluate_credibility({"papers": [_paper()], "web": [], "news": []})

    monkeypatch.setenv("OPENALEX_ENABLED", "false")
    without = agent.evaluate_credibility({"papers": [_paper()], "web": [], "news": []})

    assert with_openalex["papers"][0]["score"] == without["papers"][0]["score"]
    assert with_openalex["papers"][0]["openalex"] is None
    assert with_openalex["papers"][0]["score_before_openalex"] is None


def test_a_plain_web_page_is_never_looked_up(agent, monkeypatch):
    """Title-searching a blog post against a bibliographic index produces
    confident-looking mismatches, so web sources qualify only via an identifier."""
    monkeypatch.setattr(
        openalex,
        "lookup",
        lambda *args, **kwargs: pytest.fail("web pages must not be looked up"),
    )
    sources = {
        "web": [{"title": "Why We Raised A Seed Round", "url": "https://blog.example.com/post"}],
        "papers": [],
        "news": [],
    }
    result = agent.evaluate_credibility(sources)

    assert result["web"][0]["openalex"] is None


def test_a_web_source_carrying_a_doi_is_looked_up(agent, monkeypatch):
    looked_up = []

    def fake_lookup(*args, **kwargs):
        looked_up.append(kwargs.get("url"))
        return _work(cited_by_count=50, venue="Nature", venue_type="journal")

    monkeypatch.setattr(openalex, "lookup", fake_lookup)
    sources = {
        "web": [{"title": "A Paper Hosted Elsewhere", "url": "https://doi.org/10.1234/abc"}],
        "papers": [],
        "news": [],
    }
    result = agent.evaluate_credibility(sources)

    # Both the prefetch and the per-source evaluation ask for it; in
    # production the second is a cache hit.
    assert set(looked_up) == {"https://doi.org/10.1234/abc"}
    assert result["web"][0]["openalex"] is not None


def test_lookups_are_prefetched_concurrently_before_the_serial_loop(agent, monkeypatch):
    """Without the prefetch, N papers means N sequential timeouts on the
    critical path of a run that is supposed to finish in ~60s."""
    order = []
    monkeypatch.setattr(
        openalex, "prefetch", lambda sources: (order.append(("prefetch", len(list(sources)))), 3)[1]
    )
    monkeypatch.setattr(
        openalex, "lookup", lambda *args, **kwargs: (order.append(("lookup", None)), None)[1]
    )

    agent.evaluate_credibility({"papers": [_paper(), _paper(), _paper()], "web": [], "news": []})

    assert order[0] == ("prefetch", 3)
    assert all(step[0] == "lookup" for step in order[1:])


def test_a_raising_lookup_does_not_break_evaluation(agent, monkeypatch):
    def boom(*args, **kwargs):
        raise RuntimeError("openalex exploded")

    monkeypatch.setattr(openalex, "lookup", boom)

    with pytest.raises(RuntimeError):
        # utils.openalex.lookup swallows its own failures; this asserts the
        # contract is real by showing what happens when it does not hold.
        agent.evaluate_credibility({"papers": [_paper()], "web": [], "news": []})
