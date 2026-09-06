"""Probe the NVIDIA judge for structured-output reliability.

Run this BEFORE trusting any metric built on the judge. An OSS model behind an
OpenAI-compatible endpoint fails at JSON, not at judgement: the score is not
wrong, the call errors out. That failure is invisible in a metric report --
deepeval surfaces it as "Evaluation LLM outputted an invalid JSON" and the
test case is dropped -- so it has to be measured on its own.

The probe drives the *real* deepeval schemas (`Claims`, `Verdicts`,
`FaithfulnessScoreReason`, ...) over content from `eval/fixtures/sources.json`,
so a pass here means the same shapes the metrics ask for actually come back.

    python eval/semantic/validate_judge.py                 # 12 calls
    python eval/semantic/validate_judge.py --trials 3      # 3 per schema
    python eval/semantic/validate_judge.py --model meta/llama-3.1-8b-instruct

Exit code 0 when the hit rate clears --min-hit-rate (default 0.90), 1 when it
does not, 2 when the judge could not be constructed at all.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(REPO_ROOT / ".env")

from eval.semantic.judge import JudgeUnavailable, NvidiaJudge  # noqa: E402

FIXTURE = REPO_ROOT / "eval" / "fixtures" / "sources.json"


def _fixture_context(limit: int = 5) -> tuple[str, list[str]]:
    """Query plus a few real retrieved snippets, so the probe judges the same
    kind of text the metrics will."""
    if not FIXTURE.exists():
        return (
            "What is the TAM for AI coding assistants in 2025?",
            [
                "The TAM for AI coding assistants in 2025 was estimated at "
                "$3.0-$3.5 billion, growing to $97.9 billion by 2030.",
                "41% of code committed in 2025 was AI-generated or AI-assisted.",
            ],
        )
    payload = json.loads(FIXTURE.read_text())
    query = payload.get("query", "")
    snippets: list[str] = []
    for bucket in ("web", "papers", "news"):
        for item in (payload.get("sources") or {}).get(bucket) or []:
            text = (item.get("snippet") or item.get("summary") or "").strip()
            if len(text) > 40:
                snippets.append(text)
    return query, snippets[:limit]


def build_probes() -> list[dict]:
    """One probe per schema shape the RAG metrics actually request."""
    from deepeval.metrics.answer_relevancy.schema import (
        AnswerRelevancyScoreReason,
        Statements,
    )
    from deepeval.metrics.contextual_relevancy.schema import (
        ContextualRelevancyVerdicts,
    )
    from deepeval.metrics.faithfulness.schema import Claims, Truths, Verdicts

    query, snippets = _fixture_context()
    context = "\n".join(f"- {s}" for s in snippets)
    answer = (
        "The AI coding assistant market was worth roughly $3.2 billion in 2025 "
        "and is projected to reach $97.9 billion by 2030. Roughly 41% of "
        "committed code is now AI-assisted. Adoption is fastest in enterprises "
        "with existing DevOps tooling."
    )

    return [
        {
            "name": "Claims (list[str])",
            "schema": Claims,
            "prompt": (
                "Extract the factual claims from the text as a JSON object with "
                'a "claims" key holding a list of strings.\n\nText:\n' + answer
            ),
            "check": lambda r: len(r.claims) > 0,
        },
        {
            "name": "Truths (list[str])",
            "schema": Truths,
            "prompt": (
                "Extract the facts stated in the context as a JSON object with a "
                '"truths" key holding a list of strings.\n\nContext:\n' + context
            ),
            "check": lambda r: len(r.truths) > 0,
        },
        {
            "name": "Verdicts (literal enum + optional reason)",
            "schema": Verdicts,
            "prompt": (
                "For each claim decide whether the context supports it. Return a "
                'JSON object with a "verdicts" key: a list of objects each having '
                '"verdict" (exactly "yes", "no", or "idk") and "reason".\n\n'
                f"Context:\n{context}\n\nClaims:\n"
                '["The market was worth $3.2 billion in 2025", '
                '"Adoption is fastest in enterprises with DevOps tooling"]'
            ),
            # The enum is where weak models drift -- "Yes", "supported", "true".
            "check": lambda r: r.verdicts
            and all(v.verdict in ("yes", "no", "idk") for v in r.verdicts),
        },
        {
            "name": "Statements (list[str])",
            "schema": Statements,
            "prompt": (
                "Split the text into standalone statements. Return a JSON object "
                'with a "statements" key holding a list of strings.\n\nText:\n'
                + answer
            ),
            "check": lambda r: len(r.statements) > 0,
        },
        {
            "name": "ContextualRelevancyVerdicts (nested list)",
            "schema": ContextualRelevancyVerdicts,
            "prompt": (
                "For each context statement decide whether it is relevant to the "
                'question. Return a JSON object with a "verdicts" key: a list of '
                'objects each having "verdict" ("yes" or "no") and "statement".\n\n'
                f"Question: {query}\n\nContext:\n{context}"
            ),
            "check": lambda r: len(r.verdicts) > 0,
        },
        {
            "name": "ScoreReason (single string)",
            "schema": AnswerRelevancyScoreReason,
            "prompt": (
                "Explain in one sentence why the answer scores 0.8 for relevancy. "
                'Return a JSON object with a "reason" key.\n\n'
                f"Question: {query}\nAnswer: {answer}"
            ),
            "check": lambda r: bool(r.reason and r.reason.strip()),
        },
    ]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", default=None, help="NIM model id (vendor/name)")
    parser.add_argument("--trials", type=int, default=2, help="calls per schema")
    parser.add_argument("--min-hit-rate", type=float, default=0.90)
    parser.add_argument("--retries", type=int, default=2)
    parser.add_argument(
        "--out",
        default=str(REPO_ROOT / "eval" / "semantic" / "judge-validation.json"),
    )
    args = parser.parse_args()

    kwargs = {"max_retries": args.retries}
    if args.model:
        kwargs["model"] = args.model
    try:
        judge = NvidiaJudge(**kwargs)
    except JudgeUnavailable as exc:
        print(f"SKIP: {exc}")
        return 2

    probes = build_probes()
    print(f"Judge:  {judge.get_model_name()}")
    print(f"Probes: {len(probes)} schemas x {args.trials} trials\n")

    rows = []
    for probe in probes:
        outcomes = []
        for _ in range(args.trials):
            started = time.perf_counter()
            try:
                result = judge.generate(probe["prompt"], schema=probe["schema"])
                # Schema-valid but semantically empty still breaks a metric --
                # zero claims scores 1.0 by vacuous truth. Count it as a failure.
                ok = bool(probe["check"](result))
                outcomes.append(
                    {"ok": ok, "error": None if ok else "schema-valid but empty"}
                )
            except Exception as exc:
                outcomes.append({"ok": False, "error": f"{type(exc).__name__}: {exc}"})
            outcomes[-1]["latency_s"] = round(time.perf_counter() - started, 2)

        passed = sum(1 for o in outcomes if o["ok"])
        mark = "PASS" if passed == len(outcomes) else "FAIL"
        mean_latency = sum(o["latency_s"] for o in outcomes) / len(outcomes)
        print(
            f"  [{mark}] {probe['name']:<44} {passed}/{len(outcomes)}  "
            f"{mean_latency:.1f}s"
        )
        for outcome in outcomes:
            if outcome["error"]:
                print(f"         -> {outcome['error'][:150]}")
        rows.append(
            {
                "schema": probe["name"],
                "passed": passed,
                "trials": len(outcomes),
                "mean_latency_s": round(mean_latency, 2),
                "outcomes": outcomes,
            }
        )

    report = judge.report()
    total = sum(r["trials"] for r in rows)
    usable = sum(r["passed"] for r in rows)
    usable_rate = usable / total if total else 0.0

    print(
        f"\nOutput mode negotiated: {report['final_mode']}"
        + (
            "   (server-side constrained decoding -- JSON cannot be malformed)"
            if report["final_mode"] == "json_schema"
            else "   (not schema-constrained -- expect repair retries)"
        )
    )
    print(f"Usable replies:         {usable}/{total} ({usable_rate:.1%})")
    print(f"Valid on first attempt: {report['first_try_rate']:.1%}")
    print(
        f"Recovered by retry:     {report['ok_after_repair']}   "
        f"unrecoverable: {report['unrecoverable']}   "
        f"api errors: {report['api_errors']}"
    )

    payload = {
        "judge": report,
        "min_hit_rate": args.min_hit_rate,
        "usable_rate": round(usable_rate, 4),
        "probes": rows,
    }
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, indent=2))
    print(f"\nWrote {out.relative_to(REPO_ROOT)}")

    if usable_rate < args.min_hit_rate:
        print(
            f"\nFAIL: {usable_rate:.1%} < {args.min_hit_rate:.0%}. This judge is "
            "not reliable enough to build thresholds on. Try a larger NIM model "
            "(--model), or raise --retries."
        )
        return 1

    print(f"\nOK: judge clears {args.min_hit_rate:.0%}. Safe to run the metric suite.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
