# Chronicle MCP Server

Run cited market research from **Cursor**, **Claude Desktop**, or any MCP host — without leaving your IDE.

> This is the **local stdio** surface. Chronicle also serves a **hosted remote
> connector** for claude.ai at `https://multi-agent-deep-research-api.fly.dev/mcp`,
> which needs no local install — see [`../DEPLOYMENT.md`](../DEPLOYMENT.md) Phase 3.
> Both surfaces expose the same six tools and are kept in sync by
> `backend/tests/test_mcp_parity.py`.

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
| `get_research_job` | Fetch a job by ID — poll this after an `async_mode=true` run |
| `export_research_markdown` | Export completed job as markdown |
| `list_starter_queries` | Founder-style example queries |
| `broadcast_briefing` | Email a finished briefing to the newsletter list |
| `chronicle_health` | API connectivity check |

Because `research_market` takes 30–90s, an inline wait can time out. Ask for
`async_mode=true` and poll `get_research_job(job_id)` instead.

### `broadcast_briefing` sends real email

Every other tool is read-only. This one is annotated `destructiveHint` and mails
a real subscriber list, so it is deliberately awkward to fire by accident:

- Calling it with `confirm=false` (the default) performs a **dry run** — it
  returns the recipient count and sends nothing. Show that count to the user and
  get an explicit go-ahead before calling again with `confirm=true`.
- Each report can be broadcast **once, ever**. A repeat returns
  `already_broadcast` and sends no mail, so a retried run is safe.
- It requires `remote` mode. The subscriber list and mail credentials live in
  the Chronicle web app, so `local` mode has no route to it and returns
  `unavailable`.
- It needs `CHRONICLE_SERVICE_TOKEN` to match the value configured on the web
  app, otherwise the call is rejected 401.

## Example prompts (in Cursor)

- "Use Chronicle to research TAM for AI coding assistants in 2025"
- "Run research_market on the vertical SaaS healthcare market size"
- "Get me a cited competitive landscape for AI legal research tools"

## Environment

| Variable | Default | Purpose |
|----------|---------|---------|
| `CHRONICLE_MODE` | `remote` | `remote` = hosted API; `local` = in-process LangGraph |
| `CHRONICLE_API_URL` | Fly.io production URL | Backend base URL |
| `CHRONICLE_APP_URL` | `https://deep-research.intelliforge.tech` | Next.js app; where `broadcast_briefing` posts |
| `CHRONICLE_SERVICE_TOKEN` | — | Shared secret authorizing `broadcast_briefing`; must match the web app |
| `OPEN_ROUTER_KEY` | — | Required for `local` mode |
| `PORT` | — | If set, runs MCP over HTTP instead of stdio |

## HTTP transport (optional)

```bash
PORT=8787 python -m chronicle_mcp
```

Connect MCP clients that support remote HTTP servers to `http://localhost:8787`.
