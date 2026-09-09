# Chronicle → Claude Connector: Master Handover Prompt

> **STATUS: COMPLETE as of 2026-09-07.** Steps 1–4 below were executed and
> verified against production; the connector is live at
> `https://multi-agent-deep-research-api.fly.dev/mcp`. Secrets
> (`CHRONICLE_OAUTH_SECRET`, `CHRONICLE_MCP_ACCESS_KEY`) are set on Fly and the
> full OAuth 2.1 + PKCE flow was exercised end to end — see "VERIFICATION
> RESULTS" at the bottom. What remains is step 5 (registering in claude.ai,
> which needs a human at the approval screen) and the cold-start decision in
> step 3. This file is kept as the record of intent and the re-run procedure;
> it is no longer a to-do list.

Paste everything below the line into a fresh Claude Code session opened at the
repo root (`/Users/ghiremath/multi-agent-deep-research`).

---

## ROLE

You are taking over the task of shipping **Chronicle** (this repo, a five-agent
deep-research pipeline) as a **remote MCP connector for the Claude ecosystem** —
usable from claude.ai / Claude Desktop as a custom connector, and from Cursor or
any MCP host over stdio.

The connector code is **already written and committed**. Your job is to get it
**live, authenticated, and verified end-to-end**, not to redesign it. Read the
existing code before changing anything; prefer fixing configuration over
rewriting working modules.

## WHAT ALREADY EXISTS (verified 2026-09-07)

**Backend**: FastAPI on Fly.io — app `multi-agent-deep-research-api`,
region `sin`, config in `fly.toml`, entrypoint `backend/main.py`.
Production `GET /api/health` returns `{"status":"ok"}`.

**MCP server** — `backend/mcp_server.py`, built with FastMCP 4.x via
`build_mcp_server()`, exposed as an ASGI app and mounted at `/mcp` in
`backend/main.py`. Tools:

| Tool | Kind | Purpose |
|---|---|---|
| `research_market(query, async_mode=False)` | write | Runs the five-agent pipeline; 30–90s; returns cited markdown. `async_mode=true` returns a `job_id` immediately. |
| `get_research_job(job_id)` | read-only | Collect a previously dispatched run. |
| `export_research_markdown(job_id)` | read-only | Markdown export of a finished report. |
| `list_starter_queries()` | read-only | Suggested example queries. |
| `chronicle_health()` | read-only | Pipeline/provider health. |

Plus an `overview_doc` MCP resource.

**OAuth 2.1 authorization server** — `backend/auth/oauth.py`, router included
unconditionally in `backend/main.py`. Stateless JWT design (no session store).
Endpoints:

- `GET /.well-known/oauth-protected-resource` and `…/mcp` (RFC 9728)
- `GET /.well-known/oauth-authorization-server` and `…/mcp` (reviRFC 8414)
- `POST /oauth/register` — Dynamic Client Registration (RFC 7591)
- `GET|POST /oauth/authorize` — HTML approval screen; the human proves identity
  by typing the shared `CHRONICLE_MCP_ACCESS_KEY`, compared with
  `hmac.compare_digest` in `_authenticate_resource_owner()`. That function is
  the documented single seam to swap for real multi-user identity.
- `POST /oauth/token` — PKCE S256 code exchange

**Middleware**: `MCPAuthMiddleware` (pure-ASGI RFC 9728 bearer gate wrapping the
mounted MCP app, so `/api/*` auth behaviour is untouched) and
`MCPPathNormalizeMiddleware` (app-level, so bare `/mcp` matches the mount before
Starlette's slash redirect can downgrade the scheme).

**Fail-closed gate**: `oauth_enabled()` returns true only when BOTH a signing
secret (`CHRONICLE_OAUTH_SECRET`, falling back to `JWT_SECRET`) and
`CHRONICLE_MCP_ACCESS_KEY` are set. Without them `/mcp` is never mounted and the
discovery documents answer 503, not 404.

**stdio server** for Cursor/Claude Desktop: `mcp/` package (`chronicle_mcp`),
installed with `pip install -e mcp/`; see `mcp/README.md`.

**Tests**: `backend/tests/test_oauth_mcp.py` (34 integration tests) and
`backend/tests/test_mcp_parity.py` (guards hosted-vs-stdio tool drift).

## CURRENT STATUS — CONNECTOR IS LIVE

Commit `d4e356f` is deployed (Fly machine version 21, region `sin`), and all
three secrets (`JWT_SECRET`, `CHRONICLE_OAUTH_SECRET`, `CHRONICLE_MCP_ACCESS_KEY`)
show `Deployed`, so `oauth_enabled()` is satisfied and `/mcp` is mounted.

Verified by curl against production:

```
GET  /api/health                              → 200
GET  /.well-known/oauth-protected-resource    → 200  correct resource + issuer
GET  /.well-known/oauth-authorization-server  → 200  correct issuer
POST /oauth/register                          → 201  signed JWT client_id
GET  /oauth/authorize  (empty params)         → 400  correctly rejected
GET  /oauth/authorize  (valid PKCE params)    → 200  "Authorize Chronicle" form
POST /oauth/authorize  (wrong access key)     → 401  correctly rejected
GET  /mcp              (no token)             → 401  + WWW-Authenticate:
       Bearer resource_metadata="…/.well-known/oauth-protected-resource",
              scope="chronicle:research"
GET  /mcp              (bogus bearer)         → 401  not 500
```

Everything up to the human approval screen is confirmed working. The only
unverified link is the final leg — submitting the *correct* access key to get an
authorization code, exchanging it at `/oauth/token`, and calling `/mcp` with the
resulting bearer token. That requires the plaintext access key, which lives only
with the repo owner, and is exercised for real the moment claude.ai registers the
connector (task 5 below).

## YOUR TASKS, IN ORDER

1. **Verify locally first.** Run `pytest backend/tests/test_oauth_mcp.py
   backend/tests/test_mcp_parity.py -q`. All must pass before you deploy.

2. **Secrets are already set.** `JWT_SECRET`, `CHRONICLE_OAUTH_SECRET` and
   `CHRONICLE_MCP_ACCESS_KEY` are all `Deployed` on Fly. Do not rotate them
   unless asked. `CHRONICLE_PUBLIC_URL` and `FORWARDED_ALLOW_IPS` live in
   `fly.toml [env]` — do not duplicate them as secrets, and do not change
   `CHRONICLE_PUBLIC_URL` unless the hostname actually changes: claude.ai
   rejects an issuer that does not match the host it dialled.

3. **Redeploy only if code changes.** `flyctl deploy -a multi-agent-deep-research-api`.
   Keep one machine warm (`min_machines_running = 1` — do not scale to zero; a
   cold start drops the ~60s research POST while the run still completes
   server-side). If `/mcp` ever returns 404 again, the mount was skipped: check
   `flyctl logs` for the "Failed to build MCP app" line `backend/main.py` logs
   when `build_mcp_server()` raises, and re-check the two gate secrets.

4. **Verify the live connector surface** with curl before touching claude.ai:
   - both `.well-known` documents return 200 with `issuer` and `resource`
     equal to `https://multi-agent-deep-research-api.fly.dev`
   - `GET /mcp` with no token returns **401** with a `WWW-Authenticate` header
     carrying `resource_metadata=`
   - `GET /mcp` with a bogus bearer token returns 401, not 500
   - `POST /oauth/register` with a JSON client returns 201 and a `client_id`
   - the full PKCE dance (`/oauth/authorize` → code → `/oauth/token`) yields an
     access token, and that token makes `GET /mcp` return 200
   Report the actual status codes you observed. Do not claim success from code
   reading alone.

5. **Register in claude.ai**: Settings → Connectors → Add custom connector →
   URL `https://multi-agent-deep-research-api.fly.dev/mcp`. Claude performs DCR
   and PKCE automatically. Walk the user through the approval screen (they paste
   the access key from step 2). Then have them confirm the tools appear and
   that `list_starter_queries` and `chronicle_health` return.

6. **Long-run guidance**: `research_market` takes 30–90s and the inline wait can
   time out. Document for the user that the correct pattern from claude.ai is
   `async_mode=true` → `get_research_job(job_id)`, and make sure the tool
   descriptions say so clearly enough that Claude picks it on its own.

7. **Document and commit**: update `README.md` and `DEPLOYMENT.md` with the
   connector setup, add the new env vars to `env.example` (names and purpose
   only — never real secret values; they are currently missing there), and
   commit. Never commit a generated `CHRONICLE_MCP_ACCESS_KEY` or
   `CHRONICLE_OAUTH_SECRET`, and never print one into a file the repo tracks.

## CONSTRAINTS

- Fly deploys and secret changes are outward-facing: confirm with the user
  before the first `flyctl deploy` and before any `secrets set`.
- Do not weaken the fail-closed gate, and do not set
  `CHRONICLE_MCP_ALLOW_ANY_HOST` in production without explaining exactly what
  it relaxes and getting the user's explicit go-ahead.
- Keep hosted `/mcp` and stdio `mcp/chronicle_mcp` tool sets in sync — that is
  what `test_mcp_parity.py` exists to enforce. Add a tool to both or neither.
- `/api/*` must keep its current auth-optional behaviour; the bearer gate wraps
  only the mounted MCP app.
- Report failures with the real output. If a step is blocked (e.g. no Fly
  token), finish everything that does not depend on it and say plainly what is
  left and why.

## DEFINITION OF DONE

The user can ask Claude on claude.ai, in a chat with no repo access, a market
research question; Claude calls `research_market` through the connector; and a
cited report with credibility scores comes back. You have personally verified
steps 4's status codes and the tests in step 1 pass.

---

## VERIFICATION RESULTS (2026-09-07, against production)

Observed status codes, not inferred from code.

| Check | Result |
|---|---|
| `POST /oauth/register` (DCR) | **201**, `client_id` issued |
| `POST /oauth/authorize`, wrong access key | **401**, no code issued |
| `POST /oauth/authorize`, correct key | **302**, `state` echoed, code issued |
| `POST /oauth/token`, wrong PKCE verifier | **400** `invalid_grant` |
| `POST /oauth/token`, correct verifier | **200**, Bearer, scope `chronicle:research`, 3600s, refresh token |
| Same authorization code replayed | **400** `invalid_grant` (single-use holds) |
| `GET /mcp` no token | **401** + `WWW-Authenticate: Bearer resource_metadata="…", scope="chronicle:research"` |
| `GET /mcp` bogus bearer | **401**, not 500 |
| `/.well-known/oauth-protected-resource` | **200**, `resource` = `…fly.dev/mcp` |
| `/.well-known/oauth-authorization-server` | **200**, `issuer` = `…fly.dev` |
| `initialize` | `protocolVersion 2025-06-18`, `serverInfo: chronicle 1.0.0` |
| `tools/list` | all five tools present *(six as of 2026-09-07 with `broadcast_briefing`; seven as of 2026-09-09 with `broadcast_custom_briefing`)* |
| `chronicle_health` | `mode: hosted`, `status: ok`, `database: ok` |
| `list_starter_queries` | 6 prompts returned |

Deployed as Fly release **v21**. `fly.toml [env]` carries `CHRONICLE_PUBLIC_URL`
and `FORWARDED_ALLOW_IPS`; neither is duplicated as a secret.

**Not verified:** the claude.ai registration itself (step 5) — it needs a human
to paste the access key at the approval screen.

### Re-verified 2026-09-09, Fly release v31 (`broadcast_custom_briefing`)

| Check | Result |
|---|---|
| Running image | `sha256:7e9f60a6…b98344` — matches the image the deploy built |
| `/api/health` | **200** `{"status":"ok"}` |
| `/.well-known/oauth-protected-resource` | **200**, `resource` = `…fly.dev/mcp` |
| `/.well-known/oauth-authorization-server` | **200**, `issuer` = `…fly.dev` |
| `GET /mcp` no token | **401** + `WWW-Authenticate` carrying `resource_metadata=` |
| `GET /mcp` bogus bearer | **401**, not 500 |
| `POST /oauth/register` (DCR) | **201**, `client_id` issued |
| Tool surface | **seven tools**, `broadcast_custom_briefing` present |

The tool surface was read inside the container rather than over the wire:

```bash
flyctl ssh console -a multi-agent-deep-research-api -C "python -c \"import asyncio; from backend.mcp_server import build_mcp_server; s=build_mcp_server(); print(sorted(t.name for t in asyncio.run(s.list_tools())))\""
```

That answers "does the deployed process register the tool" without needing an
access token; the full PKCE dance still needs a human with the access key, as
above.

**Still unverified:** that Fly's `CHRONICLE_SERVICE_TOKEN` matches Vercel's.
Nothing in this table exercises it — the OAuth checks authenticate the *caller*
to the connector, while the service token authenticates the *connector* to the
frontend. See Phase 4 in [`../DEPLOYMENT.md`](../DEPLOYMENT.md) for the dry run
that settles it.

**On cold start:** `min_machines_running = 1` is already set in `fly.toml`, as
step 3 requires. The ~13s first-request latency observed during verification
was a *restart* (from `flyctl secrets set` and `flyctl deploy`), not an idle
scale-to-zero. The machine is confirmed `started` with checks `1/1 passing`.
