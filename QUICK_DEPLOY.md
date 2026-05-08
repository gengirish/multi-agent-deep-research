# Quick Deploy Guide

A condensed version of [`DEPLOYMENT.md`](./DEPLOYMENT.md). The frontend goes to **Vercel**; the backend runs in a container on whichever host you choose (Fly.io, Render, Cloud Run, etc.).

---

## 1. Backend (container host)

Build and run locally first to confirm everything works:

```bash
docker compose up --build backend
curl http://localhost:8000/api/health
```

Push the same image / repo to your host and set:

```
OPEN_ROUTER_KEY=sk-or-...
TAVILY_API_KEY=tvly-...           # optional
ENVIRONMENT=production
ALLOWED_ORIGINS=https://your-app.vercel.app
```

Start command (`backend/` working dir):

```
uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}
```

Save the public URL the host gives you.

---

## 2. Frontend → Vercel

1. https://vercel.com → **Add New Project** → pick the repo.
2. Configure:
   - Framework: **Vite**
   - Root Directory: `frontend`
   - Build Command: `npm run build`
   - Output Directory: `dist`
3. Env var:
   ```
   VITE_API_URL=https://<your-backend-url>
   ```
4. Deploy. Note the Vercel URL.

---

## 3. Lock down CORS

Back on the backend host, set:

```
ALLOWED_ORIGINS=https://<your-vercel-url>
```

(`*.vercel.app` previews are already allowed via regex in `backend/main.py`.)

---

## 4. Smoke test

1. Open the Vercel URL.
2. Run a demo query.
3. Confirm in DevTools → Network that requests hit the backend URL.

Done.

---

**Detailed walkthrough, env var reference, and troubleshooting:** [`DEPLOYMENT.md`](./DEPLOYMENT.md)
