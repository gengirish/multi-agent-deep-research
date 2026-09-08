# Quick Start

The fastest path to running Chronicle locally. For deployment, see
[`DEPLOYMENT.md`](./DEPLOYMENT.md); for what the system actually is, see
[`README.md`](./README.md).

## TL;DR

```bash
# Backend
python -m venv venv && source venv/bin/activate    # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp env.example .env                                 # Windows: copy env.example .env
# Edit .env: GOOGLE_API_KEY + GROQ_API_KEY (required), TAVILY_API_KEY (recommended)
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000

# Frontend (in another terminal)
cd frontend
npm install
# create frontend/.env.local — see step 3
npm run dev
```

Open <http://localhost:3000>.

---

## Step-by-step

### 1. Get API keys

| Provider                                          | What for                              | Required |
| ------------------------------------------------- | ------------------------------------- | :------: |
| [Google AI Studio](https://aistudio.google.com/apikey) | Analyzer, insight, report stages      |    ✅    |
| [Groq](https://console.groq.com/keys)             | Retriever + credibility stages         |    ✅    |
| [Tavily](https://tavily.com/)                     | Web search (primary)                   |    ➖    |
| [Perplexity](https://www.perplexity.ai/)          | Web search (fallback)                  |    ➖    |
| [OpenRouter](https://openrouter.ai/keys)          | Invoke-time fallback for any stage     |    ➖    |
| [Anthropic](https://console.anthropic.com/settings/keys) | Stronger analysis, when funded  |    ➖    |

Without Tavily/Perplexity the backend still runs but loses live web search and
falls back to ArXiv-only retrieval, which skews academic.

`env.example` is the authoritative reference — it documents every variable
along with the free-tier limits that shape the defaults. Two worth knowing up
front:

- **Google's free tier is 20 requests per day _per model_.** Pointing the
  analyzer, insight and report stages all at `google/gemini-flash-latest` caps
  the whole system at roughly six runs a day, and the report stage — drawing
  last — is the one that 429s into an empty template. Keep at least two
  providers in play.
- **`OPENROUTER_FALLBACK_MODEL` must not be a `:free` slug.** OpenRouter retired
  those variants, so a `:free` model 404s on every call and the fallback becomes
  silently useless. The app probes it once at startup and logs loudly if it is
  unusable.

### 2. Backend setup

```bash
python -m venv venv

source venv/bin/activate            # macOS/Linux
venv\Scripts\activate               # Windows PowerShell

pip install -r requirements.txt

cp env.example .env                 # macOS/Linux
copy env.example .env               # Windows
# Fill in GOOGLE_API_KEY and GROQ_API_KEY at minimum

uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

Verify: <http://localhost:8000/api/health> should return `{"status":"ok"}`.

### 3. Frontend setup

The frontend is a **Next.js 14 App Router** app. It needs a Postgres URL even
for local dev — `npm run build` and `postinstall` both run `prisma generate`,
and auth, history and the newsletter all read from the database. A free
[Neon](https://neon.tech) branch is enough.

```bash
cd frontend
npm install
cat > .env.local <<'EOF'
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_APP_URL=http://localhost:3000
DATABASE_URL=postgresql://...
JWT_SECRET=dev-secret-change-me     # must match the backend's JWT_SECRET
EOF
npx prisma db push
npm run dev
```

Visit <http://localhost:3000>. You should see the Chronicle landing page.

### 4. Run a query

Click any starter query on the landing page, or type your own on `/research`.
Watch the five agents run live over SSE.

---

## Run the backend in a container

```bash
docker compose up
```

This builds the same image Fly.io runs and serves it on port 8000. The frontend
is not containerised — run it on the host as above.

---

## Troubleshooting

**Every query fails with a provider error**
- `GOOGLE_API_KEY` / `GROQ_API_KEY` are unset or exhausted. Google's free tier is
  20 requests per day per model; check the backend logs for a 429.

**CORS errors in the browser**
- `NEXT_PUBLIC_API_URL` must match the backend's actual URL.
- `http://localhost:3000` is allowed by default; add anything else to
  `ALLOWED_ORIGINS` on the backend.

**Search returning nothing**
- Tavily may be rate-limited or the key invalid. The retriever falls back to
  Perplexity, then ArXiv.
- ArXiv-only results skew academic — set a Tavily key for general-web coverage.

**`prisma` errors, or the app 500s on sign-in / history**
- `DATABASE_URL` is unset or unreachable. Run `npx prisma db push` in `frontend/`
  to apply the schema.

**Import errors in the backend**
- Activate the virtualenv. Python 3.11 matches the production container.

**`/mcp` returns 404**
- That means "not configured", not "broken". The endpoint is only mounted when
  both `CHRONICLE_OAUTH_SECRET` (or `JWT_SECRET`) and `CHRONICLE_MCP_ACCESS_KEY`
  are set. See [`DEPLOYMENT.md`](./DEPLOYMENT.md) Phase 3.

---

## Tests

```bash
pytest backend/tests/          # backend suite; no API keys needed
python eval/run_eval.py        # grounding + latency eval against a live API
cd frontend && npm run test:e2e # Playwright
```

---

## Where things live

```
agents/         # The five specialized agents
orchestration/  # LangGraph state machine
utils/          # LLM config, RAG, logging
backend/        # FastAPI server, hosted MCP endpoint, OAuth
mcp/            # chronicle-mcp stdio server
eval/           # Eval harness
frontend/       # Next.js 14 App Router UI
```

Full docs: [`README.md`](./README.md). Deploy guide: [`DEPLOYMENT.md`](./DEPLOYMENT.md).
