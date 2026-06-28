"""
Optional JWT validation for the Chronicle FastAPI backend.

Chronicle is auth-OPTIONAL: anonymous callers stay fully functional. When the
Next.js layer signs a `chronicle-session` cookie and forwards it to the API
as `Authorization: Bearer <jwt>`, this module decodes the HS256 token using
the shared `JWT_SECRET` env var and surfaces a `SessionUser` for ownership
checks on research rows.

Failure mode is always "fall back to anonymous" — bad signature, expired
token, missing claim, or a misconfigured secret all return None from
`optional_session()` instead of raising. This keeps Chronicle's UX intact
(better to serve anonymous than to 500 on a stale cookie).

`require_session()` is intentionally provided but NOT used anywhere in
Chronicle today — every endpoint is auth-optional. Kept here so a future
"My Workspace" tab can opt-in without re-implementing the dependency.
"""

from __future__ import annotations

import logging
import os
from typing import Optional

from fastapi import HTTPException, Request
from pydantic import BaseModel

logger = logging.getLogger(__name__)


# Lazy-cache the secret. Read env once on first decode — avoids a syscall
# on every request and lets the test suite monkeypatch env before import.
_JWT_SECRET_CACHE: Optional[str] = None
_JWT_SECRET_LOADED: bool = False


def _get_jwt_secret() -> Optional[str]:
    """Return the shared JWT secret, reading env on first access only."""
    global _JWT_SECRET_CACHE, _JWT_SECRET_LOADED
    if not _JWT_SECRET_LOADED:
        _JWT_SECRET_CACHE = os.getenv("JWT_SECRET")
        _JWT_SECRET_LOADED = True
        if not _JWT_SECRET_CACHE:
            logger.warning(
                "JWT_SECRET is not set — all Authorization headers will fall "
                "back to anonymous. This is OK in local dev without auth, "
                "but should be set in production."
            )
    return _JWT_SECRET_CACHE


class SessionUser(BaseModel):
    """Validated session payload mapped from the Next.js JWT claims.

    Claim mapping (Next.js -> FastAPI):
        sub      -> user_id
        email    -> email
        name     -> name
        orgId    -> org_id
        orgRole  -> org_role

    `tokenVersion`, `iat`, `exp` are validated by jose during decode but
    not surfaced on this model — Chronicle's authorization only needs
    user_id today.
    """

    user_id: str
    email: str
    name: Optional[str] = None
    org_id: Optional[str] = None
    org_role: Optional[str] = None


def _extract_bearer_token(request: Request) -> Optional[str]:
    """Pull `<token>` out of an `Authorization: Bearer <token>` header.

    Case-insensitive on the scheme. Returns None if absent or malformed.
    """
    auth_header = request.headers.get("authorization") or request.headers.get(
        "Authorization"
    )
    if not auth_header:
        return None
    parts = auth_header.split(None, 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    token = parts[1].strip()
    return token or None


async def optional_session(request: Request) -> Optional[SessionUser]:
    """FastAPI dependency: returns the decoded SessionUser, or None.

    Behaviour:
      - No Authorization header        -> None  (anonymous)
      - Malformed header               -> None
      - Missing/invalid JWT_SECRET     -> None
      - Bad signature / expired / etc. -> None
      - Missing `sub` claim            -> None
      - Otherwise                      -> SessionUser

    Never raises. All failures fall back to anonymous so a stale cookie
    doesn't 500 the request — the frontend will redirect to /sign-in
    via its own middleware instead.
    """
    token = _extract_bearer_token(request)
    if token is None:
        return None

    secret = _get_jwt_secret()
    if not secret:
        return None

    try:
        # Local import so the package can be imported even when python-jose
        # isn't installed yet (e.g. during the syntax-check pre-flight).
        from jose import jwt as jose_jwt
        from jose.exceptions import JWTError

        try:
            payload = jose_jwt.decode(token, secret, algorithms=["HS256"])
        except JWTError as exc:
            logger.debug(f"JWT decode failed (treating as anonymous): {exc}")
            return None

        sub = payload.get("sub")
        if not sub:
            logger.debug("JWT missing `sub` claim — treating as anonymous")
            return None

        email = payload.get("email") or ""
        return SessionUser(
            user_id=str(sub),
            email=str(email),
            name=payload.get("name"),
            org_id=payload.get("orgId"),
            org_role=payload.get("orgRole"),
        )
    except Exception as exc:
        # Belt-and-suspenders: any unexpected error (import failure, weird
        # payload type, pydantic validation error) falls back to anonymous.
        logger.warning(f"optional_session unexpected error (fallback to anon): {exc}")
        return None


async def require_session(request: Request) -> SessionUser:
    """FastAPI dependency: same as `optional_session`, but 401s on None.

    Not wired anywhere in Chronicle today — every endpoint is
    auth-optional. Kept available so a future authenticated-only surface
    can opt in without rewriting auth.
    """
    session = await optional_session(request)
    if session is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return session
