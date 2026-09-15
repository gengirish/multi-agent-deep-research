# Evaluation

`run_eval.py` measures the pipeline on the claims the project actually makes:
how fast a cited report comes back, how many distinct sources it synthesizes,
and what fraction of the citations in the report are **grounded** — i.e. point
at a URL the retriever genuinely fetched rather than one the model invented.

```bash
pip install requests python-dotenv

python eval/run_eval.py                          # live API, 6 default queries
python eval/run_eval.py --queries 3 --check-urls # also verify each cited URL resolves
python eval/run_eval.py --mode local --baseline  # in-process, plus single-LLM ablation
python eval/run_eval.py --mode local --research-loop ab   # A/B the iterative retriever
```

Results land in `eval/results/eval-<label>.json` (full per-query detail) and
`eval/results/eval-<label>.md` (summary tables).

## A/B: single-shot vs the iterative retrieval loop

`--research-loop` decides how the retriever runs:

| Value | Behaviour |
| --- | --- |
| `env` (default) | Honours `RESEARCH_LOOP_ENABLED` — existing behaviour, unchanged |
| `off` / `on` | Forces single-shot or iterative for this sweep |
| `ab` | Runs **both** arms over the same queries and prints a comparison |

```bash
python eval/run_eval.py --mode local --research-loop ab --queries 3
```

`ab` requires `--mode local`. `RESEARCH_LOOP_ENABLED` is read when the workflow
is constructed, so a deployed API serves whichever arm it was started with and
cannot be switched per request.

Both arms run in one process against the same query list with the same models,
so the only thing that differs is the retrieval strategy. One workflow is built
per arm and reused across queries — constructing one builds six agents and their
model clients, and doing that per query made the latency figures describe the
harness as much as the pipeline.

**It doubles the sweep's cost.** Every query runs twice, and the iterative arm
itself issues extra searches and model calls. On free tiers with daily caps,
start with `--queries 2`.

The comparison table marks each metric ✅ or ⚠️ by whether it moved in the
better direction — with latency inverted, since a loop that takes twice as long
is not a win. Two metrics carry no verdict on purpose: **search queries issued**
is the loop's cost rather than a result, and **report length** is not better for
being longer.

The number that decides it is **grounding rate**, with mean credibility second.
More sources retrieved is not on its own a reason to ship the loop — it is what
you are paying for, not what you are buying. If grounding and credibility are
flat while latency and query count double, the loop is not earning its cost on
your query mix.

Per-run loop detail is recorded in the JSON under `research_loop`: iterations,
queries issued, gaps identified, why it stopped, and how many sources were found
before compression trimmed the set (`sources_merged` vs `sources_kept`) — so a
run that gathered 30 and kept 12 is distinguishable from one that only ever
found 12. Captures written with `--save-payloads` are arm-prefixed, so the
second arm does not overwrite the first.

## Metrics

| Metric | How it's computed |
| --- | --- |
| Time to cited report | Wall clock around one `/api/research` call |
| Sources per report | Retriever's web + papers + news buckets, plus distinct registrable domains |
| Citations per report | Unique URLs in the report (markdown links and bare URLs) |
| **Grounding rate** | Fraction of cited URLs that match a retrieved source — exact normalized URL first, then same-domain |
| Cited URLs resolve | `--check-urls`: each cited URL fetched, HTTP < 400 counts as resolving |
| Credibility | `overall_credibility` from the credibility agent (mean score, high/medium/low counts) |
| Contradictions | Length of `analysis.contradictions` |
| Claim lines | Report lines of ≥8 words outside headings and the sources section |
| Loop iterations / queries issued | `research_loop` trace from the retriever; 0 / 1 on a single-shot run |

The single-LLM baseline (`--baseline`) asks one model, one prompt, no retrieval
and no verification, for the same cited report. Its citations are scored against
an empty retrieval set, so any URL it produces is by construction ungrounded —
which is the point of the comparison. It uses the strongest provider available —
`ANTHROPIC_API_KEY`, then `OPEN_ROUTER_KEY`, then `GROQ_API_KEY` — so the
baseline is a fair fight; override with `BASELINE_MODEL`. Without any key it is
skipped and the multi-agent numbers still run.

## Retrieval A/B — 15 Sep 2026: the loop does not earn its cost

3 queries through both arms in one process, same models, same query list.
Full detail in [`results/eval-loop-ab.json`](results/eval-loop-ab.json).

**Verdict: leave `RESEARCH_LOOP_ENABLED` off.** Read the per-query table below
rather than the aggregate — every ✅ in the summary comes from a single run.

| Query | Arm | Time | Sources | Citations | Grounded | Loop |
| --- | --- | --- | --- | --- | --- | --- |
| TAM | single-shot | 155s | 12 | 6 | 100% | — |
| | iterative | 129s | 12 | 7 | 86% | 0 iters, *sufficient* |
| Competitors | single-shot | **92s** | 12 | 10 | 100% | — |
| | iterative | **300s** | **29** | 24 | 100% | 1 iter, 3 queries, 36→29 |
| EU regulation | single-shot | 85s | 12 | 9 | 100% | — |
| | iterative | 73s | 12 | 0 | n/a | 0 iters, *sufficient* |

Four things this shows, in order of how much they matter:

1. **The loop fires on roughly one query in three.** On the other two,
   reflection parsed fine and judged 12 sources already sufficient — so those
   runs are single-shot plus a wasted reflection call.
2. **When it fires it triples the run.** 92s → 300s on the same query. The UI
   promises "most runs finish in ~60s"; a 5-minute run reads as a hang.
3. **Grounding has no headroom.** Single-shot is pinned at 100% on every run, so
   the metric the loop was meant to improve cannot improve. It went *down*
   (96.8%) on variance, from a run where the loop never even fired.
4. **The noise is larger than the effect.** Citations across identical
   single-shot runs: 6, 10, 9 — and in an earlier sweep 6, 1, 9. Contradictions:
   1, 3, 13. Any between-arm difference below that spread is unmeasurable at
   n=3.

What the loop *did* do on the one run it fired is real: 12 → 29 sources across
36 merged, distinct domains 8 → 12, citations 10 → 24, grounding held at 100%.
The mechanism works. It is solving a problem this pipeline does not currently
have, at a latency cost the product cannot absorb.

**Caveats.** n=3 with one loop activation is directional, not a measurement. All
six runs had **zero papers** — arXiv was returning 429/503 throughout — so this
measured a web+news-only pipeline whose credibility scores (0.49/0.51) sit well
below a healthy run's 0.62.

**The question this eval cannot answer** is whether a founder gets a *better
answer*, as opposed to more sources. That needs a judge scoring report quality,
which is what `eval/semantic/` exists for and has still never run.

### Two bugs this sweep found before it could report anything

Both made earlier runs of this same A/B look like clean results when they were
not, which is the more useful finding:

- **The loop's trace was being destroyed before scoring.** `enrich_sources`
  rebuilds the sources dict and dropped `research_loop`, so the harness reported
  `loop_enabled=False` and "1 search query" on both arms — reading as "the loop
  did nothing" when the evidence had been thrown away two stages earlier.
- **Reflection had no room to answer.** It inherited the retriever's
  `max_tokens=800`, and on a reasoning model 675–1226 of those go to reasoning
  before any visible output. It returned an empty string two times in three, the
  loop correctly refused to guess, and the early stop was indistinguishable from
  success. Two whole sweeps measured a loop that never issued a follow-up search.

## Measured run — 26 Jul 2026 (fixed pipeline)

6 queries against the live deployment, with every stage running for real
(`degraded: []` on all of them). Full detail in
[`results/eval-live-fixed.json`](results/eval-live-fixed.json).

| Metric | Value |
| --- | --- |
| Time to cited report | 48.63 s mean, 43.5–59.4 s range |
| Sources retrieved per report | 17 (6 web + 5 papers + 6 news) |
| Distinct domains per report | 8.6 |
| Citations per report | 12.8 |
| Citation grounding rate | 96.9% (62 of 64) |
| Cited URLs that resolve | 100% (64 of 64) |
| Credibility spread | 6 high / 2.8 medium / 8.2 low, mean 0.64 |
| Contradictions flagged per report | 5.4 |

### Ablation: single LLM, no retrieval

Same 6 questions put to Claude Sonnet 4.5 in one prompt, asked for the same
cited report, with no retrieval and no verification:

| Metric | Multi-agent | Single LLM |
| --- | --- | --- |
| Time to report (mean) | 48.63 s | 20.06 s |
| Citations produced | 64 | 35 |
| Citations grounded in a retrieved source | **96.9%** | **0%** |
| Cited URLs that resolve | 100% (64/64) | 65.7% (23/35) |

**12 of the 35 URLs the single model cited do not resolve.** That is the
hallucinated-citation failure, measured rather than asserted.

Read the rest honestly, because the numbers cut both ways:

- The pipeline is **2.4× slower**. It retrieves 17 sources, scores each one,
  and runs a separate analysis pass; the single model writes from memory.
  Latency is the price of grounding, not an implementation defect.
- Grounding is **96.9%, not 100%** — 2 of 64 citations pointed somewhere the
  retriever never fetched. The report model occasionally reaches for a URL of
  its own. This is the honest ceiling of "ground by construction" without a
  verification pass that rejects unmatched citations, and it is the strongest
  argument for building one.
- Grounding rate is a structural property, not a quality score: it says
  citations are real, not that the report is right. Read it alongside the
  credibility distribution, not instead of it.

### Comparison with the pre-fix run

The same harness against the same deployment before the mock-analysis fix
([`results/eval-live-vs-baseline.json`](results/eval-live-vs-baseline.json)):

| Metric | Before (mock analysis) | After |
| --- | --- | --- |
| Time to cited report | 6.22 s | 48.63 s |
| Sources per report | 12 (0 papers) | 17 (5 papers) |
| Contradictions per report | 1 (the same canned string every time) | 5.4, source-attributed |
| Credibility: high / medium / low | 0 / 1 / 11 | 6 / 2.8 / 8.2 |
| Citations per report | 9 | 12.8 |

The old 6-second latency was the speed of skipping the work. Any number taken
from a run before 26 Jul 2026 describes the degraded pipeline.

### Known reliability issue

One of the 6 queries timed out at 900 s during the run and had to be retried;
the retry succeeded in 91.8 s. Slow rather than broken, but the tail latency
is real and worth a timeout budget before this is put in front of users.

## What the measurement exposed, and what was done about it

All of the following were found by running the harness against the live
deployment. All are fixed and deployed as of 26 Jul 2026.

**1. The deployment was serving mock analysis.** Every response carried
`analysis.raw_analysis == "Mock analysis - LLM not configured"` and the
matching insight marker. The "key findings", "contradictions", hypotheses and
trends in every live report were fixed strings, byte-identical across queries.
Retrieval and report generation (Groq-routed) were live; everything routed
through OpenRouter was not.

Cause: `ANALYZER_MODEL` defaulted to `anthropic/claude-3-5-sonnet`, and
OpenRouter no longer lists **any** Claude 3.5 slug — verified against
`https://openrouter.ai/api/v1/models`. The credibility agent's LLM leg failed
the same way, returning its 0.5 failure constant for every source, which was
weighted 0.6 and dragged all sources into a 0.52–0.57 band. The reported "11
of 12 sources are Low credibility" was an artifact of the failure, not a
judgement.

*Fixed by* native Anthropic routing (`_build_anthropic` via
`langchain-anthropic`) and a model id that exists (`anthropic/claude-sonnet-4-5`).
OpenRouter remains the fallback for every provider, so a missing native key
degrades rather than breaks.

**2. The arXiv channel returned nothing.** `papers` was 0 across all 6 queries,
including one squarely about RAG research. The real exception, once surfaced,
was `AttributeError: 'Search' object has no attribute 'results'` — LangChain's
`ArxivAPIWrapper` calls `Search.results()`, removed in `arxiv` 2.2+, so the
wrapper fails against every current version.

*Fixed by* calling the `arxiv` SDK client directly. This also yields
`entry_id` as a real URL; the wrapper's formatted-string output contained no
URLs at all, so papers could never have been cited even when retrieval worked.
Now 5 papers per report, cited and resolving.

**3. Every failure path was silent, and some fabricated.** Mock analysis,
heuristic-only credibility and an empty channel all returned HTTP 200 with a
normal-looking report. Worse, the fallbacks produced *plausible* content —
"multiple stakeholders involved", "the trend will continue based on current
evidence" — that reads as findings.

*Fixed by* making every fallback empty and attributable: each carries an
`[unavailable] <stage>: <reason>` marker with the exception that caused it,
`utils/degraded.py` names the affected stages, `ResearchWorkflow.run()`
attaches the list, and both API paths return it. The UI renders it as a banner
above the report.

**4. A report was generated from zero sources.** Found while testing the
retriever refactor: handed no sources at all, the report model wrote a fluent,
confident, entirely ungrounded report from its own priors — precisely the
failure this project exists to prevent, in the product that exists to prevent
it.

*Fixed by* refusing. The analyzer, insight generator and reporter now
short-circuit when there is nothing to work from, and the response says what
failed instead.

Also fixed in passing: `orchestration/coordinator.py` called `logger.warning`
in its RAG `except ImportError` handler before `logger` was defined, so a
genuine import failure would have raised `NameError` instead of the warning.

## Verifying the stages are live

`verify_stages.py` replays a captured retrieval payload through the credibility,
analyzer and insight stages and reports `LIVE` or `FALLBACK` for each. It needs
no search keys.

```bash
python eval/verify_stages.py            # uses eval/fixtures/sources.json
```

With `ANTHROPIC_API_KEY` set and the routing fix in place, all three report
`LIVE`: `llm_score` values spread across 0.3–0.85 instead of pinning to 0.5,
and the analyzer returns specific, source-attributed contradictions — e.g.
*"Source 5 explicitly states you cannot completely prevent hallucinations,
while Sources 1 and 4 imply they can be substantially reduced"* — in place of
the canned *"Some sources present conflicting viewpoints on key aspects"*.
