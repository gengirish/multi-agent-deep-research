# TODO

Open items as of 2026-09-07. Grouped by what blocks what.

---

## 1. Access control — activated, one check outstanding

Both activations cleared on 2026-09-07 (recorded in §5).

- [ ] Verify the lockdown behaves as intended: `GET /api/subscribers` as a
      signed-in **non-admin** should return 403 rather than subscriber data.
      Needs a second account or a session token — not yet exercised.
- [ ] Same check for the broadcast route: a signed-in non-admin POSTing to
      `/api/reports/{jobId}/broadcast` should get 403. The service-token path
      bypasses the admin allowlist by design, so this only covers the
      interactive path.

---

## 2. Semantic eval is wired but unverified

`eval/semantic/` ships and imports cleanly, but **it has never actually scored
anything**. Both preconditions are still missing.

- [ ] **Get an NVIDIA API key.** Web-only — there is no CLI path. The NGC CLI
      consumes a key (`ngc config set` prompts for one); it cannot mint one,
      and is irrelevant here anyway since `judge.py` talks to
      `integrate.api.nvidia.com` over the plain OpenAI SDK, not the NGC registry.
  1. Sign in at <https://build.nvidia.com>
  2. Profile menu -> **Settings -> API Keys** -> **Generate Personal Key**
  3. Expiration **Never Expire**; under Services Included tick
     **NGC Catalog** *and* **Public API Endpoints** (the latter authorizes
     `integrate.api.nvidia.com`)
  4. Key must start with `nvapi-` — `utils/llm_config.py:254` warns if it doesn't
- [ ] Add `NVIDIA_API_KEY=nvapi-...` to `.env`
- [ ] Run the judge reliability probe: `python eval/semantic/validate_judge.py`
- [ ] Generate captures via `eval/run_eval.py` with payload capture enabled —
      `eval/semantic/captures/` holds nothing but `.gitkeep`
- [ ] Re-run `pytest eval/semantic/` and confirm tests **run** rather than skip

### 2a. CI would report a false green

`test_semantic_grounding.py` skips all 5 tests when `NVIDIA_API_KEY` is absent
(verified: 5 skipped, 0 run). Correct on a laptop; in CI it means the gate
passes while measuring nothing.

- [ ] Decide the CI contract: require the key (fail when unset), or emit a
      signal that distinguishes "skipped, unmeasured" from "passed"
- [ ] Add `NVIDIA_API_KEY` as a CI secret once the key exists

---

## 3. Newsletter / audience

The feature is **built and deployed** — sign-up, subscriber CRUD, one-click
unsubscribe, and report broadcast all exist and respond correctly in
production.

**2026-09-09 — four additions, code complete, NOT yet migrated or deployed:**

  1. **`/newsletter`** — a dedicated public sign-up page. This supersedes the
     earlier note that `/#newsletter` was the right public link; the landing
     anchor still works, but the email footer CTA and any shared link should
     now use `/newsletter`.
  2. **Segments** — lower-cased tags on each subscriber, a filter on the
     Audience page, and an optional `segment` on the broadcast endpoint. The
     send-once check is now scoped per (report, segment).
  3. **Double opt-in** — public sign-ups land `PENDING` and are mailed a 48h
     confirmation link. `getActiveSubscribers` only ever returns `ACTIVE`, so
     an unconfirmed address cannot receive a broadcast. Disable locally with
     `NEWSLETTER_DOUBLE_OPT_IN=false`.
  4. **CSV import** — `POST /api/subscribers/import` plus an import panel on
     the Audience page. Imported rows are `ACTIVE` with no opt-in email.

- [ ] **Required before deploy:** run `prisma db push` against the Neon
      database. The `Subscriber` model gained `tags`, `confirmToken`,
      `confirmExpires`, `confirmedAt` and `source`, `SubscriberStatus` gained
      `PENDING`, and `Broadcast` gained `segment`. All additive (new enum
      value, new nullable/defaulted columns) — existing rows stay `ACTIVE` —
      but a Postgres enum value cannot be dropped afterwards, so this is
      one-way.
- [ ] Send a real double opt-in confirmation to a live inbox and click it —
      the template has only been verified as HTML, never in a mail client
- [ ] Verify the footer CTA renders in a real client (Gmail, Apple Mail) — the
      button is a `bgcolor` table cell, never tested end-to-end
- [ ] Draft the LinkedIn / BuildWithAIGiri subscribe CTA copy (link to
      `/newsletter`, not `/#newsletter`)
- [ ] Draft the LinkedIn profile "Featured link" copy
- [ ] Capture a subscriber-count baseline before any public push

- [ ] Exercise `broadcast_briefing` end to end from a connector with
      `confirm=false`, and confirm the reported recipient count matches the live
      list before anything is ever sent for real

Note: broadcasts already pull the live list via `getActiveSubscribers` with
per-recipient unsubscribe tokens, so no hand-maintained recipient list is
needed. As of 2026-09-07 they can also be triggered from an MCP connector via
`broadcast_briefing`, authenticated with `CHRONICLE_SERVICE_TOKEN` (live on both
Fly and Vercel production).

---

## 4. Git history aftermath

`main` was force-pushed on 2026-09-06 (author-email rewrite). Every SHA on the
branch changed.

- [ ] Tell collaborators (Seshagiri, Siddhant) to run
      `git fetch origin && git reset --hard origin/main` — a plain `git pull`
      will conflict
- [ ] Links to pre-rewrite commit SHAs are dead; re-point any in docs or logs
- [ ] Global `user.email` is still `ghiremath@pulsepoint.com`. This repo now has
      a local override; other personal repos do not

---

## 5. Verified — no action needed

Recorded so it is not re-litigated:

- **`NEWSLETTER_ADMIN_EMAILS` is live** (2026-09-07) in Production, Preview and
  Development, and production was rebuilt so it is in effect.
  `isNewsletterAdmin()` no longer returns `true` for every authenticated user.
- **`min_machines_running` needed no change** — already `= 1` in `fly.toml`. The
  ~13s first request measured during connector verification was a machine
  *restart* (from `secrets set` / `deploy`), not an idle cold start. Machine
  confirmed `started`, checks `1/1 passing`.
- **`CHRONICLE_SERVICE_TOKEN` is live** on both the Fly backend and Vercel
  production, so connector-driven broadcast is enabled.
- `backend/tests/` — **34 passed** against fastmcp 4.0.3, matching the
  `requirements.txt` pin.
- **Connector verified end-to-end in production** (2026-09-07): DCR 201;
  authorize rejects a wrong key 401 and issues a code on the right one 302
  with `state` echoed; token exchange rejects a bad PKCE verifier 400
  `invalid_grant` and succeeds 200 on the correct one; an authorization code
  replayed a second time is rejected 400. `initialize` returns
  `chronicle 1.0.0`; `tools/list` returns every tool; `chronicle_health`
  reports `database: ok` and `list_starter_queries` returns 6 prompts.
- Unauthenticated `/mcp` returns 401 with
  `WWW-Authenticate: Bearer resource_metadata="…", scope="chronicle:research"`.
- Both `.well-known` documents return 200 with `issuer`/`resource` matching the
  hostname connectors dial.
- The semantic suite's graceful-skip path works as designed.
- The 2026-09-06 author rewrite touched only Girish's own commits; Seshagiri's
  and Siddhant's authorship is intact.

---

## 6. Documentation state (2026-09-07 sweep)

The docs were re-baselined against the code on 2026-09-07. What changed, so it
is not re-discovered:

- `README.md`, `DEPLOYMENT.md` and `QUICK_START.md` all still described the
  pre-2026-05 **React + Vite** frontend — Vite build preset, `dist/` output
  directory, `VITE_API_URL`, port 5173. Following them would have produced a
  failed Vercel build. Now Next.js throughout.
- `docker-compose.yml` referenced a `Dockerfile.backend` and a
  `frontend/Dockerfile`, neither of which exists. `docker compose up` was broken
  and is documented in several places; it now builds the real `Dockerfile`.
- `PROJECT_CONTEXT.md` (last touched 2025-11-11) was replaced by
  `docs/ARCHITECTURE.md`. `QUICK_DEPLOY.md` was a duplicate of `DEPLOYMENT.md`
  and was removed.
- The MCP surfaces were documented as exposing "five tools"; `broadcast_briefing`
  makes six.
- Dead Streamlit-era code was removed: `app.py`, `streamlit_tts_component.py`,
  `utils/demo_cache.py`, `demo_cache_template.json`, `setup.py`,
  `test_system.py`. Streamlit had not been in `requirements.txt` for some time,
  so `app.py` could not import.

Still open:

- [x] `pytest backend/tests/` re-run against this changeset on 2026-09-08:
      **34 passed**. `tsc --noEmit` clean, and `backend.main`,
      `orchestration.coordinator`, `utils.llm_config` and `eval.semantic.judge`
      all still import after the Streamlit-era deletions.
- [ ] `docs/CONNECTOR_HANDOVER.md` is a completed handover record, not a live
      document. Consider folding its verification table into `DEPLOYMENT.md` and
      retiring it.
- [ ] **Scheduling is not set up yet.** The connector works from any MCP client,
      but Claude Desktop has no scheduler — scheduled jobs are a claude.ai
      feature, and registering the connector in Desktop does not register it on
      claude.ai. Pick a home for the schedule; the options and the ready-to-use
      prompt are in `docs/SCHEDULED_BRIEFINGS.md`.
- [ ] `scripts/scheduled_research.py` researches but cannot broadcast. A
      `--broadcast` flag would call the same endpoint the MCP tool uses and
      reuse `CHRONICLE_SERVICE_TOKEN` and the once-ever guard — making cron a
      complete unattended path with no model in the send loop.
