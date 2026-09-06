"""Score captured runs with the NVIDIA-judged RAG metrics.

    python eval/semantic/run_semantic.py                # score, print, save
    python eval/semantic/run_semantic.py --calibrate    # also set thresholds
    python eval/semantic/run_semantic.py --model meta/llama-3.1-8b-instruct

Reads `eval/semantic/captures/` (written by `run_eval.py --save-payloads`),
writes `eval/semantic/results/semantic-<label>.{json,md}`.

`--calibrate` writes the measured mean minus a margin into thresholds.json and
flips `calibrated` to true. Run it once against a pipeline you believe is
healthy; after that the thresholds are a regression gate, and moving them to
make a failing run pass defeats the point of having them.
"""

from __future__ import annotations

import argparse
import json
import statistics
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(REPO_ROOT / ".env")

from eval.semantic.dataset import CAPTURE_DIR, build_test_cases, load_goldens  # noqa: E402
from eval.semantic.judge import JudgeUnavailable, NvidiaJudge  # noqa: E402
from eval.semantic.metrics import (  # noqa: E402
    THRESHOLDS_PATH,
    applicable_metrics,
    build_metrics,
    load_thresholds,
)

RESULTS_DIR = REPO_ROOT / "eval" / "semantic" / "results"
# How far below the observed mean a calibrated threshold sits. Judge scores
# move run to run even at temperature 0, so a gate set at the mean fails on
# noise; this is wide enough to absorb that and still catch a real drop.
CALIBRATION_MARGIN = 0.10


def _fmt(value) -> str:
    return "n/a" if value is None else f"{value:.3f}"


def markdown(payload: dict) -> str:
    lines = [
        "# Semantic evaluation",
        "",
        f"- Judge: `{payload['judge']['model']}` (mode: {payload['judge']['final_mode']})",
        f"- Captures scored: {payload['scored']} of {payload['captures']}",
        f"- Run: {payload['timestamp']}",
        "",
        "## Scores",
        "",
        "| Metric | Mean | Min | Threshold | Cases passing |",
        "| --- | --- | --- | --- | --- |",
    ]
    for name, agg in payload["aggregate"].items():
        lines.append(
            f"| {name.replace('_', ' ').title()} | {_fmt(agg['mean'])} | "
            f"{_fmt(agg['min'])} | {agg['threshold']:.2f} | "
            f"{agg['passed']}/{agg['count']} |"
        )
    if payload["skipped"]:
        lines += ["", "## Skipped captures", ""]
        for record in payload["skipped"]:
            lines.append(f"- `{record['file']}` — {record['skip']}")
    if payload["errors"]:
        lines += ["", "## Judge errors", ""]
        for err in payload["errors"]:
            lines.append(f"- {err}")
    lines += [
        "",
        "## Per-case detail",
        "",
        "| Query | " + " | ".join(n.replace("_", " ").title() for n in payload["metric_names"]) + " |",
        "| --- |" + " --- |" * len(payload["metric_names"]),
    ]
    for case in payload["cases"]:
        query = case["query"][:64] + ("…" if len(case["query"]) > 64 else "")
        cells = [_fmt(case["scores"].get(n, {}).get("score")) for n in payload["metric_names"]]
        lines.append(f"| {query} | " + " | ".join(cells) + " |")
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", default=None, help="NIM judge model id")
    parser.add_argument("--captures", default=str(CAPTURE_DIR))
    parser.add_argument("--label", default="live")
    parser.add_argument("--calibrate", action="store_true",
                        help="Write measured thresholds back to thresholds.json")
    parser.add_argument("--fail-under-threshold", action="store_true",
                        help="Exit 1 if any metric mean is below its threshold")
    args = parser.parse_args()

    cases, skipped = build_test_cases(Path(args.captures))
    if not cases:
        print(
            f"No usable captures in {args.captures}.\n"
            "Run:  python eval/run_eval.py --queries 6 --save-payloads"
        )
        for record in skipped:
            print(f"  skipped {record['file']}: {record['skip']}")
        return 1

    try:
        judge = NvidiaJudge(**({"model": args.model} if args.model else {}))
    except JudgeUnavailable as exc:
        print(f"SKIP: {exc}")
        return 2

    thresholds = load_thresholds()
    names = applicable_metrics(bool(load_goldens()))
    if len(names) == len(applicable_metrics(True)):
        print("Goldens found — scoring contextual precision/recall too.")
    else:
        print("No goldens.json — contextual precision/recall skipped (unmeasurable).")

    print(f"Judge: {judge.get_model_name()}")
    print(f"Cases: {len(cases)}   metrics: {', '.join(names)}\n")

    metrics = build_metrics(judge, names, thresholds)
    per_case, errors = [], []
    started = time.perf_counter()

    for i, case in enumerate(cases, 1):
        print(f"[{i}/{len(cases)}] {case.input[:70]}", flush=True)
        scores = {}
        for metric, name in zip(metrics, names):
            try:
                metric.measure(case)
                scores[name] = {
                    "score": metric.score,
                    "reason": metric.reason,
                    "passed": bool(metric.score is not None
                                   and metric.score >= thresholds["metrics"][name]),
                }
                print(f"      {name:<22} {_fmt(metric.score)}")
            except Exception as exc:
                message = f"{case.name or case.input[:40]} / {name}: {type(exc).__name__}: {exc}"
                errors.append(message)
                scores[name] = {"score": None, "reason": str(exc), "passed": False}
                print(f"      {name:<22} ERROR  {type(exc).__name__}")
        per_case.append({"query": case.input, "name": case.name, "scores": scores})

    aggregate = {}
    for name in names:
        values = [c["scores"][name]["score"] for c in per_case
                  if c["scores"][name]["score"] is not None]
        aggregate[name] = {
            "mean": round(statistics.fmean(values), 4) if values else None,
            "min": round(min(values), 4) if values else None,
            "max": round(max(values), 4) if values else None,
            "count": len(values),
            "passed": sum(1 for c in per_case if c["scores"][name]["passed"]),
            "threshold": thresholds["metrics"][name],
        }

    payload = {
        "timestamp": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "judge": judge.report(),
        "captures": len(cases) + len(skipped),
        "scored": len(cases),
        "duration_s": round(time.perf_counter() - started, 1),
        "metric_names": list(names),
        "aggregate": aggregate,
        "cases": per_case,
        "skipped": [{"file": r["file"], "skip": r["skip"]} for r in skipped],
        "errors": errors,
    }

    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    json_path = RESULTS_DIR / f"semantic-{args.label}.json"
    md_path = RESULTS_DIR / f"semantic-{args.label}.md"
    json_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    md_path.write_text(markdown(payload), encoding="utf-8")

    print("\n" + "=" * 70)
    print(markdown(payload))
    print("=" * 70)
    print(f"Wrote {json_path.relative_to(REPO_ROOT)}")
    print(f"Wrote {md_path.relative_to(REPO_ROOT)}")

    report = judge.report()
    if report["unrecoverable"] or report["api_errors"]:
        print(
            f"\nJudge reliability: {report['hit_rate']:.1%} usable "
            f"({report['unrecoverable']} unrecoverable, {report['api_errors']} api "
            "errors). Scores above are computed from the calls that succeeded."
        )

    if args.calibrate:
        for name, agg in aggregate.items():
            if agg["mean"] is not None:
                thresholds["metrics"][name] = round(
                    max(0.0, agg["mean"] - CALIBRATION_MARGIN), 2
                )
        thresholds["calibrated"] = True
        thresholds["calibrated_at"] = payload["timestamp"]
        thresholds["calibrated_from"] = f"{len(cases)} captures, label={args.label}"
        thresholds["judge_model"] = report["model"]
        thresholds.pop("_comment", None)
        THRESHOLDS_PATH.write_text(json.dumps(thresholds, indent=2) + "\n")
        print(f"\nCalibrated thresholds written to {THRESHOLDS_PATH.name}:")
        for name, value in thresholds["metrics"].items():
            print(f"  {name:<22} {value}")

    if args.fail_under_threshold:
        failing = [n for n, a in aggregate.items()
                   if a["mean"] is None or a["mean"] < a["threshold"]]
        if failing:
            print(f"\nFAIL: below threshold: {', '.join(failing)}")
            return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
