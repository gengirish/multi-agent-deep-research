"""
LLM configuration — multi-provider routing.

Default routing:
    Enrichment   → Groq Llama 3.3 70B (sub-second metadata extraction)
    Analyzer     → Gemini Flash, native Google (reasoning over sources)
    Insight      → Gemini Flash, native Google (creative pattern matching)
    Reporter     → Gemini Flash, native Google (long prompt, all sources)
    Credibility  → Groq Llama 3.3 70B (one short rating call per source)

Every default sits on a free tier, with an OpenRouter `:free` OSS model as the
invoke-time fallback, so the pipeline runs end-to-end on no paid credit.

Each agent stage gets its own helper so swapping a provider is a one-line
change. Overridable via env vars (e.g. RETRIEVER_MODEL=openai/gpt-4o-mini
to revert to the OpenRouter path).

Providers:
    - OpenRouter (default)  → langchain-openai pointed at openrouter.ai
    - Groq                  → langchain-groq (sub-second Llama inference)
    - Google                → langchain-google-genai (Gemini, fallback)
    - Anthropic             → langchain-anthropic (native Claude access)

Every native provider falls back to OpenRouter with the same fully-qualified
model name, so one missing key never takes the workflow down.
"""

from __future__ import annotations

import logging
import os
from typing import Any, Optional

from dotenv import load_dotenv
from langchain_openai import ChatOpenAI

load_dotenv()

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Provider endpoints + keys
# ---------------------------------------------------------------------------

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
OPENROUTER_API_KEY = os.getenv("OPEN_ROUTER_KEY")
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")

# NVIDIA NIM (build.nvidia.com). OpenAI-compatible, so it uses the same
# ChatOpenAI client as OpenRouter with a different base URL. Its free tier is
# credit-metered per request rather than capped tokens-per-minute, which suits
# the token-heavy eval judge better than Groq's 12k/min ceiling.
NVIDIA_BASE_URL = os.getenv("NVIDIA_BASE_URL", "https://integrate.api.nvidia.com/v1")
NVIDIA_API_KEY = os.getenv("NVIDIA_API_KEY")

# Invoke-time safety net. Every stage's primary model can fail in ways that
# construction cannot detect — a 429 from a rate-limited tier, a 402 from an
# unfunded account, a provider outage — and the agents then fall back to empty
# results.
#
# This was `openai/gpt-oss-20b:free` until OpenRouter retired the `:free`
# variants. Every call to the retired slug returned 404 "This model is
# unavailable for free", so the safety net was dead for weeks without a single
# alarm: RunnableWithFallbacks re-raises the *first* exception when all options
# fail, so callers only ever saw the primary's error and never the fallback's
# 404. The paid slug is a fraction of a cent per call — cheap enough to be the
# thing that stands between a 429 and an empty report. `validate_fallback()`
# below now probes it so a future retirement is loud. Set to an empty string to
# disable the fallback entirely.
OPENROUTER_FALLBACK_MODEL = os.getenv(
    "OPENROUTER_FALLBACK_MODEL", "openai/gpt-oss-20b"
)

# Minimum output budget for Gemini, which spends part of it on reasoning.
GOOGLE_MIN_OUTPUT_TOKENS = int(os.getenv("GOOGLE_MIN_OUTPUT_TOKENS", "8192"))

# ---------------------------------------------------------------------------
# Per-stage model selection
# ---------------------------------------------------------------------------
# The `provider/model` prefix encodes which native SDK we route through:
#   groq/...      → langchain-groq
#   google/...    → langchain-google-genai
#   anthropic/... → langchain-anthropic
#   *             → OpenRouter (langchain-openai with custom base_url)

DEFAULT_MODEL = os.getenv("DEFAULT_MODEL", "anthropic/claude-sonnet-4-5")
# Retrieval-stage metadata, sentiment and classification, plus the research
# loop's reflection step — Groq for sub-second inference.
#
# This said groq/llama-3.3-70b-versatile until Groq retired its whole Llama 3.x
# line. A retired slug does not fail loudly: every call 404'd and silently fell
# back to OpenRouter, so the stage kept working on the wrong model while paying
# for a wasted request first. `validate_fallback()` probes the fallback at
# startup for exactly this reason; nothing probed the per-stage slugs, which is
# why this sat unnoticed. `tests/test_model_slugs_live.py` now covers them.
RETRIEVER_MODEL = os.getenv("RETRIEVER_MODEL", "groq/openai/gpt-oss-20b")
# Analysis ran on Claude until that account's balance ran out, then on Gemini
# Flash as a free-tier native path. Gemini's free tier is 20 requests per day
# *per model*, and once that is spent the google SDK retries with exponential
# backoff rather than failing fast: a verified production run spent 35 of its
# 133 seconds here before falling through to OpenRouter, and an earlier one
# spent minutes. The stage was never broken — just slow and wasteful.
#
# Haiku is paid, so it has no daily cap, and the report stage already carries
# all ~17 sources on it, which is the evidence that it has the context this
# stage needs too. It also keeps analysis off Groq, where three stages already
# share a 12k tokens/min budget and a 17-source prompt would 429 the way the
# report stage used to.
#
# Set ANALYZER_MODEL=anthropic/claude-sonnet-4-5 for better reasoning at higher
# cost — analysis is the stage where that would show up most, since it scores
# credibility and finds contradictions.
ANALYZER_MODEL = os.getenv("ANALYZER_MODEL", "anthropic/claude-haiku-4-5")

# Credibility runs one call per source (~17 per query), so it gets its own
# slot rather than riding on ANALYZER_MODEL: the task is a short 0-1 rating
# that a small fast model handles, and keeping it off the analyzer's provider
# stops one stage's per-minute quota from starving the other. Same Groq Llama
# retirement as the retriever above.
#
# The 20b is deliberate over the 120b here: the prompt asks for a bare number
# and `_llm_credibility` reads the first number it finds, so there is nothing
# for a larger model to be better at — and 17 calls per run is the stage most
# likely to brush Groq's per-minute token cap.
CREDIBILITY_MODEL = os.getenv("CREDIBILITY_MODEL", "groq/openai/gpt-oss-20b")
# Insight ran on openai/gpt-4o via OpenRouter until that account ran out of
# credit and the stage started returning 402s, then on Gemini Flash — which
# stacked it onto the same 20-requests-per-day-per-model Google quota as the
# analyzer. In practice insight was the stage that lost: it drew after the
# analyzer and degraded to "the model responded but no insights could be parsed"
# on every run once the daily quota was spent.
#
# Groq's gpt-oss-120b has its own quota and is the strongest reasoning model
# Groq serves. Note it spends part of the token budget on reasoning before any
# visible content, so create_insight_llm's max_tokens=1500 is load-bearing —
# a small budget returns HTTP 200 with empty content, which reads downstream as
# exactly the parse failure this change is meant to stop.
INSIGHT_MODEL = os.getenv("INSIGHT_MODEL", "groq/openai/gpt-oss-120b")
# The report prompt carries all ~17 sources, so it needs headroom: Groq's
# free tier caps at 12k tokens/minute and 429'd into the template writer.
#
# This ran on Gemini Flash until that stacked three stages (analyzer, insight,
# report) onto one Google project quota. Google's free tier is 20 requests per
# day *per model* (quotaId GenerateRequestsPerDayPerProjectPerModel-FreeTier),
# so three calls per run put the ceiling at ~6 runs/day — and the report stage,
# drawing last, was the one that hit RESOURCE_EXHAUSTED and shipped a template
# with empty TAM/SAM/SOM. Haiku is back (the Anthropic balance that ran out has
# been funded), it has the context for all 17 sources, and it puts this stage in
# a different failure domain from the analyzer.
REPORT_MODEL = os.getenv("REPORT_MODEL", "anthropic/claude-haiku-4-5")

TEMPERATURES = {
    "retriever": float(os.getenv("RETRIEVER_TEMPERATURE", "0.1")),
    "analyzer": float(os.getenv("ANALYZER_TEMPERATURE", "0.5")),
    "insight": float(os.getenv("INSIGHT_TEMPERATURE", "0.7")),
    "report": float(os.getenv("REPORT_TEMPERATURE", "0.2")),
}


# ---------------------------------------------------------------------------
# Provider routing
# ---------------------------------------------------------------------------


def _split_provider(model: str) -> tuple[str, str]:
    """Split `provider/model` into (provider, model_name).

    OpenRouter format is also `provider/model` (e.g. `openai/gpt-4o`), so
    when we don't recognise the provider as a native SDK we keep the
    fully-qualified name and route through OpenRouter unchanged.
    """
    if "/" in model:
        provider, _, model_name = model.partition("/")
        return provider.lower(), model_name
    return "openrouter", model


def _build_groq(model_name: str, temperature: float, max_tokens: Optional[int]):
    if not GROQ_API_KEY:
        logger.warning(
            "GROQ_API_KEY not set — falling back to OpenRouter for Groq model "
            f"{model_name}"
        )
        return None
    try:
        # Imported lazily so a missing langchain-groq install only breaks
        # consumers of Groq, not the whole config module.
        from langchain_groq import ChatGroq  # type: ignore
    except ImportError:
        logger.warning(
            "langchain-groq not installed. `pip install langchain-groq>=0.2.0`. "
            "Falling back to OpenRouter."
        )
        return None

    kwargs: dict[str, Any] = {
        "model": model_name,
        "temperature": temperature,
        "groq_api_key": GROQ_API_KEY,
    }
    if max_tokens:
        kwargs["max_tokens"] = max_tokens
    try:
        llm = ChatGroq(**kwargs)
        logger.info(f"LLM initialized via Groq: {model_name} (temp={temperature})")
        return llm
    except Exception as e:
        logger.error(f"Groq init failed: {e}. Falling back to OpenRouter.")
        return None


def _build_google(model_name: str, temperature: float, max_tokens: Optional[int]):
    if not GOOGLE_API_KEY:
        logger.warning(
            f"GOOGLE_API_KEY not set — falling back to OpenRouter for Google "
            f"model {model_name}"
        )
        return None
    try:
        from langchain_google_genai import ChatGoogleGenerativeAI  # type: ignore
    except ImportError:
        logger.warning(
            "langchain-google-genai not installed. "
            "`pip install langchain-google-genai>=2.0.0`. "
            "Falling back to OpenRouter."
        )
        return None

    kwargs: dict[str, Any] = {
        "model": model_name,
        "temperature": temperature,
        "google_api_key": GOOGLE_API_KEY,
    }
    if max_tokens:
        # Gemini counts its internal reasoning against max_output_tokens, so a
        # budget sized for the visible answer gets spent thinking and the reply
        # is truncated mid-structure. Measured: at 2000 the analyzer returned
        # only its SUMMARY section and the rest parsed to nothing; at 8192 all
        # four sections came back. Raise the floor rather than the callers'
        # budgets, which are correct for every other provider.
        kwargs["max_output_tokens"] = max(max_tokens, GOOGLE_MIN_OUTPUT_TOKENS)
    try:
        llm = ChatGoogleGenerativeAI(**kwargs)
        logger.info(f"LLM initialized via Google: {model_name} (temp={temperature})")
        return llm
    except Exception as e:
        logger.error(f"Google init failed: {e}. Falling back to OpenRouter.")
        return None


def _build_anthropic(model_name: str, temperature: float, max_tokens: Optional[int]):
    if not ANTHROPIC_API_KEY:
        logger.warning(
            "ANTHROPIC_API_KEY not set — falling back to OpenRouter for Anthropic "
            f"model {model_name}"
        )
        return None
    try:
        from langchain_anthropic import ChatAnthropic  # type: ignore
    except ImportError:
        logger.warning(
            "langchain-anthropic not installed. "
            "`pip install langchain-anthropic>=0.3.0`. Falling back to OpenRouter."
        )
        return None

    kwargs: dict[str, Any] = {
        "model": model_name,
        "temperature": temperature,
        "anthropic_api_key": ANTHROPIC_API_KEY,
    }
    # ChatAnthropic requires max_tokens, unlike the other providers.
    kwargs["max_tokens"] = max_tokens or 2000
    try:
        llm = ChatAnthropic(**kwargs)
        logger.info(f"LLM initialized via Anthropic: {model_name} (temp={temperature})")
        return llm
    except Exception as e:
        logger.error(f"Anthropic init failed: {e}. Falling back to OpenRouter.")
        return None


def _build_nvidia(model_name: str, temperature: float, max_tokens: Optional[int]):
    """NVIDIA NIM call via the OpenAI-compatible endpoint.

    NIM model ids themselves contain a slash (`meta/llama-3.3-70b-instruct`),
    so a fully-qualified name here is `nvidia/<vendor>/<model>`.
    `_split_provider` partitions on the first slash only, which leaves the
    vendor-qualified id intact.
    """
    if not NVIDIA_API_KEY or NVIDIA_API_KEY == "your_nvidia_key_here":
        logger.warning(
            "NVIDIA_API_KEY not set - falling back to OpenRouter for NVIDIA "
            f"model {model_name}"
        )
        return None

    api_key = NVIDIA_API_KEY.strip().strip('"').strip("'")
    if not api_key.startswith("nvapi-"):
        logger.warning(
            "NVIDIA_API_KEY format looks wrong (expected 'nvapi-' prefix). "
            "Continuing anyway in case the format changed."
        )

    kwargs: dict[str, Any] = {
        "model": model_name,
        "temperature": temperature,
        "openai_api_key": api_key,
        "openai_api_base": NVIDIA_BASE_URL,
    }
    if max_tokens:
        kwargs["max_tokens"] = max_tokens
    try:
        llm = ChatOpenAI(**kwargs)
        logger.info(f"LLM initialized via NVIDIA NIM: {model_name} (temp={temperature})")
        return llm
    except Exception as e:
        logger.error(f"NVIDIA init failed: {e}. Falling back to OpenRouter.")
        return None


def _build_openrouter(model: str, temperature: float, max_tokens: Optional[int]):
    """OpenRouter call. Expects fully-qualified model (`provider/name`)."""
    if not OPENROUTER_API_KEY or OPENROUTER_API_KEY == "your_openrouter_key_here":
        logger.warning("OPEN_ROUTER_KEY not set. LLM will not be available.")
        return None

    api_key = OPENROUTER_API_KEY.strip().strip('"').strip("'")
    if not api_key.startswith("sk-or-"):
        logger.warning(
            "OPEN_ROUTER_KEY format looks wrong (expected 'sk-or-' prefix). "
            "Continuing anyway in case the format changed."
        )

    try:
        kwargs: dict[str, Any] = {
            "model": model,
            "temperature": temperature,
            "openai_api_key": api_key,
            "openai_api_base": OPENROUTER_BASE_URL,
            "default_headers": {
                "HTTP-Referer": "https://deep-research.intelliforge.tech",
                "X-Title": "Chronicle",
            },
        }
        if max_tokens:
            kwargs["max_tokens"] = max_tokens
        llm = ChatOpenAI(**kwargs)
        logger.info(f"LLM initialized via OpenRouter: {model} (temp={temperature})")
        return llm
    except Exception as e:
        logger.error(f"OpenRouter init failed: {e}")
        return None


def _with_free_fallback(
    llm: Any,
    primary_model: str,
    temperature: float,
    max_tokens: Optional[int],
):
    """Attach a free OSS model as an invoke-time fallback.

    LangChain retries the fallback when the primary raises, which is the only
    layer that can catch a 429 or 402 — those surface on the call, not on
    client construction. Returns the primary unchanged when no fallback is
    configured or when the primary already *is* the fallback.
    """
    if llm is None or not OPENROUTER_FALLBACK_MODEL:
        return llm
    if not OPENROUTER_API_KEY or OPENROUTER_API_KEY == "your_openrouter_key_here":
        return llm
    if primary_model == OPENROUTER_FALLBACK_MODEL:
        return llm

    fallback = _build_openrouter(OPENROUTER_FALLBACK_MODEL, temperature, max_tokens)
    if fallback is None:
        return llm

    fallback = _with_error_logging(fallback, OPENROUTER_FALLBACK_MODEL)

    try:
        wrapped = llm.with_fallbacks([fallback])
        logger.info(
            f"Fallback attached: {primary_model} -> {OPENROUTER_FALLBACK_MODEL}"
        )
        return wrapped
    except Exception as e:  # older langchain-core without Runnable fallbacks
        logger.warning(f"Could not attach fallback for {primary_model}: {e}")
        return llm


def _with_tracing(llm: Any, model: str):
    """Attach the Langfuse callback handler, when tracing is configured.

    This is the layer that turns spans into *useful* spans: the handler is what
    records prompt/completion tokens and computed cost per call, which is the
    number that matters when every default provider sits on a free tier with a
    daily cap. No keys or no `langfuse` package means `get_callback_handler()`
    returns None and the model is returned untouched.

    Applied after fallbacks are attached so that a fallback invocation is
    traced too — otherwise the runs that cost the most are the ones missing
    from the dashboard.
    """
    if llm is None:
        return llm
    try:
        from utils.tracing import get_callback_handler

        handler = get_callback_handler()
        if handler is None:
            return llm
        return llm.with_config(
            {"callbacks": [handler], "metadata": {"chronicle_model": model}}
        )
    except Exception as e:
        # Observability is never allowed to cost us the model.
        logger.warning(f"Could not attach tracing to {model}: {e}")
        return llm


def _with_error_logging(fallback: Any, model: str):
    """Make the fallback's own failures visible.

    RunnableWithFallbacks collects every exception and then re-raises the
    *first* one — the primary's. A fallback that fails for its own reason (a
    retired model slug, an unfunded account) therefore leaves no trace at all:
    callers log the primary's 429 and the real second failure is swallowed.
    That is precisely how a 404ing fallback went unnoticed. An error listener
    fires before the exception is discarded, so both halves reach the log.

    Best-effort: a langchain-core without `with_listeners` returns the fallback
    unchanged rather than losing the fallback altogether.
    """
    # *args/**kwargs rather than a fixed signature: langchain-core has called
    # listeners with (run) and with (run, config) across versions, and a
    # signature mismatch here would raise from inside the fallback path — the
    # one place that must not acquire a new way to fail.
    def _on_error(*args: Any, **kwargs: Any) -> None:
        run = args[0] if args else kwargs.get("run")
        err = getattr(run, "error", run)
        logger.error(
            f"Fallback model {model} ALSO failed: {err}. "
            f"The exception surfaced to the caller is the primary's, not this "
            f"one — the stage has no working model."
        )

    try:
        return fallback.with_listeners(on_error=_on_error)
    except Exception as e:
        logger.warning(f"Could not attach error listener to fallback {model}: {e}")
        return fallback


def validate_fallback(timeout: float = 20.0) -> tuple[bool, str]:
    """Probe the configured fallback model with one tiny call.

    The safety net is only worth having if it can actually be invoked, and a
    model slug can be retired by the provider at any time without anything in
    this process noticing. Called at startup so that failure is loud on boot
    rather than silent until the day a primary rate-limits.

    Returns (ok, detail). Never raises.
    """
    if not OPENROUTER_FALLBACK_MODEL:
        return True, "fallback disabled (OPENROUTER_FALLBACK_MODEL empty)"
    if not OPENROUTER_API_KEY or OPENROUTER_API_KEY == "your_openrouter_key_here":
        return False, "OPEN_ROUTER_KEY not set — no fallback is attached to any stage"

    probe = _build_openrouter(OPENROUTER_FALLBACK_MODEL, 0.0, 1)
    if probe is None:
        return False, f"could not construct fallback client for {OPENROUTER_FALLBACK_MODEL}"

    try:
        probe.invoke("ok", timeout=timeout)
        return True, f"{OPENROUTER_FALLBACK_MODEL} reachable"
    except Exception as e:
        return False, f"{OPENROUTER_FALLBACK_MODEL} unusable: {type(e).__name__}: {e}"


def create_llm(
    model: Optional[str] = None,
    temperature: float = 0.3,
    base_url: Optional[str] = None,  # legacy, ignored for native providers
    max_tokens: Optional[int] = None,
):
    """Create an LLM client, routing to the correct provider based on the
    `provider/model` prefix.

    If the native provider (Groq, Google) is unavailable for any reason, we
    transparently fall back to OpenRouter with the same fully-qualified
    model name — this way one missing key never takes the workflow down.
    """
    model_name_full = model or DEFAULT_MODEL
    provider, native_name = _split_provider(model_name_full)

    builders = {
        "groq": _build_groq,
        "google": _build_google,
        "anthropic": _build_anthropic,
        "nvidia": _build_nvidia,
    }
    builder = builders.get(provider)
    if builder is not None:
        llm = builder(native_name, temperature, max_tokens)
        if llm is not None:
            llm = _with_free_fallback(llm, model_name_full, temperature, max_tokens)
            return _with_tracing(llm, model_name_full)
        # Fall through to OpenRouter with the fully-qualified name

    llm = _build_openrouter(model_name_full, temperature, max_tokens)
    llm = _with_free_fallback(llm, model_name_full, temperature, max_tokens)
    return _with_tracing(llm, model_name_full)


# ---------------------------------------------------------------------------
# Per-stage helpers (preserved for backward compatibility)
# ---------------------------------------------------------------------------


def create_retriever_llm():
    """Fast LLM for retrieval-phase work (metadata, sentiment, classification).
    Defaults to Groq Llama 3.3 70B for sub-second inference; falls back to
    OpenRouter if GROQ_API_KEY is missing.
    """
    return create_llm(
        model=RETRIEVER_MODEL,
        temperature=TEMPERATURES["retriever"],
        max_tokens=800,
    )


def create_analyzer_llm():
    """Strong-reasoning LLM for cross-source analysis (Claude 3.5 Sonnet)."""
    return create_llm(
        model=ANALYZER_MODEL,
        temperature=TEMPERATURES["analyzer"],
        max_tokens=2000,
    )


def create_insight_llm():
    """Creative LLM for hypothesis generation (GPT-4o)."""
    return create_llm(
        model=INSIGHT_MODEL,
        temperature=TEMPERATURES["insight"],
        max_tokens=1500,
    )


def create_credibility_llm():
    """Short per-source rating calls — many of them, so speed matters more
    than depth. Falls back to the analyzer model when unset."""
    return create_llm(
        model=CREDIBILITY_MODEL or ANALYZER_MODEL,
        temperature=0.3,
        max_tokens=1500,
    )


def create_report_llm():
    """Fast formatting LLM for report compilation (Claude Haiku)."""
    return create_llm(
        model=REPORT_MODEL,
        temperature=TEMPERATURES["report"],
        max_tokens=4000,
    )


def is_llm_available() -> bool:
    """True if at least one provider is configured."""
    return bool(
        OPENROUTER_API_KEY or GROQ_API_KEY or GOOGLE_API_KEY or NVIDIA_API_KEY
    )


def message_text(response: Any) -> str:
    """Normalize a LangChain chat response into plain text.

    Providers do not agree on the shape of `.content`. OpenAI-compatible and
    Anthropic clients return a string; Gemini returns a list of content parts
    (dicts carrying `text`, plus reasoning blocks that have no text at all).
    Reading `.content` directly therefore yields a list for Google models,
    which then flows downstream as a non-string report or analysis.
    """
    content = getattr(response, "content", None)
    if content is None:
        return str(response)
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for part in content:
            if isinstance(part, str):
                parts.append(part)
            elif isinstance(part, dict):
                text = part.get("text")
                if isinstance(text, str) and text:
                    parts.append(text)
        return "".join(parts)
    return str(content)
