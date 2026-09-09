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
`destructiveHint`, dry-runs unless `confirm=true`, and refuses to send the same
report to the same audience twice.

## The subscriber lifecycle

One list, shared by every public capture surface (`/newsletter`, the landing
anchor, and shared report footers), keyed by the sentinel owner
`GLOBAL_NEWSLETTER_OWNER_ID` — so there is exactly one newsletter, not one per
signed-in user. `frontend/src/lib/subscribers.ts` is the only module that writes
to it.

```
public sign-up ──► PENDING ──(clicks 48h token)──► ACTIVE ──(unsubscribe)──► UNSUBSCRIBED
                      │                              ▲                            │
                      │                              │                            │
owner add / CSV import ────────────────────────────►─┘◄───(re-subscribe: back to PENDING)
```

Two invariants hold the design together:

- **Only `ACTIVE` is mailable.** `getActiveSubscribers()` filters on it, so a
  `PENDING` row cannot receive a broadcast no matter what else goes wrong.
- **`POST /api/subscribe` reveals nothing.** Pending, already-subscribed and
  re-subscribing addresses get a byte-identical response; otherwise the public
  endpoint would answer "is this address on the list?" for anyone who asked.

Segments are a lower-cased `text[]` on the row rather than a join table — a
handful of short labels per subscriber, never queried independently of their
subscriber. Targeting a segment is a `tags hasSome` filter, and the send-once
guard on `Broadcast` is keyed by `(jobId, segment)` so one report can reach
`investors` today and `beta` next week without either send being repeatable.

## How identity is established

One path, deliberately: a request carries the `chronicle-session` cookie, and
`getSession()` in `frontend/src/lib/auth.ts` verifies that JWT — signature and
expiry — on every call. Route handlers do their own authorization on top
(`isNewsletterAdmin()` for the newsletter surfaces).

`middleware.ts` lives at the **project root**, not under `src/`. Next.js only
picks up `src/middleware.ts` when the app itself lives under `src/`, and here
`app/` is at the root — a middleware file in the wrong place is not an error,
it simply never runs. Verify with `sortedMiddleware` in
`.next/server/middleware-manifest.json` after a build; an empty array means it
is not wired up.

Middleware gates pages and evicts stale cookies. It does **not** hand identity
downstream: it strips inbound `x-user-*` headers rather than injecting them.
An earlier design had it inject verified claims that `getSession()` then
trusted, which meant anyone could send those headers and be treated as any
user — see the 2026-09-09 entry in `CHANGELOG.md`.

## Security controls worth knowing

| Control | Failure mode if unset |
| ------- | --------------------- |
| `NEWSLETTER_ADMIN_EMAILS` | `isNewsletterAdmin()` returns `true` for **every** signed-in user — anyone who can sign in reads the subscriber list (PII) and can mail it |
| `AGENTMAIL_API_KEY` | `sendEmail()` returns `false` instead of throwing, so sends fail silently: public sign-ups accept an address, stay `PENDING`, and can never confirm. Watch for `PENDING` rows accumulating on `/audience` |
| `CHRONICLE_MCP_ACCESS_KEY` | `/mcp` is not mounted at all (fails closed) |
| `CHRONICLE_OAUTH_SECRET` | Falls back to `JWT_SECRET`, so connector tokens and user session tokens share one signing key — one leak forges both |
| `CHRONICLE_SERVICE_TOKEN` | `getServiceIdentity()` is inert, so connector-driven broadcast is simply off |
| `JWT_SECRET` (frontend) | `getSession()` returns null for everyone, so gated routes fail closed — but middleware also logs and falls through, so pages render an unauthenticated shell |
| `FORWARDED_ALLOW_IPS` | Fly terminates TLS upstream; without it Uvicorn reports `scheme="http"` and the wrong scheme leaks into the advertised OAuth issuer |

## Theming

Colour lives in one place: the token block at the top of `frontend/src/App.css`.
`:root` carries the dark palette (Chronicle's default, and what the design was
built for); `[data-theme="light"]` redefines the same names and never adds new
ones. A literal colour in a component stylesheet is a bug — it will not theme.

`src/theme/ThemeProvider.tsx` holds three states, not two: `light`, `dark` and
`system`. "System" is a real preference — a boolean cannot express "keep
following the OS" once it has been persisted — so the provider tracks the
`prefers-color-scheme` media query for as long as that is the choice. The
resolved value is written to `<html data-theme>` and to `style.colorScheme`,
which is what themes native form controls and scrollbars.

`src/theme/theme-script.ts` is inlined into `<head>` by `app/layout.tsx` and
runs before first paint. Without it the page paints dark, React mounts, and
light-mode users get a flash on every navigation. It must be blocking and
dependency-free, which is why it is a string rather than a component.

### The elevation ladder

The tokens `--c-surface-1` … `--c-surface-7` exist because the two themes lift
surfaces in opposite directions. On dark they are white washes that get
brighter as they rise; on light a white wash over white is invisible, so they
become opaque slate tints that get *darker*. Components pick a step by meaning
("how raised is this?") rather than by copying an alpha value — that inversion
is exactly what a hardcoded `rgba(255,255,255,0.03)` cannot survive.

Chrome (`--c-bg-chrome`) works the same way: the sidebar and top bar sit
slightly darker than the page on dark, and go white on light, where the shadow
carries the depth instead.


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
