# Semantic evaluation

The harness in `eval/run_eval.py` measures citations **structurally**: it
proves a cited URL is one the retriever genuinely fetched. That catches the
fabricated-citation failure, and the single-LLM ablation shows it plainly —
96.9% grounded versus 0%, with 12 of the baseline's 35 URLs not resolving at
all.

What it cannot tell you is whether the *sentence attached* to a real citation
actually follows from what that source said. A report can score 100% grounding
and still misread every page it cites. That gap is what this layer measures,
using DeepEval's RAG metrics with an LLM judge.

The two layers answer different questions and neither replaces the other:

| | Structural (`run_eval.py`) | Semantic (here) |
| --- | --- | --- |
| Question | Is this URL real and retrieved? | Does this claim follow from it? |
| Method | String/domain matching, HTTP checks | LLM-as-judge |
| Cost | Free, deterministic | Judge calls, noisy |
| Fails on | Hallucinated URLs | Misread sources, drift, bad retrieval |

## Why NVIDIA NIM as the judge

Two reasons, in order of importance.

**Independence.** The pipeline's stages run Gemini Flash and Groq Llama
(`utils/llm_config.py`). A judge from the same family as the generator scores
its own output generously — the well-documented self-preference effect. NIM
hosts a third family, so the judge has no stake in the answer.

**Token budget.** `env.example` already records that Groq's free tier caps at
12k tokens/minute and that a report prompt built from ~17 sources exceeds it.
Faithfulness judging is *more* token-hungry than generation — it re-reads the
full retrieval context once per claim — so Groq's free tier is the wrong shape
for it. NIM's free tier meters per request instead.

Any OpenAI-compatible endpoint works; `--model` and `JUDGE_MODEL` override the
default, and `NVIDIA_BASE_URL` repoints the client entirely.

## Setup

```bash
pip install -r eval/semantic/requirements.txt
# add NVIDIA_API_KEY to .env — get one at https://build.nvidia.com/
```

## 1. Validate the judge first

The failure mode of an OSS judge is not a wrong score, it is unparseable
output. DeepEval asks for structured JSON (`{"claims": [...]}`,
`{"verdicts": [{"verdict": "yes"|"no"|"idk"}]}`); when the model fences it,
prefixes prose, or writes `"Yes"` instead of `"yes"`, the metric raises
*"Evaluation LLM outputted an invalid JSON"* and the case is dropped. Averages
computed over the survivors then look fine.

So measure that first, against the real deepeval schemas:

```bash
python eval/semantic/validate_judge.py
python eval/semantic/validate_judge.py --model meta/llama-3.1-8b-instruct --trials 5
```

It reports the negotiated output mode and the usable-reply rate, and exits
non-zero below `--min-hit-rate` (default 90%). If the negotiated mode is
`json_schema`, the endpoint is doing server-side constrained decoding and the
JSON is structurally guaranteed; `json_object` and `prompt` mean the wrapper is
repairing replies, and the retry counts tell you how often.

`judge.py` handles this by negotiating downward (`json_schema` → `json_object`
→ prompt-described), stripping fences, repairing trailing commas, and retrying
with the validation error fed back. A mode downgrade deliberately does not
consume the retry budget.

## 2. Capture pipeline runs

Scored results keep only aggregates, so the raw report and sources have to be
captured to score them semantically without re-running a 50s/query pipeline
against free-tier quota every time a threshold changes:

```bash
python eval/run_eval.py --queries 6 --save-payloads
python eval/semantic/dataset.py     # what got captured, and what will be skipped
```

Captures land in `eval/semantic/captures/` (gitignored — regenerable, large).
Runs with `degraded` stages are skipped rather than scored: an `[unavailable]`
report measures the outage, not the pipeline.

## 3. Score

```bash
python eval/semantic/run_semantic.py                     # score and report
python eval/semantic/run_semantic.py --calibrate         # set thresholds
python eval/semantic/run_semantic.py --fail-under-threshold
pytest eval/semantic -v                                  # the CI gate
```

## Metrics

Split by what they need, because the split is not cosmetic:

**Scored on every capture** — the pipeline already produces everything they
need.

- **Faithfulness** — do the report's claims follow from the retrieved context?
  The claim-level counterpart to the structural grounding rate, and the number
  worth watching. A widening gap between them means the reporter is citing real
  pages while misreading them.
- **Answer Relevancy** — does the report answer the question asked?
- **Contextual Relevancy** — how much of what the retriever returned was
  on-topic? Scores the retriever, not the writer.

**Require goldens** — these compare retrieval against a human-written expected
answer, so without one they are not zero, they are *unmeasurable*, and the
suite skips them rather than reporting a misleading number.

- **Contextual Precision** — are the relevant chunks ranked above irrelevant ones?
- **Contextual Recall** — did retrieval find what the expected answer needs?

To enable them, write `eval/semantic/goldens.json`:

```json
{ "What is the total addressable market for AI coding assistants in 2025?": "..." }
```

## Thresholds

`thresholds.json` ships **uncalibrated**, with conservative placeholders that
are not measurements — do not quote them. Run `--calibrate` once against a
pipeline you believe is healthy; it writes each measured mean minus a 0.10
margin (judge scores drift run to run even at temperature 0) and flips
`calibrated` to true. `pytest` skips the gate while uncalibrated rather than
passing against numbers nobody measured.

After that the thresholds are a regression gate. Moving them so a failing run
passes defeats the point of having them.

## Reading the scores honestly

- **The judge is a free-tier OSS model.** Treat the scores as a regression
  signal, not an absolute quality measure. A drop from 0.85 to 0.60 between
  runs is informative; 0.85 versus 0.87 is noise.
- **Faithfulness is not correctness.** It measures whether claims follow from
  the retrieved sources. If the sources are wrong, a faithful report is
  confidently wrong. Read it next to the credibility distribution, the same
  caveat the structural harness carries.
- **Every score is one judge's opinion.** The one thing a judge cannot make up
  is whether a URL was fetched. That is why the structural layer stays.

## Files

| File | Role |
| --- | --- |
| `judge.py` | `NvidiaJudge` — output-mode negotiation, JSON repair, retry, reliability stats |
| `validate_judge.py` | Structured-output reliability probe. Run before trusting scores |
| `dataset.py` | Captures → `LLMTestCase`s; skips degraded runs |
| `metrics.py` | Metric construction and the goldens gate |
| `run_semantic.py` | Scoring run, markdown/JSON report, `--calibrate` |
| `test_semantic_grounding.py` | Pytest gate for CI |
| `thresholds.json` | Per-metric minimums |
