# Chronicle evaluation results

- Run at: 2026-09-15T14:42:31+00:00
- Mode: `local`
- Queries: 3 (3 completed successfully)

## Multi-agent pipeline

| Metric | Value |
| --- | --- |
| Time to cited report (mean) | 167.29 s |
| Time to cited report (median) | 129.45 s |
| Time range | 72.71–299.72 s |
| Sources retrieved per report (mean) | 17.67 |
| Distinct domains per report (mean) | 12 |
| Retrieval mix (web / papers / news) | 8 / 1.67 / 8 |
| Citations per report (mean) | 10.33 |
| Citation grounding rate | 96.8% |
| Mean credibility score of sources | 0.51 |
| High / medium / low credibility sources | 2.33 / 2.67 / 12.67 |
| Contradictions flagged per report (mean) | 3 |
| Reports where a contradiction was found | 3 / 3 |
| Report length (mean words) | 2071 |

## Single-LLM baseline

Not run — no `OPEN_ROUTER_KEY` or `GROQ_API_KEY` available in this environment. Re-run with `--baseline` once a key is set to produce the ablation column.

## Retrieval A/B: single-shot vs iterative loop

Same 3 queries through both arms, one process, identical models. `single-shot` is the original retriever; `iterative` is `RESEARCH_LOOP_ENABLED=true`.

| Metric | Single-shot | Iterative | Change |
| --- | --- | --- | --- |
| Time to cited report (mean s) | 110.62 | 167.29 | +56.67 (+51%) ⚠️ |
| Search queries issued (mean) | 1 | 1.67 | +0.67 (+67%) |
| Sources retrieved (mean) | 12 | 17.67 | +5.67 (+47%) ✅ |
| Distinct domains (mean) | 8 | 12 | +4.00 (+50%) ✅ |
| Citations per report (mean) | 8.33 | 10.33 | +2.00 (+24%) ✅ |
| Citation grounding rate | 100.0% | 96.8% | -3.2 pp ⚠️ |
| Mean credibility of sources | 0.49 | 0.51 | +0.02 (+4%) ✅ |
| Contradictions flagged (mean) | 5.67 | 3 | -2.67 (-47%) ⚠️ |
| Report length (mean words) | 2030 | 2071 | +41.00 (+2%) |

Loop stop reasons observed: sufficient.

## Per-query detail

| Query | Latency (s) | Sources | Citations | Grounded | Contradictions |
| --- | --- | --- | --- | --- | --- |
| What is the total addressable market for AI coding assistant… | 129.45 | 12 | 7 | 85.7% | 1 |
| Who are the main competitors in the AI research assistant sp… | 299.72 | 29 | 24 | 100.0% | 5 |
| What regulatory requirements apply to AI-generated medical a… | 72.71 | 12 | 0 | n/a% | 3 |
