# Chronicle evaluation results

- Run at: 2026-07-25T17:45:23+00:00
- Mode: `api` against `https://multi-agent-deep-research-api.fly.dev`
- Queries: 6 (6 completed successfully)

## Multi-agent pipeline

| Metric | Value |
| --- | --- |
| Time to cited report (mean) | 6.22 s |
| Time to cited report (median) | 4.41 s |
| Time range | 3.64–16.16 s |
| Sources retrieved per report (mean) | 12 |
| Distinct domains per report (mean) | 8.33 |
| Retrieval mix (web / papers / news) | 6 / 0 / 6 |
| Citations per report (mean) | 9 |
| Citation grounding rate | 100.0% |
| Cited URLs that resolve | 92.6% |
| Mean credibility score of sources | 0.55 |
| High / medium / low credibility sources | 0 / 1 / 11 |
| Contradictions flagged per report (mean) | 1 |
| Reports where a contradiction was found | 6 / 6 |
| Report length (mean words) | 693.83 |

## Single-LLM baseline (no retrieval, no verification)

Model: `claude-sonnet-4-5`

| Metric | Multi-agent | Single LLM |
| --- | --- | --- |
| Time to report (mean) | 6.22 s | 20.1 s |
| Citations per report (mean) | 9 | 6.17 |
| Citations grounded in retrieved sources | 100.0% | 0.0% |
| Cited URLs that resolve | 92.6% | 64.9% |

## Per-query detail

| Query | Latency (s) | Sources | Citations | Grounded | Contradictions |
| --- | --- | --- | --- | --- | --- |
| What is the total addressable market for AI coding assistant… | 16.16 | 12 | 8 | 100.0% | 1 |
| Who are the main competitors in the AI research assistant sp… | 4.1 | 12 | 9 | 100.0% | 1 |
| What regulatory requirements apply to AI-generated medical a… | 4.47 | 12 | 10 | 100.0% | 1 |
| What are the latest techniques for reducing hallucination in… | 4.63 | 12 | 10 | 100.0% | 1 |
| How much venture funding went into AI agent startups in the … | 4.35 | 12 | 8 | 100.0% | 1 |
| What are the dominant pricing models for developer-tool SaaS… | 3.64 | 12 | 9 | 100.0% | 1 |
