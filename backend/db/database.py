"""
Async SQLAlchemy engine + session wiring for Chronicle.

We use a single process-wide AsyncEngine with a NullPool when running inside
short-lived worker tasks (ARQ jobs are isolated coroutines), and the default
pool elsewhere. Neon's pooler endpoint also performs server-side pooling, so
we keep client-side pool_size modest.
"""

from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from typing import AsyncIterator, Optional

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from backend.db.models import Base

logger = logging.getLogger(__name__)

_engine: Optional[AsyncEngine] = None
_sessionmaker: Optional[async_sessionmaker[AsyncSession]] = None


def _normalize_url(url: str) -> str:
    """Convert a plain `postgresql://` URL to `postgresql+asyncpg://` and strip
    query params asyncpg doesn't understand (Neon ships `channel_binding`
    which the libpq driver supports but asyncpg does not).
    """
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql://", 1)
    if url.startswith("postgresql://") and "+asyncpg" not in url:
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)

    # asyncpg does not understand `sslmode` or `channel_binding` query params.
    # Strip them — we enable TLS via the `ssl="require"` connect_arg below.
    if "?" in url:
        base, _, qs = url.partition("?")
        keep = [
            kv
            for kv in qs.split("&")
            if not kv.startswith(("sslmode=", "channel_binding="))
        ]
        url = base + ("?" + "&".join(keep) if keep else "")

    return url


def get_engine() -> AsyncEngine:
    """Get the process-wide async engine (lazy-initialised)."""
    global _engine
    if _engine is not None:
        return _engine

    raw_url = os.getenv("DATABASE_URL")
    if not raw_url:
        raise RuntimeError(
            "DATABASE_URL is not set. Required to start the FastAPI backend "
            "or ARQ worker."
        )

    url = _normalize_url(raw_url)

    # TLS is mandatory for Neon. asyncpg accepts ssl=True/False/'require'.
    connect_args: dict = {"ssl": "require"}

    _engine = create_async_engine(
        url,
        pool_size=int(os.getenv("DB_POOL_SIZE", "5")),
        max_overflow=int(os.getenv("DB_MAX_OVERFLOW", "10")),
        pool_pre_ping=True,
        # 1h vs the previous 5m — Neon connections are stable, and the
        # shorter recycle was just churning unnecessary compute time.
        pool_recycle=int(os.getenv("DB_POOL_RECYCLE", "3600")),
        connect_args=connect_args,
        echo=os.getenv("DB_ECHO", "").lower() in ("1", "true", "yes"),
    )
    logger.info("Async DB engine created (Neon Postgres via asyncpg)")
    return _engine


def get_sessionmaker() -> async_sessionmaker[AsyncSession]:
    """Get the process-wide async session factory."""
    global _sessionmaker
    if _sessionmaker is not None:
        return _sessionmaker

    _sessionmaker = async_sessionmaker(
        get_engine(),
        expire_on_commit=False,
        autoflush=False,
        autocommit=False,
    )
    return _sessionmaker


@asynccontextmanager
async def session_scope() -> AsyncIterator[AsyncSession]:
    """Yield a session and commit-or-rollback at exit."""
    sm = get_sessionmaker()
    async with sm() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def init_db() -> None:
    """Run `create_all()` against the configured DB. Safe to call repeatedly.

    Also runs explicit ALTER TABLE / CREATE INDEX statements for additive
    schema changes that `create_all()` won't apply to existing tables
    (it only creates missing tables/indexes, not columns on existing ones).
    """
    from sqlalchemy import text

    engine = get_engine()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

        # Additive migrations (safe to run repeatedly thanks to IF NOT EXISTS)
        await conn.execute(
            text(
                "ALTER TABLE research_results "
                "ADD COLUMN IF NOT EXISTS query_hash VARCHAR(64)"
            )
        )
        await conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_research_results_query_hash "
                "ON research_results (query_hash)"
            )
        )
    logger.info("DB schema verified / migrated (research_results + query_hash)")


async def dispose_engine() -> None:
    """Dispose the engine — call on app shutdown."""
    global _engine, _sessionmaker
    if _engine is not None:
        await _engine.dispose()
        _engine = None
        _sessionmaker = None
        logger.info("Async DB engine disposed")
