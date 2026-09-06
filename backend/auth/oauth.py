"""
OAuth 2.1 authorization server for the Chronicle remote MCP endpoint.

claude.ai custom connectors will not attach to a bare bearer-token endpoint.
They require the full discovery dance:

    GET  /.well-known/oauth-protected-resource   (RFC 9728) -> names the AS
    GET  /.well-known/oauth-authorization-server (RFC 8414) -> names endpoints
    POST /oauth/register                         (RFC 7591) -> dynamic client
    GET  /oauth/authorize                        + PKCE S256
    POST /oauth/token                            -> access + refresh token

This module implements exactly that, with one deliberate simplification:
**identity is a single shared access key**, not a user directory. The wire
protocol is real OAuth 2.1 so claude.ai is satisfied; the human at the
/authorize screen proves themselves by pasting `CHRONICLE_MCP_ACCESS_KEY`.
That matches Chronicle's actual scale (see fly.toml — one warm machine,
single-user). Swapping in per-user identity later means changing only
`_authenticate_resource_owner` and the `sub` claim.

## Statelessness

There is no table and no Redis key behind any of this. Client registrations,
authorization codes, and both token types are all HS256 JWTs signed with the
server secret, each carrying its own `typ` claim:

    typ=client   client_id, embeds the registered redirect_uris
    typ=code     authorization code, embeds the PKCE challenge (60s TTL)
    typ=access   bearer token for /mcp (1h TTL)
    typ=refresh  refresh token (30d TTL)

So a Fly restart or a second machine cannot invalidate a connector that was
already authorized — the thing that would otherwise make DCR-based connectors
break every deploy.

The one piece of real state is `_USED_CODES`, an in-memory replay guard for
authorization codes. A restart inside the 60s code window would let a stolen
code be replayed once; with a single warm machine and a 60s TTL this is an
accepted, documented trade rather than an oversight.

## Configuration

    CHRONICLE_MCP_ACCESS_KEY   required — the shared secret a human pastes
    CHRONICLE_OAUTH_SECRET     signing key; falls back to JWT_SECRET
    CHRONICLE_PUBLIC_URL       public origin; falls back to the request's

If the access key or the signing secret is missing, `oauth_enabled()` returns
False and main.py refuses to mount /mcp at all. Failing closed matters here:
the alternative is publishing an unauthenticated tool that spends LLM credits.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import logging
import os
import secrets
import time
from typing import Any, Optional
from urllib.parse import urlencode

from fastapi import APIRouter, Form, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse

logger = logging.getLogger(__name__)

ACCESS_TOKEN_TTL = 3600           # 1 hour
REFRESH_TOKEN_TTL = 30 * 86400    # 30 days
CODE_TTL = 60                     # 1 minute — codes are exchanged immediately
CLIENT_TTL = 365 * 86400          # 1 year

MCP_SCOPE = "chronicle:research"
DEFAULT_PUBLIC_URL = "https://multi-agent-deep-research-api.fly.dev"

# Replay guard for authorization codes. Bounded by CODE_TTL sweeps, so it
# cannot grow without limit even under a flood of /token calls.
_USED_CODES: dict[str, float] = {}


# --------------------------------------------------------------------------
# Configuration helpers
# --------------------------------------------------------------------------

def _signing_secret() -> Optional[str]:
    """Secret used to sign every artifact this AS issues."""
    return os.getenv("CHRONICLE_OAUTH_SECRET") or os.getenv("JWT_SECRET")


def _access_key() -> Optional[str]:
    return os.getenv("CHRONICLE_MCP_ACCESS_KEY")


def oauth_enabled() -> bool:
    """True when the connector is safe to expose. Checked before mounting."""
    return bool(_signing_secret() and _access_key())


def public_url(request: Optional[Request] = None) -> str:
    """Public origin of this API, used to build issuer and resource URLs."""
    configured = os.getenv("CHRONICLE_PUBLIC_URL")
    if configured:
        return configured.rstrip("/")
    if request is not None:
        # Fly terminates TLS upstream, so request.url.scheme can read "http".
        # X-Forwarded-Proto is authoritative for the origin we advertise.
        proto = request.headers.get("x-forwarded-proto", request.url.scheme)
        host = request.headers.get("host")
        if host:
            return f"{proto}://{host}"
    return DEFAULT_PUBLIC_URL


def _resource_url(request: Optional[Request] = None) -> str:
    return f"{public_url(request)}/mcp"


# --------------------------------------------------------------------------
# JWT helpers
# --------------------------------------------------------------------------

def _encode(claims: dict[str, Any], typ: str, ttl: int) -> str:
    from jose import jwt as jose_jwt

    secret = _signing_secret()
    if not secret:
        raise HTTPException(status_code=503, detail="OAuth is not configured")
    now = int(time.time())
    payload = {**claims, "typ": typ, "iat": now, "exp": now + ttl}
    return jose_jwt.encode(payload, secret, algorithm="HS256")


def _decode(token: str, expected_typ: str) -> Optional[dict[str, Any]]:
    """Decode and type-check a token. Returns None on any failure.

    The `typ` check is load-bearing, not cosmetic: without it a refresh token
    would be accepted as an access token, silently turning a 30-day credential
    into a bearer token for /mcp.
    """
    from jose import jwt as jose_jwt
    from jose.exceptions import JWTError

    secret = _signing_secret()
    if not secret:
        return None
    try:
        payload = jose_jwt.decode(token, secret, algorithms=["HS256"])
    except JWTError as exc:
        logger.debug(f"OAuth token decode failed ({expected_typ}): {exc}")
        return None
    if payload.get("typ") != expected_typ:
        logger.debug(f"OAuth token typ mismatch: {payload.get('typ')} != {expected_typ}")
        return None
    return payload


def verify_access_token(token: str) -> Optional[dict[str, Any]]:
    """Public entry point used by the MCP auth middleware."""
    return _decode(token, "access")


# --------------------------------------------------------------------------
# PKCE
# --------------------------------------------------------------------------

def _verify_pkce(verifier: str, challenge: str, method: str) -> bool:
    """Check an RFC 7636 code_verifier against the stored challenge.

    Only S256 is accepted. OAuth 2.1 removes `plain`, and accepting it would
    hand any party that intercepted the redirect a usable code.
    """
    if method != "S256":
        return False
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    expected = base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")
    return hmac.compare_digest(expected, challenge)


def _sweep_used_codes(now: float) -> None:
    for code_id, expiry in list(_USED_CODES.items()):
        if expiry < now:
            _USED_CODES.pop(code_id, None)


# --------------------------------------------------------------------------
# Routes
# --------------------------------------------------------------------------

router = APIRouter(tags=["oauth"])


@router.get("/.well-known/oauth-protected-resource")
@router.get("/.well-known/oauth-protected-resource/mcp")
async def protected_resource_metadata(request: Request) -> JSONResponse:
    """RFC 9728. Tells the client which AS guards /mcp.

    Served at both the bare path and the resource-suffixed path because
    clients differ on which they probe first.
    """
    base = public_url(request)
    return JSONResponse({
        "resource": _resource_url(request),
        "authorization_servers": [base],
        "scopes_supported": [MCP_SCOPE],
        "bearer_methods_supported": ["header"],
        "resource_documentation": f"{base}/docs",
    })


@router.get("/.well-known/oauth-authorization-server")
@router.get("/.well-known/oauth-authorization-server/mcp")
async def authorization_server_metadata(request: Request) -> JSONResponse:
    """RFC 8414 discovery document."""
    base = public_url(request)
    return JSONResponse({
        "issuer": base,
        "authorization_endpoint": f"{base}/oauth/authorize",
        "token_endpoint": f"{base}/oauth/token",
        "registration_endpoint": f"{base}/oauth/register",
        "response_types_supported": ["code"],
        "grant_types_supported": ["authorization_code", "refresh_token"],
        "code_challenge_methods_supported": ["S256"],
        "token_endpoint_auth_methods_supported": ["none"],
        "scopes_supported": [MCP_SCOPE],
        "service_documentation": f"{base}/docs",
    })


@router.post("/oauth/register", status_code=201)
async def register_client(request: Request) -> JSONResponse:
    """RFC 7591 dynamic client registration.

    Chronicle accepts any well-formed registration — there is no client
    approval queue. That is safe because a client_id alone grants nothing:
    the resource owner still has to paste the access key at /authorize.

    The returned client_id is itself a signed JWT carrying the redirect_uris,
    which is what makes registrations survive a redeploy.
    """
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="invalid_client_metadata")

    redirect_uris = body.get("redirect_uris") or []
    if not isinstance(redirect_uris, list) or not redirect_uris:
        return JSONResponse(
            status_code=400,
            content={"error": "invalid_redirect_uri",
                     "error_description": "redirect_uris is required"},
        )
    for uri in redirect_uris:
        if not isinstance(uri, str) or not uri.startswith(("https://", "http://localhost")):
            return JSONResponse(
                status_code=400,
                content={"error": "invalid_redirect_uri",
                         "error_description": f"redirect_uri must be https (or http://localhost): {uri}"},
            )

    client_name = str(body.get("client_name") or "Unnamed MCP client")[:120]
    client_id = _encode(
        {"redirect_uris": redirect_uris, "client_name": client_name},
        "client", CLIENT_TTL,
    )
    logger.info(f"OAuth client registered: {client_name} -> {redirect_uris}")

    return JSONResponse(status_code=201, content={
        "client_id": client_id,
        "client_id_issued_at": int(time.time()),
        "redirect_uris": redirect_uris,
        "client_name": client_name,
        "grant_types": ["authorization_code", "refresh_token"],
        "response_types": ["code"],
        "token_endpoint_auth_method": "none",
        "scope": MCP_SCOPE,
    })


_APPROVAL_PAGE = """<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Authorize Chronicle</title>
<style>
  :root {{ color-scheme: light dark; }}
  body {{ font-family: ui-sans-serif, -apple-system, "Segoe UI", sans-serif;
         display: grid; place-items: center; min-height: 100vh; margin: 0;
         background: #0f1115; color: #e8eaed; }}
  .card {{ width: min(420px, 92vw); background: #171a21; border: 1px solid #262b36;
          border-radius: 14px; padding: 28px; }}
  h1 {{ font-size: 19px; margin: 0 0 4px; }}
  p  {{ font-size: 14px; line-height: 1.5; color: #a2a9b8; margin: 0 0 18px; }}
  .client {{ color: #e8eaed; font-weight: 600; }}
  label {{ display: block; font-size: 13px; margin-bottom: 6px; color: #a2a9b8; }}
  input {{ width: 100%; box-sizing: border-box; padding: 10px 12px; font-size: 15px;
          border-radius: 8px; border: 1px solid #333a48; background: #0f1115;
          color: #e8eaed; }}
  button {{ width: 100%; margin-top: 16px; padding: 11px; font-size: 15px;
           font-weight: 600; border: 0; border-radius: 8px; background: #3d7dff;
           color: #fff; cursor: pointer; }}
  button:hover {{ background: #2f6ae8; }}
  .err {{ background: #3a1d22; border: 1px solid #5c2a33; color: #ffb4be;
         padding: 9px 12px; border-radius: 8px; font-size: 13px; margin-bottom: 16px; }}
  .scope {{ font-size: 12px; color: #6f7789; margin-top: 16px; }}
</style>
<div class="card">
  <h1>Authorize connector</h1>
  <p><span class="client">{client_name}</span> is requesting access to your
     Chronicle research tools.</p>
  {error_html}
  <form method="post" action="/oauth/authorize">
    <label for="access_key">Chronicle access key</label>
    <input id="access_key" name="access_key" type="password" autocomplete="off"
           autofocus required placeholder="CHRONICLE_MCP_ACCESS_KEY">
    {hidden}
    <button type="submit">Approve access</button>
  </form>
  <div class="scope">Grants: run research, read jobs, export reports.</div>
</div>
"""


def _hidden_fields(params: dict[str, str]) -> str:
    from html import escape
    return "\n    ".join(
        f'<input type="hidden" name="{escape(k)}" value="{escape(v)}">'
        for k, v in params.items() if v
    )


def _render_approval(params: dict[str, str], client_name: str, error: str = "") -> HTMLResponse:
    from html import escape
    error_html = f'<div class="err">{escape(error)}</div>' if error else ""
    return HTMLResponse(_APPROVAL_PAGE.format(
        client_name=escape(client_name),
        error_html=error_html,
        hidden=_hidden_fields(params),
    ), status_code=200 if not error else 401)


def _validate_authorize_params(
    client_id: str, redirect_uri: str, response_type: str,
    code_challenge: str, code_challenge_method: str,
) -> tuple[dict[str, Any], Optional[JSONResponse]]:
    """Shared validation for both GET and POST /oauth/authorize.

    Errors here are rendered as JSON rather than redirected, because an
    unvalidated redirect_uri is exactly what an open redirector is made of.
    """
    def fail(code: str, desc: str) -> JSONResponse:
        return JSONResponse(status_code=400,
                            content={"error": code, "error_description": desc})

    client = _decode(client_id, "client")
    if client is None:
        return {}, fail("invalid_client", "Unknown or expired client_id. Re-register.")
    if redirect_uri not in (client.get("redirect_uris") or []):
        return {}, fail("invalid_request", "redirect_uri does not match registration")
    if response_type != "code":
        return {}, fail("unsupported_response_type", "Only response_type=code is supported")
    if not code_challenge:
        return {}, fail("invalid_request", "PKCE code_challenge is required")
    if code_challenge_method != "S256":
        return {}, fail("invalid_request", "Only code_challenge_method=S256 is supported")
    return client, None


@router.get("/oauth/authorize")
async def authorize_form(
    request: Request,
    client_id: str = "",
    redirect_uri: str = "",
    response_type: str = "code",
    code_challenge: str = "",
    code_challenge_method: str = "S256",
    state: str = "",
    scope: str = MCP_SCOPE,
) -> Any:
    """Render the access-key approval screen."""
    client, error = _validate_authorize_params(
        client_id, redirect_uri, response_type, code_challenge, code_challenge_method)
    if error is not None:
        return error
    return _render_approval(
        {
            "client_id": client_id, "redirect_uri": redirect_uri,
            "response_type": response_type, "code_challenge": code_challenge,
            "code_challenge_method": code_challenge_method,
            "state": state, "scope": scope,
        },
        client.get("client_name") or "An MCP client",
    )


def _authenticate_resource_owner(supplied_key: str) -> Optional[str]:
    """Verify the human at the approval screen. Returns a `sub` or None.

    This is the single seam to replace for real multi-user identity: swap the
    shared-key check for a session lookup and return that user's id instead.
    """
    expected = _access_key()
    if not expected:
        return None
    if not hmac.compare_digest(supplied_key.strip(), expected):
        return None
    return "chronicle-owner"


@router.post("/oauth/authorize")
async def authorize_submit(
    request: Request,
    access_key: str = Form(""),
    client_id: str = Form(""),
    redirect_uri: str = Form(""),
    response_type: str = Form("code"),
    code_challenge: str = Form(""),
    code_challenge_method: str = Form("S256"),
    state: str = Form(""),
    scope: str = Form(MCP_SCOPE),
) -> Any:
    """Check the access key, then redirect back with an authorization code."""
    client, error = _validate_authorize_params(
        client_id, redirect_uri, response_type, code_challenge, code_challenge_method)
    if error is not None:
        return error

    params = {
        "client_id": client_id, "redirect_uri": redirect_uri,
        "response_type": response_type, "code_challenge": code_challenge,
        "code_challenge_method": code_challenge_method,
        "state": state, "scope": scope,
    }
    client_name = client.get("client_name") or "An MCP client"

    subject = _authenticate_resource_owner(access_key)
    if subject is None:
        logger.warning(f"OAuth authorize rejected: bad access key for {client_name}")
        return _render_approval(params, client_name, "Incorrect access key. Try again.")

    code = _encode({
        "sub": subject,
        "cid": client_id,
        "redirect_uri": redirect_uri,
        "code_challenge": code_challenge,
        "scope": scope,
        "jti": secrets.token_urlsafe(12),
    }, "code", CODE_TTL)

    logger.info(f"OAuth code issued to {client_name}")
    query = {"code": code}
    if state:
        query["state"] = state
    return RedirectResponse(f"{redirect_uri}?{urlencode(query)}", status_code=302)


def _token_error(code: str, desc: str, status: int = 400) -> JSONResponse:
    return JSONResponse(status_code=status,
                        content={"error": code, "error_description": desc})


def _issue_tokens(subject: str, client_id: str, scope: str) -> JSONResponse:
    access = _encode({"sub": subject, "cid": client_id, "scope": scope},
                     "access", ACCESS_TOKEN_TTL)
    refresh = _encode({"sub": subject, "cid": client_id, "scope": scope},
                      "refresh", REFRESH_TOKEN_TTL)
    return JSONResponse({
        "access_token": access,
        "token_type": "Bearer",
        "expires_in": ACCESS_TOKEN_TTL,
        "refresh_token": refresh,
        "scope": scope,
    }, headers={"Cache-Control": "no-store", "Pragma": "no-cache"})


@router.post("/oauth/token")
async def token(
    grant_type: str = Form(""),
    code: str = Form(""),
    redirect_uri: str = Form(""),
    client_id: str = Form(""),
    code_verifier: str = Form(""),
    refresh_token: str = Form(""),
) -> Any:
    """Exchange an authorization code (with PKCE) or refresh an access token."""
    if grant_type == "authorization_code":
        payload = _decode(code, "code")
        if payload is None:
            return _token_error("invalid_grant", "Authorization code is invalid or expired")

        # Replay guard. Codes are single-use per RFC 6749 §4.1.2.
        now = time.time()
        _sweep_used_codes(now)
        jti = payload.get("jti") or ""
        if jti in _USED_CODES:
            logger.warning("OAuth code replay rejected")
            return _token_error("invalid_grant", "Authorization code already used")
        _USED_CODES[jti] = now + CODE_TTL

        if client_id and payload.get("cid") != client_id:
            return _token_error("invalid_grant", "client_id does not match the code")
        if redirect_uri and payload.get("redirect_uri") != redirect_uri:
            return _token_error("invalid_grant", "redirect_uri does not match the code")
        if not code_verifier:
            return _token_error("invalid_request", "code_verifier is required")
        if not _verify_pkce(code_verifier, payload.get("code_challenge", ""), "S256"):
            return _token_error("invalid_grant", "PKCE verification failed")

        return _issue_tokens(payload["sub"], payload.get("cid", ""),
                             payload.get("scope", MCP_SCOPE))

    if grant_type == "refresh_token":
        payload = _decode(refresh_token, "refresh")
        if payload is None:
            return _token_error("invalid_grant", "Refresh token is invalid or expired")
        return _issue_tokens(payload["sub"], payload.get("cid", ""),
                             payload.get("scope", MCP_SCOPE))

    return _token_error("unsupported_grant_type",
                        f"grant_type must be authorization_code or refresh_token, got '{grant_type}'")


# --------------------------------------------------------------------------
# Resource-server middleware
# --------------------------------------------------------------------------

class MCPAuthMiddleware:
    """Pure-ASGI bearer gate wrapped around the mounted MCP app.

    A 401 from an MCP resource server has to carry an RFC 9728
    `WWW-Authenticate` challenge naming the protected-resource metadata URL.
    That header is how claude.ai discovers where to start the OAuth flow —
    without it a connector shows only a generic failure and never offers to
    authenticate.

    Written as raw ASGI rather than BaseHTTPMiddleware on purpose: the MCP
    transport streams responses, and BaseHTTPMiddleware buffers them.
    """

    def __init__(self, app, resource_metadata_url: str = ""):
        self.app = app
        self._configured_metadata_url = resource_metadata_url

    def _challenge(self, scope) -> str:
        url = self._configured_metadata_url
        if not url:
            headers = {k.decode("latin-1").lower(): v.decode("latin-1")
                       for k, v in scope.get("headers", [])}
            proto = headers.get("x-forwarded-proto", scope.get("scheme", "https"))
            host = headers.get("host", "")
            base = os.getenv("CHRONICLE_PUBLIC_URL") or (
                f"{proto}://{host}" if host else DEFAULT_PUBLIC_URL)
            url = f"{base.rstrip('/')}/.well-known/oauth-protected-resource"
        return f'Bearer resource_metadata="{url}", scope="{MCP_SCOPE}"'

    async def _reject(self, scope, receive, send, description: str) -> None:
        import json as _json

        body = _json.dumps({
            "error": "invalid_token",
            "error_description": description,
        }).encode()
        await send({
            "type": "http.response.start",
            "status": 401,
            "headers": [
                (b"content-type", b"application/json"),
                (b"www-authenticate", self._challenge(scope).encode("latin-1")),
                (b"content-length", str(len(body)).encode()),
            ],
        })
        await send({"type": "http.response.body", "body": body})

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        headers = {k.decode("latin-1").lower(): v.decode("latin-1")
                   for k, v in scope.get("headers", [])}
        auth = headers.get("authorization", "")
        parts = auth.split(None, 1)
        if len(parts) != 2 or parts[0].lower() != "bearer":
            await self._reject(scope, receive, send,
                               "A Bearer access token is required.")
            return

        claims = verify_access_token(parts[1].strip())
        if claims is None:
            await self._reject(scope, receive, send,
                               "The access token is invalid or expired.")
            return

        # Hand identity down to the MCP layer for future per-user scoping.
        scope = dict(scope)
        scope["chronicle_auth"] = claims
        await self.app(scope, receive, send)


class MCPPathNormalizeMiddleware:
    """Rewrite a bare `/mcp` to `/mcp/` before routing, avoiding a redirect.

    Starlette's `Mount("/mcp")` only matches paths that continue past the
    prefix, so a request to bare `/mcp` misses the mount and falls through to
    the router's `redirect_slashes`, which answers 307 to `/mcp/`. It builds
    that Location from `scope["scheme"]` — "http" behind Fly's TLS terminator
    unless uvicorn happens to trust the proxy's forwarded headers. A connector
    following it would be downgraded to plaintext and fail.

    Rewriting the path here means the mount matches on the first pass and no
    redirect is ever emitted, whether or not proxy headers are trusted. This
    has to run as app-level middleware because routing happens before any
    mounted sub-app sees the request.
    """

    def __init__(self, app, prefix: str = "/mcp"):
        self.app = app
        self.prefix = prefix

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http" and scope.get("path") == self.prefix:
            scope = dict(scope)
            scope["path"] = self.prefix + "/"
            scope["raw_path"] = (self.prefix + "/").encode()
        await self.app(scope, receive, send)
