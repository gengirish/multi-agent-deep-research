"""
Langfuse tracing, behind a shim that degrades to nothing.

A five-agent graph running on free tiers with per-model daily caps is very
hard to debug from logs alone: you can see that a run was slow or degraded,
but not which stage burned the quota, what the analyzer actually received, or
what a retry cost. Langfuse gives per-run traces with token counts and cost.

Everything here is optional and defensive:

* No `LANGFUSE_PUBLIC_KEY`/`LANGFUSE_SECRET_KEY` -> disabled, all calls no-op.
* `langfuse` not installed -> disabled, all calls no-op.
* Langfuse installed but broken (bad host, network down, SDK change) -> the
  failure is logged once and tracing disables itself for the process.

Nothing in this module may raise into a research run. A tracing backend is not
allowed to take down the product it is observing.

Supports three SDK shapes, because which one is installed depends on when the
image was built and Langfuse has renamed this API twice:

    v2  client.trace(...)                      -> trace.span(...)
    v3  client.start_as_current_span(...)
    v4  client.start_as_current_observation(name=..., as_type=...)

Detection is by capability, not by parsing `__version__`, which some builds do
not carry.
"""

from __future__ import annotations

import logging
import os
import threading
from contextlib import contextmanager
from typing import Any, Dict, Iterator, Optional

logger = logging.getLogger(__name__)

_lock = threading.Lock()
_initialized = False
_client: Any = None
_sdk_major: int = 0
_handler_cls: Any = None
# Set once a call into the SDK has failed. Stops us from logging the same
# breakage on every span of every subsequent run.
_disabled_after_error = False

# v2 has no implicit context, so the active trace is threaded through here.
_current_trace = threading.local()


def _env_configured() -> bool:
    return bool(
        os.getenv("LANGFUSE_PUBLIC_KEY", "").strip()
        and os.getenv("LANGFUSE_SECRET_KEY", "").strip()
    )


def _initialize() -> None:
    """Import and construct the Langfuse client once, tolerating any failure."""
    global _initialized, _client, _sdk_major, _handler_cls

    if _initialized:
        return
    with _lock:
        if _initialized:
            return
        _initialized = True

        if not _env_configured():
            logger.info(
                "Langfuse tracing disabled (LANGFUSE_PUBLIC_KEY / "
                "LANGFUSE_SECRET_KEY not set)"
            )
            return

        try:
            import langfuse  # noqa: F401
        except ImportError:
            logger.warning(
                "LANGFUSE_* keys are set but the `langfuse` package is not "
                "installed — tracing is off. Install it with `pip install langfuse`."
            )
            return

        # v3 and v4 expose get_client(); v2 does not. Which of v3/v4 it is
        # then follows from which span method the client actually has — v4
        # renamed start_as_current_span to start_as_current_observation, and
        # calling the wrong one silently costs every trace.
        try:
            from langfuse import get_client  # type: ignore[attr-defined]

            _client = get_client()
            if hasattr(_client, "start_as_current_span"):
                _sdk_major = 3
            elif hasattr(_client, "start_as_current_observation"):
                _sdk_major = 4
            else:
                raise AttributeError("no recognised span method on the Langfuse client")
        except Exception:
            try:
                from langfuse import Langfuse  # type: ignore[attr-defined]

                _client = Langfuse()
                _sdk_major = 2
            except Exception as e:
                logger.warning(f"Langfuse client construction failed: {e}")
                _client = None
                return

        # The LangChain callback handler moved between majors. It is what
        # captures per-LLM-call tokens and cost, so losing it costs most of
        # the value — but it must not cost us the trace as well.
        for module_path, attr in (
            ("langfuse.langchain", "CallbackHandler"),
            ("langfuse.callback", "CallbackHandler"),
        ):
            try:
                module = __import__(module_path, fromlist=[attr])
                _handler_cls = getattr(module, attr)
                break
            except Exception:
                continue
        if _handler_cls is None:
            logger.warning(
                "Langfuse is enabled but no CallbackHandler could be imported; "
                "spans will be recorded without per-call token/cost data."
            )

        logger.info(f"Langfuse tracing enabled (SDK v{_sdk_major})")


def _fail(context: str, error: Exception) -> None:
    """Record the first SDK failure and disable tracing for the process."""
    global _disabled_after_error
    if not _disabled_after_error:
        _disabled_after_error = True
        logger.warning(
            f"Langfuse failed during {context} ({type(error).__name__}: {error}). "
            f"Tracing is now disabled for this process; the run continues."
        )


def is_enabled() -> bool:
    """True when traces will actually be recorded."""
    _initialize()
    return _client is not None and not _disabled_after_error


def get_callback_handler() -> Optional[Any]:
    """A LangChain callback handler, or None when tracing is off.

    Attached to every LLM in `llm_config.create_llm`, which is what makes token
    counts and cost show up on the spans rather than just timings.
    """
    if not is_enabled() or _handler_cls is None:
        return None
    try:
        return _handler_cls()
    except Exception as e:
        _fail("callback handler construction", e)
        return None


class _NullSpan:
    """Stand-in returned when tracing is off, so callers need no branching."""

    def update(self, **kwargs: Any) -> None:
        pass

    def score(self, **kwargs: Any) -> None:
        pass


class _V2Span:
    """Adapts a v2 span object to the v3-shaped `.update(output=...)` call."""

    def __init__(self, span: Any) -> None:
        self._span = span

    def update(self, **kwargs: Any) -> None:
        try:
            self._span.update(**kwargs)
        except Exception as e:
            _fail("span update", e)

    def score(self, **kwargs: Any) -> None:
        try:
            self._span.score(**kwargs)
        except Exception as e:
            _fail("span score", e)


def _open_observation(
    name: str,
    input_payload: Optional[Dict[str, Any]],
    metadata: Optional[Dict[str, Any]],
    as_type: str,
):
    """Return the SDK's span context manager for v3 or v4.

    Both yield an object with `.update(output=...)`, which is the whole
    surface the rest of this module and its callers use.
    """
    if _sdk_major >= 4:
        return _client.start_as_current_observation(
            name=name,
            as_type=as_type,
            input=input_payload,
            metadata=metadata or {},
        )
    return _client.start_as_current_span(
        name=name, input=input_payload, metadata=metadata or {}
    )


@contextmanager
def research_trace(
    name: str,
    query: str,
    metadata: Optional[Dict[str, Any]] = None,
) -> Iterator[Any]:
    """Wrap one whole research run as a trace.

    Yields a span-like handle; call `.update(output=...)` on it to attach the
    result. Always yields something, so callers never guard the `with`.
    """
    if not is_enabled():
        yield _NullSpan()
        return

    if _sdk_major >= 3:
        try:
            with _open_observation(name, {"query": query}, metadata, "span") as span:
                if _sdk_major == 3:
                    try:
                        _client.update_current_trace(
                            name=name, input={"query": query}, metadata=metadata or {}
                        )
                    except Exception:
                        # Trace-level metadata is a nicety; the span is the point.
                        pass
                # v4 has no update_current_trace, and its trace-level
                # input/output setter is deprecated — the root observation's
                # own name and input carry the same information there.
                yield span
            return
        except Exception as e:
            _fail(f"trace start (v{_sdk_major})", e)
            yield _NullSpan()
            return

    try:
        trace = _client.trace(name=name, input={"query": query}, metadata=metadata or {})
        _current_trace.value = trace
    except Exception as e:
        _fail("trace start (v2)", e)
        yield _NullSpan()
        return

    try:
        yield _V2Span(trace)
    finally:
        _current_trace.value = None


@contextmanager
def span(
    name: str,
    metadata: Optional[Dict[str, Any]] = None,
    as_type: str = "span",
) -> Iterator[Any]:
    """Wrap one pipeline stage. No-ops when tracing is off or no trace is open.

    `as_type` is a v4 nicety — "retriever", "chain", "agent" and friends render
    differently in the Langfuse UI. It is ignored on older SDKs.
    """
    if not is_enabled():
        yield _NullSpan()
        return

    if _sdk_major >= 3:
        try:
            with _open_observation(name, None, metadata, as_type) as sp:
                yield sp
            return
        except Exception as e:
            _fail(f"span {name} (v{_sdk_major})", e)
            yield _NullSpan()
            return

    trace = getattr(_current_trace, "value", None)
    if trace is None:
        yield _NullSpan()
        return

    child = None
    try:
        child = trace.span(name=name, metadata=metadata or {})
        yield _V2Span(child)
    except Exception as e:
        _fail(f"span {name} (v2)", e)
        yield _NullSpan()
    finally:
        if child is not None:
            try:
                child.end()
            except Exception:
                pass


def flush() -> None:
    """Push buffered events. Langfuse batches, and Fly can stop a container
    before the background flush fires, so the API layer calls this at the end
    of a run."""
    if not is_enabled():
        return
    try:
        _client.flush()
    except Exception as e:
        _fail("flush", e)


def reset_for_tests() -> None:
    """Drop cached client state so tests can re-initialize under new env."""
    global _initialized, _client, _sdk_major, _handler_cls, _disabled_after_error
    with _lock:
        _initialized = False
        _client = None
        _sdk_major = 0
        _handler_cls = None
        _disabled_after_error = False
    _current_trace.value = None
