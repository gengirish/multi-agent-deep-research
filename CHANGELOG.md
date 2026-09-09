# Changelog

Notable changes, newest first. Dates are commit dates.

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
