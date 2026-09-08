# Architecture

How Chronicle is put together, and why. For what it does and how to run it, see
[`README.md`](../README.md); for deployment, [`DEPLOYMENT.md`](../DEPLOYMENT.md).

_Last verified against the code: 2026-09-07._

---

## Shape of the system

Three deployable pieces plus two MCP surfaces:

```
┌─────────────────────────────┐         ┌──────────────────────────────┐
│ Next.js 14 (Vercel)         │  HTTPS  │ FastAPI (Fly.io, container)  │
│ • landing, /research        │────────▶│ • /api/research  (SSE)       │
│ • auth, history, /audience  │         │ • LangGraph pipeline         │
│ • /api/* route handlers     │◀────────│ • /mcp  (OAuth 2.1 + PKCE)   │
│ • Prisma → Neon Postgres    │ service └──────────────────────────────┘
│ • AgentMail (newsletter)    │  token             ▲
└─────────────────────────────┘                    │ stdio
                                        ┌──────────────────────────────┐
                                        │ chronicle-mcp (mcp/)         │
                                        │ local server for Cursor etc. │
                                        └──────────────────────────────┘
```

The one back-edge — backend calling into the frontend — exists because the
subscriber list, email template and AgentMail credentials live in the Next.js
layer. A connector has no browser cookie, so that call carries
`CHRONICLE_SERVICE_TOKEN` instead.

## The pipeline

Five agents, orchestrated as a LangGraph state machine in
`orchestration/coordinator.py`. Each stage's output is the next one's input;
progress is pushed to the browser over Server-Sent Events as it happens, which
is why the UI can show the chain assembling rather than a spinner.

| Stage | Module | Job |
| ----- | ------ | --- |
| Retriever | `agents/retriever.py` | Candidate sources from Tavily → Perplexity → ArXiv |
| Enricher | `agents/` | Metadata, dates, source-type classification, sentiment |
| Analyzer | `agents/` | Credibility scores, contradictions, load-bearing claims |
| Insight | `agents/` | Hypotheses, trend chains, reasoning steps |
| Report | `agents/` | Structured, cited markdown |

Execution is **inline** — `asyncio.create_task` inside FastAPI, not a separate
worker. There used to be an ARQ + Redis worker process; it was retired after a
cost audit (~$5.70/mo always-on for a single-user workload). The ARQ shim
survives in `backend/queue/tasks.py`, so restoring a worker means adding a
process group back to `fly.toml` and scaling it, not rewriting anything.

## Model routing

`utils/llm_config.py` owns provider selection. A model is named
`provider/model`, and the prefix picks the SDK: `groq/` → Groq, `google/` →
Gemini, `anthropic/` → Anthropic, anything else → OpenRouter. Each stage can be
overridden independently (`RETRIEVER_MODEL`, `ANALYZER_MODEL`, …).

Two constraints shape the defaults, and both are easy to trip over:

- **Google's free tier is 20 requests/day _per model_.** Pointing analyzer,
  insight and report all at `google/gemini-flash-latest` caps the system at
  roughly six runs a day — and the report stage, drawing last, is the one that
  429s into an empty template. Keep at least two providers in the mix.
- **Groq is fastest but caps at 12k tokens/min**, which a report prompt built
  from ~17 sources exceeds. It suits the retriever and credibility stages, not
  the report.

`OPENROUTER_FALLBACK_MODEL` is an invoke-time safety net for any stage whose
primary rate-limits. It must name a real slug: OpenRouter retired its `:free`
variants, so a `:free` model 404s on every call and the fallback becomes
silently useless. The app probes it once at startup and logs loudly when it is
unusable.

## Input modes

`/research` accepts three:

1. **Type** — plain text.
2. **Speak** (`VoiceInput.tsx`) — Web Speech API. Best in Chrome/Edge.
3. **Picture** (`PictureInput.tsx`) — camera capture, preprocessed on a canvas
   (2× upscale, grayscale, adaptive threshold), OCR'd with Tesseract.js, then
   sent to `POST /api/extract-image-text`, where GPT-4o vision via OpenRouter
   corrects the OCR output into a clean query. Requires HTTPS in production for
   camera access, and `OPEN_ROUTER_KEY` on the backend.

## Persistence

Neon Postgres, reached two ways: Prisma from the Next.js layer (users,
subscribers, reports) and async SQLAlchemy from FastAPI (research results). A
Chroma vector store is opt-in for semantic search and off by default —
`chromadb` is commented out in `requirements.txt`.

## MCP surfaces

Two of them, exposing the same six tools:

- **`backend/mcp_server.py`** — hosted, built on FastMCP 4.x, mounted at `/mcp`
  and fronted by the OAuth 2.1 authorization server in `backend/auth/oauth.py`.
  This is what claude.ai registers as a custom connector.
- **`mcp/chronicle_mcp/`** — a pip-installable stdio server for Cursor and
  Claude Desktop. Runs `remote` (calls the hosted API) or `local` (in-process
  LangGraph).

`backend/tests/test_mcp_parity.py` fails if the two drift apart.

The hosted endpoint **fails closed**: without both a signing secret and
`CHRONICLE_MCP_ACCESS_KEY` it is never mounted and `/mcp` returns 404. That is
deliberate — an unauthenticated research tool spends real LLM credits. A 404
means "not configured"; a configured endpoint answers 401 with a
`WWW-Authenticate: Bearer resource_metadata="…"` challenge.

Five of the six tools are read-only. `broadcast_briefing` is annotated
`destructiveHint`, dry-runs unless `confirm=true`, and refuses to send a report
twice.

## Security controls worth knowing

| Control | Failure mode if unset |
| ------- | --------------------- |
| `NEWSLETTER_ADMIN_EMAILS` | `isNewsletterAdmin()` returns `true` for **every** signed-in user — anyone who can sign in reads the subscriber list (PII) and can mail it |
| `CHRONICLE_MCP_ACCESS_KEY` | `/mcp` is not mounted at all (fails closed) |
| `CHRONICLE_OAUTH_SECRET` | Falls back to `JWT_SECRET`, so connector tokens and user session tokens share one signing key — one leak forges both |
| `CHRONICLE_SERVICE_TOKEN` | `getServiceIdentity()` is inert, so connector-driven broadcast is simply off |
| `FORWARDED_ALLOW_IPS` | Fly terminates TLS upstream; without it Uvicorn reports `scheme="http"` and the wrong scheme leaks into the advertised OAuth issuer |

## Evaluation

`eval/run_eval.py` measures what the project actually claims: latency, distinct
sources synthesized, and **citation groundedness** — the fraction of cited URLs
the retriever genuinely fetched rather than the model inventing them.

`eval/semantic/` adds an LLM-as-judge layer on NVIDIA NIM, deliberately a
different model family from the Gemini/Groq models the pipeline runs on so the
judge is not scoring its own output. It is wired but **has never scored
anything** — it needs `NVIDIA_API_KEY` and captured payloads. Note that its
tests *skip* rather than fail when the key is absent, so in CI it would report
a false green. See [`../TODO.md`](../TODO.md).
