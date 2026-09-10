"""
OpenAlex credibility signals.

The credibility agent scores a source from the URL, the title and a model's
opinion of them. None of that can tell a paper with 400 citations apart from a
preprint nobody read, and none of it can see a retraction. OpenAlex can: it is
a free, key-less bibliographic index (~250M works) that returns citation
counts, venue, open-access status and a retraction flag.

Design constraints this module exists under:

* **Never block a run.** Every lookup is best-effort. A timeout, a 5xx, a
  malformed payload or a missing `requests` all return None and the caller
  keeps its existing score. Nothing here raises.
* **Never mis-attribute.** Matching a paper by title is a fuzzy operation, and
  crediting a source with another paper's 4,000 citations is worse than having
  no signal at all. Title matches must clear a token-overlap floor
  (`OPENALEX_MIN_TITLE_MATCH`) or they are discarded; DOI and arXiv-ID matches
  are exact and skip the check.
* **Pay the network cost once.** Results are cached in-process with a TTL, and
  `prefetch()` warms the cache concurrently so the credibility agent's serial
  per-source loop hits memory rather than making N sequential round-trips.

Set `OPENALEX_MAILTO` to an email address to enter OpenAlex's polite pool,
which gets faster and more reliable service. Set `OPENALEX_ENABLED=false` to
turn the whole thing off.
"""

from __future__ import annotations

import logging
import math
import os
import re
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional, Tuple

try:
    import requests
except ImportError:  # pragma: no cover - requests is a hard dep of the backend
    requests = None  # type: ignore[assignment]

logger = logging.getLogger(__name__)


OPENALEX_BASE_URL = os.getenv("OPENALEX_BASE_URL", "https://api.openalex.org")
OPENALEX_TIMEOUT = float(os.getenv("OPENALEX_TIMEOUT", "5.0"))
OPENALEX_CACHE_TTL = float(os.getenv("OPENALEX_CACHE_TTL", "86400"))
OPENALEX_MAILTO = os.getenv("OPENALEX_MAILTO", "").strip()
# Fraction of the retrieved title's significant tokens that must appear in the
# OpenAlex title before we accept a search hit as the same work.
OPENALEX_MIN_TITLE_MATCH = float(os.getenv("OPENALEX_MIN_TITLE_MATCH", "0.6"))
# Hard ceiling on lookups per prefetch, so a run with an unusually large source
# set cannot turn into 50 outbound requests.
OPENALEX_MAX_LOOKUPS = int(os.getenv("OPENALEX_MAX_LOOKUPS", "12"))
# OpenAlex rate-limits anonymous callers, and the prefetch fires these
# concurrently. Four is empirically under the threshold; setting
# OPENALEX_MAILTO enters the polite pool and raises it considerably.
OPENALEX_PREFETCH_WORKERS = int(os.getenv("OPENALEX_PREFETCH_WORKERS", "4"))
# One retry after a 429, because a rate-limit is transient and the alternative
# is silently dropping the signal for a whole batch of papers.
OPENALEX_RATE_LIMIT_PAUSE = float(os.getenv("OPENALEX_RATE_LIMIT_PAUSE", "1.0"))

_USER_AGENT = "Chronicle/1.0 (https://deep-research.intelliforge.tech)"

# key -> (expires_at, value). value may be None, which is itself worth caching:
# a title that OpenAlex does not know should not be looked up five more times.
_cache: Dict[str, Tuple[float, Optional[Dict[str, Any]]]] = {}
_cache_lock = threading.Lock()
_mailto_warned = False

_STOPWORDS = {
    "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "in", "is",
    "it", "of", "on", "or", "that", "the", "to", "via", "with",
}


def is_enabled() -> bool:
    """True unless explicitly disabled. No API key is required."""
    return os.getenv("OPENALEX_ENABLED", "true").strip().lower() not in (
        "false", "0", "no", "off"
    )


# ---------------------------------------------------------------------------
# Identifier extraction
# ---------------------------------------------------------------------------

_DOI_RE = re.compile(r"\b(10\.\d{4,9}/[^\s\"'<>&]+)", re.IGNORECASE)
# arXiv has two id shapes: the modern 2401.01234 and the legacy hep-th/9901001.
_ARXIV_RE = re.compile(
    r"arxiv\.org/(?:abs|pdf)/(\d{4}\.\d{4,5}|[a-z\-]+(?:\.[A-Z]{2})?/\d{7})",
    re.IGNORECASE,
)


def extract_doi(*candidates: Optional[str]) -> Optional[str]:
    """Pull a DOI out of a URL or free text. Returns a bare `10.x/y` DOI."""
    for text in candidates:
        if not text:
            continue
        match = _DOI_RE.search(text)
        if match:
            # Trailing punctuation is common when a DOI is scraped from prose.
            return match.group(1).rstrip(".,);]").lower()
    return None


def extract_arxiv_id(*candidates: Optional[str]) -> Optional[str]:
    """Pull an arXiv id out of an abs/pdf URL, dropping any version suffix."""
    for text in candidates:
        if not text:
            continue
        match = _ARXIV_RE.search(text)
        if match:
            return re.sub(r"v\d+$", "", match.group(1))
    return None


def _normalize_title(title: str) -> List[str]:
    """Significant lowercase tokens of a title, for match scoring."""
    tokens = re.findall(r"[a-z0-9]+", (title or "").lower())
    return [t for t in tokens if t not in _STOPWORDS and len(t) > 1]


def _title_match_ratio(wanted: str, found: str) -> float:
    """Fraction of the wanted title's tokens present in the found title."""
    wanted_tokens = _normalize_title(wanted)
    if not wanted_tokens:
        return 0.0
    found_tokens = set(_normalize_title(found))
    hits = sum(1 for t in wanted_tokens if t in found_tokens)
    return hits / len(wanted_tokens)


# ---------------------------------------------------------------------------
# HTTP
# ---------------------------------------------------------------------------

def _params(extra: Optional[Dict[str, str]] = None) -> Dict[str, str]:
    params = dict(extra or {})
    if OPENALEX_MAILTO:
        params["mailto"] = OPENALEX_MAILTO
    return params


def _warn_once_about_mailto() -> None:
    """Anonymous callers get rate-limited first. Say so, once."""
    global _mailto_warned
    if _mailto_warned or OPENALEX_MAILTO:
        return
    _mailto_warned = True
    logger.info(
        "OPENALEX_MAILTO is not set. OpenAlex rate-limits anonymous callers "
        "before polite-pool ones; set it to an email address to make "
        "bibliographic signals more reliable."
    )


def _get(path: str, params: Optional[Dict[str, str]] = None) -> Optional[Any]:
    """One GET against OpenAlex. Returns parsed JSON, or None on any failure.

    Retries once on 429 — the prefetch issues several of these concurrently
    and a rate-limit is transient, so giving up immediately would drop the
    signal for a whole batch of papers rather than one.
    """
    if requests is None:
        return None
    _warn_once_about_mailto()
    url = f"{OPENALEX_BASE_URL.rstrip('/')}/{path.lstrip('/')}"

    for attempt in (1, 2):
        try:
            response = requests.get(
                url,
                params=_params(params),
                timeout=OPENALEX_TIMEOUT,
                headers={"User-Agent": _USER_AGENT, "Accept": "application/json"},
            )
        except Exception as e:
            logger.debug(f"OpenAlex request failed for {url}: {type(e).__name__}: {e}")
            return None

        if response.status_code == 429 and attempt == 1:
            time.sleep(OPENALEX_RATE_LIMIT_PAUSE)
            continue

        if response.status_code == 404:
            # An identifier we hold that OpenAlex does not index — most often
            # a pre-2022 arXiv paper, from before arXiv minted DOIs. The
            # caller falls through to a title search. Normal, not an error.
            return None
        if response.status_code != 200:
            logger.debug(f"OpenAlex returned {response.status_code} for {url}")
            return None
        try:
            return response.json()
        except Exception as e:
            logger.debug(f"OpenAlex returned unparseable JSON for {url}: {e}")
            return None
    return None


def _parse_work(raw: Dict[str, Any], matched_by: str) -> Optional[Dict[str, Any]]:
    """Reduce an OpenAlex work object to the fields credibility cares about."""
    if not isinstance(raw, dict) or not raw.get("id"):
        return None

    location = raw.get("primary_location") or {}
    venue = location.get("source") or {}

    return {
        "openalex_id": raw.get("id"),
        "doi": (raw.get("doi") or "").replace("https://doi.org/", "") or None,
        "title": raw.get("title") or raw.get("display_name") or "",
        "cited_by_count": int(raw.get("cited_by_count") or 0),
        # OpenAlex exposes the flag as `is_retracted`; treat a missing field as
        # "not known to be retracted" rather than as a failure.
        "is_retracted": bool(raw.get("is_retracted")),
        "publication_year": raw.get("publication_year"),
        "venue": venue.get("display_name"),
        # "journal" | "conference" | "repository" | "ebook platform" | ...
        "venue_type": venue.get("type"),
        "is_oa": bool((raw.get("open_access") or {}).get("is_oa")),
        "referenced_works_count": len(raw.get("referenced_works") or []),
        "matched_by": matched_by,
    }


def _lookup_uncached(
    title: str, url: str = "", extra_text: str = ""
) -> Optional[Dict[str, Any]]:
    """Resolve a source to an OpenAlex work by DOI, then arXiv id, then title."""
    doi = extract_doi(url, extra_text, title)
    if doi:
        raw = _get(f"/works/doi:{doi}")
        parsed = _parse_work(raw, "doi") if isinstance(raw, dict) else None
        if parsed:
            return parsed

    arxiv_id = extract_arxiv_id(url, extra_text)
    if arxiv_id:
        # arXiv preprints from 2022 onward carry a DOI arXiv mints itself.
        # Older ones do not, and 404 here — the title search below is what
        # resolves those, which is why this is a fall-through and not a return.
        raw = _get(f"/works/doi:10.48550/arxiv.{arxiv_id}")
        parsed = _parse_work(raw, "arxiv") if isinstance(raw, dict) else None
        if parsed:
            return parsed

    if not title or len(title.strip()) < 12:
        return None

    payload = _get(
        "/works",
        {
            # `title.search` is the narrow field search; the broad `search`
            # param matches abstracts too and returns confident-looking
            # nonsense for a title query.
            "filter": f"title.search:{title.strip()}",
            "per-page": "3",
            "select": (
                "id,doi,title,display_name,cited_by_count,is_retracted,"
                "publication_year,primary_location,open_access,referenced_works"
            ),
        },
    )
    if not isinstance(payload, dict):
        return None

    for raw in (payload.get("results") or [])[:3]:
        candidate = _parse_work(raw, "title")
        if not candidate:
            continue
        ratio = _title_match_ratio(title, candidate.get("title", ""))
        if ratio >= OPENALEX_MIN_TITLE_MATCH:
            candidate["title_match_ratio"] = round(ratio, 2)
            return candidate
        logger.debug(
            f"OpenAlex title hit rejected ({ratio:.2f} < "
            f"{OPENALEX_MIN_TITLE_MATCH}): {title!r} vs {candidate.get('title')!r}"
        )
    return None


def lookup(title: str, url: str = "", extra_text: str = "") -> Optional[Dict[str, Any]]:
    """Cached, never-raising lookup of one source in OpenAlex.

    Returns the reduced work dict, or None when disabled, unmatched or failed.
    """
    if not is_enabled():
        return None

    cache_key = f"{(url or '').strip().lower()}|{(title or '').strip().lower()}"
    now = time.time()

    with _cache_lock:
        hit = _cache.get(cache_key)
        if hit and hit[0] > now:
            return hit[1]

    try:
        work = _lookup_uncached(title, url, extra_text)
    except Exception as e:  # defensive: this must never break a research run
        logger.warning(f"OpenAlex lookup raised unexpectedly: {type(e).__name__}: {e}")
        work = None

    with _cache_lock:
        _cache[cache_key] = (now + OPENALEX_CACHE_TTL, work)
    return work


def prefetch(sources: Iterable[Dict[str, Any]]) -> int:
    """Warm the cache for many sources concurrently.

    The credibility agent evaluates sources one at a time; without this, N
    papers means N sequential 5s-timeout round-trips bolted onto the critical
    path. Returns the number of lookups attempted.
    """
    if not is_enabled():
        return 0

    pending = []
    for source in sources:
        if len(pending) >= OPENALEX_MAX_LOOKUPS:
            break
        title = source.get("title") or ""
        url = source.get("url") or ""
        if not title and not url:
            continue
        pending.append((title, url, source.get("summary") or source.get("snippet") or ""))

    if not pending:
        return 0

    workers = min(OPENALEX_PREFETCH_WORKERS, len(pending))
    try:
        with ThreadPoolExecutor(max_workers=workers) as pool:
            list(
                pool.map(
                    lambda args: lookup(title=args[0], url=args[1], extra_text=args[2]),
                    pending,
                )
            )
    except Exception as e:
        logger.warning(f"OpenAlex prefetch failed: {type(e).__name__}: {e}")
    return len(pending)


def clear_cache() -> None:
    """Drop the in-process cache. Used by tests."""
    with _cache_lock:
        _cache.clear()


# ---------------------------------------------------------------------------
# Scoring
# ---------------------------------------------------------------------------

# How much of the final credibility score bibliographic evidence accounts for,
# when OpenAlex has a record at all. A blend rather than a bonus, because the
# existing heuristic saturates: an arXiv paper already scores 0.5 base + 0.3
# academic domain + 0.2 paper type + authors + title = clamped to 1.0, so an
# additive bonus has nowhere to go and a 400-citation paper would be
# indistinguishable from a preprint nobody read — precisely the distinction
# this module exists to make. At 0.25 the blend can pull a saturated score
# down to ~0.86 for an uncited preprint while leaving a well-cited journal
# paper at the top.
OPENALEX_WEIGHT = float(os.getenv("OPENALEX_WEIGHT", "0.25"))
RETRACTED_SCORE = 0.05


def bibliometric_score(work: Dict[str, Any]) -> Tuple[float, List[str]]:
    """Score a work on its bibliographic record alone, 0.0-1.0.

    0.5 is "indexed, but the record says nothing either way". Everything below
    is evidence of weakness (uncited, unreviewed, very old) and everything
    above is evidence of reception (citations, a peer-reviewed venue).
    """
    score = 0.5
    reasons: List[str] = []

    # Citations on a log scale: the interesting distinction is 0 vs 10 vs 100,
    # not 900 vs 1000, and a linear scale would let one famous paper swamp
    # every other credibility input.
    citations = int(work.get("cited_by_count") or 0)
    if citations > 0:
        score += min(0.35, 0.12 * math.log10(1 + citations))
        reasons.append(f"{citations} citations (OpenAlex)")
    else:
        reasons.append("no recorded citations")

    venue_type = (work.get("venue_type") or "").lower()
    venue_name = work.get("venue")
    if venue_type in ("journal", "conference"):
        score += 0.15
        reasons.append(f"published in {venue_name or venue_type}")
    elif venue_type == "repository":
        # A preprint server. Not disqualifying — arXiv is a primary channel for
        # this product — but it has had no peer review.
        score -= 0.05
        reasons.append(f"preprint/repository ({venue_name or 'unknown'})")

    year = work.get("publication_year")
    if isinstance(year, int):
        if datetime.now(timezone.utc).year - year > 15:
            score -= 0.05
            reasons.append(f"older literature ({year})")

    return max(0.0, min(1.0, score)), reasons


def apply_to_score(
    base_score: float, work: Optional[Dict[str, Any]]
) -> Tuple[float, List[str], bool]:
    """Fold bibliographic evidence into an existing credibility score.

    Returns `(score, reasons, retracted)`. With no work the score is returned
    untouched, so sources OpenAlex has nothing to say about are unaffected.
    Retraction is not a blend: a retracted paper is not a slightly-less-credible
    paper, so it is floored outright.
    """
    if not work:
        return base_score, [], False

    if work.get("is_retracted"):
        return RETRACTED_SCORE, ["RETRACTED (OpenAlex) — do not cite"], True

    biblio, reasons = bibliometric_score(work)
    blended = (1.0 - OPENALEX_WEIGHT) * base_score + OPENALEX_WEIGHT * biblio
    return max(0.0, min(1.0, blended)), reasons, False
