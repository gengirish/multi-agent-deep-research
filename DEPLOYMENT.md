# Deployment Guide

This guide covers deploying the Multi-Agent AI Deep Researcher to production.

- **Frontend (React + Vite)** → **Vercel**
- **Backend (FastAPI)** → any container host (Fly.io, Render, Cloud Run, ECS, etc.)

The backend has no platform-specific coupling. Anything that can run a Python ASGI app on a configurable `$PORT` will work.

---

## Architecture

```
┌──────────────────────┐        HTTPS         ┌────────────────────────┐
│  Vercel (frontend)   │ ───────────────────▶ │  Container backend     │
│  React + Vite        │                      │  FastAPI / uvicorn     │
│  VITE_API_URL ──────▶│                      │  PORT, ALLOWED_ORIGINS │
└──────────────────────┘                      └────────────────────────┘
```

---

## Prerequisites

1. Code pushed to GitHub
2. Vercel account (https://vercel.com)
3. A backend host of your choice (Fly.io setup is tracked separately)
4. API keys: `OPEN_ROUTER_KEY`, `TAVILY_API_KEY` (optional)

---

## Phase 1: Backend (container-based host)

### 1. Local container build (sanity check)

```bash
docker compose up --build backend
curl http://localhost:8000/api/health
# → {"status":"ok","message":"API is running"}
```

### 2. Required environment variables

| Variable          | Purpose                                  | Example                                    |
| ----------------- | ---------------------------------------- | ------------------------------------------ |
| `OPEN_ROUTER_KEY` | LLM access via OpenRouter                | `sk-or-...`                                |
| `TAVILY_API_KEY`  | Web search (optional)                    | `tvly-...`                                 |
| `PORT`            | Server port (host usually injects)       | `8000`                                     |
| `ALLOWED_ORIGINS` | Comma-separated CORS allowlist           | `https://your-app.vercel.app`              |
| `ENVIRONMENT`     | Free-form environment label              | `production`                               |

`backend/main.py` already accepts `ALLOWED_ORIGINS`, automatically appends any `https://*.vercel.app` previews via regex, and binds to whatever `$PORT` the host provides.

### 3. Start command

```
uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}
```

(Working directory: `backend/`. Most hosts derive this from a `Dockerfile` or build config.)

### 4. Health check

```bash
curl https://<your-backend-host>/api/health
```

Save the resulting URL — the frontend needs it.

---

## Phase 2: Frontend → Vercel

### 1. Import the project

1. https://vercel.com → **Add New Project**
2. Select your GitHub repo
3. Vercel auto-detects Vite

### 2. Build configuration

| Setting          | Value           |
| ---------------- | --------------- |
| Framework Preset | Vite            |
| Root Directory   | `frontend`      |
| Build Command    | `npm run build` |
| Output Directory | `dist`          |
| Install Command  | `npm install`   |

### 3. Environment variables

```
VITE_API_URL=https://<your-backend-host>
NEXT_PUBLIC_API_URL=https://<your-backend-host>
NEXT_PUBLIC_APP_URL=https://<your-frontend-host>
DATABASE_URL=<postgres connection string>
JWT_SECRET=<shared secret with the backend>
AGENTMAIL_API_KEY=<for transactional + broadcast email>
AGENTMAIL_FROM_EMAIL=briefing@yourdomain.com
NEWSLETTER_ADMIN_EMAILS=you@example.com
```

> **`NEWSLETTER_ADMIN_EMAILS` is a security control, not a convenience.**
> When unset, `isNewsletterAdmin()` in `frontend/src/lib/subscribers.ts`
> returns `true` for *every* authenticated user, so anyone who can sign in can
> read the subscriber list (PII) and broadcast to it. The open default is
> intended for a single-operator deployment. Set it before publicising signup
> links. Vercel injects env vars at **build** time, so a change only takes
> effect after a redeploy.

`NEXT_PUBLIC_APP_URL` is also what email footers use to build the subscribe
CTA (`${NEXT_PUBLIC_APP_URL}/#newsletter`) and per-recipient unsubscribe links.

### 4. Deploy

Vercel will build and deploy. Note the production URL (e.g. `https://your-app.vercel.app`).

### 5. Tighten backend CORS

Update `ALLOWED_ORIGINS` on the backend host to include your real Vercel URL:

```
ALLOWED_ORIGINS=https://your-app.vercel.app
```

(`*.vercel.app` previews are already allowed via regex in `main.py`.)

---

## Phase 3: claude.ai remote connector (optional)

Chronicle exposes a hosted MCP endpoint at `/mcp`, guarded by an OAuth 2.1
authorization server (`backend/auth/oauth.py`). Registering it as a claude.ai
custom connector lets Claude run cited market research directly.

### 1. The gate fails closed

`/mcp` is only mounted when **both** are true (`oauth_enabled()`):

| Requirement | Env var |
|---|---|
| Signing secret | `CHRONICLE_OAUTH_SECRET`, falling back to `JWT_SECRET` |
| Shared access key | `CHRONICLE_MCP_ACCESS_KEY` (no fallback) |

With either missing the app logs `MCP endpoint disabled …` and mounts nothing,
so `/mcp` returns **404**. That is deliberate — it avoids publishing an
unauthenticated tool that spends LLM credits. A 404 here means "not
configured", not "broken".

Prefer setting a dedicated `CHRONICLE_OAUTH_SECRET` over relying on the
`JWT_SECRET` fallback: otherwise connector tokens and user session tokens
share one signing key, so a single leak forges both.

### 2. Set the secrets

```bash
flyctl secrets set -a multi-agent-deep-research-api \
  CHRONICLE_OAUTH_SECRET="$(openssl rand -hex 32)" \
  CHRONICLE_MCP_ACCESS_KEY="$(openssl rand -hex 24)"
```

`flyctl secrets set` restarts the machine, so no separate deploy is needed.
Record the access key — a human types it into the approval screen. Never
commit either value.

`CHRONICLE_PUBLIC_URL` and `FORWARDED_ALLOW_IPS` are already in `fly.toml
[env]`; do not duplicate them as secrets. `FORWARDED_ALLOW_IPS` matters
because Fly terminates TLS upstream — without it Uvicorn reports
`scheme="http"` and that wrong scheme leaks into the advertised issuer.

### 3. Verify before touching claude.ai

```bash
B=https://multi-agent-deep-research-api.fly.dev
curl -s -o /dev/null -w "%{http_code}\n" $B/mcp                 # 401, not 404
curl -si $B/mcp | grep -i www-authenticate                       # resource_metadata=
curl -s $B/.well-known/oauth-protected-resource                   # 200
curl -s $B/.well-known/oauth-authorization-server                 # 200, issuer matches host
```

A `401` carrying `WWW-Authenticate: Bearer resource_metadata="…"` is the
correct unauthenticated response. The `issuer` must equal the hostname the
connector dials or claude.ai rejects registration.

### 4. Register

claude.ai → Settings → Connectors → Add custom connector →
`https://multi-agent-deep-research-api.fly.dev/mcp`

Claude performs dynamic client registration and PKCE automatically; the
approval screen asks for `CHRONICLE_MCP_ACCESS_KEY`. Five tools should appear:
`research_market`, `get_research_job`, `export_research_markdown`,
`list_starter_queries`, `chronicle_health`.

### 5. Long-running research from a connector

`research_market` takes 30–90s and an inline wait can time out. From claude.ai
the correct pattern is `async_mode=true`, then poll `get_research_job(job_id)`.
Polling relies on `status` and `error` in the `/api/conversations/{id}` detail
payload; the browser learns completion from SSE instead.

> **Cold start.** `fly.toml` sets `min_machines_running = 1` precisely to avoid
> this: scaling to zero meant a ~60s research POST arriving during boot was
> dropped by the proxy while the run completed server-side. Machines still
> restart on `flyctl deploy` and `flyctl secrets set`, and the first request
> after a restart pays ~13s — that is a restart, not an idle cold start. If a
> connector handshake fails immediately after a deploy, retry before
> investigating.


## End-to-end verification

```bash
# Backend is up
curl https://<backend-host>/api/health

# Backend accepts requests
curl -X POST https://<backend-host>/api/research \
  -H "Content-Type: application/json" \
  -d '{"query": "test query"}'
```

Then open the Vercel URL, run a demo query, and watch the network tab to confirm the frontend hits the backend host.

---

## Troubleshooting

**CORS errors**
- Confirm `ALLOWED_ORIGINS` on the backend includes the exact Vercel URL (no trailing slash).
- Preview deployments use `*.vercel.app` and are matched by the regex in `main.py`.

**Backend can't bind**
- Some hosts inject `PORT`. Don't hardcode 8000 in the start command — the snippet above respects `$PORT`.

**API key errors**
- `OPEN_ROUTER_KEY` must start with `sk-or-`.
- Verify locally before pushing to the host.

**Frontend builds but can't reach backend**
- `VITE_API_URL` must be set at build time on Vercel (Vite inlines env vars during build).
- After changing it, trigger a redeploy.

---

## Local fallback

If the production stack is down during a demo:

```bash
# Terminal 1
./run_backend.sh        # or run_backend.bat on Windows

# Terminal 2
cd frontend && npm run dev
```

Or run the full stack with Docker:

```bash
docker compose up
```
