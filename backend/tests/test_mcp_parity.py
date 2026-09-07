"""
Guard against drift between Chronicle's two MCP servers.

Chronicle ships the same tool surface twice on purpose:

    mcp/chronicle_mcp/server.py   stdio + local HTTP, proxies the REST API
                                  (Cursor, Claude Desktop)
    backend/mcp_server.py         hosted in-process on FastAPI at /mcp
                                  (claude.ai custom connector)

A host attaching to either one should see an identical set of tools with
identical parameter names. These tests fail the build when someone adds a
tool to one half and forgets the other — the failure mode that would
otherwise show up as "it works in Cursor but not in the connector".

Run:  pytest backend/tests/test_mcp_parity.py
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
for candidate in (REPO_ROOT, REPO_ROOT / "mcp"):
    if str(candidate) not in sys.path:
        sys.path.insert(0, str(candidate))

# Both servers only build when the OAuth config is present; supply throwaway
# values so importing the module under test doesn't depend on deploy secrets.
os.environ.setdefault("CHRONICLE_MCP_ACCESS_KEY", "test-key")
os.environ.setdefault("CHRONICLE_OAUTH_SECRET", "test-signing-secret")

EXPECTED_TOOLS = {
    "research_market",
    "get_research_job",
    "export_research_markdown",
    "broadcast_briefing",
    "list_starter_queries",
    "chronicle_health",
}


async def _tool_map(server) -> dict[str, object]:
    """Name -> Tool for every tool a host would see on this server."""
    return {tool.name: tool for tool in await server.list_tools()}


@pytest.fixture(scope="module")
def hosted_server():
    from backend.mcp_server import build_mcp_server

    return build_mcp_server()


@pytest.fixture(scope="module")
def stdio_server():
    chronicle_mcp_server = pytest.importorskip(
        "chronicle_mcp.server",
        reason="stdio package not installed (pip install -e mcp/)",
    )
    return chronicle_mcp_server.mcp


@pytest.mark.asyncio
async def test_hosted_server_exposes_expected_tools(hosted_server):
    assert set((await _tool_map(hosted_server)).keys()) == EXPECTED_TOOLS


@pytest.mark.asyncio
async def test_tool_names_match_across_servers(hosted_server, stdio_server):
    hosted = set((await _tool_map(hosted_server)).keys())
    stdio = set((await _tool_map(stdio_server)).keys())
    assert hosted == stdio, (
        f"MCP tool surfaces have drifted.\n"
        f"  only hosted (backend/mcp_server.py): {sorted(hosted - stdio)}\n"
        f"  only stdio  (mcp/chronicle_mcp):     {sorted(stdio - hosted)}"
    )


@pytest.mark.asyncio
async def test_tool_parameters_match_across_servers(hosted_server, stdio_server):
    hosted = await _tool_map(hosted_server)
    stdio = await _tool_map(stdio_server)

    mismatches = []
    for name in sorted(set(hosted) & set(stdio)):
        h = set((hosted[name].parameters.get("properties") or {}).keys())
        s = set((stdio[name].parameters.get("properties") or {}).keys())
        if h != s:
            mismatches.append(f"{name}: hosted={sorted(h)} stdio={sorted(s)}")
    assert not mismatches, "Parameter drift:\n  " + "\n  ".join(mismatches)


@pytest.mark.asyncio
async def test_hosted_read_only_tools_are_annotated(hosted_server):
    """Read-only hints let a host skip confirmation prompts for safe tools."""
    tools = await _tool_map(hosted_server)
    for name in ("get_research_job", "export_research_markdown",
                 "list_starter_queries", "chronicle_health"):
        annotations = tools[name].annotations
        assert annotations is not None and annotations.read_only_hint is True, (
            f"{name} should carry readOnlyHint=True"
        )
    # research_market spends LLM credits — it must NOT be marked read-only.
    assert tools["research_market"].annotations.read_only_hint is not True
