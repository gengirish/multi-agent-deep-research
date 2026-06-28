"""
Repository helpers for ResearchResult.

The build plan calls for an *idempotent* upsert by job_id so the
killed-worker retry test produces exactly one row — Postgres'
INSERT ... ON CONFLICT gives us that primitive directly.

Cost optimization: `find_recent_successful` powers a 24h query-level
result cache so a repeated query returns the existing row's job_id
instead of running the LLM pipeline again (~$0.46 saved per cache hit).
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Optional, Sequence

from sqlalchemy import and_, desc, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.models import ResearchResult, hash_query

logger = logging.getLogger(__name__)


async def upsert_result(
    session: AsyncSession,
    *,
    job_id: str,
    query: str,
    status: str,
    result: Optional[dict[str, Any]] = None,
    conversation: Optional[dict[str, Any]] = None,
    error: Optional[str] = None,
) -> ResearchResult:
    """Idempotent upsert keyed on job_id.

    Multiple worker attempts on the same job_id collapse to a single row;
    the most recent attempt wins for result/conversation/status/error.
    """
    query_hash = hash_query(query)

    stmt = pg_insert(ResearchResult).values(
        job_id=job_id,
        query=query,
        query_hash=query_hash,
        status=status,
        result=result,
        conversation=conversation,
        error=error,
    )

    update_columns: dict[str, Any] = {
        "query": stmt.excluded.query,
        "query_hash": stmt.excluded.query_hash,
        "status": stmt.excluded.status,
        "updated_at": func.now(),
    }
    if result is not None:
        update_columns["result"] = stmt.excluded.result
    if conversation is not None:
        update_columns["conversation"] = stmt.excluded.conversation
    if error is not None:
        update_columns["error"] = stmt.excluded.error

    stmt = stmt.on_conflict_do_update(
        index_elements=[ResearchResult.job_id],
        set_=update_columns,
    ).returning(ResearchResult)

    row = (await session.execute(stmt)).scalar_one()
    return row


async def get_by_id(
    session: AsyncSession, job_id: str
) -> Optional[ResearchResult]:
    return await session.get(ResearchResult, job_id)


async def list_recent(
    session: AsyncSession, *, limit: int = 50, offset: int = 0
) -> Sequence[ResearchResult]:
    stmt = (
        select(ResearchResult)
        .order_by(desc(ResearchResult.created_at))
        .limit(limit)
        .offset(offset)
    )
    rows = (await session.execute(stmt)).scalars().all()
    return rows


async def find_recent_successful(
    session: AsyncSession,
    *,
    query: str,
    within_hours: int = 24,
) -> Optional[ResearchResult]:
    """Return the most recent successful row for the same normalised query
    if it was created within the TTL window. Used by the cache layer.

    Lookups are O(log n) on the (query_hash) index.
    """
    qhash = hash_query(query)
    # ResearchResult.created_at is TIMESTAMP WITHOUT TIME ZONE (the
    # SQLAlchemy DateTime default). Compare with a naive UTC datetime
    # so asyncpg doesn't reject the tz-aware/tz-naive mix.
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=within_hours)).replace(tzinfo=None)
    stmt = (
        select(ResearchResult)
        .where(
            and_(
                ResearchResult.query_hash == qhash,
                ResearchResult.status == "success",
                ResearchResult.created_at >= cutoff,
            )
        )
        .order_by(desc(ResearchResult.created_at))
        .limit(1)
    )
    return (await session.execute(stmt)).scalar_one_or_none()
