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
```

Results land in `eval/results/eval-<label>.json` (full per-query detail) and
`eval/results/eval-<label>.md` (summary tables).

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

The single-LLM baseline (`--baseline`) asks one model, one prompt, no retrieval
and no verification, for the same cited report. Its citations are scored against
an empty retrieval set, so any URL it produces is by construction ungrounded —
which is the point of the comparison. It uses the strongest provider available —
`ANTHROPIC_API_KEY`, then `OPEN_ROUTER_KEY`, then `GROQ_API_KEY` — so the
baseline is a fair fight; override with `BASELINE_MODEL`. Without any key it is
skipped and the multi-agent numbers still run.

## Measured run — 25 Jul 2026

6 queries against the live deployment (`multi-agent-deep-research-api.fly.dev`),
full detail in
[`results/eval-live-vs-baseline.json`](results/eval-live-vs-baseline.json):

| Metric | Value |
| --- | --- |
| Time to cited report | 6.22 s mean, 4.41 s median, 3.64–16.16 s range |
| Sources retrieved per report | 12 (6 web + 6 news + 0 papers) |
| Distinct domains per report | 8.3 |
| Citations per report | 9 |
| Citation grounding rate | **100%** (54 of 54) |
| Cited URLs that resolve | 92.6% (50 of 54) |
| Report length | 694 words mean |

The 16.16 s outlier is the first query of the run — a cold Fly.io machine.
An earlier run of the same 6 queries on a warm machine averaged 7.89 s
([`results/eval-live.json`](results/eval-live.json)).

### Ablation: single LLM, no retrieval

Same 6 questions put to Claude Sonnet 4.5 in one prompt, asked for the same
cited report, with no retrieval and no verification:

| Metric | Multi-agent | Single LLM |
| --- | --- | --- |
| Time to report (mean) | 6.22 s | 20.1 s |
| Citations produced | 54 | 37 |
| Citations grounded in a retrieved source | **100%** | **0%** |
| Cited URLs that resolve | 92.6% (50/54) | 64.9% (24/37) |

Two things fall out of this. The single LLM cites fewer sources and takes three
times as long, because it writes prose where the pipeline assembles retrieved
material. More importantly, **13 of the 37 URLs it cited do not resolve** — the
hallucinated-citation failure, measured rather than asserted. None of the
pipeline's 54 citations are invented, because the reporter can only cite what
the retriever handed it; the 4 that don't resolve are live sources behind
bot-blocking or since-moved pages, not fabrications.

The grounding rate is a structural property, not a quality score: it says
citations are real, not that the report is good. Read it alongside the
credibility distribution, not instead of it.

## What the measurement exposed

Three findings that the numbers above surfaced. The first two are fixed in the
code — see [What changed](#what-changed) — but the fixes only reach the live
deployment once its secrets and image are updated.

**1. The deployed backend is serving mock analysis.** Every response carries
`analysis.raw_analysis == "Mock analysis - LLM not configured"` and
`insights.raw_insights == "Mock insights - LLM not configured"`. The analyzer
([`agents/analyzer.py:181`](../agents/analyzer.py#L181)) and insight generator
([`agents/insight_generator.py:201`](../agents/insight_generator.py#L201)) are
returning their canned fallbacks, so the "key findings", "contradictions",
hypotheses and trends in every live report are fixed strings, identical across
queries. Retrieval and report generation (both Groq-routed) are genuinely live;
everything routed through OpenRouter is not.

Contributing cause: `ANALYZER_MODEL` defaults to `anthropic/claude-3-5-sonnet`
([`utils/llm_config.py:54`](../utils/llm_config.py#L54)), and OpenRouter no
longer lists **any** Claude 3.5 slug — verified against
`https://openrouter.ai/api/v1/models`. `INSIGHT_MODEL` (`openai/gpt-4o`) is
still a valid slug but also falls back, which points at a key- or
credit-level failure on top of the stale model id.

Because the credibility agent's LLM leg fails the same way, every source scores
`llm_score` of exactly 0.5 — the failure constant from
[`agents/credibility.py:257`](../agents/credibility.py#L257) — which is weighted
0.6 and drags every source into a 0.52–0.57 band. That is why the measured run
reports a 0.55 mean credibility score with 11 of 12 sources labelled "Low":
the label is an artifact of the failure, not a judgement about the sources.

**Do not put the credibility or contradiction numbers from this run on a slide.**
The grounding, latency, source-count and URL-resolution numbers are unaffected —
they come from retrieval and report assembly, which work.

**2. The arXiv channel returns nothing in production.** `papers` was 0 across
all 6 queries even for the RAG-techniques query, which should hit arXiv
squarely. `arxiv>=2.1.0` is in `requirements.txt`, so this is a runtime
failure inside `_retrieve_papers_sync`, silently swallowed
([`agents/retriever.py:192`](../agents/retriever.py#L192)).

**3. Every failure path is silent.** Mock analysis, heuristic-only credibility
and an empty paper channel all return HTTP 200 with a normal-looking report.
Nothing in the API response distinguished a fully-live run from a degraded one.

## What changed

**Native Anthropic routing, and a model id that exists.** `utils/llm_config.py`
gained an `anthropic/...` provider branch (`_build_anthropic`, via
`langchain-anthropic`) alongside the existing Groq and Google ones, and the
analyzer/credibility default moved from the retired `anthropic/claude-3-5-sonnet`
to `anthropic/claude-sonnet-4-5`. OpenRouter remains the fallback for every
provider, so a missing native key still degrades rather than breaks. Set
`ANTHROPIC_API_KEY` to use the native path.

**A `degraded` field on the response.** `utils/degraded.py` inspects a finished
run and names the stages that fell back — mock analysis, mock insights,
credibility scores pinned to the 0.5 failure constant, or an empty retrieval
channel. `ResearchWorkflow.run()` attaches it and logs a warning;
`ResearchResponse.degraded` carries it to the client. An empty list means a
fully live run. The eval harness records it per query.

Also fixed in passing: `orchestration/coordinator.py` called `logger.warning`
in its RAG `except ImportError` handler before `logger` was defined, so a
genuine import failure would have raised `NameError` instead of the intended
warning. The logger is now initialized before the try block.

Finding 2 (arXiv returning nothing) is **not** fixed — the failure is inside
`_retrieve_papers_sync` and needs the real exception, which the current
`except` swallows.

## Verifying the stages are live

`verify_stages.py` replays a captured retrieval payload through the credibility,
analyzer and insight stages and reports `LIVE` or `FALLBACK` for each. It needs
no search keys.

```bash
python eval/verify_stages.py            # uses eval/fixtures/sources.json
```

With `ANTHROPIC_API_KEY` set and the routing fix in place, all three report
`LIVE`: `llm_score` values spread across 0.3–0.6 instead of pinning to 0.5, and
the analyzer returns specific, source-derived contradictions — e.g. *"2025 TAM
estimates conflict significantly: Gartner estimates $3.0–3.5B, MarketsandMarkets
..."* — in place of the canned *"Some sources present conflicting viewpoints on
key aspects"*.
