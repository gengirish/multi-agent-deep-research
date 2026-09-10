"""
Tests for the Langfuse tracing shim.

The contract under test is entirely negative: with no keys, no package, or a
broken SDK, tracing must be invisible and must never raise into a run. A
tracing backend that can take down the pipeline it observes is worse than no
tracing.

Run:  pytest tests/test_tracing.py
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from utils import tracing


@pytest.fixture(autouse=True)
def _reset(monkeypatch):
    monkeypatch.delenv("LANGFUSE_PUBLIC_KEY", raising=False)
    monkeypatch.delenv("LANGFUSE_SECRET_KEY", raising=False)
    tracing.reset_for_tests()
    yield
    tracing.reset_for_tests()


def test_disabled_without_keys():
    assert tracing.is_enabled() is False
    assert tracing.get_callback_handler() is None


def test_spans_are_usable_when_disabled():
    """Callers must never have to branch on whether tracing is configured."""
    with tracing.research_trace("run", "a query") as run_span:
        run_span.update(output={"anything": 1})
        with tracing.span("stage", {"k": "v"}) as stage_span:
            stage_span.update(output="done")
    tracing.flush()  # must not raise


def test_keys_without_the_package_disables_rather_than_raising(monkeypatch):
    monkeypatch.setenv("LANGFUSE_PUBLIC_KEY", "pk-test")
    monkeypatch.setenv("LANGFUSE_SECRET_KEY", "sk-test")
    real_import = __builtins__["__import__"] if isinstance(__builtins__, dict) else __builtins__.__import__

    def blocked_import(name, *args, **kwargs):
        if name == "langfuse" or name.startswith("langfuse."):
            raise ImportError("no langfuse here")
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr("builtins.__import__", blocked_import)
    tracing.reset_for_tests()

    assert tracing.is_enabled() is False
    with tracing.research_trace("run", "q") as span:
        span.update(output={})


def test_a_client_that_raises_disables_tracing_and_the_run_continues(monkeypatch):
    class ExplodingClient:
        def start_as_current_span(self, **kwargs):
            raise RuntimeError("langfuse host unreachable")

        def flush(self):
            raise RuntimeError("still unreachable")

    monkeypatch.setattr(tracing, "_initialized", True)
    monkeypatch.setattr(tracing, "_client", ExplodingClient())
    monkeypatch.setattr(tracing, "_sdk_major", 3)
    monkeypatch.setattr(tracing, "_disabled_after_error", False)

    with tracing.span("stage") as span:
        span.update(output="x")  # the null span absorbs this

    # First failure disables tracing for the rest of the process, so the same
    # broken backend is not re-tried on every span of every later run.
    assert tracing.is_enabled() is False
    tracing.flush()


def test_v3_spans_are_recorded_when_the_sdk_works(monkeypatch):
    events = []

    class FakeSpan:
        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

        def update(self, **kwargs):
            events.append(("update", kwargs))

    class FakeClient:
        def start_as_current_span(self, **kwargs):
            events.append(("span", kwargs.get("name")))
            return FakeSpan()

        def update_current_trace(self, **kwargs):
            events.append(("trace", kwargs.get("name")))

        def flush(self):
            events.append(("flush", None))

    monkeypatch.setattr(tracing, "_initialized", True)
    monkeypatch.setattr(tracing, "_client", FakeClient())
    monkeypatch.setattr(tracing, "_sdk_major", 3)
    monkeypatch.setattr(tracing, "_disabled_after_error", False)

    with tracing.research_trace("chronicle.research", "q") as run_span:
        with tracing.span("retrieval"):
            pass
        run_span.update(output={"ok": True})
    tracing.flush()

    assert ("span", "chronicle.research") in events
    assert ("span", "retrieval") in events
    assert ("trace", "chronicle.research") in events
    assert ("flush", None) in events


def test_v4_uses_the_renamed_observation_api(monkeypatch):
    """v4 renamed start_as_current_span to start_as_current_observation.

    Calling the v3 name against a v4 client raises AttributeError, the shim
    disables itself, and every trace is silently lost — which is exactly what
    happened before this branch existed.
    """
    events = []

    class FakeSpan:
        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

        def update(self, **kwargs):
            events.append(("update", kwargs.get("output")))

    class FakeV4Client:
        # Deliberately absent: start_as_current_span.
        def start_as_current_observation(self, **kwargs):
            events.append(("observation", kwargs.get("name"), kwargs.get("as_type")))
            return FakeSpan()

        def flush(self):
            pass

    monkeypatch.setattr(tracing, "_initialized", True)
    monkeypatch.setattr(tracing, "_client", FakeV4Client())
    monkeypatch.setattr(tracing, "_sdk_major", 4)
    monkeypatch.setattr(tracing, "_disabled_after_error", False)

    with tracing.research_trace("chronicle.research", "q") as run_span:
        with tracing.span("retrieval", as_type="retriever"):
            pass
        run_span.update(output={"ok": True})

    assert ("observation", "chronicle.research", "span") in events
    assert ("observation", "retrieval", "retriever") in events
    assert tracing.is_enabled() is True, "the v4 path must not trip the failure latch"


def test_the_sdk_major_is_detected_from_capability(monkeypatch):
    """Version detection must not depend on __version__, which some builds
    do not carry."""

    class V3Client:
        def start_as_current_span(self, **kwargs):
            pass

    class V4Client:
        def start_as_current_observation(self, **kwargs):
            pass

    for client, expected in ((V3Client(), 3), (V4Client(), 4)):
        monkeypatch.setenv("LANGFUSE_PUBLIC_KEY", "pk")
        monkeypatch.setenv("LANGFUSE_SECRET_KEY", "sk")
        tracing.reset_for_tests()
        monkeypatch.setattr("langfuse.get_client", lambda c=client: c, raising=False)
        tracing._initialize()
        assert tracing._sdk_major == expected


def test_v2_spans_nest_under_the_open_trace(monkeypatch):
    events = []

    class FakeChild:
        def __init__(self, name):
            self.name = name

        def update(self, **kwargs):
            events.append(("child-update", self.name))

        def end(self):
            events.append(("child-end", self.name))

    class FakeTrace:
        def span(self, name=None, metadata=None):
            events.append(("child", name))
            return FakeChild(name)

        def update(self, **kwargs):
            events.append(("trace-update", None))

    class FakeClient:
        def trace(self, **kwargs):
            events.append(("trace", kwargs.get("name")))
            return FakeTrace()

        def flush(self):
            pass

    monkeypatch.setattr(tracing, "_initialized", True)
    monkeypatch.setattr(tracing, "_client", FakeClient())
    monkeypatch.setattr(tracing, "_sdk_major", 2)
    monkeypatch.setattr(tracing, "_disabled_after_error", False)

    with tracing.research_trace("chronicle.research", "q") as run_span:
        with tracing.span("retrieval"):
            pass
        run_span.update(output={"ok": True})

    assert ("trace", "chronicle.research") in events
    assert ("child", "retrieval") in events
    assert ("child-end", "retrieval") in events, "v2 spans must be explicitly ended"
    assert ("trace-update", None) in events


def test_a_v2_span_outside_any_trace_is_a_no_op(monkeypatch):
    class FakeClient:
        def trace(self, **kwargs):
            pytest.fail("no trace should be started")

    monkeypatch.setattr(tracing, "_initialized", True)
    monkeypatch.setattr(tracing, "_client", FakeClient())
    monkeypatch.setattr(tracing, "_sdk_major", 2)
    monkeypatch.setattr(tracing, "_disabled_after_error", False)

    with tracing.span("orphan") as span:
        span.update(output="x")
