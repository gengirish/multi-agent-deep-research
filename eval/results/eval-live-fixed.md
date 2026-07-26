# Chronicle evaluation results

- Run at: 2026-07-26T01:33:25+00:00
- Mode: `api` against `https://multi-agent-deep-research-api.fly.dev`
- Queries: 6 (5 completed successfully)

## Multi-agent pipeline

| Metric | Value |
| --- | --- |
| Time to cited report (mean) | 48.63 s |
| Time to cited report (median) | 45.82 s |
| Time range | 43.46–59.37 s |
| Sources retrieved per report (mean) | 17 |
| Distinct domains per report (mean) | 8.6 |
| Retrieval mix (web / papers / news) | 6 / 5 / 6 |
| Citations per report (mean) | 12.8 |
| Citation grounding rate | 96.9% |
| Cited URLs that resolve | 100.0% |
| Mean credibility score of sources | 0.64 |
| High / medium / low credibility sources | 6 / 2.8 / 8.2 |
| Contradictions flagged per report (mean) | 5.4 |
| Reports where a contradiction was found | 5 / 5 |
| Report length (mean words) | 755.6 |

## Single-LLM baseline (no retrieval, no verification)

Model: `claude-sonnet-4-5`

| Metric | Multi-agent | Single LLM |
| --- | --- | --- |
| Time to report (mean) | 48.63 s | 20.06 s |
| Citations per report (mean) | 12.8 | 5.83 |
| Citations grounded in retrieved sources | 96.9% | 0.0% |
| Cited URLs that resolve | 100.0% | 65.7% |

## Per-query detail

| Query | Latency (s) | Sources | Citations | Grounded | Contradictions |
| --- | --- | --- | --- | --- | --- |
| What is the total addressable market for AI coding assistant… | — | — | — | — | failed: ReadTimeout: HTTPSConnectionPool(host='multi-agent-deep-research-api.fly.dev', port=443): Read timed out. (read timeout=900) |
| Who are the main competitors in the AI research assistant sp… | 59.37 | 17 | 14 | 100.0% | 3 |
| What regulatory requirements apply to AI-generated medical a… | 45.82 | 17 | 14 | 100.0% | 2 |
| What are the latest techniques for reducing hallucination in… | 43.46 | 17 | 13 | 92.3% | 1 |
| How much venture funding went into AI agent startups in the … | 49.09 | 17 | 10 | 90.0% | 18 |
| What are the dominant pricing models for developer-tool SaaS… | 45.41 | 17 | 13 | 100.0% | 3 |
