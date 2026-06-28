"""
Token counting + content truncation utilities.

The build-plan "context overflow" failure path is prevented by counting
tokens *before* sending text to an LLM and truncating fetched content
(and conversation history) so we never blow the model's context window.

We use tiktoken with the cl100k_base encoding as a reasonable default —
it's exact for OpenAI's tokenizer family and a close enough proxy for
Anthropic and Llama models for budgeting purposes.
"""

from __future__ import annotations

import logging
from typing import Iterable, List, Optional

logger = logging.getLogger(__name__)

# Conservative per-stage token budgets — leave headroom for the model's
# response and any system prompt overhead the agent appends downstream.
DEFAULT_INPUT_BUDGETS = {
    "retriever": 6_000,   # Groq Llama 3.3 70B has 128k, but we never need that
    "enrichment": 4_000,  # short per-source extraction
    "analyzer": 12_000,   # cross-source reasoning over multiple snippets
    "insight": 10_000,
    "report": 14_000,     # builds the final report from analysis + insights
}

_encoder = None
_encoder_failed = False


def _get_encoder():
    """Lazy-load tiktoken's cl100k_base encoder. Returns None if tiktoken
    is unavailable so callers can fall back to char-based heuristics.
    """
    global _encoder, _encoder_failed
    if _encoder is not None:
        return _encoder
    if _encoder_failed:
        return None
    try:
        import tiktoken  # type: ignore

        _encoder = tiktoken.get_encoding("cl100k_base")
        return _encoder
    except Exception as e:
        logger.warning(
            f"tiktoken not available ({e}); falling back to char/4 heuristic"
        )
        _encoder_failed = True
        return None


def count_tokens(text: str) -> int:
    """Return the token count for `text`. Uses tiktoken when available,
    otherwise approximates as len(text) // 4.
    """
    if not text:
        return 0
    enc = _get_encoder()
    if enc is None:
        return max(1, len(text) // 4)
    try:
        return len(enc.encode(text))
    except Exception as e:
        logger.warning(f"tiktoken encode failed ({e}); using char/4 heuristic")
        return max(1, len(text) // 4)


def truncate_to_tokens(text: str, max_tokens: int, *, marker: str = "\n…[truncated]") -> str:
    """Truncate `text` so it encodes to at most `max_tokens` tokens.

    The marker is appended only if truncation actually happened. We don't
    try to be smart about sentence boundaries — the use case is feeding
    LLMs that don't care, and being smart adds latency.
    """
    if max_tokens <= 0 or not text:
        return ""

    enc = _get_encoder()
    if enc is None:
        # Char-based approximation: 4 chars ~= 1 token
        char_budget = max_tokens * 4
        if len(text) <= char_budget:
            return text
        return text[:char_budget] + marker

    try:
        tokens = enc.encode(text)
        if len(tokens) <= max_tokens:
            return text
        # Reserve a few tokens for the marker
        marker_tokens = len(enc.encode(marker))
        keep = max(0, max_tokens - marker_tokens)
        return enc.decode(tokens[:keep]) + marker
    except Exception as e:
        logger.warning(f"tiktoken truncate failed ({e}); using char-based fallback")
        char_budget = max_tokens * 4
        return text[:char_budget] + marker if len(text) > char_budget else text


def truncate_iter_to_budget(
    items: Iterable[str], total_budget: int, *, per_item_max: Optional[int] = None
) -> List[str]:
    """Truncate an iterable of strings to fit a total token budget.

    Per-item caps are applied first (so one giant doc can't crowd everyone
    else out), then we accumulate items until we exceed `total_budget`.
    The last item is itself truncated to fit, if needed.
    """
    capped: List[str] = []
    used = 0
    for item in items:
        piece = (
            truncate_to_tokens(item, per_item_max) if per_item_max else item
        )
        n = count_tokens(piece)
        if used + n <= total_budget:
            capped.append(piece)
            used += n
        else:
            remaining = total_budget - used
            if remaining > 50:  # only bother if there's meaningful room left
                capped.append(truncate_to_tokens(piece, remaining))
                used = total_budget
            break
    return capped


def budget_for(stage: str) -> int:
    """Lookup the configured token budget for a stage name."""
    return DEFAULT_INPUT_BUDGETS.get(stage, 4_000)
