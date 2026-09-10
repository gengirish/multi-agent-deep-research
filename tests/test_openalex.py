"""
Tests for the OpenAlex credibility signal layer.

No network: `_get` is monkeypatched throughout. What matters here is that the
module never mis-attributes a work, never raises into a run, and turns a
bibliographic record into a bounded score adjustment.

Run:  pytest tests/test_openalex.py
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from utils import openalex


@pytest.fixture(autouse=True)
def _clean_cache(monkeypatch):
    """Every test starts with an empty cache and OpenAlex enabled."""
    monkeypatch.setenv("OPENALEX_ENABLED", "true")
    openalex.clear_cache()
    yield
    openalex.clear_cache()


def _work(**overrides):
    raw = {
        "id": "https://openalex.org/W123",
        "doi": "https://doi.org/10.1234/abc",
        "title": "Attention Is All You Need",
        "cited_by_count": 100,
        "is_retracted": False,
        "publication_year": 2017,
        "primary_location": {"source": {"display_name": "NeurIPS", "type": "conference"}},
        "open_access": {"is_oa": True},
        "referenced_works": ["W1", "W2"],
    }
    raw.update(overrides)
    return raw


# -- identifier extraction ---------------------------------------------------

@pytest.mark.parametrize(
    "text,expected",
    [
        ("https://doi.org/10.1038/s41586-021-03819-2", "10.1038/s41586-021-03819-2"),
        ("see doi:10.1234/ABC.5678 for detail", "10.1234/abc.5678"),
        # Trailing sentence punctuation is common in scraped prose.
        ("https://doi.org/10.1234/abc.", "10.1234/abc"),
        ("https://example.com/no-doi-here", None),
    ],
)
def test_extract_doi(text, expected):
    assert openalex.extract_doi(text) == expected


@pytest.mark.parametrize(
    "url,expected",
    [
        ("https://arxiv.org/abs/2401.01234", "2401.01234"),
        ("http://arxiv.org/pdf/2401.01234v3", "2401.01234"),
        ("https://arxiv.org/abs/hep-th/9901001", "hep-th/9901001"),
        ("https://example.com/paper", None),
    ],
)
def test_extract_arxiv_id(url, expected):
    assert openalex.extract_arxiv_id(url) == expected


# -- matching ----------------------------------------------------------------

def test_doi_match_skips_the_title_check(monkeypatch):
    calls = []

    def fake_get(path, params=None):
        calls.append(path)
        return _work()

    monkeypatch.setattr(openalex, "_get", fake_get)
    result = openalex.lookup(title="Something Else Entirely", url="https://doi.org/10.1234/abc")

    assert result["matched_by"] == "doi"
    assert result["cited_by_count"] == 100
    assert calls == ["/works/doi:10.1234/abc"], "an exact DOI hit needs no title search"


def test_arxiv_id_resolves_through_the_minted_doi(monkeypatch):
    seen = []

    def fake_get(path, params=None):
        seen.append(path)
        return _work() if "10.48550" in path else None

    monkeypatch.setattr(openalex, "_get", fake_get)
    result = openalex.lookup(title="A Paper", url="https://arxiv.org/abs/2401.01234")

    assert result["matched_by"] == "arxiv"
    assert "/works/doi:10.48550/arxiv.2401.01234" in seen


def test_a_title_search_hit_that_does_not_match_is_rejected(monkeypatch):
    """The failure mode this guards: crediting a source with another paper's
    4,000 citations. No signal is strictly better than a wrong one."""
    monkeypatch.setattr(
        openalex,
        "_get",
        lambda path, params=None: {
            "results": [_work(title="Entirely Unrelated Work On Fish Migration")]
        },
    )

    assert openalex.lookup(title="Market Sizing For Vertical SaaS In 2026") is None


def test_a_title_search_hit_that_matches_is_accepted(monkeypatch):
    monkeypatch.setattr(
        openalex,
        "_get",
        lambda path, params=None: {"results": [_work(title="Attention is all you need")]},
    )
    result = openalex.lookup(title="Attention Is All You Need")

    assert result["matched_by"] == "title"
    assert result["title_match_ratio"] == 1.0


def test_short_titles_are_not_title_searched(monkeypatch):
    """Too little signal to match on; searching would invite a false positive."""
    monkeypatch.setattr(
        openalex, "_get", lambda path, params=None: pytest.fail("should not call OpenAlex")
    )
    assert openalex.lookup(title="TAM") is None


# -- resilience --------------------------------------------------------------

def test_a_raising_backend_returns_none_rather_than_propagating(monkeypatch):
    def boom(path, params=None):
        raise RuntimeError("connection reset")

    monkeypatch.setattr(openalex, "_get", boom)
    assert openalex.lookup(title="Attention Is All You Need", url="https://doi.org/10.1/x") is None


def test_malformed_payloads_return_none(monkeypatch):
    monkeypatch.setattr(openalex, "_get", lambda path, params=None: {"unexpected": "shape"})
    assert openalex.lookup(title="Attention Is All You Need") is None


def test_disabled_short_circuits_before_any_request(monkeypatch):
    monkeypatch.setenv("OPENALEX_ENABLED", "false")
    monkeypatch.setattr(
        openalex, "_get", lambda path, params=None: pytest.fail("should not call OpenAlex")
    )
    assert openalex.lookup(title="Attention Is All You Need") is None
    assert openalex.prefetch([{"title": "x", "url": "y"}]) == 0


def test_a_rate_limit_is_retried_once(monkeypatch):
    """The prefetch fires several of these at once and OpenAlex rate-limits
    anonymous callers, so giving up on the first 429 would drop the signal for
    a whole batch of papers rather than one."""
    import requests as requests_module

    class FakeResponse:
        def __init__(self, status_code, payload=None):
            self.status_code = status_code
            self._payload = payload or {}
            self.text = ""

        def json(self):
            return self._payload

    responses = [FakeResponse(429), FakeResponse(200, _work())]
    calls = []

    def fake_request(url, params=None, timeout=None, headers=None):
        calls.append(url)
        return responses.pop(0)

    monkeypatch.setattr(openalex, "OPENALEX_RATE_LIMIT_PAUSE", 0.0)
    monkeypatch.setattr(requests_module, "get", fake_request)

    result = openalex.lookup(title="", url="https://doi.org/10.1234/abc")

    assert len(calls) == 2, "a 429 should be retried once"
    assert result is not None


def test_a_second_rate_limit_gives_up_rather_than_looping(monkeypatch):
    import requests as requests_module

    class FakeResponse:
        status_code = 429
        text = ""

        def json(self):
            return {}

    calls = []

    def fake_request(url, params=None, timeout=None, headers=None):
        calls.append(url)
        return FakeResponse()

    monkeypatch.setattr(openalex, "OPENALEX_RATE_LIMIT_PAUSE", 0.0)
    monkeypatch.setattr(requests_module, "get", fake_request)

    assert openalex.lookup(title="", url="https://doi.org/10.1234/abc") is None
    assert len(calls) == 2


def test_a_404_falls_through_to_the_title_search(monkeypatch):
    """arXiv only minted DOIs from 2022 on, so the id lookup 404s for older
    papers and the title search is what resolves them."""
    paths = []

    def fake_get(path, params=None):
        paths.append(path)
        if path.startswith("/works/doi:"):
            return None  # 404
        return {"results": [_work(title="Attention Is All You Need")]}

    monkeypatch.setattr(openalex, "_get", fake_get)
    result = openalex.lookup(
        title="Attention Is All You Need", url="https://arxiv.org/abs/1706.03762"
    )

    assert result is not None
    assert result["matched_by"] == "title"
    assert paths[0] == "/works/doi:10.48550/arxiv.1706.03762"
    assert paths[-1] == "/works"


# -- caching -----------------------------------------------------------------

def test_repeat_lookups_hit_the_cache(monkeypatch):
    calls = []
    monkeypatch.setattr(
        openalex, "_get", lambda path, params=None: (calls.append(path), _work())[1]
    )

    for _ in range(3):
        openalex.lookup(title="Attention Is All You Need", url="https://doi.org/10.1234/abc")

    assert len(calls) == 1


def test_a_miss_is_cached_too(monkeypatch):
    """A title OpenAlex does not know must not be looked up once per source."""
    calls = []
    monkeypatch.setattr(
        openalex, "_get", lambda path, params=None: (calls.append(path), {"results": []})[1]
    )

    for _ in range(3):
        assert openalex.lookup(title="A Paper Nobody Has Ever Written About") is None

    assert len(calls) == 1


def test_prefetch_is_capped(monkeypatch):
    monkeypatch.setenv("OPENALEX_MAX_LOOKUPS", "3")
    # Re-read the module-level cap the way the process would on import.
    monkeypatch.setattr(openalex, "OPENALEX_MAX_LOOKUPS", 3)
    monkeypatch.setattr(openalex, "_get", lambda path, params=None: None)

    sources = [{"title": f"Paper number {i} on markets", "url": f"https://x.com/{i}"} for i in range(20)]
    assert openalex.prefetch(sources) == 3


# -- scoring -----------------------------------------------------------------

def test_no_work_leaves_the_score_untouched():
    assert openalex.apply_to_score(0.72, None) == (0.72, [], False)


def test_retraction_overrides_everything():
    """A retracted paper with 5,000 citations is not a strong source."""
    score, reasons, retracted = openalex.apply_to_score(
        1.0, openalex._parse_work(_work(is_retracted=True, cited_by_count=5000), "doi")
    )
    assert retracted is True
    assert score == openalex.RETRACTED_SCORE
    assert any("RETRACTED" in r for r in reasons)


def test_citations_raise_the_bibliometric_score_on_a_log_scale():
    def score_for(count):
        work = openalex._parse_work(_work(cited_by_count=count, primary_location={}), "doi")
        return openalex.bibliometric_score(work)[0]

    assert score_for(0) == 0.5
    assert 0.5 < score_for(10) < score_for(100) < score_for(1000)

    # A log scale pays roughly the same per decade, which is the intent: the
    # interesting distinction is 0 vs 10 vs 100 citations. A linear scale would
    # make a 1000-citation paper worth 100x a 10-citation one and swamp every
    # other credibility signal.
    first_decade = score_for(100) - score_for(10)
    second_decade = score_for(1000) - score_for(100)
    assert abs(first_decade - second_decade) < 0.02

    # And the ceiling binds: past ~1000 citations more of them buy nothing.
    assert score_for(1000) == score_for(100_000)


def test_a_peer_reviewed_venue_beats_a_preprint_server():
    journal = openalex.bibliometric_score(
        openalex._parse_work(
            _work(primary_location={"source": {"display_name": "Nature", "type": "journal"}}), "doi"
        )
    )[0]
    preprint = openalex.bibliometric_score(
        openalex._parse_work(
            _work(primary_location={"source": {"display_name": "arXiv", "type": "repository"}}), "doi"
        )
    )[0]
    assert journal > preprint


def test_the_bibliometric_score_stays_in_range():
    best = openalex.bibliometric_score(
        openalex._parse_work(
            _work(
                cited_by_count=10_000_000,
                primary_location={"source": {"display_name": "Nature", "type": "journal"}},
            ),
            "doi",
        )
    )[0]
    worst = openalex.bibliometric_score(
        openalex._parse_work(
            _work(
                cited_by_count=0,
                publication_year=1970,
                primary_location={"source": {"display_name": "arXiv", "type": "repository"}},
            ),
            "doi",
        )
    )[0]
    assert 0.0 <= worst < best <= 1.0


def test_the_blend_can_discriminate_between_saturated_sources():
    """The case that motivated a blend over a bonus.

    Both of these already score 1.0 on the existing heuristics — arXiv URL,
    paper type, named authors. Only bibliographic evidence can separate them.
    """
    cited = openalex.apply_to_score(
        1.0,
        openalex._parse_work(
            _work(
                cited_by_count=800,
                primary_location={"source": {"display_name": "Nature", "type": "journal"}},
            ),
            "doi",
        ),
    )[0]
    ignored = openalex.apply_to_score(
        1.0,
        openalex._parse_work(
            _work(
                cited_by_count=0,
                primary_location={"source": {"display_name": "arXiv", "type": "repository"}},
            ),
            "doi",
        ),
    )[0]

    assert cited > ignored
    assert cited > 0.95, "a well-cited journal paper should stay at the top"
    assert ignored < 0.9, "an uncited preprint should not sit at the ceiling"


def test_the_blend_weight_bounds_how_far_the_signal_can_move_a_score():
    """OpenAlex informs the score; it does not become the score."""
    best_case = openalex.apply_to_score(
        0.0, openalex._parse_work(_work(cited_by_count=10_000_000,
            primary_location={"source": {"display_name": "Nature", "type": "journal"}}), "doi")
    )[0]
    assert best_case <= openalex.OPENALEX_WEIGHT + 1e-9
