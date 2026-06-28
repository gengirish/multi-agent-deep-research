"""
FastAPI Backend Server
Multi-Agent AI Deep Researcher API
"""

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
import sys
import os
import json
import uuid
import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

# Add parent directory to path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from orchestration.coordinator import ResearchWorkflow
from utils.agent_logger import get_agent_logger
from backend.auth.jwt_dependency import optional_session, SessionUser
from backend.db import (
    dispose_engine,
    get_by_id,
    init_db,
    list_recent,
    session_scope,
    upsert_result,
)
from backend.db.models import ResearchResult
from backend.queue.redis_client import (
    dispose_redis,
    get_redis,
    progress_channel,
)
from backend.queue.tasks import enqueue_research

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan event handler for startup and shutdown."""
    # Startup
    logger.info("FastAPI app starting up...")
    try:
        await init_db()
    except Exception as e:
        # Don't crash the server if the DB is briefly unavailable on cold
        # start — health check + research endpoint will surface errors with
        # context. This also keeps `python backend/main.py` usable for
        # smoke-testing without Neon configured.
        logger.error(f"DB init failed at startup (continuing without it): {e}")
    logger.info("App is ready to accept requests")
    # Workflow stays lazy so cold starts don't pay the LangGraph cost.
    yield
    logger.info("FastAPI app shutting down...")
    try:
        await dispose_engine()
    except Exception as e:
        logger.warning(f"DB engine dispose error (ignored): {e}")
    try:
        await dispose_redis()
    except Exception as e:
        logger.warning(f"Redis client dispose error (ignored): {e}")

# Initialize FastAPI app with lifespan
app = FastAPI(
    title="Multi-Agent AI Deep Researcher API",
    description="API for multi-agent research system",
    version="1.0.0",
    lifespan=lifespan
)

# Enable CORS for React frontend
# Get allowed origins from environment or use defaults
allowed_origins_str = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173,http://127.0.0.1:3000"
)
# Split and strip whitespace and trailing slashes from each origin
allowed_origins = [origin.strip().rstrip('/') for origin in allowed_origins_str.split(",") if origin.strip()]

# Add Vercel production URL if provided
vercel_url = os.getenv("VERCEL_URL")
if vercel_url:
    vercel_url = vercel_url.strip()
    allowed_origins.append(f"https://{vercel_url}")
    allowed_origins.append(f"http://{vercel_url}")

# Log allowed origins for debugging
logger.info(f"CORS allowed origins: {allowed_origins}")

# Configure CORS middleware
# Use allow_origin_regex to handle all Vercel preview and production deployments
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=r"https://.*\.vercel\.app",  # Matches all Vercel deployments
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Initialize workflow lazily to prevent crashes on startup
# Workflow will be initialized on first use
_workflow_instance = None

def get_workflow(use_enhanced_credibility: bool = False, enable_rag: bool = False):
    """Get or create workflow instance (lazy initialization).
    
    Args:
        use_enhanced_credibility: Use multi-dimensional credibility scoring
        enable_rag: Enable RAG for semantic search
    """
    global _workflow_instance
    if _workflow_instance is None:
        try:
            _workflow_instance = ResearchWorkflow(
                use_enhanced_credibility=use_enhanced_credibility,
                enable_rag=enable_rag
            )
        except Exception as e:
            logger.error(f"Failed to initialize workflow: {e}")
            raise
    return _workflow_instance

# Request/Response models
class ResearchRequest(BaseModel):
    query: str

class ResearchResponse(BaseModel):
    sources: Dict[str, Any]
    analysis: Dict[str, Any]
    insights: Dict[str, Any]
    credibility: Dict[str, Any]  # Source credibility assessments
    report: str
    status: str
    error: Optional[str] = None
    conversation: Optional[Dict[str, Any]] = None  # Agent conversation log

class HealthResponse(BaseModel):
    status: str
    message: str

class ConversationListItem(BaseModel):
    id: str
    timestamp: str
    query: Optional[str] = None
    file_name: str
    file_size: int

class ConversationDetail(BaseModel):
    id: str
    data: Dict[str, Any]

# Helper function to get log directory
def get_log_dir() -> Path:
    """Get the agent conversation log directory."""
    return Path(os.getenv("AGENT_LOG_DIR", "logs/agent_conversations"))

# Health check endpoint
@app.get("/api/health", response_model=HealthResponse)
async def health():
    """Health check endpoint"""
    return HealthResponse(status="ok", message="API is running")

# Demo queries endpoint
@app.get("/api/demo-queries")
async def demo_queries():
    """Return pre-cached demo queries"""
    return {
        "queries": [
            "Latest developments in quantum computing 2024",
            "Current state of AI safety research and regulations",
            "Emerging climate technology solutions 2024"
        ]
    }

def _new_job_id() -> str:
    """UUID4 hex job_id used as the Postgres primary key."""
    return uuid.uuid4().hex


async def _persist_result(
    *,
    job_id: str,
    query: str,
    status: str,
    result_payload: Optional[Dict[str, Any]] = None,
    conversation_payload: Optional[Dict[str, Any]] = None,
    error: Optional[str] = None,
    user_id: Optional[str] = None,
) -> None:
    """Idempotent upsert into research_results. Never raises on caller path.

    A failure here means the user still gets their result (returned inline)
    but the row isn't persisted — surfaced via logs rather than HTTP 500.
    """
    try:
        async with session_scope() as session:
            await upsert_result(
                session,
                job_id=job_id,
                query=query,
                status=status,
                result=result_payload,
                conversation=conversation_payload,
                error=error,
                user_id=user_id,
            )
        logger.info(
            f"Persisted research_results row job_id={job_id} "
            f"status={status} user_id={user_id}"
        )
    except Exception as exc:
        logger.exception(f"Failed to persist research_results row job_id={job_id}: {exc}")


def _is_row_visible(
    row: ResearchResult, session: Optional[SessionUser]
) -> bool:
    """Ownership rule for /api/research/jobs/{id} & friends.

    - Anonymous rows (row.user_id IS NULL)            -> visible to anyone.
      Keeps shareable /r/{id} URLs working for the public + the original
      anonymous author.
    - Owned rows                                      -> visible only to
      the owning user. Anonymous viewers and other signed-in users get
      404 (NOT 403 — we don't want to leak existence of someone else's
      row by status-code differentiation).
    """
    if row.user_id is None:
        return True
    if session is None:
        return False
    return row.user_id == session.user_id


# Main research endpoint
@app.post("/api/research", response_model=ResearchResponse)
async def research(
    req: ResearchRequest,
    session: Optional[SessionUser] = Depends(optional_session),
):
    """
    Main research endpoint - processes query through multi-agent workflow.
    Persists result to Postgres (research_results) with idempotent upsert
    keyed by job_id. Tagged with `user_id` when the caller is signed in.
    """
    job_id = _new_job_id()
    user_id = session.user_id if session else None
    logger.info(
        f"Research request received: query={req.query!r} "
        f"job_id={job_id} user_id={user_id}"
    )

    # Mark queued/running immediately so the row exists even if the workflow
    # explodes. updated_at lets us order properly in /api/conversations.
    await _persist_result(
        job_id=job_id, query=req.query, status="running", user_id=user_id
    )

    try:
        result = await asyncio.to_thread(lambda: get_workflow().run(req.query))

        await _persist_result(
            job_id=job_id,
            query=req.query,
            status="success" if not result.get("error") else "error",
            result_payload={
                "sources": result.get("sources", {}),
                "analysis": result.get("analysis", {}),
                "insights": result.get("insights", {}),
                "credibility": result.get("credibility", {}),
                "report": result.get("report", ""),
            },
            conversation_payload=result.get("conversation"),
            error=result.get("error") or None,
            user_id=user_id,
        )

        return ResearchResponse(
            sources=result.get("sources", {}),
            analysis=result.get("analysis", {}),
            insights=result.get("insights", {}),
            credibility=result.get("credibility", {}),
            report=result.get("report", ""),
            status="success" if not result.get("error") else "error",
            error=result.get("error", ""),
            conversation=result.get("conversation"),
        )

    except Exception as e:
        logger.error(f"Research failed (job_id={job_id}): {e}")
        await _persist_result(
            job_id=job_id,
            query=req.query,
            status="error",
            error=str(e),
            user_id=user_id,
        )
        return ResearchResponse(
            sources={},
            analysis={},
            insights={},
            credibility={},
            report=f"Error: {str(e)}",
            status="error",
            error=str(e),
        )

# Streaming endpoint for real-time progress
@app.post("/api/research-stream")
async def research_stream(
    req: ResearchRequest,
    session: Optional[SessionUser] = Depends(optional_session),
):
    """
    Streaming endpoint for real-time progress updates
    Uses Server-Sent Events (SSE). Tags the row with `user_id` when the
    caller is signed in so ownership matches the queue-based path.
    """
    job_id = _new_job_id()
    user_id = session.user_id if session else None
    logger.info(
        f"Streaming research request: query={req.query!r} "
        f"job_id={job_id} user_id={user_id}"
    )
    await _persist_result(
        job_id=job_id, query=req.query, status="running", user_id=user_id
    )

    async def event_generator():
        try:
            # First event surfaces the job_id so the frontend can deep-link
            # to /history/{job_id} and /r/{job_id} once the run completes.
            yield f"data: {json.dumps({'stage': 'queued', 'job_id': job_id, 'progress': 0})}\n\n"
            # Stage 1: Retrieval
            yield f"data: {json.dumps({'stage': 'retrieval', 'message': '🔍 Retrieving sources from web, papers, and news...', 'progress': 20})}\n\n"
            await asyncio.sleep(0.5)
            
            # Stage 2: Enrichment
            yield f"data: {json.dumps({'stage': 'enrichment', 'message': '📊 Enriching sources with metadata and sentiment...', 'progress': 40})}\n\n"
            await asyncio.sleep(0.3)
            
            # Run full workflow in background
            # We'll simulate stages but run the full workflow
            full_result = await asyncio.to_thread(
                lambda: get_workflow().run(req.query)
            )
            
            # Extract results
            retrieval_result = full_result.get("sources", {})
            analysis_result = full_result.get("analysis", {})
            insights_result = full_result.get("insights", {})
            credibility_result = full_result.get("credibility", {})
            report_result = full_result.get("report", "")
            
            # Final result (conversation data is already included in full_result)
            final_result = {
                "sources": retrieval_result,
                "analysis": analysis_result,
                "insights": insights_result,
                "credibility": credibility_result,
                "report": report_result,
                "status": "success",
                "conversation": full_result.get("conversation")
            }
            
            # Attach the job_id to the final event so the frontend can store
            # it for /history/{job_id} navigation + sharing.
            final_result["job_id"] = job_id

            await _persist_result(
                job_id=job_id,
                query=req.query,
                status="success",
                result_payload={
                    "sources": retrieval_result,
                    "analysis": analysis_result,
                    "insights": insights_result,
                    "credibility": credibility_result,
                    "report": report_result,
                },
                conversation_payload=full_result.get("conversation"),
                user_id=user_id,
            )

            yield f"data: {json.dumps({'stage': 'complete', 'message': '✅ Research complete!', 'progress': 100, 'data': final_result})}\n\n"

        except Exception as e:
            logger.error(f"Streaming error (job_id={job_id}): {e}")
            await _persist_result(
                job_id=job_id,
                query=req.query,
                status="error",
                error=str(e),
                user_id=user_id,
            )
            yield f"data: {json.dumps({'stage': 'error', 'message': f'Error: {str(e)}', 'progress': 0, 'job_id': job_id})}\n\n"
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )

# ============================================================
# Queue-based research endpoints (production path)
# ============================================================
#
# Flow:
#   1. POST  /api/research/jobs               -> enqueue ARQ job, return {job_id}
#   2. GET   /api/research/jobs/{id}/stream   -> subscribe to Redis pub/sub channel,
#                                                forward events as SSE
#   3. GET   /api/research/jobs/{id}          -> fetch final row from Postgres
#
# The legacy /api/research and /api/research-stream endpoints stay live
# while the frontend migrates, then can be removed.


class JobCreatedResponse(BaseModel):
    job_id: str
    status: str = "queued"
    cache_hit: bool = False


@app.post("/api/research/jobs", response_model=JobCreatedResponse, status_code=202)
async def create_research_job(
    req: ResearchRequest,
    session: Optional[SessionUser] = Depends(optional_session),
):
    """Dispatch a research job. Returns the job_id immediately.

    If an identical query produced a successful row in the last 24h *for
    this caller* (anonymous or this signed-in user), the existing row's
    job_id is returned (cache_hit=True, status="success") — the frontend's
    SSE subscription will get an immediate completion event replayed from
    Postgres. Saves ~$0.46 in LLM cost per hit.

    Otherwise a new job_id is generated, the work is dispatched
    in-process via asyncio.create_task, and the SSE channel will carry
    live progress.
    """
    try:
        job_id, cache_hit = await enqueue_research(
            req.query, user_id=session.user_id if session else None
        )
    except Exception as e:
        logger.exception(f"Failed to dispatch research job: {e}")
        raise HTTPException(status_code=503, detail="Backend unavailable")
    return JobCreatedResponse(
        job_id=job_id,
        status="success" if cache_hit else "queued",
        cache_hit=cache_hit,
    )


@app.get("/api/research/jobs/{job_id}/stream")
async def stream_research_job(
    job_id: str,
    session: Optional[SessionUser] = Depends(optional_session),
):
    """SSE stream of worker progress for a single job.

    Subscribes to Redis pub/sub channel `chronicle:job:{job_id}` and
    forwards each message to the browser as a `data:` SSE event. Closes
    when a `complete` or `error` event is received.

    Ownership: the row is fetched once up front. If it's owned by a
    different user (i.e. not visible per `_is_row_visible`), we 404 BEFORE
    subscribing — leaking pub/sub events to another user would defeat
    per-row privacy.

    If a stale subscriber rejoins after the worker is already done, we
    immediately replay a single synthetic completion event built from
    the Postgres row so the client doesn't hang forever.
    """
    # Up-front ownership gate. We do the lookup before opening the SSE
    # response so a 404 is a real HTTP status, not an SSE error event.
    try:
        async with session_scope() as db_session:
            row = await get_by_id(db_session, job_id)
    except Exception as exc:
        logger.warning(f"ownership-precheck DB error (job_id={job_id}): {exc}")
        row = None  # fall through; pub/sub may still have a live job

    if row is not None and not _is_row_visible(row, session):
        # 404 (not 403) — don't leak existence of someone else's row.
        raise HTTPException(status_code=404, detail="Job not found")

    channel = progress_channel(job_id)

    async def event_generator():
        # If the job is already finished, replay completion from Postgres
        # and exit. (Prevents reconnect hangs.) Ownership was already
        # validated above; we don't re-check here.
        try:
            async with session_scope() as db_session2:
                row = await get_by_id(db_session2, job_id)
            if row is not None and row.status in ("success", "error"):
                payload = {
                    "stage": "complete" if row.status == "success" else "error",
                    "progress": 100,
                    "data": {
                        **(row.result or {}),
                        "status": row.status,
                        "job_id": row.job_id,
                        "error": row.error or "",
                    },
                }
                yield f"data: {json.dumps(payload)}\n\n"
                return
        except Exception as exc:
            logger.warning(f"replay-from-db skipped (job_id={job_id}): {exc}")

        redis = get_redis()
        pubsub = redis.pubsub()
        try:
            await pubsub.subscribe(channel)
            # heartbeat so reverse proxies don't kill the connection
            last_event = asyncio.get_event_loop().time()
            while True:
                msg = await pubsub.get_message(
                    ignore_subscribe_messages=True, timeout=15.0
                )
                if msg is None:
                    # send a comment line as keep-alive
                    yield ": keepalive\n\n"
                    # safety: if we've been idle for >5 min, bail
                    if asyncio.get_event_loop().time() - last_event > 300:
                        logger.info(
                            f"SSE idle timeout for job_id={job_id}, closing"
                        )
                        return
                    continue

                last_event = asyncio.get_event_loop().time()
                data = msg.get("data")
                if not data:
                    continue
                yield f"data: {data}\n\n"

                # Best-effort parse to detect terminal events
                try:
                    parsed = json.loads(data)
                    if parsed.get("stage") in ("complete", "error"):
                        return
                except (TypeError, ValueError):
                    pass
        except asyncio.CancelledError:
            # client disconnected
            raise
        except Exception as exc:
            logger.exception(f"SSE stream error (job_id={job_id}): {exc}")
            err = json.dumps({"stage": "error", "message": str(exc), "progress": 0})
            yield f"data: {err}\n\n"
        finally:
            try:
                await pubsub.unsubscribe(channel)
                await pubsub.aclose()
            except Exception:
                pass

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/api/research/jobs/{job_id}", response_model=ConversationDetail)
async def get_research_job(
    job_id: str,
    session: Optional[SessionUser] = Depends(optional_session),
):
    """Fetch the final result for a finished job (or its current status).

    Ownership: anonymous rows are public (so /r/{id} shares keep working);
    owned rows are only returned to the owner. Anyone else gets 404
    (NOT 403 — we don't leak existence).
    """
    try:
        async with session_scope() as db_session:
            row = await get_by_id(db_session, job_id)
        if row is None:
            raise HTTPException(status_code=404, detail="Job not found")
        if not _is_row_visible(row, session):
            # Mirrors a not-found response on purpose.
            raise HTTPException(status_code=404, detail="Job not found")
        return ConversationDetail(id=row.job_id, data=row.to_detail())
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Failed to fetch job {job_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch job")


# Conversation history endpoints
@app.get("/api/conversations", response_model=List[ConversationListItem])
async def list_conversations(
    limit: int = 50,
    offset: int = 0,
    session: Optional[SessionUser] = Depends(optional_session),
):
    """
    List saved research conversations.

    Reads from Postgres `research_results` (newest first). Scoped by
    caller: anonymous viewers see only anonymous rows (user_id IS NULL),
    signed-in viewers see only their own rows. This is what keeps an
    anonymous /history view from leaking a signed-in user's research.
    """
    try:
        async with session_scope() as db_session:
            rows = await list_recent(
                db_session,
                limit=limit,
                offset=offset,
                user_id=session.user_id if session else None,
            )
        items = [
            ConversationListItem(**row.to_log_row()) for row in rows
        ]
        logger.info(
            f"Retrieved {len(items)} conversation(s) from Postgres "
            f"(user_id={session.user_id if session else None})"
        )
        return items
    except Exception as e:
        logger.error(f"Failed to list conversations: {e}")
        raise HTTPException(status_code=500, detail="Failed to list conversations")


@app.get("/api/conversations/{conversation_id}", response_model=ConversationDetail)
async def get_conversation(
    conversation_id: str,
    session: Optional[SessionUser] = Depends(optional_session),
):
    """
    Get the full conversation by id (UUID4 hex, the job_id PK).

    Ownership: anonymous rows are public; owned rows are only visible to
    their owner. Anyone else gets 404 (NOT 403 — don't leak existence).
    """
    try:
        async with session_scope() as db_session:
            row = await get_by_id(db_session, conversation_id)

        if row is None:
            logger.warning(f"Conversation not found: {conversation_id}")
            raise HTTPException(status_code=404, detail="Conversation not found")

        if not _is_row_visible(row, session):
            # Mirrors a not-found response on purpose.
            raise HTTPException(status_code=404, detail="Conversation not found")

        detail = row.to_detail()
        logger.info(f"Retrieved conversation: {conversation_id}")
        return ConversationDetail(id=detail["id"], data=detail["data"])

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to read conversation {conversation_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to load conversation")


# Export endpoint
@app.get("/api/export/{conversation_id}/markdown")
async def export_markdown(
    conversation_id: str,
    session: Optional[SessionUser] = Depends(optional_session),
):
    """
    Export the report for a given conversation_id as a Markdown file.
    Reads from Postgres `research_results`.

    Same ownership rule as the detail endpoint: anonymous rows are public,
    owned rows only export to their owner, everyone else gets 404.
    """
    try:
        async with session_scope() as db_session:
            row = await get_by_id(db_session, conversation_id)

        if row is None:
            raise HTTPException(status_code=404, detail="Conversation not found")

        if not _is_row_visible(row, session):
            raise HTTPException(status_code=404, detail="Conversation not found")

        report_content = (row.result or {}).get("report") or "No report available"
        timestamp = row.created_at.isoformat() if row.created_at else "N/A"

        markdown = f"""# Research Report

## Query
{row.query}

## Session ID
{conversation_id}

## Generated On
{timestamp}

---

## Report

{report_content}

---

*Generated by Chronicle — AI research copilot for founders*
"""

        from fastapi.responses import Response

        return Response(
            content=markdown,
            media_type="text/markdown",
            headers={
                "Content-Disposition": f'attachment; filename="research_{conversation_id}.md"'
            },
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to export conversation {conversation_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to export conversation")


# Semantic search endpoint (RAG)
class SearchRequest(BaseModel):
    query: str
    n_results: int = 10
    credibility_threshold: float = 0.6

@app.post("/api/search")
async def semantic_search(req: SearchRequest):
    """
    Semantic search across indexed research sources using RAG.
    Requires RAG to be enabled in workflow.
    """
    try:
        from utils.rag_service import get_rag_service
        rag = get_rag_service()
        
        results = rag.hybrid_search(
            query=req.query,
            n_results=req.n_results,
            credibility_threshold=req.credibility_threshold
        )
        
        return {
            "query": req.query,
            "results": results,
            "total_indexed": rag.get_stats().get("total_documents", 0),
            "status": "success"
        }
    except Exception as e:
        logger.error(f"Semantic search failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Semantic search failed: {str(e)}"
        )


# RAG stats endpoint
@app.get("/api/rag/stats")
async def rag_stats():
    """Get RAG vector store statistics."""
    try:
        from utils.rag_service import get_rag_service
        rag = get_rag_service()
        return rag.get_stats()
    except Exception as e:
        logger.error(f"Failed to get RAG stats: {e}")
        return {"total_documents": 0, "error": str(e)}


# Voice input endpoint (for future Wispr Flow integration)
@app.post("/api/research-voice")
async def research_voice(audio_data: bytes = None):
    """
    Accept voice input and convert to text query.
    Currently a placeholder for future Wispr Flow integration.
    
    In production, this would:
    1. Accept audio data from frontend
    2. Use Wispr Flow API or Web Speech API to convert to text
    3. Return the transcribed query
    """
    logger.info("Voice endpoint called (placeholder)")
    return {
        "message": "Voice endpoint ready for Wispr Flow integration",
        "status": "success",
        "note": "Currently using Web Speech API in frontend. Backend integration pending."
    }


# Root endpoint
@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "name": "Chronicle",
        "tagline": "AI research copilot for founders",
        "version": "2.0.0",
        "storage": "Postgres (Neon)",
        "queue": "ARQ on Upstash Redis",
        "endpoints": {
            "health": "/api/health",
            "demo_queries": "/api/demo-queries",
            # New queue-based research path (preferred)
            "create_job": "POST /api/research/jobs",
            "job_stream": "GET /api/research/jobs/{job_id}/stream",
            "job_result": "GET /api/research/jobs/{job_id}",
            # Legacy in-process research path (kept for backward compat)
            "research_inline": "POST /api/research",
            "research_stream_inline": "POST /api/research-stream",
            "research_voice": "/api/research-voice",
            # History (DB-backed)
            "conversations_list": "/api/conversations",
            "conversation_detail": "/api/conversations/{conversation_id}",
            "export_markdown": "/api/export/{conversation_id}/markdown",
            "semantic_search": "/api/search",
            "rag_stats": "/api/rag/stats",
        },
    }

# Production entrypoint is the ASGI app `app` above.
# Run with: uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}
