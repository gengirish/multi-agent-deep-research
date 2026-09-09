"""
Unit tests for the hosted newsletter-broadcast proxy.

`_call_newsletter_broadcast` is the only thing standing between a scheduled
briefing and the whole subscriber list, so the two things worth pinning down
are that it targets the newsletter route with the service token attached, and
that it fails closed — never sending, never asking the caller for a token —
when the server has no token configured.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

os.environ.setdefault("CHRONICLE_MCP_ACCESS_KEY", "test-key")
os.environ.setdefault("CHRONICLE_OAUTH_SECRET", "test-signing-secret")

from backend import mcp_server  # noqa: E402


class _FakeResponse:
    def __init__(self, status_code: int, payload: dict):
        self.status_code = status_code
        self._payload = payload
        self.text = str(payload)

    @property
    def is_success(self) -> bool:
        return 200 <= self.status_code < 300

    def json(self) -> dict:
        return dict(self._payload)


class _FakeClient:
    """Stands in for httpx.AsyncClient and records the single POST it sees."""

    def __init__(self, calls: list, response: _FakeResponse, **_kwargs):
        self._calls = calls
        self._response = response

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_exc):
        return False

    async def post(self, url, json=None, headers=None):
        self._calls.append({"url": url, "json": json, "headers": headers})
        return self._response


@pytest.fixture
def captured(monkeypatch):
    calls: list = []
    response = _FakeResponse(200, {"ok": True, "dryRun": True, "recipientCount": 7})
    monkeypatch.setattr(
        mcp_server.httpx,
        "AsyncClient",
        lambda **kwargs: _FakeClient(calls, response, **kwargs),
    )
    return calls


@pytest.mark.asyncio
async def test_posts_to_newsletter_route_with_bearer_and_payload(
    monkeypatch, captured
):
    monkeypatch.setenv("CHRONICLE_SERVICE_TOKEN", "s3cret")

    result = await mcp_server._call_newsletter_broadcast(
        subject="Morning Briefing",
        html="<h1>hi</h1>",
        text="hi",
        segment="founders",
        dedupe_key="daily-briefing:2026-09-09",
        dry_run=True,
    )

    assert len(captured) == 1
    call = captured[0]
    assert call["url"] == f"{mcp_server.CHRONICLE_APP_URL}/api/newsletter/broadcast"
    assert call["headers"]["Authorization"] == "Bearer s3cret"
    assert call["json"] == {
        "subject": "Morning Briefing",
        "html": "<h1>hi</h1>",
        "dedupeKey": "daily-briefing:2026-09-09",
        "dryRun": True,
        "text": "hi",
        "segment": "founders",
    }
    assert result["ok"] is True
    assert result["http_status"] == 200
    assert result["recipientCount"] == 7


@pytest.mark.asyncio
async def test_optional_fields_are_omitted_when_empty(monkeypatch, captured):
    monkeypatch.setenv("CHRONICLE_SERVICE_TOKEN", "s3cret")

    await mcp_server._call_newsletter_broadcast(
        subject="S", html="<p>b</p>", text="", segment="",
        dedupe_key="key-abc", dry_run=False,
    )

    payload = captured[0]["json"]
    assert "text" not in payload and "segment" not in payload
    assert payload["dryRun"] is False


@pytest.mark.asyncio
async def test_missing_token_returns_not_configured_without_calling(
    monkeypatch, captured
):
    monkeypatch.delenv("CHRONICLE_SERVICE_TOKEN", raising=False)

    result = await mcp_server._call_newsletter_broadcast(
        subject="S", html="<p>b</p>", text="", segment="",
        dedupe_key="key-abc", dry_run=True,
    )

    assert result == {
        "ok": False,
        "error": "not_configured",
        "message": (
            "Broadcasting is not configured on this server. Set "
            "CHRONICLE_SERVICE_TOKEN on the backend and the frontend to "
            "the same value."
        ),
    }
    assert captured == []


@pytest.mark.asyncio
async def test_route_errors_pass_through_verbatim(monkeypatch):
    """409 already_broadcast is an answer to relay, not a failure to mask."""
    monkeypatch.setenv("CHRONICLE_SERVICE_TOKEN", "s3cret")
    calls: list = []
    response = _FakeResponse(409, {"error": "already_broadcast"})
    monkeypatch.setattr(
        mcp_server.httpx,
        "AsyncClient",
        lambda **kwargs: _FakeClient(calls, response, **kwargs),
    )

    result = await mcp_server._call_newsletter_broadcast(
        subject="S", html="<p>b</p>", text="", segment="",
        dedupe_key="key-abc", dry_run=False,
    )

    assert result["error"] == "already_broadcast"
    assert result["ok"] is False
    assert result["http_status"] == 409
