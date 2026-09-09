"""
Chronicle MCP Server

Exposes multi-agent market research to Cursor, Claude Desktop, and any MCP host.

Usage (stdio — default for Cursor / Claude Desktop):
    pip install -e mcp/
    python -m chronicle_mcp

Usage (HTTP — remote MCP):
    PORT=8787 python -m chronicle_mcp
"""

from __future__ import annotations

import json
import os
import re
from typing import Annotated, Any, Literal, Optional

from fastmcp import FastMCP
from pydantic import Field

from chronicle_mcp import __version__
from chronicle_mcp.api import (
    broadcast,
    broadcast_newsletter,
    DEFAULT_API_URL,
    ChronicleAPIError,
    create_job,
    demo_queries,
    export_markdown,
    get_job,
    health,
    research_sync,
    wait_for_job,
)
from chronicle_mcp.local import run_local_research

FOUNDER_STARTER_QUERIES = [
    "Market size for AI coding assistants — TAM, SAM, SOM 2025",
    "How big is the vertical SaaS market for healthcare?",
    "TAM and growth rate for AI customer support automation",
    "Market size of the creator economy and key segments",
    "Competitive landscape for AI legal research tools 2025",
    "Regulatory requirements for AI in healthcare diagnostics US EU",
]

mcp = FastMCP(
    name="chronicle",
    instructions=(
        "Chronicle is a multi-agent research copilot for founders. "
        "Use research_market for cited TAM/SAM/SOM reports with source credibility "
        "scores and surfaced contradictions. Prefer founder-style market-sizing queries. "
        "Results include a markdown report ready to paste into decks or YC applications."
    ),
    version=__version__,
)


def _mode() -> Literal["remote", "local"]:
    return "local" if os.getenv("CHRONICLE_MODE", "remote").lower() == "local" else "remote"


def _api_url() -> str:
    return os.getenv("CHRONICLE_API_URL", DEFAULT_API_URL).rstrip("/")


def _format_result(payload: dict[str, Any], *, job_id: Optional[str] = None) -> str:
    """Return a concise text block for the MCP host."""
    report = payload.get("report") or ""
    status = payload.get("status", "unknown")
    error = payload.get("error") or ""

    credibility = payload.get("credibility") or {}
    analysis = payload.get("analysis") or {}

    lines = [
        f"Status: {status}",
    ]
    if job_id:
        lines.append(f"Job ID: {job_id}")
        lines.append(f"Share: https://deep-research.intelliforge.tech/history/{job_id}")
    if error:
        lines.append(f"Error: {error}")

    if credibility:
        avg = credibility.get("average_score") or credibility.get("overall_average")
        if avg is not None:
            lines.append(f"Average source credibility: {avg}")

    contradictions = analysis.get("contradictions") or []
    if contradictions:
        lines.append(f"Contradictions flagged: {len(contradictions)}")

    lines.extend(["", "--- Report ---", "", report or "(no report generated)"])
    return "\n".join(lines)



DEDUPE_KEY_RE = re.compile(r"^[a-z0-9:_-]{3,64}$")


def _app_url() -> str:
    """Public origin of the Chronicle web app (owns the newsletter + mail)."""
    return os.getenv(
        "CHRONICLE_APP_URL", "https://deep-research.intelliforge.tech"
    ).rstrip("/")


@mcp.tool(
    tags={"research"},
    annotations={"readOnlyHint": False, "destructiveHint": False},
)
def research_market(
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
                "If true, enqueue a background job and poll until complete. "
                "If false (default), run synchronously."
            ),
        ),
    ] = False,
) -> str:
    """
    Run Chronicle's five-agent research pipeline on a market-sizing or founder research query.

    Returns a cited markdown report with credibility scores and surfaced contradictions.
    Typical runtime: 30–90 seconds.
    """
    if _mode() == "local":
        try:
            result = run_local_research(query)
        except Exception as exc:
            return f"Local research failed: {exc}"
        return _format_result(result)

    base = _api_url()
    try:
        if async_mode:
            job = create_job(base, query)
            job_id = job["job_id"]
            if job.get("cache_hit"):
                row = get_job(base, job_id)
            else:
                row = wait_for_job(base, job_id)
            payload = {
                "report": (row.get("result") or {}).get("report", ""),
                "status": row.get("status"),
                "error": row.get("error"),
                "credibility": (row.get("result") or {}).get("credibility", {}),
                "analysis": (row.get("result") or {}).get("analysis", {}),
            }
            return _format_result(payload, job_id=job_id)

        result = research_sync(base, query)
        return _format_result(result)
    except ChronicleAPIError as exc:
        return f"Chronicle API error: {exc}"


@mcp.tool(
    tags={"research"},
    annotations={"readOnlyHint": True},
)
def get_research_job(
    job_id: Annotated[
        str,
        Field(description="Job ID returned by research_market (async_mode=true)"),
    ],
) -> str:
    """Fetch the status and report for a previously submitted research job."""
    if _mode() == "local":
        return "Job lookup requires CHRONICLE_MODE=remote (hosted API with persistence)."

    try:
        row = get_job(_api_url(), job_id)
    except ChronicleAPIError as exc:
        return f"Chronicle API error: {exc}"

    payload = {
        "report": (row.get("result") or {}).get("report", ""),
        "status": row.get("status"),
        "error": row.get("error"),
        "credibility": (row.get("result") or {}).get("credibility", {}),
        "analysis": (row.get("result") or {}).get("analysis", {}),
    }
    return _format_result(payload, job_id=job_id)


@mcp.tool(
    tags={"research"},
    annotations={"readOnlyHint": True},
)
def export_research_markdown(
    job_id: Annotated[str, Field(description="Job ID to export as downloadable markdown")],
) -> str:
    """Export a completed research job as full markdown (query, metadata, report body)."""
    if _mode() == "local":
        return "Export requires CHRONICLE_MODE=remote (hosted API with persistence)."

    try:
        return export_markdown(_api_url(), job_id)
    except ChronicleAPIError as exc:
        return f"Export failed: {exc}"


@mcp.tool(
    tags={"research"},
    annotations={"readOnlyHint": True},
)
def list_starter_queries() -> str:
    """Return founder-style starter queries for market sizing and competitive research."""
    if _mode() == "remote":
        try:
            remote = demo_queries(_api_url())
            queries = remote if remote else FOUNDER_STARTER_QUERIES
        except ChronicleAPIError:
            queries = FOUNDER_STARTER_QUERIES
    else:
        queries = FOUNDER_STARTER_QUERIES

    return json.dumps({"queries": queries}, indent=2)



@mcp.tool(
    tags={"newsletter"},
    annotations={"readOnlyHint": False, "destructiveHint": True},
)
def broadcast_briefing(
    job_id: str,
    note: str = "",
    confirm: bool = False,
) -> str:
    """Email a finished research briefing to the Chronicle newsletter list.

    THIS SENDS REAL EMAIL TO REAL PEOPLE AND CANNOT BE UNDONE.

    Always call once with confirm=false first and show the caller how many
    subscribers would receive it. Only call with confirm=true when the user has
    asked for this specific report to go out — never to "finish" a task on your
    own initiative.

    Each report can be broadcast once, ever; a second attempt returns
    already_broadcast and sends nothing, so a retried run is safe.
    """
    job_id = (job_id or "").strip()
    if not job_id:
        return json.dumps(
            {"ok": False, "error": "invalid", "message": "job_id is required."},
            indent=2,
        )

    # Sending is owned by the Next.js app (subscriber list, template, AgentMail
    # credentials). Local mode has no route to it.
    if _mode() == "local":
        return json.dumps(
            {
                "ok": False,
                "error": "unavailable",
                "message": (
                    "Broadcasting requires remote mode — the subscriber list "
                    "and mail credentials live in the Chronicle web app."
                ),
            },
            indent=2,
        )

    try:
        result = broadcast(_app_url(), job_id, note.strip(), dry_run=not confirm)
    except ChronicleAPIError as exc:
        return json.dumps(
            {"ok": False, "error": "request_failed", "message": str(exc)[:300]},
            indent=2,
        )

    if not confirm and result.get("ok"):
        result["sent"] = False
        result["next_step"] = (
            "Nothing was sent. Report the recipient count to the user and ask "
            "them to confirm before calling again with confirm=true."
        )
    return json.dumps(result, indent=2)


@mcp.tool(
    tags={"newsletter"},
    annotations={"readOnlyHint": False, "destructiveHint": True},
)
def broadcast_custom_briefing(
    subject: str,
    html: str,
    dedupe_key: str,
    text: str = "",
    segment: str = "",
    confirm: bool = False,
) -> str:
    """Email an arbitrary, externally-composed briefing (e.g. the daily
    IntelliForge Morning Briefing) to the Chronicle newsletter list.

    THIS SENDS REAL EMAIL TO REAL PEOPLE AND CANNOT BE UNDONE.

    Always call once with confirm=false first and report the recipient count
    to the user before sending.

    Each dedupe_key can be broadcast once per audience, ever; a repeat returns
    already_broadcast and sends nothing, so a retried scheduled run is safe.
    """
    subject = (subject or "").strip()
    html = (html or "").strip()
    dedupe_key = (dedupe_key or "").strip()

    if not subject:
        return json.dumps(
            {"ok": False, "error": "invalid", "message": "subject is required."},
            indent=2,
        )
    if not html:
        return json.dumps(
            {"ok": False, "error": "invalid", "message": "html is required."},
            indent=2,
        )
    if not DEDUPE_KEY_RE.match(dedupe_key):
        return json.dumps(
            {
                "ok": False,
                "error": "invalid",
                "message": (
                    "dedupe_key must be 3-64 chars of a-z, 0-9, ':', '_' or '-'."
                ),
            },
            indent=2,
        )

    # Sending is owned by the Next.js app (subscriber list, unsubscribe links,
    # AgentMail credentials). Local mode has no route to it.
    if _mode() == "local":
        return json.dumps(
            {
                "ok": False,
                "error": "unavailable",
                "message": (
                    "Broadcasting requires remote mode — the subscriber list "
                    "and mail credentials live in the Chronicle web app."
                ),
            },
            indent=2,
        )

    try:
        result = broadcast_newsletter(
            _app_url(),
            subject,
            html,
            (text or "").strip(),
            (segment or "").strip(),
            dedupe_key,
            dry_run=not confirm,
        )
    except ChronicleAPIError as exc:
        return json.dumps(
            {"ok": False, "error": "request_failed", "message": str(exc)[:300]},
            indent=2,
        )

    if not confirm and result.get("ok"):
        result["sent"] = False
        result["next_step"] = (
            "Nothing was sent. Report the recipient count to the user and ask "
            "them to confirm before calling again with confirm=true."
        )
    return json.dumps(result, indent=2)


@mcp.tool(
    tags={"meta"},
    annotations={"readOnlyHint": True},
)
def chronicle_health() -> str:
    """Check connectivity to the Chronicle API (remote mode only)."""
    if _mode() == "local":
        return json.dumps(
            {
                "mode": "local",
                "status": "ok",
                "message": "Local mode — research runs in-process with repo .env keys",
            },
            indent=2,
        )

    try:
        data = health(_api_url())
        data["mode"] = "remote"
        data["api_url"] = _api_url()
        return json.dumps(data, indent=2)
    except ChronicleAPIError as exc:
        return json.dumps({"mode": "remote", "status": "error", "message": str(exc)}, indent=2)


@mcp.resource("chronicle://docs/overview")
def overview_doc() -> str:
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
- `chronicle_health` — API connectivity check

## Environment

- `CHRONICLE_MODE` — `remote` (default) or `local`
- `CHRONICLE_API_URL` — API base URL (default: Fly.io production)
- `OPEN_ROUTER_KEY` — required for local mode

Live demo: https://deep-research.intelliforge.tech
"""


def main() -> None:
    port = os.getenv("PORT")
    if port:
        mcp.run(transport="http", host="0.0.0.0", port=int(port))
    else:
        mcp.run()


if __name__ == "__main__":
    main()
