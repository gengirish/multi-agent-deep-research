# Chronicle evaluation results

- Run at: 2026-07-25T17:15:24+00:00
- Mode: `api` against `https://multi-agent-deep-research-api.fly.dev`
- Queries: 6 (6 completed successfully)

## Multi-agent pipeline

| Metric | Value |
| --- | --- |
| Time to cited report (mean) | 7.89 s |
| Time to cited report (median) | 7.82 s |
| Time range | 6.72–9.18 s |
| Sources retrieved per report (mean) | 12 |
| Distinct domains per report (mean) | 8.33 |
| Retrieval mix (web / papers / news) | 6 / 0 / 6 |
| Citations per report (mean) | 9 |
| Citation grounding rate | 100.0% |
| Cited URLs that resolve | 90.7% |
| Mean credibility score of sources | 0.55 |
| High / medium / low credibility sources | 0 / 1 / 11 |
| Contradictions flagged per report (mean) | 1 |
| Reports where a contradiction was found | 6 / 6 |
| Report length (mean words) | 715.17 |

## Single-LLM baseline

Not run — no `OPEN_ROUTER_KEY` or `GROQ_API_KEY` available in this environment. Re-run with `--baseline` once a key is set to produce the ablation column.

## Per-query detail

| Query | Latency (s) | Sources | Citations | Grounded | Contradictions |
| --- | --- | --- | --- | --- | --- |
| What is the total addressable market for AI coding assistant… | 6.72 | 12 | 8 | 100.0% | 1 |
| Who are the main competitors in the AI research assistant sp… | 7.29 | 12 | 9 | 100.0% | 1 |
| What regulatory requirements apply to AI-generated medical a… | 8.53 | 12 | 10 | 100.0% | 1 |
| What are the latest techniques for reducing hallucination in… | 7.61 | 12 | 10 | 100.0% | 1 |
| How much venture funding went into AI agent startups in the … | 8.04 | 12 | 8 | 100.0% | 1 |
| What are the dominant pricing models for developer-tool SaaS… | 9.18 | 12 | 9 | 100.0% | 1 |
