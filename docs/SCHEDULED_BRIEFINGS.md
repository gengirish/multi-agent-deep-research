# Scheduled briefings

How to run Chronicle unattended: research a topic on a cadence, then email the
result to the newsletter list.

_Last verified against the code: 2026-09-08._

---

## Pick where the schedule lives

There is no scheduler inside Chronicle. Something external has to trigger the
run, and the three practical options differ in what they depend on.

| Option | Runs on | Can broadcast | Depends on |
| --- | --- | --- | --- |
| claude.ai scheduled job | Anthropic's cloud | Yes | Connector registered **on claude.ai** |
| `scripts/scheduled_research.py` + cron | Your machine / CI | **Not yet** — research only | A machine that is awake |
| Vercel Cron | Vercel | Yes (if implemented there) | Topic fixed in code |

> **Claude Desktop has no scheduler.** Desktop can *use* the connector
> interactively, but scheduled jobs are a claude.ai (web) feature. Registering
> the connector in Desktop does not register it on claude.ai — that is a
> separate step, and the prompt below needs the claude.ai one.

The connector itself is server-side and client-agnostic: the same
`/mcp` endpoint serves claude.ai, Claude Desktop and Cursor.

---

## Option 1 — claude.ai scheduled job

Register `https://multi-agent-deep-research-api.fly.dev/mcp` as a custom
connector on claude.ai (Settings → Connectors), then schedule this prompt.
Set the cadence in the scheduler UI, not in the prompt.

```text
Use the Chronicle connector to produce and send this week's market briefing.

Topic: TAM, SAM and SOM for AI inference chips and accelerators in 2026,
with credibility-scored sources and a confidence score.

Steps, in order:

1. Call research_market with that topic and async_mode=true. It returns a
   job_id immediately. Do not wait inline — the pipeline takes 30-90s.

2. Poll get_research_job with that job_id until status is "success" (or an
   equivalent completed state). Wait ~15s between polls, up to 10 attempts.
   - If status is "error", stop. Report the error and send nothing.
   - If it is still running after 10 attempts, stop and report the job_id so
     it can be checked manually. Do not broadcast an unfinished report.

3. Call broadcast_briefing with that job_id and confirm=false. This sends
   nothing — it returns how many subscribers would receive it. Report that
   number.

4. If step 3 returned ok:true with recipientCount > 0, call broadcast_briefing
   again with the same job_id, confirm=true, and a one-sentence note
   summarising the single most important finding from the report.

5. Report the final outcome: the job_id, the subject line, and how many
   subscribers received it.

Rules:
- If any call returns error "already_broadcast", stop immediately and report
  it as success — that report has already gone out. Do not retry and do not
  start a new research run to work around it.
- If recipientCount is 0, stop and say the list is empty. Do not send.
- Never call broadcast_briefing with confirm=true on a job_id you did not
  create in step 1 of this run.
- Do not substitute a different topic or a cached older report if the run
  fails. A missed week is better than a wrong send.
```

### Why the prompt is shaped this way

**The dry run in step 3 is not ceremony.** It puts the recipient count in the
run's own output, so a wrong number — 0, or unexpectedly large — is visible in
the log next to the send that followed it.

**The `already_broadcast` rule is the important one.** A model's default
instinct on an error is to retry or route around it. Here a `409` means *the
email already went out*, so retrying is the one genuinely harmful response.

**The last rule blocks the likeliest failure.** Without it, a failed research
run invites the model to "helpfully" broadcast an older report to complete the
task — mailing stale research under a fresh date.

**Weekly sends still work.** The once-ever guard is keyed on `job_id`, and
each scheduled run creates a new report with a new id. It blocks a *retry of
the same run*, not next week's briefing.

---

## Option 2 — cron + `scripts/scheduled_research.py`

Stdlib-only, no `pip install`, uses the async job endpoints so a 30-90s run
never sits on one blocking request that a proxy might drop.

```bash
python3 scripts/scheduled_research.py --out reports/ \
  "TAM for AI coding assistants 2026"
```

Exit codes: `0` success, `1` pipeline error, `2` usage error, `3`
network/timeout — so cron can alert on failure.

**Limitation: this script researches but does not broadcast.** Adding a
`--broadcast` flag would call the same endpoint the MCP tool uses and reuse
the same `CHRONICLE_SERVICE_TOKEN` and once-ever guard. Not implemented yet.

---

## Safety model

Broadcasting is guarded in the server, not in the prompt — prompt wording is
advisory, and an unattended caller has nobody to ask.

| Guard | Behaviour |
| --- | --- |
| `confirm` defaults to `false` | Reports the recipient count and sends nothing |
| One broadcast per report, ever | A second attempt returns `409 already_broadcast` and sends nothing |
| Separate dry-run rate limit | A model looping previews cannot `429` the real send behind it |
| Service token | One fixed operator identity, never an arbitrary user; unset means broadcasting is unavailable |

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for how these fit together and
[`../DEPLOYMENT.md`](../DEPLOYMENT.md) for configuring `CHRONICLE_SERVICE_TOKEN`.

---

## Before you schedule it

The real send path has **not** been exercised in production. Every test to date
has been a dry run, so the first `confirm=true` will be the first live email —
and the first time the `already_broadcast` guard runs for real. Send one
briefing manually, or add a throwaway address to `/audience` and broadcast to
that, before putting this on a cadence.
