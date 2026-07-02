"""In-process research workflow for local MCP usage."""

from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Any


def _ensure_repo_on_path() -> None:
    """Add repo root so orchestration/agents imports resolve."""
    repo_root = Path(__file__).resolve().parents[2]
    root = str(repo_root)
    if root not in sys.path:
        sys.path.insert(0, root)


def run_local_research(query: str) -> dict[str, Any]:
    """Execute the LangGraph pipeline in-process (requires .env API keys)."""
    _ensure_repo_on_path()

    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parents[2] / ".env")

    if not os.getenv("OPEN_ROUTER_KEY"):
        raise RuntimeError(
            "OPEN_ROUTER_KEY is not set. Add it to .env at the repo root "
            "or use CHRONICLE_MODE=remote to call the hosted API."
        )

    from orchestration.coordinator import ResearchWorkflow

    workflow = ResearchWorkflow()
    result = workflow.run(query)
    return {
        "sources": result.get("sources", {}),
        "analysis": result.get("analysis", {}),
        "insights": result.get("insights", {}),
        "credibility": result.get("credibility", {}),
        "report": result.get("report", ""),
        "status": "success" if not result.get("error") else "error",
        "error": result.get("error", ""),
        "conversation": result.get("conversation"),
    }
