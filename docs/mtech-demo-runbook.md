# Chronicle — demo runbook & talk track

For the MTech / GAA project demo. Deck: 15 slides, speaker notes built in (press `N`).
Guidelines allow a **10-minute video** and a **3–5 minute one-to-one viva**.

---

## 0. Guideline compliance

`GAA_Project_Guidelines.pdf` asks the slides to focus on six things. Mapping:

| Required section | Slide(s) | Covered by |
| --- | --- | --- |
| Application and motivation | 2 | Fabricated-citation failure mode, three failing alternatives |
| Dataset used | 5 | No fine-tuning; per-query live retrieval, 17 sources across 3 channels |
| Model / technique used | 4, 6 | LangGraph five-node state machine; per-stage model + temperature table |
| Customization and implementation details | 6, 7 | Model routing, invoke-time failover, token floor, parser hardening, degradation detection |
| Deployment (if applicable) | 8 | Vercel + Fly.io + Neon + ARQ/Redis, SSE streaming, MCP surface |
| Results, conclusions, future work | 10, 13, 14 | Ablation results, five conclusions, prioritized roadmap |

Four slides go beyond the required list — 3 (what it does / demo cue), 9 (evaluation
method), 11 (what measurement exposed), 12 (limitations). They exist because the
guidelines require a **working implementation capable of generating meaningful
results**, and because the viva asks every member to explain model, data,
implementation and results. Slides 9–12 are where those answers live.

There is deliberately **no literature-survey slide** — the guidelines explicitly
say not to spend time there.

> **One rebalance for the video.** The guidelines say the 10-minute video should
> focus *mainly on demonstrating the working application and generated results,
> rather than lengthy explanations.* The run order in §2 is tuned for a live
> presentation and gives the demo about a minute. **For the recorded video, cut
> slides 4–8 to roughly 30 seconds each and give the live run 3–4 minutes** —
> show the agent stream, open a citation, scroll the contradictions. Same deck,
> different pacing.

**Team size:** the guidelines cap teams at 2, and expect two-member teams to show
model customization, custom datasets, or a more comprehensive application. If
you're presenting as a pair, lead with breadth — five-agent pipeline, evaluation
harness, two deployed surfaces, MCP package — and make sure both members can
answer §4 unaided.

---

## 1. Before you present (do this 15 minutes ahead)

| Check | Command / action | Expected |
| --- | --- | --- |
| Backend awake | `curl https://multi-agent-deep-research-api.fly.dev/api/health` | `{"status":"ok"}` |
| Warm the pipeline | Run one full query on the live site | Report returns, no degraded banner |
| Frontend up | Open https://deep-research.intelliforge.tech | Loads under 1 s |
| Free-tier quota | Confirm today's Gemini / Groq quota isn't exhausted | No `[unavailable]` markers in the report |
| Fallback tab | Have `eval/results/eval-live-fixed.md` open | For the numbers, if live run stalls |
| Backup recording | Screen-record one successful run the night before | Insurance |

**Warm it up.** Fly is pinned to one machine, but the first LLM call of the day is
still the slowest. Never let the examiner's query be the first query of the day.

**Have a pre-baked result open in a tab.** A run takes ~50 s and has a known tail
case (one query in the measured set took 900 s and needed a retry). If the live
run stalls past ~90 s, keep talking and switch to the pre-baked report. Say what
you're doing — "this is the tail-latency case from my limitations slide" turns a
stumble into a point you already made.

---

## 2. Ten-minute run order

| Time | Slides | What you're doing |
| --- | --- | --- |
| 0:00–0:40 | 1–2 | Title + the problem: fabricated citations, not bad answers |
| 0:40–1:20 | 3 | What it does — **start the live query here** |
| 1:20–2:30 | 4–5 | Pipeline + data, while the query runs on the other screen |
| 2:30–3:30 | — | **Back to the live run.** Walk the actual output |
| 3:30–4:30 | 6–7 | Model routing, temperatures, the four engineering fixes |
| 4:30–5:10 | 8 | Deployment |
| 5:10–6:00 | 9 | Evaluation method — including the "0% by construction" caveat |
| 6:00–7:10 | 10 | **Results.** Slow down here |
| 7:10–8:10 | 11 | What measurement exposed — the four hidden failures |
| 8:10–8:50 | 12 | Limitations |
| 8:50–9:40 | 13–14 | Conclusions + future work |
| 9:40–10:00 | 15 | Close, invite questions |

### Walking the live output (the 2:30–3:30 segment)

This is the part that actually demonstrates a working implementation. Point at,
in this order:

1. **The agent step stream** — five stages completing in sequence, not a spinner.
2. **A citation** — click it. It opens. "Every one of these was fetched by the
   retriever before the report was written."
3. **The contradictions section** — "these are source-attributed, naming which
   sources disagree, not a generic 'sources differ' string."
4. **The credibility spread** — "scored per source, mixed high and low, which is
   what a real source set looks like."
5. **No degraded banner** — "if any stage had fallen back, it would be named here."

---

## 3. Lines worth memorising

- *"The failure mode isn't bad answers. It's confident answers with fabricated sources."*
- *"Twelve of the thirty-five URLs the single model cited do not resolve. That's the hallucinated-citation problem measured, not asserted."*
- *"Decomposition bought me verifiability, not just quality. Because retrieval is a separate stage that keeps its output, 'is this citation real' becomes computable."*
- *"Latency is the price of grounding, not an implementation defect."*
- *"Silent failure was the recurring defect here — every serious bug returned HTTP 200 with a normal-looking report."*
- *"The pre-fix pipeline answered in 6.2 seconds. That was the speed of skipping the work."*

---

## 4. Viva Q&A — the answers you need cold

**Q. Why five agents instead of one good prompt?**
Three reasons, in order of strength. (1) *Verifiability*: retrieval is a discrete
stage whose output is retained in graph state, so a citation can be mechanically
checked against it — inside one prompt there is nothing to check against.
(2) *Different tuning*: retriever runs at temperature 0.1, insight at 0.7, report
at 0.2; one prompt gets one temperature. (3) *Attributable failure*: each stage
fails distinctly, so degradation can be named per stage instead of the whole
answer silently getting worse.

**Q. What dataset did you use? Did you fine-tune?**
No fine-tuning, no fixed corpus. The dataset is assembled per query at runtime:
~6 web results via Tavily, ~5 arXiv papers via the `arxiv` SDK, ~6 news items —
17 sources across ~8.6 distinct domains in the measured run. That retrieved set
is retained and is the ground truth the grounding metric scores citations against.

**Q. How is credibility actually scored?**
A weighted blend, in `agents/credibility.py`: `0.4 × heuristic + 0.6 × LLM`.
The heuristic starts at 0.5 and adjusts on signals — `+0.3` for academic domains
(`.edu`, `arxiv.org`, `pubmed`), `+0.2` for `.gov` and wire services, `−0.1` for
blog platforms, `−0.2` for social media, `+0.2` if the source is a paper, plus
small bumps for a real title and named authors, clamped to 0–1. The LLM leg rates
the source independently. Both legs are reported separately (`heuristic_score`,
`llm_score`) so a failed LLM leg is visible rather than averaged in.

*Follow-up you should pre-empt:* that failure actually happened — the LLM leg was
returning its 0.5 failure constant for every source, and at weight 0.6 it dragged
everything into a 0.52–0.57 band. The reported "11 of 12 sources are low
credibility" was an artifact of the failure, not a judgement. That's why the two
legs are now reported separately.

**Q. Isn't the 0% grounding for the baseline rigged?**
Yes, partly, and I say so on the slide. The baseline has no retrieval set, so any
URL it emits is ungrounded by construction — that number is definitional. The
independent number is the resolve check: I fetched all 35 URLs it produced and
12 returned an error or didn't exist. 65.7% versus 100% is the honest comparison.

**Q. Is 96.9% cherry-picked? Six queries is small.**
Six queries, 64 citations, one live deployment — it's a small sample and I'd
describe it as an indicative measurement, not a benchmark. It's also reproducible:
`python eval/run_eval.py --check-urls` re-runs it, and the raw per-query JSON is
committed in `eval/results/`. Two caveats I'd add unprompted: one of the six
queries timed out and needed a retry, and the run predates the current free-tier
model routing.

**Q. Why is it slower than just asking a model?**
2.4× slower — 48.6 s versus 20.1 s. It retrieves 17 sources, scores each one for
credibility, runs a separate analysis pass, then writes. The single model writes
from memory immediately. That's the trade the product makes deliberately.

**Q. What's the prompt engineering contribution?**
Per-stage system prompts with per-stage temperature (0.1 / 0.5 / 0.1 / 0.7 / 0.2),
structured section output from the analyzer (`SUMMARY`, `KEY CLAIMS`,
`CONTRADICTIONS`) parsed into typed fields, and an output-token floor of 8192 on
Gemini because it counts internal reasoning against `max_output_tokens` — at 2000
the response truncated after the first section.

**Q. What happens when a provider is down or out of quota?**
Every client is wrapped at *invoke* time with `.with_fallbacks([openai/gpt-oss-20b:free])`
through OpenRouter. It has to be invoke-time: 429 and 402 surface on the call, not
on client construction, so a construction-time fallback never fires. If the
fallback also fails, the stage returns an empty, attributable result carrying
`[unavailable] <stage>: <reason>`, `utils/degraded.py` collects the affected
stage names, and the UI shows a banner above the report. It degrades visibly
rather than fabricating.

**Q. What does it cost to run?**
Zero. All five stages default to provider free tiers — Gemini Flash for analyzer,
insight and report; Groq Llama 3.3 70B for retriever and credibility — with a
free OpenRouter OSS model as failover. Setting `ANALYZER_MODEL=anthropic/claude-sonnet-4-5`
upgrades reasoning quality when there's budget; it's one environment variable.

**Q. How is this different from Perplexity or ChatGPT deep research?**
Two things I'd claim, neither of them "better model". First, the grounding
guarantee is structural and measured — I publish the harness and the number.
Second, the intermediate state is a product surface: credibility per source and
contradictions *between* sources are shown, not resolved away. It's built for
someone who has to defend the claim, not just read it.

**Q. What would you do next if you had another two weeks?**
A verification pass that refuses to emit any citation not matching a retrieved
source — that closes the 96.9→100% gap by construction rather than by prompting
harder. Then re-run the harness on the current free-tier routing, which is
overdue, and add a timeout budget for the tail-latency case.

**Q. What's the single hardest bug you fixed?**
The deployment was serving mock analysis while looking completely healthy. Every
report's findings and contradictions were byte-identical canned strings, returned
with HTTP 200. `ANALYZER_MODEL` pointed at a Claude 3.5 slug OpenRouter had
delisted, and the fallback produced plausible filler — "multiple stakeholders
involved" — that reads like a finding. It was only visible because I ran the
evaluation harness against the live deployment rather than trusting the UI.

---

## 5. Numbers to have on the tip of your tongue

| | |
| --- | --- |
| Time to cited report | 48.6 s mean, 43.5–59.4 s range |
| Sources / citations per report | 17 sources (6 web, 5 papers, 6 news), 12.8 citations |
| Grounding | 96.9% — 62 of 64 |
| Cited URLs resolve | 100% — 64 of 64 |
| Single-LLM baseline | 0% grounded, 23 of 35 URLs resolve, 20.1 s |
| Contradictions per report | 5.4, source-attributed |
| Credibility | mean 0.64; 6 high / 2.8 medium / 8.2 low |
| Cost per run | $0 |
| Measurement date / config | 26 Jul 2026, Claude Sonnet 4.5 analyzer |

**Always state the config with the numbers.** The pipeline now defaults to
free-tier Gemini Flash and Groq, and grounding has not been re-scored on that routing.

### Health spot-check, 9 Aug 2026 (current free-tier routing)

One live query — *"dominant pricing models for developer-tool SaaS in 2025"* —
against production, to confirm the demo works on today's configuration:

| | |
| --- | --- |
| Latency | 63.8 s |
| `degraded` | `[]` — every stage ran for real |
| Sources | 17 (6 web / 5 papers / 6 news) |
| Claims / contradictions | 4 / 3 |
| Report | 1600 words, 11 unique cited URLs |

Grounding was not scored on this run — it's a health check, not a measurement.
Say it that way if asked.

**One transient failure worth knowing about:** an earlier attempt returned HTTP 200
but the connection dropped mid-body at ~103 s. The retry succeeded in 64 s. This is
the same tail-latency behaviour as the 900 s case in the eval — treat a stalled run
as expected, not as a broken demo, and have the backup tab ready.

---

## 6. If something breaks live

| Symptom | Say this | Do this |
| --- | --- | --- |
| Query hangs past 90 s | "This is the tail-latency case on my limitations slide." | Switch to the pre-baked report tab |
| Degraded banner appears | "That banner is the feature — the stage failed and it's telling you which one, instead of inventing content." | Keep going; it proves the design |
| Backend 502 / cold | "Fly scaled the machine down; first request wakes it." | Re-fire; meanwhile show the eval results |
| Frontend loads, no result | Show `eval/results/eval-live-fixed.md` | Walk the measured numbers instead |

A visible failure you have already named on a slide costs you nothing. An
unexplained one costs you the room. Name it first.
