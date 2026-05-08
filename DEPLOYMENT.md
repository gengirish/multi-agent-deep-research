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
```

### 4. Deploy

Vercel will build and deploy. Note the production URL (e.g. `https://your-app.vercel.app`).

### 5. Tighten backend CORS

Update `ALLOWED_ORIGINS` on the backend host to include your real Vercel URL:

```
ALLOWED_ORIGINS=https://your-app.vercel.app
```

(`*.vercel.app` previews are already allowed via regex in `main.py`.)

---

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
