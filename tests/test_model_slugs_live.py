"""
Live check that every configured model slug still exists.

Skipped by default. This exists because of a specific failure that went
unnoticed in production: Groq retired its whole Llama 3.x line, and
`groq/llama-3.3-70b-versatile` — the default for two stages — started
returning 404 on every call. Nothing broke loudly. `_with_free_fallback`
caught each 404 and the stage carried on via OpenRouter, so the pipeline kept
producing reports while silently running the wrong model and paying for a
failed request first.

`validate_fallback()` probes the fallback slug at startup for exactly this
reason. Nothing probed the per-stage slugs, which is the gap this closes.

Each probe is one tiny completion, so running it costs a few fractions of a
cent on the paid providers and one request against Google's 20-per-day free
tier. That is why it is opt-in rather than part of the default suite.

Run:  MODEL_SLUG_LIVE_TESTS=1 pytest tests/test_model_slugs_live.py -v
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

pytestmark = pytest.mark.skipif(
    os.getenv("MODEL_SLUG_LIVE_TESTS", "").strip().lower() not in ("1", "true", "yes"),
    reason="live network test; set MODEL_SLUG_LIVE_TESTS=1 to run",
)

import utils.llm_config as llm_config  # noqa: E402


# (label, slug). Every slug the pipeline can route to by default.
CONFIGURED_SLUGS = [
    ("DEFAULT_MODEL", llm_config.DEFAULT_MODEL),
    ("RETRIEVER_MODEL", llm_config.RETRIEVER_MODEL),
    ("ANALYZER_MODEL", llm_config.ANALYZER_MODEL),
    ("CREDIBILITY_MODEL", llm_config.CREDIBILITY_MODEL),
    ("INSIGHT_MODEL", llm_config.INSIGHT_MODEL),
    ("REPORT_MODEL", llm_config.REPORT_MODEL),
]


def _build_without_fallback(slug: str):
    """Construct the client the way `create_llm` would, minus the fallback.

    The fallback is the whole reason a retired slug is invisible, so probing
    through `create_llm` would assert nothing: OpenRouter would answer and the
    test would pass with the primary dead.
    """
    provider, native_name = llm_config._split_provider(slug)
    builders = {
        "groq": llm_config._build_groq,
        "google": llm_config._build_google,
        "anthropic": llm_config._build_anthropic,
        "nvidia": llm_config._build_nvidia,
    }
    builder = builders.get(provider)
    if builder is None:
        return llm_config._build_openrouter(slug, 0.0, 64)
    return builder(native_name, 0.0, 64)


@pytest.mark.parametrize("label,slug", CONFIGURED_SLUGS, ids=[s[0] for s in CONFIGURED_SLUGS])
def test_the_configured_slug_still_exists(label, slug):
    client = _build_without_fallback(slug)
    if client is None:
        pytest.skip(f"{label}: no client for {slug} — provider key not set here")

    try:
        client.invoke("reply with: ok")
    except Exception as exc:
        # A 404/not-found is the retirement signature and the thing this test
        # is for. A 429 or a credit error means the slug is real but the account
        # is capped, which is a different problem and not a reason to fail.
        message = str(exc).lower()
        if any(marker in message for marker in ("does not exist", "not found", "404")):
            pytest.fail(
                f"{label}={slug} no longer exists at its provider. Every call "
                f"404s and falls back to {llm_config.OPENROUTER_FALLBACK_MODEL}, "
                f"so the stage runs on the wrong model without failing. Pick a "
                f"current slug."
            )
        pytest.skip(f"{label}={slug} reachable but erroring ({type(exc).__name__}): {exc}")


def test_the_fallback_slug_still_exists():
    """The fallback is the last line of defence for every stage; if it is also
    retired, a rate-limited stage has no working model at all."""
    ok, detail = llm_config.validate_fallback()
    assert ok, detail
