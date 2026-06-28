"""
LLM configuration — multi-provider routing.

Default routing:
    Enrichment   → Groq Llama 3.3 70B (sub-second metadata extraction)
    Analyzer     → Claude 3.5 Sonnet via OpenRouter (strong reasoning)
    Insight      → GPT-4o via OpenRouter (creative pattern matching)
    Reporter     → Claude 3.5 Haiku via OpenRouter (fast formatting)
    Credibility  → Claude 3.5 Sonnet via OpenRouter (reasoning over sources)

Each agent stage gets its own helper so swapping a provider is a one-line
change. Overridable via env vars (e.g. RETRIEVER_MODEL=openai/gpt-4o-mini
to revert to the OpenRouter path).

Providers:
    - OpenRouter (default)  → langchain-openai pointed at openrouter.ai
    - Groq                  → langchain-groq (sub-second Llama inference)
    - Google                → langchain-google-genai (Gemini, fallback)
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

# ---------------------------------------------------------------------------
# Per-stage model selection
# ---------------------------------------------------------------------------
# The `provider/model` prefix encodes which native SDK we route through:
#   groq/...      → langchain-groq
#   google/...    → langchain-google-genai
#   *             → OpenRouter (langchain-openai with custom base_url)

DEFAULT_MODEL = os.getenv("DEFAULT_MODEL", "anthropic/claude-3-5-sonnet")
# Retrieval-stage metadata + sentiment — Groq Llama 3.3 70B for sub-second.
RETRIEVER_MODEL = os.getenv("RETRIEVER_MODEL", "groq/llama-3.3-70b-versatile")
ANALYZER_MODEL = os.getenv("ANALYZER_MODEL", "anthropic/claude-3-5-sonnet")
INSIGHT_MODEL = os.getenv("INSIGHT_MODEL", "openai/gpt-4o")
# Report compilation is formatting-heavy / low cognitive load — switch to
# Groq Llama 3.3 70B for ~10x cost reduction vs Claude 3.5 Haiku and
# faster perceived completion. Override via REPORT_MODEL env to revert.
REPORT_MODEL = os.getenv("REPORT_MODEL", "groq/llama-3.3-70b-versatile")

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
        kwargs["max_output_tokens"] = max_tokens
    try:
        llm = ChatGoogleGenerativeAI(**kwargs)
        logger.info(f"LLM initialized via Google: {model_name} (temp={temperature})")
        return llm
    except Exception as e:
        logger.error(f"Google init failed: {e}. Falling back to OpenRouter.")
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

    if provider == "groq":
        llm = _build_groq(native_name, temperature, max_tokens)
        if llm is not None:
            return llm
        # Fall through to OpenRouter

    if provider == "google":
        llm = _build_google(native_name, temperature, max_tokens)
        if llm is not None:
            return llm
        # Fall through to OpenRouter

    # OpenRouter expects the fully-qualified model name
    return _build_openrouter(model_name_full, temperature, max_tokens)


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


def create_report_llm():
    """Fast formatting LLM for report compilation (Claude Haiku)."""
    return create_llm(
        model=REPORT_MODEL,
        temperature=TEMPERATURES["report"],
        max_tokens=4000,
    )


def is_llm_available() -> bool:
    """True if at least one provider is configured."""
    return bool(OPENROUTER_API_KEY) or bool(GROQ_API_KEY) or bool(GOOGLE_API_KEY)
