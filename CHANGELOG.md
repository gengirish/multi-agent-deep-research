# Changelog

Notable changes, newest first. Dates are commit dates.

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
  unsubscribe.
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
