# Deployment Guide

This guide covers deploying Chronicle to production.

- **Frontend (Next.js 14, App Router)** → **Vercel**
- **Backend (FastAPI)** → any container host (Fly.io, Render, Cloud Run, ECS, etc.)

The backend has no platform-specific coupling. Anything that can run a Python ASGI app on a configurable `$PORT` will work.

---

## Architecture

```
┌──────────────────────────┐      HTTPS       ┌──────────────────────────┐
│  Vercel (frontend)       │ ───────────────▶ │  Fly.io (backend)        │
│  Next.js 14 App Router   │                  │  FastAPI / uvicorn       │
│  NEXT_PUBLIC_API_URL ───▶│ ◀─────────────── │  PORT, ALLOWED_ORIGINS   │
│  Postgres via Prisma     │  service token   │  /mcp (OAuth 2.1 + PKCE) │
│  AgentMail (newsletter)  │  (broadcast)     └──────────────────────────┘
└──────────────────────────┘
```

The backend calls *back* into the Next.js app for one thing only: broadcasting a
briefing to the newsletter list, authenticated with `CHRONICLE_SERVICE_TOKEN`
(Phase 4). Everything else flows frontend → backend.

---

## Prerequisites

1. Code pushed to GitHub
2. Vercel account (https://vercel.com)
3. A backend host of your choice (this deployment uses Fly.io; see `fly.toml`)
4. API keys: `GOOGLE_API_KEY` and `GROQ_API_KEY` (required), `TAVILY_API_KEY`
   (recommended), `OPEN_ROUTER_KEY` / `ANTHROPIC_API_KEY` / `PERPLEXITY_API_KEY`
   (optional). `env.example` documents every variable with its free-tier limits.

---

## Phase 1: Backend (container-based host)

### 1. Local container build (sanity check)

```bash
docker compose up --build backend
curl http://localhost:8000/api/health
# → {"status":"ok","message":"API is running"}
```

### 2. Required environment variables

| Variable            | Purpose                                       | Example                       |
| ------------------- | --------------------------------------------- | ----------------------------- |
| `GOOGLE_API_KEY`    | Analyzer / insight / report stages (Gemini)   | `AIza...`                     |
| `GROQ_API_KEY`      | Retriever + credibility stages (Llama 3.3)    | `gsk_...`                     |
| `DATABASE_URL`      | Neon Postgres — research results              | `postgresql://...`            |
| `TAVILY_API_KEY`    | Web search (recommended)                      | `tvly-...`                    |
| `OPEN_ROUTER_KEY`   | Invoke-time fallback for any stage (optional) | `sk-or-...`                   |
| `JWT_SECRET`        | Shared HS256 secret with the Next.js layer    | 32-byte hex                   |
| `PORT`              | Server port (host usually injects)            | `8080`                        |
| `ALLOWED_ORIGINS`   | Comma-separated CORS allowlist                | `https://your-app.vercel.app` |
| `ENVIRONMENT`       | Free-form environment label                   | `production`                  |

Set `OPENROUTER_FALLBACK_MODEL` to a real slug (e.g. `openai/gpt-oss-20b`), never a
`:free` one — OpenRouter retired those variants and a `:free` slug 404s on every call,
which makes the fallback silently useless. The app probes it once at startup and logs
loudly if it is unusable.

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
3. Set the Root Directory to `frontend`; Vercel then detects Next.js

### 2. Build configuration

| Setting          | Value                              |
| ---------------- | ---------------------------------- |
| Framework Preset | Next.js                            |
| Root Directory   | `frontend`                         |
| Build Command    | `npm run build` (runs `prisma generate` first) |
| Output Directory | *(leave default — Next.js managed)* |
| Install Command  | `npm install`                      |

`DATABASE_URL` must be present at **build** time, not just at runtime: the build
script runs `prisma generate` before `next build`.

### 3. Environment variables

```
NEXT_PUBLIC_API_URL=https://<your-backend-host>
NEXT_PUBLIC_APP_URL=https://<your-frontend-host>
DATABASE_URL=<postgres connection string>
JWT_SECRET=<shared secret with the backend>
AGENTMAIL_API_KEY=<for transactional + broadcast email>
AGENTMAIL_FROM_EMAIL=briefing@yourdomain.com
NEWSLETTER_ADMIN_EMAILS=you@example.com
NEWSLETTER_DOUBLE_OPT_IN=true          # default; set false only for local dev
CHRONICLE_SERVICE_TOKEN=<same value as on the backend; see Phase 4>
```

> **`NEWSLETTER_ADMIN_EMAILS` is a security control, not a convenience.**
> When unset, `isNewsletterAdmin()` in `frontend/src/lib/subscribers.ts`
> returns `true` for *every* authenticated user, so anyone who can sign in can
> read the subscriber list (PII) and broadcast to it. The open default is
> intended for a single-operator deployment. Set it before publicising signup
> links. Vercel injects env vars at **build** time, so a change only takes
> effect after a redeploy.

`NEXT_PUBLIC_APP_URL` is also what emails use to build the subscribe CTA
(`${NEXT_PUBLIC_APP_URL}/newsletter`), the double opt-in confirmation link
(`/api/subscribe/confirm?token=…`) and per-recipient unsubscribe links.

> **Double opt-in is on unless disabled.** A public sign-up stays `PENDING` and
> unmailable until its confirmation link is clicked, so a deployment with no
> working `AGENTMAIL_API_KEY` will accept sign-ups that can never confirm —
> `sendEmail()` degrades to returning `false` rather than throwing. If sign-ups
> are piling up as `PENDING` on `/audience`, check the mail credentials first.

> **A pulled `AGENTMAIL_API_KEY` is not the live value.** Vercel does not return
> the plaintext of a sensitive variable, so the value `vercel env pull` writes
> cannot be used to test the credential locally — it will fail auth even while
> production sends fine. Verify sending against the deployment, not the pulled
> file.

### 3b. Push the Prisma schema

The Next.js app owns the `users`, `subscribers`, `broadcasts` and
`verification_tokens` tables. After a schema change, and before the deploy that
depends on it:

```bash
cd frontend && npx prisma db push
```

Do this **first** — a deploy whose code reads a column the database lacks will
500 on the affected routes until the push lands. `research_results` is owned by
SQLAlchemy and must never be migrated from Prisma; if a push proposes changes to
it, stop.

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
approval screen asks for `CHRONICLE_MCP_ACCESS_KEY`. Six tools should appear:
`research_market`, `get_research_job`, `export_research_markdown`,
`list_starter_queries`, `broadcast_briefing`, `chronicle_health`.

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


---

## Phase 4: Newsletter broadcast from the connector (optional)

`broadcast_briefing` lets an agent mail a finished briefing to the subscriber
list. Sending is owned by the Next.js app — it holds the list, the template and
the AgentMail credentials — so the backend has to call *back* into it. A browser
cookie is not available to a connector, so that call is authenticated with a
shared service token instead.

### 1. Mint one token, set it in both places

```bash
TOKEN="$(openssl rand -hex 32)"

flyctl secrets set -a multi-agent-deep-research-api \
  CHRONICLE_SERVICE_TOKEN="$TOKEN"

vercel env add CHRONICLE_SERVICE_TOKEN production   # paste the same value
```

The values must match byte for byte; a mismatch surfaces as a 401 from the
broadcast route. `getServiceIdentity()` in `frontend/src/lib/service-auth.ts` is
**inert while `CHRONICLE_SERVICE_TOKEN` is unset**, so the service path is closed
by default and the feature simply stays off until you opt in.

### 2. Point the backend at the frontend

`CHRONICLE_APP_URL` is already set in `fly.toml [env]`. Override it only if your
frontend lives elsewhere:

```bash
flyctl secrets set -a multi-agent-deep-research-api \
  CHRONICLE_APP_URL="https://your-frontend-host"
```

### 3. What the token does and does not grant

A service token authenticates as **one fixed operator identity**, never an
arbitrary user, and it is accepted only on the broadcast route. Because it *is*
the operator, `NEWSLETTER_ADMIN_EMAILS` does not gate it — the allowlist applies
to interactive sessions only. Treat the token as equivalent to newsletter-send
rights and rotate it like a password.

### 4. Safety properties worth knowing before you enable it

- The tool is annotated `destructiveHint`. Calling it with `confirm=false`
  performs a **dry run**: it returns the recipient count and sends nothing.
- Each report can be broadcast **once, ever**. A second attempt returns
  `already_broadcast` and sends no mail, so a retried agent run is safe.
- Dry runs and real sends draw on separate rate-limit budgets (20 and 5 per
  10-minute window respectively), so probing cannot exhaust the send budget.


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
- `OPEN_ROUTER_KEY` must start with `sk-or-`; `NVIDIA_API_KEY` with `nvapi-`.
- Verify locally before pushing to the host.

**Frontend builds but can't reach backend**
- `NEXT_PUBLIC_*` values are inlined at build time. After changing one, trigger a
  redeploy — editing it in the dashboard alone changes nothing.

**Build fails on `prisma generate`**
- `DATABASE_URL` is missing from the build environment, not just from runtime.

**Broadcast from the connector returns 401**
- `CHRONICLE_SERVICE_TOKEN` must be byte-identical on Fly and on Vercel, and
  `CHRONICLE_APP_URL` must point at the frontend origin. See Phase 4.

---

## Local fallback

If the production stack is down during a demo:

```bash
# Terminal 1
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000

# Terminal 2
cd frontend && npm run dev      # http://localhost:3000
```

Or run the backend in the production container:

```bash
docker compose up
```
