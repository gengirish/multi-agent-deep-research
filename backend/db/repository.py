"""
Repository helpers for ResearchResult.

The plan calls for an *idempotent* upsert by job_id so the killed-worker
retry test produces exactly one row — Postgres' INSERT ... ON CONFLICT
gives us that primitive directly.
"""

from __future__ import annotations

import logging
from typing import Any, Optional, Sequence

from sqlalchemy import desc, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.models import ResearchResult

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
    stmt = pg_insert(ResearchResult).values(
        job_id=job_id,
        query=query,
        status=status,
        result=result,
        conversation=conversation,
        error=error,
    )

    update_columns: dict[str, Any] = {
        "query": stmt.excluded.query,
        "status": stmt.excluded.status,
        "updated_at": __import__("sqlalchemy").func.now(),
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
