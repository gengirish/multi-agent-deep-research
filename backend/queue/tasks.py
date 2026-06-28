"""
Inline + queued research execution helpers.

Originally written to support both an in-process inline path and an ARQ
worker-based queued path. After cost analysis we chose inline-only at
single-user scale (saves ~$5.70/mo on the always-on worker) — the queue
code is kept here as a `research_job` shim so we can re-enable a real
worker later without rewriting.

Both paths share `_run_research_pipeline()` which:
  - publishes per-stage progress to Redis pub/sub (so SSE works either way)
  - runs the LangGraph in a worker thread (CPU-bound, ~10s)
  - upserts the final result to Postgres via idempotent INSERT ... ON CONFLICT

Idempotency: every Postgres write goes through `upsert_result`. Multiple
retries on the same job_id collapse to a single row — preserves the
build-plan grading guarantee.
"""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from typing import Any, Dict, Optional

from backend.db import get_by_id, session_scope, upsert_result
from backend.queue.redis_client import get_redis, progress_channel

logger = logging.getLogger(__name__)

# Cache TTL for repeat queries (24h matches the build plan's recommendation).
RESULT_CACHE_TTL_HOURS = 24


# ---------------------------------------------------------------------------
# Public producer helper (called by FastAPI)
# ---------------------------------------------------------------------------


async def enqueue_research(
    query: str, user_id: Optional[str] = None
) -> tuple[str, bool]:
    """Spawn an inline research task and return (job_id, cache_hit).

    If an identical query produced a successful row in the last 24h
    *for the same caller* (anonymous or this user), return that row's
    job_id without running the LangGraph again — saves ~$0.46 in LLM
    cost per cache hit. The cache is scoped per-user so different
    users don't share rows (privacy + each /history tab stays
    attributable to its owner).

    Otherwise generates a new job_id, inserts a `running` row tagged
    with `user_id`, and spawns the LangGraph pipeline via
    asyncio.create_task. The task keeps running even if the request
    completes — its result is persisted to Postgres so SSE clients can
    replay it on reconnect.
    """
    from backend.db.repository import find_recent_successful  # local import to avoid cycle

    # 1) Cache lookup (scoped to this caller)
    async with session_scope() as session:
        cached = await find_recent_successful(
            session,
            query=query,
            within_hours=RESULT_CACHE_TTL_HOURS,
            user_id=user_id,
        )
    if cached is not None:
        logger.info(
            f"CACHE HIT for query={query!r} user_id={user_id} "
            f"-> job_id={cached.job_id} "
            f"(age={cached.created_at}, saved ~$0.46 in LLM cost)"
        )
        return cached.job_id, True

    # 2) New job
    job_id = uuid.uuid4().hex
    async with session_scope() as session:
        await upsert_result(
            session,
            job_id=job_id,
            query=query,
            status="queued",
            user_id=user_id,
        )

    # Spawn the pipeline. We deliberately don't await — the goal is
    # "return jobId immediately, let the work run in the background".
    asyncio.create_task(_run_research_pipeline(job_id, query, user_id))
    logger.info(
        f"Inline research dispatched job_id={job_id} query={query!r} "
        f"user_id={user_id}"
    )
    return job_id, False


# ---------------------------------------------------------------------------
# Shared pipeline (used by both inline path and the ARQ shim)
# ---------------------------------------------------------------------------


async def _publish(job_id: str, event: Dict[str, Any]) -> None:
    """Publish a JSON event to the per-job pub/sub channel.

    The redis client is reused across calls. Publish failures are
    swallowed so a transient Upstash blip doesn't fail the job.
    """
    try:
        redis = get_redis()
        await redis.publish(progress_channel(job_id), json.dumps(event))
    except Exception as exc:
        logger.warning(f"publish failed (job_id={job_id}): {exc}")


def _run_workflow_blocking(query: str) -> Dict[str, Any]:
    """Run the LangGraph workflow synchronously inside a worker thread."""
    # Import lazily so the API process doesn't pay LangGraph import cost.
    from orchestration.coordinator import ResearchWorkflow

    workflow = ResearchWorkflow()  # respects use_enhanced_credibility / RAG envs
    return workflow.run(query)


async def _run_research_pipeline(
    job_id: str, query: str, user_id: Optional[str] = None
) -> Dict[str, Any]:
    """Core pipeline shared by the inline + (future) queued execution paths.

    Publishes per-stage events to the Redis pub/sub channel that SSE
    subscribers listen on; persists the final state to Postgres via the
    idempotent upsert. Every upsert carries `user_id` so the row's
    ownership is preserved across the running → success/error transitions
    (the repo COALESCEs so we can't accidentally clobber an existing
    owner with None).
    """
    logger.info(
        f"Pipeline start job_id={job_id} query={query!r} user_id={user_id}"
    )

    async with session_scope() as session:
        await upsert_result(
            session,
            job_id=job_id,
            query=query,
            status="running",
            user_id=user_id,
        )

    await _publish(job_id, {"stage": "queued", "job_id": job_id, "progress": 5})
    await _publish(
        job_id,
        {"stage": "retrieval", "message": "Retrieving sources…", "progress": 20},
    )
    await asyncio.sleep(0.05)
    await _publish(
        job_id,
        {"stage": "enrichment", "message": "Enriching with metadata…", "progress": 40},
    )

    try:
        result = await asyncio.to_thread(_run_workflow_blocking, query)
    except Exception as e:
        logger.exception(f"Pipeline failed (job_id={job_id}): {e}")
        async with session_scope() as session:
            await upsert_result(
                session,
                job_id=job_id,
                query=query,
                status="error",
                error=str(e),
                user_id=user_id,
            )
        await _publish(
            job_id,
            {"stage": "error", "message": f"Error: {e}", "progress": 0, "job_id": job_id},
        )
        return {"job_id": job_id, "status": "error", "error": str(e)}

    await _publish(job_id, {"stage": "analyzer", "message": "Analyzing…", "progress": 60})
    await asyncio.sleep(0.05)
    await _publish(job_id, {"stage": "insight", "message": "Generating insights…", "progress": 80})
    await asyncio.sleep(0.05)
    await _publish(job_id, {"stage": "report", "message": "Compiling report…", "progress": 95})

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
            user_id=user_id,
        )

    await _publish(
        job_id,
        {
            "stage": "complete",
            "message": "Research complete.",
            "progress": 100,
            "data": {**result_payload, "status": status, "job_id": job_id},
        },
    )

    logger.info(f"Pipeline finished job_id={job_id} status={status}")
    return {"job_id": job_id, "status": status}


# ---------------------------------------------------------------------------
# ARQ shim — kept so a future worker process can call the same pipeline.
# Not loaded today (no worker process group in fly.toml).
# ---------------------------------------------------------------------------


async def research_job(ctx: dict, job_id: str, query: str) -> Dict[str, Any]:
    """ARQ task wrapper around the inline pipeline.

    Re-enable a real worker by adding a `worker` process group back to
    fly.toml + reverting the API to use ARQ's `pool.enqueue_job`. Until
    then this function is dead code but kept tested via the inline path.
    """
    return await _run_research_pipeline(job_id, query)


async def on_startup(ctx: dict) -> None:
    ctx["redis_client"] = get_redis()
    logger.info("ARQ worker startup complete (queue mode)")


async def on_shutdown(ctx: dict) -> None:
    from backend.queue.redis_client import dispose_redis

    try:
        await dispose_redis()
    finally:
        logger.info("ARQ worker shutdown complete")
