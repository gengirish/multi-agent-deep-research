"""
Chronicle MCP server, hosted in-process on the FastAPI app.

This is the *remote* half of Chronicle's MCP story. The package under
`mcp/chronicle_mcp/` is the local stdio half: a thin urllib client that
proxies to the public REST API for Cursor and Claude Desktop. This module
instead runs inside the API process and calls the queue and database layers
directly, which is what makes it viable as a claude.ai custom connector:

  * no loopback HTTP hop back into our own uvicorn worker,
  * async all the way down, so a 90s pipeline run doesn't pin a thread,
  * ownership checks reuse `_is_row_visible`, the same rule the REST
    endpoints enforce, rather than a second copy of that logic.

The two servers expose the **same five tool names with the same signatures**
on purpose — a host should not care which one it attached to.
`backend/tests/test_mcp_parity.py` fails the build if they drift.

Mounted at /mcp by main.py, but only when `oauth_enabled()` — see
`backend/auth/oauth.py` for why this fails closed.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from typing import Annotated, Any, Optional

from pydantic import Field

logger = logging.getLogger(__name__)

# How long research_market will wait for the pipeline before handing back a
# job_id and telling the caller to poll. Kept under the 300s Fly/proxy
# request ceiling: returning a job_id the host can poll beats holding a
# request open until something upstream kills it mid-run.
DEFAULT_WAIT_SEC = 240.0
POLL_INTERVAL_SEC = 2.0

FOUNDER_STARTER_QUERIES = [
    "Market size for AI coding assistants — TAM, SAM, SOM 2025",
    "How big is the vertical SaaS market for healthcare?",
    "TAM and growth rate for AI customer support automation",
    "Market size of the creator economy and key segments",
    "Competitive landscape for AI legal research tools 2025",
    "Regulatory requirements for AI in healthcare diagnostics US EU",
]

SERVER_INSTRUCTIONS = (
    "Chronicle is a multi-agent research copilot for founders. "
    "Use research_market for cited TAM/SAM/SOM reports with source credibility "
    "scores and surfaced contradictions. Prefer founder-style market-sizing "
    "queries. Results include a markdown report ready to paste into decks or "
    "YC applications. Runs take 30-90 seconds; if research_market returns a "
    "job_id with status 'queued', poll get_research_job with that id."
)


def _share_url(job_id: str) -> str:
    base = os.getenv("CHRONICLE_APP_URL", "https://deep-research.intelliforge.tech")
    return f"{base.rstrip('/')}/history/{job_id}"


def _format_result(payload: dict[str, Any], *, job_id: Optional[str] = None) -> str:
    """Render a job payload as the text block the MCP host will show.

    Deliberately identical in shape to `chronicle_mcp.server._format_result`
    so a host sees the same output from either transport.
    """
    report = payload.get("report") or ""
    status = payload.get("status", "unknown")
    error = payload.get("error") or ""
    credibility = payload.get("credibility") or {}
    analysis = payload.get("analysis") or {}

    lines = [f"Status: {status}"]
    if job_id:
        lines.append(f"Job ID: {job_id}")
        lines.append(f"Share: {_share_url(job_id)}")
    if error:
        lines.append(f"Error: {error}")

    avg = credibility.get("average_score") or credibility.get("overall_average")
    if avg is not None:
        lines.append(f"Average source credibility: {avg}")

    contradictions = analysis.get("contradictions") or []
    if contradictions:
        lines.append(f"Contradictions flagged: {len(contradictions)}")

    lines.extend(["", "--- Report ---", "", report or "(no report generated)"])
    return "\n".join(lines)


def _payload_from_row(row: Any) -> dict[str, Any]:
    result = row.result or {}
    return {
        "report": result.get("report", ""),
        "status": row.status,
        "error": row.error or "",
        "credibility": result.get("credibility", {}),
        "analysis": result.get("analysis", {}),
    }


async def _load_row(job_id: str) -> Any:
    """Fetch one job row, or None. Import locally to keep module import cheap."""
    from backend.db import get_by_id, session_scope

    async with session_scope() as db_session:
        return await get_by_id(db_session, job_id)


async def _visible_row(job_id: str) -> tuple[Any, Optional[str]]:
    """Fetch a row subject to the REST layer's ownership rule.

    Returns (row, error_message). Rows owned by a signed-in user are not
    visible to the connector, which authenticates as its own subject — same
    404-not-403 behaviour as the REST endpoints so we don't leak existence.
    """
    from backend.main import _is_row_visible

    row = await _load_row(job_id)
    if row is None:
        return None, f"Job {job_id} not found."
    if not _is_row_visible(row, None):
        return None, f"Job {job_id} not found."
    return row, None


def build_mcp_server():
    """Construct the FastMCP server. Called once at import time by main.py."""
    from fastmcp import FastMCP

    from backend.auth.oauth import MCP_SCOPE  # noqa: F401  (documents the scope)

    mcp = FastMCP(
        name="chronicle",
        instructions=SERVER_INSTRUCTIONS,
        version="1.0.0",
    )

    @mcp.tool(
        tags={"research"},
        annotations={"readOnlyHint": False, "destructiveHint": False},
    )
    async def research_market(
        query: Annotated[
            str,
            Field(
                description=(
                    "Market or research question, e.g. "
                    "'TAM for AI coding assistants 2025' or "
                    "'Competitive landscape for vertical SaaS in healthcare'"
                ),
                min_length=8,
                max_length=500,
            ),
        ],
        async_mode: Annotated[
            bool,
            Field(
                description=(
                    "If true, return the job_id immediately without waiting. "
                    "If false (default), wait for the pipeline to finish."
                ),
            ),
        ] = False,
    ) -> str:
        """
        Run Chronicle's five-agent research pipeline on a market-sizing or
        founder research query.

        Returns a cited markdown report with credibility scores and surfaced
        contradictions. Typical runtime: 30-90 seconds.
        """
        from backend.queue.tasks import enqueue_research

        try:
            job_id, cache_hit = await enqueue_research(query, user_id=None)
        except Exception as exc:
            logger.exception("MCP research_market dispatch failed")
            return f"Failed to dispatch research job: {exc}"

        if async_mode and not cache_hit:
            return (
                f"Status: queued\nJob ID: {job_id}\nShare: {_share_url(job_id)}\n\n"
                f"Research is running. Call get_research_job with this job_id "
                f"in 30-90 seconds to collect the report."
            )

        deadline = asyncio.get_running_loop().time() + DEFAULT_WAIT_SEC
        while asyncio.get_running_loop().time() < deadline:
            row = await _load_row(job_id)
            if row is not None and row.status in ("success", "error", "failed"):
                return _format_result(_payload_from_row(row), job_id=job_id)
            await asyncio.sleep(POLL_INTERVAL_SEC)

        # Timing out is not a failure — the pipeline is still running
        # server-side and the row will land. Hand back the handle.
        return (
            f"Status: still running\nJob ID: {job_id}\nShare: {_share_url(job_id)}\n\n"
            f"The pipeline exceeded the {DEFAULT_WAIT_SEC:.0f}s inline wait but is "
            f"still running. Call get_research_job with this job_id to collect it."
        )

    @mcp.tool(tags={"research"}, annotations={"readOnlyHint": True})
    async def get_research_job(
        job_id: Annotated[
            str,
            Field(description="Job ID returned by research_market (async_mode=true)"),
        ],
    ) -> str:
        """Fetch the status and report for a previously submitted research job."""
        row, error = await _visible_row(job_id)
        if error:
            return error
        return _format_result(_payload_from_row(row), job_id=job_id)

    @mcp.tool(tags={"research"}, annotations={"readOnlyHint": True})
    async def export_research_markdown(
        job_id: Annotated[
            str, Field(description="Job ID to export as downloadable markdown")
        ],
    ) -> str:
        """Export a completed research job as full markdown (query, metadata, report body)."""
        row, error = await _visible_row(job_id)
        if error:
            return error

        report = (row.result or {}).get("report") or "No report available"
        timestamp = row.created_at.isoformat() if row.created_at else "N/A"
        return (
            f"# Research Report\n\n"
            f"## Query\n{row.query}\n\n"
            f"## Session ID\n{job_id}\n\n"
            f"## Generated On\n{timestamp}\n\n"
            f"---\n\n## Report\n\n{report}\n\n"
            f"---\n\n*Generated by Chronicle — AI research copilot for founders*\n"
        )

    @mcp.tool(tags={"research"}, annotations={"readOnlyHint": True})
    async def list_starter_queries() -> str:
        """Return founder-style starter queries for market sizing and competitive research."""
        return json.dumps({"queries": FOUNDER_STARTER_QUERIES}, indent=2)

    @mcp.tool(tags={"meta"}, annotations={"readOnlyHint": True})
    async def chronicle_health() -> str:
        """Check that the Chronicle pipeline and its datastore are reachable."""
        db_ok, db_detail = True, "ok"
        try:
            await _load_row("__health_probe__")
        except Exception as exc:
            db_ok, db_detail = False, str(exc)[:200]

        return json.dumps({
            "mode": "hosted",
            "status": "ok" if db_ok else "degraded",
            "database": db_detail,
            "app_url": os.getenv("CHRONICLE_APP_URL",
                                 "https://deep-research.intelliforge.tech"),
        }, indent=2)

    @mcp.resource("chronicle://docs/overview")
    async def overview_doc() -> str:
        """How Chronicle works — agent pipeline and MCP usage."""
        return """# Chronicle MCP

Chronicle runs founder research through five specialized agents:

1. **Retriever** — Tavily, Perplexity, arXiv (parallel)
2. **Enricher** — metadata, dates, sentiment
3. **Analyzer** — credibility scoring, contradictions
4. **Insight** — hypotheses and trend chains
5. **Report builder** — cited markdown output

## Tools

- `research_market` — run a full research query (primary tool)
- `get_research_job` — fetch a job by ID
- `export_research_markdown` — export job as markdown file content
- `list_starter_queries` — example founder queries
- `chronicle_health` — pipeline and datastore check

Live demo: https://deep-research.intelliforge.tech
"""

    return mcp
