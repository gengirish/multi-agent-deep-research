"""
Shared Upstash Redis client + ARQ settings.

The same Upstash database backs three roles:
  1. ARQ job queue + result store
  2. SSE pub/sub channels (`chronicle:job:{job_id}`)
  3. (future) episodic memory per the build plan

We expose `get_redis()` returning a singleton async client. ARQ creates
its own connections from `get_arq_settings()`.
"""

from __future__ import annotations

import logging
import os
import ssl
from typing import Optional
from urllib.parse import urlparse

import redis.asyncio as aioredis
from arq.connections import RedisSettings

logger = logging.getLogger(__name__)

_redis: Optional[aioredis.Redis] = None


def _redis_url() -> str:
    url = os.getenv("REDIS_URL")
    if not url:
        raise RuntimeError(
            "REDIS_URL is not set. Required for the ARQ queue and SSE "
            "pub/sub. Get one from Upstash (use the rediss:// TCP endpoint, "
            "not the REST URL)."
        )
    return url


def get_redis() -> aioredis.Redis:
    """Process-wide async Redis client. Healthy across reconnects."""
    global _redis
    if _redis is None:
        url = _redis_url()
        _redis = aioredis.from_url(
            url,
            encoding="utf-8",
            decode_responses=True,
            socket_keepalive=True,
            health_check_interval=30,
        )
        logger.info("Async Redis client created (Upstash)")
    return _redis


async def dispose_redis() -> None:
    """Close the shared client on shutdown."""
    global _redis
    if _redis is not None:
        try:
            await _redis.aclose()
        finally:
            _redis = None
            logger.info("Async Redis client closed")


def get_arq_settings() -> RedisSettings:
    """Build ARQ's RedisSettings from REDIS_URL.

    ARQ's RedisSettings is its own connection abstraction (it doesn't take
    a URL string directly), so we parse the URL ourselves.
    """
    url = _redis_url()
    parsed = urlparse(url)

    if parsed.scheme not in ("redis", "rediss"):
        raise RuntimeError(
            f"REDIS_URL must use redis:// or rediss:// scheme, got {parsed.scheme!r}"
        )

    use_ssl = parsed.scheme == "rediss"
    host = parsed.hostname or "localhost"
    port = parsed.port or (6380 if use_ssl else 6379)
    password = parsed.password
    username = parsed.username or "default"

    settings = RedisSettings(
        host=host,
        port=port,
        password=password,
        username=username,
        database=0,
        ssl=use_ssl,
        # Upstash uses a wildcard cert; verify-against-host is the default
        # and works. If you ever see SSL errors, set ssl_cert_reqs="none".
        ssl_cert_reqs="required" if use_ssl else None,
    )
    return settings


def progress_channel(job_id: str) -> str:
    """Redis pub/sub channel used to stream worker progress to SSE."""
    return f"chronicle:job:{job_id}"
