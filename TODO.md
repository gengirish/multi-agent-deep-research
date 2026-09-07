# TODO

Open items as of 2026-09-07. Grouped by what blocks what.

---

## 1. Pending activation — DONE (2026-09-07)

Both cleared; kept briefly for the record.

- [x] **`NEWSLETTER_ADMIN_EMAILS` is live.** Set for Production, Preview and
      Development, and the docs push rebuilt production so it is now in effect.
      `isNewsletterAdmin()` no longer returns `true` for every authenticated
      user.
- [x] **`min_machines_running` needed no change** — it was already
      `= 1` in `fly.toml`. The ~13s first request measured during connector
      verification was a machine *restart* (from `secrets set` / `deploy`), not
      an idle cold start. Machine confirmed `started`, checks `1/1 passing`.

Still worth doing:

- [ ] Verify the lockdown behaves as intended: `GET /api/subscribers` as a
      signed-in **non-admin** should return 403 rather than subscriber data.
      Needs a second account or a session token — not yet exercised.

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
production. Resolved: there is no `/subscribe` page (it is `POST
/api/subscribe`), so `/#newsletter` is the correct public link and the email
footer CTA is right.

- [ ] Verify the footer CTA renders in a real client (Gmail, Apple Mail) — the
      button is a `bgcolor` table cell, never tested end-to-end
- [ ] Draft the LinkedIn / BuildWithAIGiri subscribe CTA copy
- [ ] Draft the LinkedIn profile "Featured link" copy
- [ ] Capture a subscriber-count baseline before any public push

Note: broadcasts already pull the live list via `getActiveSubscribers` with
per-recipient unsubscribe tokens, so no hand-maintained recipient list is
needed.

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

- `backend/tests/` — **34 passed** against fastmcp 4.0.3, matching the
  `requirements.txt` pin.
- **Connector verified end-to-end in production** (2026-09-07): DCR 201;
  authorize rejects a wrong key 401 and issues a code on the right one 302
  with `state` echoed; token exchange rejects a bad PKCE verifier 400
  `invalid_grant` and succeeds 200 on the correct one; an authorization code
  replayed a second time is rejected 400. `initialize` returns
  `chronicle 1.0.0`; `tools/list` returns all five tools; `chronicle_health`
  reports `database: ok` and `list_starter_queries` returns 6 prompts.
- Unauthenticated `/mcp` returns 401 with
  `WWW-Authenticate: Bearer resource_metadata="…", scope="chronicle:research"`.
- Both `.well-known` documents return 200 with `issuer`/`resource` matching the
  hostname connectors dial.
- The semantic suite's graceful-skip path works as designed.
- The 2026-09-06 author rewrite touched only Girish's own commits; Seshagiri's
  and Siddhant's authorship is intact.
