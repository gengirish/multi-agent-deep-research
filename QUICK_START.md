# Quick Start

The fastest path to running Chronicle locally.

## TL;DR

```bash
# Backend
python -m venv venv && source venv/bin/activate    # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp env.example .env                                 # Windows: copy env.example .env
# Edit .env: set OPEN_ROUTER_KEY (required) and TAVILY_API_KEY (recommended)
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000

# Frontend (in another terminal)
cd frontend
npm install
echo "VITE_API_URL=http://localhost:8000" > .env.local
npm run dev
```

Open http://localhost:5173.

---

## Step-by-step

### 1. Get API keys

| Provider                              | What for                  | Required |
| ------------------------------------- | ------------------------- | :------: |
| [OpenRouter](https://openrouter.ai/keys) | LLM access (all agents)   |    ✅    |
| [Tavily](https://tavily.com/)         | Web search (primary)       |    ➖    |
| [Perplexity](https://perplexity.ai/)  | Web search (fallback)      |    ➖    |

The backend works without Tavily/Perplexity but loses live web search — it'll fall back to ArXiv-only retrieval.

### 2. Backend setup

```bash
# Virtual env
python -m venv venv

# Activate
source venv/bin/activate            # macOS/Linux
venv\Scripts\activate               # Windows PowerShell

# Install
pip install -r requirements.txt

# Configure
cp env.example .env                 # macOS/Linux
copy env.example .env               # Windows
# Edit .env, fill in OPEN_ROUTER_KEY at minimum

# Run
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

Verify: <http://localhost:8000/api/health> should return `{"status":"ok"}`.

### 3. Frontend setup

```bash
cd frontend
npm install
echo "VITE_API_URL=http://localhost:8000" > .env.local
npm run dev
```

Visit <http://localhost:5173>. You should see the Chronicle landing page.

### 4. Run a query

Click any starter query on the landing page (or type your own on `/research`). Watch the five agents run live.

---

## Run with Docker

```bash
docker compose up
```

Backend at `http://localhost:8000`, frontend at `http://localhost:5173`.

---

## Troubleshooting

**`OPEN_ROUTER_KEY` not set**
- The backend will start but every query will fail. Set it in `.env` and restart.

**CORS errors in the browser**
- Frontend's `VITE_API_URL` must match the backend's actual URL.
- For local dev, `http://localhost:5173` and `http://localhost:3000` are allowed by default.

**Search returning nothing**
- Tavily may be rate-limited or your key invalid. The retriever falls back to Perplexity, then ArXiv.
- ArXiv-only results are biased toward academic content — set a Tavily key for general-web coverage.

**Import errors**
- Activate the virtualenv. Confirm `python --version` returns 3.8+ (3.11 recommended for parity with the production container).

---

## Where things live

```
agents/         # The five specialized agents
orchestration/  # LangGraph state machine
utils/          # LLM config, RAG, logging
backend/        # FastAPI server entrypoint
frontend/       # React + Vite UI
```

Full docs: [`README.md`](./README.md). Deploy guide: [`DEPLOYMENT.md`](./DEPLOYMENT.md).
