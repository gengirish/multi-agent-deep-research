# Chronicle MCP Server

Run cited market research from **Cursor**, **Claude Desktop**, or any MCP host — without leaving your IDE.

## Install

From the repo root:

```bash
pip install -e mcp/
```

For in-process local runs (uses your `.env` keys):

```bash
pip install -e "mcp/[local]"
```

## Cursor setup

Add to `.cursor/mcp.json` (or merge into your global MCP config):

```json
{
  "mcpServers": {
    "chronicle": {
      "command": "python",
      "args": ["-m", "chronicle_mcp"],
      "env": {
        "CHRONICLE_API_URL": "https://multi-agent-deep-research-api.fly.dev"
      }
    }
  }
}
```

Restart Cursor. You should see **chronicle** under MCP tools.

## Claude Desktop setup

`~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "chronicle": {
      "command": "python",
      "args": ["-m", "chronicle_mcp"],
      "env": {
        "CHRONICLE_API_URL": "https://multi-agent-deep-research-api.fly.dev"
      }
    }
  }
}
```

## Tools

| Tool | Description |
|------|-------------|
| `research_market` | Run full multi-agent research on a query (~30–90s) |
| `get_research_job` | Fetch a job by ID |
| `export_research_markdown` | Export completed job as markdown |
| `list_starter_queries` | Founder-style example queries |
| `chronicle_health` | API connectivity check |

## Example prompts (in Cursor)

- "Use Chronicle to research TAM for AI coding assistants in 2025"
- "Run research_market on the vertical SaaS healthcare market size"
- "Get me a cited competitive landscape for AI legal research tools"

## Environment

| Variable | Default | Purpose |
|----------|---------|---------|
| `CHRONICLE_MODE` | `remote` | `remote` = hosted API; `local` = in-process LangGraph |
| `CHRONICLE_API_URL` | Fly.io production URL | Backend base URL |
| `OPEN_ROUTER_KEY` | — | Required for `local` mode |
| `PORT` | — | If set, runs MCP over HTTP instead of stdio |

## HTTP transport (optional)

```bash
PORT=8787 python -m chronicle_mcp
```

Connect MCP clients that support remote HTTP servers to `http://localhost:8787`.
