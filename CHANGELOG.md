# Changelog

Notable changes, newest first. Dates are commit dates.

## 2026-09-10 — Credibility: judge citations against a paper's age

- **Fixed a flaw introduced by the entry below.** The citation signal treated
  "no citations" as evidence of being ignored, regardless of when the paper was
  published. A paper published two months ago has no citations because nobody
  has had time to cite it — so the newest work was marked down exactly as hard
  as work that had years to be read and wasn't. In the production verification
  run the 2026 preprints scored *below* a 2024 paper, purely for being new. For
  a product whose users ask what the **latest** techniques are, that ranked the
  answer last.
- **Citations now count at any age; their absence only counts once the paper has
  had time.** Below `OPENALEX_CITATION_GRACE_MONTHS` (18) an uncited paper stays
  neutral on that axis and the reasoning reads "too recent to judge by
  citations". Above it, the absence costs `OPENALEX_UNCITED_PENALTY` (0.08) and
  reads "no citations after Nmo". Presence of citations was never gated — a
  well-cited new paper must not be damped for being new.
- The ordering this produces, on the five papers from run `1e644543`: well-cited
  work on top (proven beats unproven), brand-new work in the middle (unproven,
  but no longer punished), and long-ignored work at the bottom. Holding the
  pre-OpenAlex score constant, a 2-month-old preprint now scores 0.68 where an
  identical paper from 2019 scores 0.66; before this change both scored 0.66.
  The gap survives the 2dp rounding the credibility agent applies.
- **Age comes from `publication_date`, not the year.** A year alone cannot tell
  January from December, which is half the grace period. The field is now
  requested explicitly, and a live contract test asserts all three match paths
  (DOI, arXiv id, title search) return it — a silent regression to year-only
  precision would quietly change how every new paper scores. Records carrying
  only a year fall back to mid-year, the least-wrong single point: January would
  age a December paper by a year, December would make a January paper look brand
  new. Future-dated records — a journal's forthcoming issue — are treated as
  brand new rather than negatively aged.
- 14 new tests, including the regression itself (new and ignored must not score
  alike), the grace boundary at 17 vs 19 months, and that citations still beat
  recency so the fix does not over-correct into rewarding novelty.

## 2026-09-10 — Credibility: bibliographic signals from OpenAlex

- **The credibility agent can now see how a paper was received.** It scored a
  source from three things: URL patterns (`.edu`, `.gov`, `arxiv.org`), the
  source type, and a model's opinion of the title and snippet. None of those
  distinguish a 400-citation paper from a preprint nobody read, and none of them
  can see a retraction. `utils/openalex.py` adds citation count, venue and venue
  type, publication year, and the retraction flag from [OpenAlex](https://openalex.org)
  — free, no API key, no account.
- **Blended at `OPENALEX_WEIGHT` (0.25), not added.** The first version added a
  bonus and a test caught that it did nothing: the existing heuristic already
  saturates, since an arXiv paper scores 0.5 base + 0.3 academic domain + 0.2
  paper type + author and title bonuses and is clamped to 1.0. A bonus had
  nowhere to go, so the exact distinction this exists to draw would have stayed
  invisible. A blend pulls an uncited preprint off the ceiling while leaving a
  well-cited journal paper at the top. Sources OpenAlex does not know score
  exactly as before.
- **Retraction is not blended.** It floors the score at 0.05 and says so in the
  reasoning string, because a retracted paper is not a slightly-less-credible
  paper. This is the one signal none of the previous inputs could produce: a
  retracted arXiv paper with 5,000 citations scored high on every heuristic the
  agent had.
- Three rules keep a third-party call out of harm's way on a stage that
  previously made none. It **never blocks a run** — timeouts, 5xx, rate limits
  and malformed payloads all return no signal and leave the score untouched, and
  nothing in the module raises. It **never mis-attributes** — crediting a source
  with another paper's citations is worse than having no signal, so title
  matches must clear a token-overlap floor, and web or news items are only
  looked up when they carry a DOI or arXiv id, because title-searching a blog
  post against a bibliographic index produces confident-looking mismatches. And
  it **pays the network cost once** — TTL cache including misses, plus a
  concurrent prefetch before the credibility agent's serial per-source loop, so
  N papers is one batch rather than N sequential timeouts.
- On by default (`OPENALEX_ENABLED=false` to disable). Set `OPENALEX_MAILTO` to
  enter OpenAlex's polite pool; anonymous callers are rate-limited first, and a
  429 is retried once.
- **Verified in production**, run `1e644543`: all 5 papers resolved, 4 through
  the arXiv-minted DOI and 1 through the title-search fallback. The 18-citation
  paper now scores above the 0-citation ones (0.74 vs 0.66–0.68) — the
  discrimination that was impossible before. All 6 web sources were correctly
  never looked up, scores untouched. Retraction remains covered only by tests;
  no retracted source has come up in a real run.
- Worth knowing: arXiv only began minting DOIs in 2022, so the id lookup 404s
  for older papers and the title search is what resolves them.
  `tests/test_openalex_live.py` pins these API shapes against the real service
  and is skipped unless `OPENALEX_LIVE_TESTS=1`.
- **Known flaw, fixed the same day** — see the entry above. A paper published
  this year cannot have citations yet, so the first version of the citation
  signal conflated "new" with "ignored".
- `agents/credibility_enhanced.py` does not get the signal — only the standard
  agent, which is the default.

## 2026-09-10 — Retrieval: iterative research loop, off by default

- **The retriever no longer has to get it right on the first try.** It fired one
  query at three channels, took five results each, and everything downstream was
  bounded by that single shot: if the first search missed the angle the question
  actually needed, no later stage could recover it.
  `agents/research_loop.py` wraps it in the search → reflect → follow-up →
  search-again loop from LangChain's
  [open_deep_research](https://github.com/langchain-ai/open_deep_research) (MIT),
  then merges, de-duplicates and compresses.
- **Two departures from upstream, both about cost.** Reflection is the only LLM
  step; upstream also summarizes each source with a model call, which multiplies
  token spend by the source count and is untenable when Google's free tier is 20
  requests per day *per model*. Compression here is structural — de-duplicate,
  rank, cap — not generative. And every dimension is capped, so the worst case is
  knowable: `RESEARCH_LOOP_MAX_ITERATIONS` model calls plus
  `MAX_ITERATIONS × FOLLOW_UPS × 3` searches, which at the defaults is 2 extra
  model calls and 12 extra searches per run.
- De-duplication normalizes URLs — scheme, `www.`, trailing slash, tracking
  parameters — so the same document found by two queries is stored once. Every
  source carries `_query` and `_iteration`, so the report and the eval harness
  can tell which question surfaced it. Each iteration is written to the agent log
  like any other agent action; a loop that silently ran three extra searches
  would break the claim that every step the agents take is visible.
- The loop stops early when the model reports the sources are sufficient, when it
  returns no follow-up queries, when its response cannot be parsed, or when
  nothing was retrieved at all. That last case is deliberate: a total retrieval
  failure is a provider problem, and rewording the query cannot fix it.
- **Off by default.** `RESEARCH_LOOP_ENABLED=true` turns it on, and
  `ResearchWorkflow(enable_research_loop=…)` overrides the flag, which is what
  lets one process measure both arms. Leaving it off restores the previous
  behaviour exactly — the retriever itself is untouched either way.
- **`eval/run_eval.py --research-loop {env,on,off,ab}`.** `ab` runs both arms
  over the same queries in one process, same models, same query list, so the only
  difference is the retrieval strategy; it requires `--mode local`, because
  `RESEARCH_LOOP_ENABLED` is read when the workflow is constructed and a deployed
  API serves whichever arm it booted with. The comparison table marks each metric
  by whether it moved in the better direction, with latency inverted — a loop that
  takes twice as long is not a win. Two metrics carry no verdict on purpose:
  search queries issued is the loop's cost rather than a result, and a longer
  report is not a better one.
- Also fixed while wiring the A/B: the harness built a fresh `ResearchWorkflow`
  per query — six agents and their model clients — which put seconds of setup
  inside every latency measurement. One workflow per arm is now cached and
  reused, so the numbers describe the pipeline rather than the harness.
- **The A/B has not been run.** Two arms against live search and LLM providers is
  real spend on a daily-capped free tier, so whether the loop earns its extra
  searches is still an open question. Grounding rate is the number that decides
  it, mean credibility second — more sources retrieved is what you are paying,
  not what you are buying.

## 2026-09-10 — Observability: Langfuse tracing, off unless keys are set

- **A span per pipeline stage, with per-call token counts and cost.** Five agents
  on provider free tiers with per-model daily caps are hard to debug from logs
  alone: the log can say a run was slow or degraded, not which stage burned the
  quota or what a retry cost. `utils/tracing.py` records the run as a
  [Langfuse](https://github.com/langfuse/langfuse) trace, and `create_llm` now
  attaches the LangChain callback handler to every model, which is what supplies
  the token and cost numbers rather than just timings.
- **Written so it cannot cost anything it observes.** No keys, no `langfuse`
  package, an unreachable host or an SDK change all disable tracing for the
  process after one logged warning, and every span object degrades to a no-op
  callers can still call `.update()` on. A tracing backend that can take down the
  pipeline it watches is worse than no tracing.
- **Version detection is by capability, not `__version__`.** Langfuse has renamed
  this API twice: v2 `client.trace()`, v3 `client.start_as_current_span()`, v4
  `client.start_as_current_observation()`. The first version of the shim called
  the v3 name, which against the installed v4.15.2 raised `AttributeError` — the
  safety net caught it and self-disabled exactly as designed, which also meant it
  would have recorded nothing at all. There is now a test per branch, because
  that failure is silent by construction.
- `langfuse` is a hard requirement so enabling tracing in production is an
  env-var change rather than an image rebuild; it is unused at runtime without
  `LANGFUSE_PUBLIC_KEY` and `LANGFUSE_SECRET_KEY`. Its OpenTelemetry dependencies
  left the deployed image at 142 MB.
- Because Langfuse batches and Fly can stop a container before the background
  flush fires, a finished run flushes explicitly.
- Not yet enabled in production — no keys are set. The first production run after
  this deploy took 7m08s against an exhausted Gemini daily quota, and attributing
  that time precisely is exactly what a trace would have answered.

## 2026-09-09 — MCP: `broadcast_custom_briefing`

- **New MCP tool `broadcast_custom_briefing`**, on both servers
  (`backend/mcp_server.py` for the claude.ai connector, `mcp/chronicle_mcp/`
  for stdio). The route shipped above is reachable over HTTP, but the scheduled
  job that composes the daily "IntelliForge Morning Briefing" reaches Chronicle
  only through MCP and cannot POST to the web app directly — so the route had no
  caller. This tool is that caller: subject + HTML in, `POST
  /api/newsletter/broadcast` out.
- Mirrors `broadcast_briefing` deliberately — same `destructiveHint`
  annotation, same confirm→`dryRun` gate (`confirm=false` returns the recipient
  count and sends nothing), same pass-the-answer-through contract, so
  `already_broadcast` and the empty-list 400 reach the model verbatim.
  `dedupe_key` is validated against the route's own charset before the call, so
  a typo comes back as a local `invalid` rather than a round trip.
- The service token is read server-side from `CHRONICLE_SERVICE_TOKEN` and never
  requested from the caller; unset, the tool answers `not_configured` and sends
  nothing.
- Tests: the parity suite now expects the tool on both servers, and
  `backend/tests/test_newsletter_broadcast_tool.py` pins the target URL, the
  bearer header, the payload shape and the fail-closed path.

## 2026-09-09 — Newsletter: broadcast an arbitrary briefing

- **New endpoint `POST /api/newsletter/broadcast`.** Until now the only way to
  mail the list was `POST /api/reports/[jobId]/broadcast`, which needs a
  `ResearchResult` and renders its markdown. The daily "IntelliForge Morning
  Briefing" is a news digest built by a scheduled job outside Chronicle and
  arrives as finished HTML, so it had nowhere to go. The new route takes
  `subject` + `html` (plus optional `text`, `segment`, `dryRun`) and reuses the
  existing machinery unchanged: the same auth, the same active-subscriber query,
  the same rate-limit budgets, the same `broadcasts` audit table.
- **`dedupeKey` is the send-once identity.** With no report ID to key on, the
  caller names the issue (`^[a-z0-9:_-]{3,64}$`, e.g. `daily-briefing:2026-09-09`)
  and it is stored in `Broadcast.jobId` — no new model, no migration. Scoped per
  (`dedupeKey`, `segment`), so a retried scheduled run gets `409
  already_broadcast` and mails no one twice.
- Each recipient's own unsubscribe link is stamped into the body inside the send
  loop, before `</body>` when the briefing is a full document and appended when
  it is a fragment. That placement lives in `src/lib/briefing-email.ts` so it is
  unit-testable without a request.
- **First unit tests in the frontend.** Added Vitest (`npm test`) alongside the
  Playwright e2e suite, covering the new route's auth, dry run, send, audit row,
  per-recipient links, repeat-send and empty-list paths, plus the footer helper.
  Also added the `.eslintrc.json` the repo never had — `npm run lint` previously
  dropped into ESLint's interactive setup prompt.

## 2026-09-09 — Security: spoofable identity headers

- **Fixed an authentication bypass that was live in production.** `getSession()`
  trusted `x-user-id` / `x-user-email` / `x-user-name` request headers, on the
  premise that middleware had already verified the JWT and injected them. A
  client can set those headers itself, and the middleware was never running:
  it sat at `src/middleware.ts` while `app/` lives at the project root, so
  Next.js never compiled it (`sortedMiddleware` was empty in the build
  manifest). An unauthenticated `curl` with three headers returned the full
  subscriber list — names, emails, tags, sign-up source. Every route behind
  `getSession()` was reachable the same way, including broadcast and subscriber
  deletion. `NEWSLETTER_ADMIN_EMAILS` behaved correctly and bought nothing,
  because the operator address is not a secret.
- Identity now comes from the signed session cookie and nowhere else;
  `getSessionFromHeaders()` is gone. Middleware moved to the project root, so
  page gating (`/history`, `/audience`) actually runs for the first time, and it
  strips inbound `x-user-*` headers as defence in depth.
- Regression tests assert 401 — not 403, which would mean the forged session was
  accepted and merely un-privileged — for forged headers on a read and a write.

## 2026-09-09 — Newsletter: a real front door

- **Dedicated sign-up page at `/newsletter`.** The landing-page anchor was a
  poor destination for the places a newsletter actually gets shared (a LinkedIn
  featured link, a bio link, the footer of the briefing itself) — those readers
  arrive already interested and had to scroll past a product pitch to reach the
  form. The briefing footer CTA now points here. The landing anchor still works.
- **Double opt-in.** Public sign-ups land `PENDING` with a 48-hour single-use
  token and are mailed a confirmation link. `getActiveSubscribers()` reads
  `ACTIVE` only, so an unconfirmed address cannot receive a broadcast. Owner-added
  and CSV-imported rows skip it. `POST /api/subscribe` now returns an identical
  response for pending, already-subscribed and re-subscribing addresses — the old
  `created` flag made the public endpoint an oracle for list membership.
- **Segments.** Free-form tags per subscriber, normalized server-side so
  `Investors` and ` investors ` are one segment. Filter chips and inline tag
  editing on `/audience`; broadcast takes an optional `segment`. The send-once
  guard is now scoped per (report, segment).
- **CSV import.** `POST /api/subscribers/import` plus an import panel, backed by
  a dependency-free RFC 4180 parser handling quoted fields, embedded newlines,
  doubled quotes, CRLF and BOM. Header aliases cover the common vendor exports;
  a bare one-address-per-line list works too. Bad rows are skipped with line
  numbers rather than failing the batch.
- **Fixed a latent middleware trap.** `/api/subscribe` sat in the prefix
  allowlist, where it also matched `/api/subscribers`. Nothing was exposed —
  those handlers enforce their own session and admin checks — but the overlap
  would have caught the next route added under that name.
- Schema: `Subscriber` gained `tags`, `confirmToken`, `confirmExpires`,
  `confirmedAt`, `source`; `SubscriberStatus` gained `PENDING`; `Broadcast`
  gained `segment`. All additive — existing rows stayed `ACTIVE`.

## 2026-09 — Connector, quotas, and the newsletter lockdown

- **`broadcast_briefing` MCP tool.** A connector can now mail a finished
  briefing to the newsletter list. Sending stays owned by the Next.js app (it
  holds the list, template and AgentMail credentials), so the backend calls back
  into it authenticated with `CHRONICLE_SERVICE_TOKEN`. The tool dry-runs unless
  `confirm=true`, refuses to send the same report twice, and draws dry runs and
  real sends from separate rate-limit budgets.
- **Hosted claude.ai remote connector** at `/mcp`, fronted by an OAuth 2.1
  authorization server with PKCE and dynamic client registration. Fails closed:
  without both a signing secret and `CHRONICLE_MCP_ACCESS_KEY` the endpoint is
  never mounted. Verified end to end against production.
- **Repaired a dead LLM fallback.** OpenRouter retired its `:free` model
  variants, so the configured `:free` fallback slug had been 404ing on every
  call — the safety net was silently absent. The app now probes the fallback
  once at startup and logs loudly when it is unusable.
- **Split the Google quota domain.** The free tier meters 20 requests/day *per
  model*, so pointing analyzer, insight and report at one Gemini model capped the
  system at ~6 runs/day, with the report stage 429ing into an empty template.
- **`NEWSLETTER_ADMIN_EMAILS` activated** across all environments. While unset,
  `isNewsletterAdmin()` returned `true` for every authenticated user.
- **Semantic eval layer** (`eval/semantic/`) with an NVIDIA NIM LLM-as-judge,
  deliberately a different model family from the pipeline's own models. Wired
  but not yet exercised — see `TODO.md`.

## 2026-07 — Free-tier pipeline and honest failure

- Ran the whole pipeline on provider free tiers with OSS failover, moving stages
  off exhausted and rate-limited accounts.
- **Removed every fabricating fallback path** in the agents. Stages that degrade
  now say so instead of inventing plausible output.
- Routed Claude natively rather than through OpenRouter.
- Kept one Fly machine warm (`min_machines_running = 1`): scaling to zero meant a
  ~60s research POST arriving during boot was dropped by the proxy while the run
  completed server-side.
- Eval harness measuring grounding, latency and a single-LLM ablation; E2E tests
  that assert real analysis rather than just real markup.

## 2026-06/07 — Product surface

- **`chronicle-mcp`**: pip-installable stdio MCP server for Cursor and Claude
  Desktop.
- **Newsletter**: subscriber list, public sign-up, broadcasts, one-click
  unsubscribe. (Double opt-in, segments and CSV import came later — see the
  2026-09-09 entry.)
- **Auth**: custom JWT authentication with password reset and email
  verification, via AgentMail.
- **Reports**: email a report from a signed-in account; magazine-style template
  for PDF and email; shareable-report growth loop and Trust panel.
- **PWA**: install, offline, and update flows end to end.
- **Cost optimization**: inline pipeline execution replacing the always-on ARQ
  worker, plus a 24h query cache and a Groq reporter.

## 2026-05 — Chronicle

- Rebrand from "Multi-Agent Deep Researcher" to **Chronicle**, repositioned on
  defensible market sizing for founders.
- **Frontend rewritten from React + Vite to Next.js 14 (App Router)**; backend
  moved to Fly.io. Sidebar-first workspace with a command palette, breadcrumbs
  and keyboard shortcuts.
- Neon Postgres storage; semantic color palette and shared inline-SVG icon set.

## 2025-11 — Original multi-agent system

- Five-agent LangGraph pipeline: retriever, enricher, analyzer, insight, report.
- Source credibility agent and agent-conversation logging.
- Parallel retrieval and parallel analysis.
- D3.js visualizations for research metrics.
- Three input modes: type, speak (Web Speech API), and picture — camera capture
  preprocessed on a canvas, OCR'd with Tesseract.js, then corrected by GPT-4o
  vision.
- Text-to-speech for reports; Perplexity search fallback; optional RAG.

> The 2025-11 line also shipped a Streamlit UI (`app.py`) alongside the React
> app. It was removed in 2026-09 — Streamlit had not been a declared dependency
> for some time, so the entrypoint no longer imported.
