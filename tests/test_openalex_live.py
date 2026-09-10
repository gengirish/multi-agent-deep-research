"""
Live OpenAlex contract tests.

Skipped by default. These are the only tests that touch the network, and they
exist because the rest of the OpenAlex suite mocks `_get` — which verifies our
logic but would not notice OpenAlex changing a URL shape or a field name under
us.

Run:  OPENALEX_LIVE_TESTS=1 pytest tests/test_openalex_live.py
"""

from __future__ import annotations

import os
import sys
import time
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from utils import openalex

pytestmark = pytest.mark.skipif(
    os.getenv("OPENALEX_LIVE_TESTS", "").strip().lower() not in ("1", "true", "yes"),
    reason="live network test; set OPENALEX_LIVE_TESTS=1 to run",
)


@pytest.fixture(autouse=True)
def _spaced_out():
    """OpenAlex rate-limits anonymous callers; do not machine-gun it."""
    openalex.clear_cache()
    yield
    time.sleep(1.0)


def test_a_doi_resolves_with_the_fields_we_score_on():
    work = openalex.lookup(title="", url="https://doi.org/10.1038/s41586-021-03819-2")

    assert work is not None, "AlphaFold's DOI should resolve"
    assert work["matched_by"] == "doi"
    assert work["cited_by_count"] > 1000
    assert work["venue"] == "Nature"
    assert work["venue_type"] == "journal"
    assert work["is_retracted"] is False


def test_a_recent_arxiv_id_resolves_through_the_minted_doi():
    work = openalex.lookup(title="Mixtral of Experts", url="https://arxiv.org/abs/2401.04088")

    assert work is not None
    assert work["matched_by"] == "arxiv"


def test_a_pre_2022_arxiv_paper_falls_through_to_title_search():
    """arXiv only began minting DOIs in 2022, so the id lookup 404s for older
    papers and the title search is what resolves them."""
    work = openalex.lookup(
        title="Attention Is All You Need", url="https://arxiv.org/abs/1706.03762"
    )

    assert work is not None
    assert work["matched_by"] == "title"
    assert work["cited_by_count"] > 1000


def test_every_match_path_returns_a_publication_date():
    """The citation grace period needs month precision, so a missing or
    year-only date would silently change how new papers are scored. A year alone
    cannot tell January from December."""
    for kwargs in (
        {"title": "", "url": "https://doi.org/10.1038/s41586-021-03819-2"},
        {"title": "Mixtral of Experts", "url": "https://arxiv.org/abs/2401.04088"},
        {"title": "Attention Is All You Need"},
    ):
        openalex.clear_cache()
        work = openalex.lookup(**kwargs)
        assert work is not None, kwargs
        date = work.get("publication_date")
        assert date and len(date) >= 10, f"no usable publication_date for {kwargs}: {date!r}"
        assert openalex._age_months(work) is not None
        time.sleep(1.0)


def test_an_unpublished_business_question_matches_nothing():
    assert openalex.lookup(title="Market sizing for vertical SaaS in India 2026") is None
