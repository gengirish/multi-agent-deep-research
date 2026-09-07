# TODO

Open items as of 2026-09-07. Grouped by what blocks what.

---

## 1. Semantic eval is wired but unverified

The suite in `eval/semantic/` ships and imports cleanly, but **it has never
actually scored anything**. Both preconditions are missing.

- [ ] **Get an NVIDIA API key.** Web-only — there is no CLI path. The NGC CLI
      consumes a key (`ngc config set` prompts for one); it cannot mint one,
      and it is irrelevant here anyway since `judge.py` talks to
      `integrate.api.nvidia.com` over the plain OpenAI SDK, not the NGC registry.
  1. Sign in at <https://build.nvidia.com>
  2. Profile menu -> **Settings -> API Keys** -> **Generate Personal Key**
  3. Expiration **Never Expire**; under Services Included tick
     **NGC Catalog** *and* **Public API Endpoints** (the latter is the one that
     authorizes `integrate.api.nvidia.com`)
  4. Key must start with `nvapi-` — `utils/llm_config.py:254` warns if it doesn't
- [ ] Add `NVIDIA_API_KEY=nvapi-...` to `.env` (it is only in `env.example` today)
- [ ] Run the judge reliability probe: `python eval/semantic/validate_judge.py`
- [ ] Generate captures via `eval/run_eval.py` with payload capture enabled —
      `eval/semantic/captures/` currently holds nothing but `.gitkeep`
- [ ] Re-run `pytest eval/semantic/` and confirm tests **run** rather than skip

### 1a. CI would report a false green

`test_semantic_grounding.py` skips all 5 tests when `NVIDIA_API_KEY` is absent.
That is correct for a laptop, but in CI it means the gate passes while measuring
nothing.

- [ ] Decide the CI contract: either require the key (fail when unset) or emit a
      loud warning that distinguishes "skipped, unmeasured" from "passed"
- [ ] Add `NVIDIA_API_KEY` as a CI secret once the key exists

---

## 2. Subscribe / growth loop

The email footer CTA now points at `${APP_URL}/#newsletter`, which deep-links to
the `SubscribeForm` on the landing page. This was a **fallback** — `/subscribe`
returned 404 and the real public URL was never confirmed.

- [ ] **Confirm the canonical public subscribe URL.** If `/#newsletter` is the
      real one, nothing to do. If a dedicated route is preferred, update
      `SUBSCRIBE_URL` in `frontend/src/lib/report-email.ts`
- [ ] Verify the CTA renders correctly in a real client (Gmail, Apple Mail) —
      the button is a bgcolor table cell, untested end-to-end
- [ ] Draft the LinkedIn / BuildWithAIGiri subscribe CTA copy
- [ ] Draft the LinkedIn profile "Featured link" copy
- [ ] Decide whether daily/weekly sends should pull recipients from Chronicle's
      `/audience` list instead of a hand-maintained list. Blocked on identifying
      the endpoints the `/audience` page calls — can be found by inspecting the
      logged-in app

---

## 3. Git history aftermath

`main` was force-pushed twice on 2026-09-06 (author-email rewrite, then two
follow-up commits). Every SHA on the branch changed.

- [ ] Tell collaborators (Seshagiri, Siddhant) to run
      `git fetch origin && git reset --hard origin/main` — a plain `git pull`
      will conflict
- [ ] Any bookmarked links to pre-rewrite commit SHAs are dead; re-point if
      referenced in docs or deploy logs
- [ ] Global `user.email` is still `ghiremath@pulsepoint.com`. This repo now has
      a local override, but **other personal repos do not** — decide whether to
      change the global default

---

## 4. Verified, no action needed

Recorded so it isn't re-litigated:

- `backend/tests/` — 34 passed against fastmcp 4.0.3, matching the pin in
  `requirements.txt`. Covers the OAuth 2.1 + MCP flow and hosted/stdio parity.
- The semantic suite's graceful-skip path works as designed.
- Author rewrite touched only Girish's own commits; Seshagiri's and Siddhant's
  authorship is intact.
