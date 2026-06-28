"""
ARQ tasks + queue helpers.

The single task `research_job` runs the LangGraph workflow inside the
worker process, publishes per-stage progress to a Redis pub/sub channel
(so the FastAPI `/api/research/{job_id}/stream` endpoint can forward
them to the browser via SSE), and upserts the final result into Postgres
keyed by job_id.

Idempotency: every write to Postgres goes through `upsert_result`, which
uses INSERT ... ON CONFLICT (job_id). Retries on the same job_id collapse
to a single row — that's the build plan's "killed worker -> retry ->
exactly one final Neon row" requirement.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import uuid
from typing import Any, Dict, Optional

from arq import ArqRedis
from arq.connections import create_pool

from backend.db import session_scope, upsert_result
from backend.queue.redis_client import (
    dispose_redis,
    get_arq_settings,
    get_redis,
    progress_channel,
)

logger = logging.getLogger(__name__)

# Job + queue config
RESEARCH_QUEUE = "chronicle:research"


# ---------------------------------------------------------------------------
# Public producer helper (called by FastAPI)
# ---------------------------------------------------------------------------


_arq_pool: Optional[ArqRedis] = None


async def _get_arq_pool() -> ArqRedis:
    global _arq_pool
    if _arq_pool is None:
        _arq_pool = await create_pool(get_arq_settings(), default_queue_name=RESEARCH_QUEUE)
        logger.info("ARQ producer pool created")
    return _arq_pool


async def enqueue_research(query: str) -> str:
    """Enqueue a research job and return its job_id.

    The job_id is generated client-side (UUID4 hex) so the API can return
    it to the browser immediately and the browser can start subscribing to
    the SSE channel before the worker has even picked up the job. Both
    sides agree on the channel name via `progress_channel(job_id)`.
    """
    job_id = uuid.uuid4().hex
    pool = await _get_arq_pool()

    # Pre-create the queued row so the history endpoint sees it immediately
    # even if the worker is cold-starting.
    async with session_scope() as session:
        await upsert_result(
            session,
            job_id=job_id,
            query=query,
            status="queued",
        )

    # _job_id sets the ARQ job identity for stalled-job recovery + dedupe.
    await pool.enqueue_job(
        "research_job",
        job_id,
        query,
        _job_id=f"research:{job_id}",
        _queue_name=RESEARCH_QUEUE,
    )
    logger.info(f"Enqueued research job_id={job_id} query={query!r}")
    return job_id


# ---------------------------------------------------------------------------
# Worker task
# ---------------------------------------------------------------------------


async def _publish(ctx: dict, job_id: str, event: Dict[str, Any]) -> None:
    """Publish a JSON event to the per-job pub/sub channel."""
    redis = ctx.get("redis_client") or get_redis()
    payload = json.dumps(event)
    try:
        await redis.publish(progress_channel(job_id), payload)
    except Exception as exc:
        # Don't fail the job if a progress message can't be published.
        logger.warning(f"publish failed (job_id={job_id}): {exc}")


def _run_workflow_blocking(query: str) -> Dict[str, Any]:
    """Run the LangGraph workflow synchronously inside a worker thread."""
    # Import lazily so the API process doesn't pay LangGraph import cost.
    from orchestration.coordinator import ResearchWorkflow

    workflow = ResearchWorkflow()  # respects use_enhanced_credibility / RAG envs
    return workflow.run(query)


async def research_job(ctx: dict, job_id: str, query: str) -> Dict[str, Any]:
    """ARQ task — runs the multi-agent pipeline and persists the result.

    Stages mirror the existing /api/research-stream events so the
    frontend's progress UI keeps working unchanged.
    """
    attempt = ctx.get("job_try", 1)
    logger.info(
        f"Worker picked up job_id={job_id} attempt={attempt} query={query!r}"
    )

    # Mark running on first attempt. (On retry the row already exists.)
    async with session_scope() as session:
        await upsert_result(
            session, job_id=job_id, query=query, status="running"
        )

    await _publish(
        ctx,
        job_id,
        {"stage": "queued", "job_id": job_id, "progress": 5, "attempt": attempt},
    )

    # Simulated stage events (mirrors the previous SSE shape). The actual
    # work happens inside _run_workflow_blocking; we publish around it.
    await _publish(
        ctx,
        job_id,
        {"stage": "retrieval", "message": "Retrieving sources…", "progress": 20},
    )
    await asyncio.sleep(0.2)
    await _publish(
        ctx,
        job_id,
        {"stage": "enrichment", "message": "Enriching with metadata…", "progress": 40},
    )

    try:
        result = await asyncio.to_thread(_run_workflow_blocking, query)
    except Exception as e:
        logger.exception(f"research_job failed (job_id={job_id}): {e}")
        async with session_scope() as session:
            await upsert_result(
                session,
                job_id=job_id,
                query=query,
                status="error",
                error=str(e),
            )
        await _publish(
            ctx,
            job_id,
            {"stage": "error", "message": f"Error: {e}", "progress": 0, "job_id": job_id},
        )
        raise  # Let ARQ retry per worker config

    # Publish intermediate stage completions
    await _publish(ctx, job_id, {"stage": "analyzer", "message": "Analyzing…", "progress": 60})
    await asyncio.sleep(0.05)
    await _publish(ctx, job_id, {"stage": "insight", "message": "Generating insights…", "progress": 80})
    await asyncio.sleep(0.05)
    await _publish(ctx, job_id, {"stage": "report", "message": "Compiling report…", "progress": 95})

    status = "success" if not result.get("error") else "error"
    result_payload = {
        "sources": result.get("sources", {}),
        "analysis": result.get("analysis", {}),
        "insights": result.get("insights", {}),
        "credibility": result.get("credibility", {}),
        "report": result.get("report", ""),
    }
    conversation = result.get("conversation")

    async with session_scope() as session:
        await upsert_result(
            session,
            job_id=job_id,
            query=query,
            status=status,
            result=result_payload,
            conversation=conversation,
            error=result.get("error") or None,
        )

    await _publish(
        ctx,
        job_id,
        {
            "stage": "complete",
            "message": "Research complete.",
            "progress": 100,
            "data": {**result_payload, "status": status, "job_id": job_id},
        },
    )

    logger.info(
        f"Worker finished job_id={job_id} status={status} attempt={attempt}"
    )
    return {"job_id": job_id, "status": status}


# ---------------------------------------------------------------------------
# ARQ WorkerSettings (loaded by `arq backend.queue.worker_settings.WorkerSettings`)
# ---------------------------------------------------------------------------


async def on_startup(ctx: dict) -> None:
    ctx["redis_client"] = get_redis()
    logger.info("ARQ worker startup complete")


async def on_shutdown(ctx: dict) -> None:
    try:
        await dispose_redis()
    finally:
        logger.info("ARQ worker shutdown complete")
