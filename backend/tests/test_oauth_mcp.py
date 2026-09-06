"""
Tests for the OAuth 2.1 authorization server guarding the remote MCP endpoint.

These exercise the wire protocol claude.ai actually performs when attaching a
custom connector — discovery, dynamic client registration, an authorization
code with PKCE, the token exchange, and finally a real MCP `initialize` /
`tools/list` over the mounted transport. If a connector ever fails to attach,
the break will almost certainly show up here first.

The MCP server mounted here is a stub with one tool rather than the real
Chronicle one: this file is about the auth and transport plumbing, and using a
stub keeps it runnable without Postgres, Redis, or LLM keys. Tool surface is
covered separately by test_mcp_parity.py.

Run:  pytest backend/tests/test_oauth_mcp.py
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
import secrets
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

ACCESS_KEY = "test-key-abc123"
PUBLIC_URL = "https://api.example.test"
REDIRECT_URI = "https://claude.ai/api/mcp/auth_callback"

os.environ["CHRONICLE_MCP_ACCESS_KEY"] = ACCESS_KEY
os.environ["CHRONICLE_OAUTH_SECRET"] = "sup3r-secret-signing-key-for-tests"
os.environ["CHRONICLE_PUBLIC_URL"] = PUBLIC_URL

from backend.auth import oauth as oauth_mod  # noqa: E402


@pytest.fixture(scope="module")
def client():
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from fastmcp import FastMCP

    mcp = FastMCP(name="chronicle", instructions="test", version="1.0.0")

    @mcp.tool(tags={"research"}, annotations={"readOnlyHint": True})
    async def list_starter_queries() -> str:
        """Starter queries."""
        return json.dumps({"queries": ["a", "b"]})

    mcp_asgi = mcp.http_app(
        path="/", stateless_http=True,
        allowed_hosts=["testserver", "api.example.test", "localhost"],
    )

    @asynccontextmanager
    async def lifespan(app):
        async with mcp_asgi.lifespan(app):
            yield

    app = FastAPI(lifespan=lifespan)
    app.include_router(oauth_mod.router)
    app.mount("/mcp", oauth_mod.MCPAuthMiddleware(mcp_asgi), name="mcp")
    app.add_middleware(oauth_mod.MCPPathNormalizeMiddleware)

    with TestClient(app) as c:
        yield c


def _pkce() -> tuple[str, str]:
    verifier = secrets.token_urlsafe(64)
    challenge = base64.urlsafe_b64encode(
        hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")
    return verifier, challenge


def _register(client, name="Claude") -> str:
    r = client.post("/oauth/register",
                    json={"redirect_uris": [REDIRECT_URI], "client_name": name})
    assert r.status_code == 201, r.text
    return r.json()["client_id"]


def _authorize_params(client_id: str, challenge: str) -> dict[str, str]:
    return {
        "client_id": client_id, "redirect_uri": REDIRECT_URI,
        "response_type": "code", "code_challenge": challenge,
        "code_challenge_method": "S256", "state": "xyz123",
    }


def _get_code(client, client_id: str, challenge: str) -> str:
    r = client.post("/oauth/authorize",
                    data={**_authorize_params(client_id, challenge),
                          "access_key": ACCESS_KEY},
                    follow_redirects=False)
    assert r.status_code == 302, r.text
    return parse_qs(urlparse(r.headers["location"]).query)["code"][0]


def _access_token(client) -> str:
    verifier, challenge = _pkce()
    client_id = _register(client)
    code = _get_code(client, client_id, challenge)
    r = client.post("/oauth/token", data={
        "grant_type": "authorization_code", "code": code,
        "redirect_uri": REDIRECT_URI, "client_id": client_id,
        "code_verifier": verifier})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


# --------------------------------------------------------------------------
# Discovery (RFC 9728 / RFC 8414)
# --------------------------------------------------------------------------

@pytest.mark.parametrize("path", [
    "/.well-known/oauth-protected-resource",
    "/.well-known/oauth-protected-resource/mcp",
])
def test_protected_resource_metadata(client, path):
    r = client.get(path)
    assert r.status_code == 200
    body = r.json()
    assert body["resource"] == f"{PUBLIC_URL}/mcp"
    assert body["authorization_servers"] == [PUBLIC_URL]


def test_authorization_server_metadata(client):
    body = client.get("/.well-known/oauth-authorization-server").json()
    assert body["issuer"] == PUBLIC_URL
    assert body["registration_endpoint"] == f"{PUBLIC_URL}/oauth/register"
    # OAuth 2.1 drops `plain`; advertising it would invite a downgrade.
    assert body["code_challenge_methods_supported"] == ["S256"]
    assert set(body["grant_types_supported"]) == {"authorization_code", "refresh_token"}


# --------------------------------------------------------------------------
# Resource-server gate
# --------------------------------------------------------------------------

def test_mcp_requires_bearer_token(client):
    r = client.post("/mcp/", json={"jsonrpc": "2.0", "id": 1, "method": "tools/list"})
    assert r.status_code == 401


def test_401_carries_resource_metadata_challenge(client):
    """Without this header a connector never learns where to authenticate."""
    r = client.post("/mcp/", json={"jsonrpc": "2.0", "id": 1, "method": "tools/list"})
    challenge = r.headers.get("www-authenticate", "")
    assert "resource_metadata=" in challenge
    assert "/.well-known/oauth-protected-resource" in challenge


def test_garbage_token_rejected(client):
    r = client.post("/mcp/", json={"jsonrpc": "2.0", "id": 1, "method": "tools/list"},
                    headers={"Authorization": "Bearer not-a-jwt"})
    assert r.status_code == 401


# --------------------------------------------------------------------------
# Dynamic client registration (RFC 7591)
# --------------------------------------------------------------------------

def test_registration_returns_public_client(client):
    body = client.post("/oauth/register", json={
        "redirect_uris": [REDIRECT_URI], "client_name": "Claude"}).json()
    assert body["client_id"]
    assert body["token_endpoint_auth_method"] == "none"
    assert "client_secret" not in body  # public client; PKCE is the protection


@pytest.mark.parametrize("payload", [
    {},                                          # missing redirect_uris
    {"redirect_uris": []},                       # empty
    {"redirect_uris": ["ftp://evil.test/cb"]},   # non-https scheme
    {"redirect_uris": ["http://evil.test/cb"]},  # plaintext, non-loopback
])
def test_registration_rejects_bad_redirect_uris(client, payload):
    assert client.post("/oauth/register", json=payload).status_code == 400


# --------------------------------------------------------------------------
# Authorization endpoint
# --------------------------------------------------------------------------

def test_authorize_renders_approval_form(client):
    _, challenge = _pkce()
    r = client.get("/oauth/authorize",
                   params=_authorize_params(_register(client), challenge))
    assert r.status_code == 200
    assert "Claude" in r.text
    assert "access_key" in r.text


@pytest.mark.parametrize("override", [
    {"redirect_uri": "https://evil.test/cb"},     # unregistered — open redirector
    {"code_challenge_method": "plain"},           # PKCE downgrade
    {"code_challenge": ""},                       # no PKCE at all
    {"response_type": "token"},                   # implicit flow, removed in 2.1
    {"client_id": "not-a-real-client"},
])
def test_authorize_rejects_invalid_requests(client, override):
    _, challenge = _pkce()
    params = {**_authorize_params(_register(client), challenge), **override}
    r = client.get("/oauth/authorize", params=params)
    assert r.status_code == 400, r.text


def test_wrong_access_key_issues_no_code(client):
    _, challenge = _pkce()
    r = client.post("/oauth/authorize",
                    data={**_authorize_params(_register(client), challenge),
                          "access_key": "wrong"},
                    follow_redirects=False)
    assert r.status_code == 401
    assert "location" not in r.headers


def test_correct_access_key_redirects_with_state(client):
    _, challenge = _pkce()
    r = client.post("/oauth/authorize",
                    data={**_authorize_params(_register(client), challenge),
                          "access_key": ACCESS_KEY},
                    follow_redirects=False)
    assert r.status_code == 302
    query = parse_qs(urlparse(r.headers["location"]).query)
    assert query["code"]
    assert query["state"] == ["xyz123"]  # CSRF binding must survive the round trip


# --------------------------------------------------------------------------
# Token endpoint
# --------------------------------------------------------------------------

def test_token_exchange_succeeds(client):
    verifier, challenge = _pkce()
    client_id = _register(client)
    code = _get_code(client, client_id, challenge)
    body = client.post("/oauth/token", data={
        "grant_type": "authorization_code", "code": code,
        "redirect_uri": REDIRECT_URI, "client_id": client_id,
        "code_verifier": verifier}).json()
    assert body["token_type"] == "Bearer"
    assert body["access_token"] and body["refresh_token"]
    assert body["expires_in"] == oauth_mod.ACCESS_TOKEN_TTL


def test_wrong_pkce_verifier_rejected(client):
    _, challenge = _pkce()
    client_id = _register(client)
    code = _get_code(client, client_id, challenge)
    r = client.post("/oauth/token", data={
        "grant_type": "authorization_code", "code": code,
        "redirect_uri": REDIRECT_URI, "client_id": client_id,
        "code_verifier": secrets.token_urlsafe(64)})
    assert r.status_code == 400
    assert r.json()["error"] == "invalid_grant"


def test_authorization_code_is_single_use(client):
    verifier, challenge = _pkce()
    client_id = _register(client)
    code = _get_code(client, client_id, challenge)
    form = {"grant_type": "authorization_code", "code": code,
            "redirect_uri": REDIRECT_URI, "client_id": client_id,
            "code_verifier": verifier}
    assert client.post("/oauth/token", data=form).status_code == 200
    assert client.post("/oauth/token", data=form).status_code == 400


def test_mismatched_redirect_uri_rejected(client):
    verifier, challenge = _pkce()
    client_id = _register(client)
    code = _get_code(client, client_id, challenge)
    r = client.post("/oauth/token", data={
        "grant_type": "authorization_code", "code": code,
        "redirect_uri": "https://claude.ai/somewhere-else",
        "client_id": client_id, "code_verifier": verifier})
    assert r.status_code == 400


def test_refresh_grant_issues_new_access_token(client):
    verifier, challenge = _pkce()
    client_id = _register(client)
    code = _get_code(client, client_id, challenge)
    tokens = client.post("/oauth/token", data={
        "grant_type": "authorization_code", "code": code,
        "redirect_uri": REDIRECT_URI, "client_id": client_id,
        "code_verifier": verifier}).json()
    r = client.post("/oauth/token", data={
        "grant_type": "refresh_token", "refresh_token": tokens["refresh_token"]})
    assert r.status_code == 200
    assert r.json()["access_token"]


def test_unsupported_grant_rejected(client):
    r = client.post("/oauth/token", data={"grant_type": "password"})
    assert r.status_code == 400
    assert r.json()["error"] == "unsupported_grant_type"


def test_refresh_token_is_not_accepted_as_access_token(client):
    """The `typ` claim is what stops a 30-day credential becoming a bearer token."""
    verifier, challenge = _pkce()
    client_id = _register(client)
    code = _get_code(client, client_id, challenge)
    tokens = client.post("/oauth/token", data={
        "grant_type": "authorization_code", "code": code,
        "redirect_uri": REDIRECT_URI, "client_id": client_id,
        "code_verifier": verifier}).json()
    r = client.post("/mcp/", json={"jsonrpc": "2.0", "id": 1, "method": "tools/list"},
                    headers={"Authorization": f"Bearer {tokens['refresh_token']}"})
    assert r.status_code == 401


def test_client_id_is_not_accepted_as_access_token(client):
    r = client.post("/mcp/", json={"jsonrpc": "2.0", "id": 1, "method": "tools/list"},
                    headers={"Authorization": f"Bearer {_register(client)}"})
    assert r.status_code == 401


# --------------------------------------------------------------------------
# Authenticated MCP transport
# --------------------------------------------------------------------------

MCP_HEADERS_BASE = {
    "Accept": "application/json, text/event-stream",
    "Content-Type": "application/json",
}
INITIALIZE = {
    "jsonrpc": "2.0", "id": 1, "method": "initialize",
    "params": {"protocolVersion": "2025-06-18", "capabilities": {},
               "clientInfo": {"name": "probe", "version": "1"}},
}


def test_initialize_with_valid_token(client):
    r = client.post("/mcp/", json=INITIALIZE,
                    headers={**MCP_HEADERS_BASE,
                             "Authorization": f"Bearer {_access_token(client)}"})
    assert r.status_code == 200, r.text
    assert "chronicle" in r.text


def test_tools_list_with_valid_token(client):
    r = client.post("/mcp/", json={"jsonrpc": "2.0", "id": 2, "method": "tools/list"},
                    headers={**MCP_HEADERS_BASE,
                             "Authorization": f"Bearer {_access_token(client)}"})
    assert r.status_code == 200, r.text
    assert "list_starter_queries" in r.text


def test_bare_mcp_path_is_served_without_redirect(client):
    """A 307 here would be built from scheme=http behind Fly's TLS terminator."""
    r = client.post("/mcp", json=INITIALIZE, follow_redirects=False,
                    headers={**MCP_HEADERS_BASE,
                             "Authorization": f"Bearer {_access_token(client)}"})
    assert r.status_code == 200, f"expected 200, got {r.status_code}"
