"""Pytest gate for semantic grounding.

    pytest eval/semantic -v

Skips (does not fail) when NVIDIA_API_KEY is absent or no captures exist, so a
contributor without judge credentials is not blocked. It fails only on a real
regression: a captured report whose claims stop following from the sources it
retrieved.

Each metric gets its own parametrized test so a failure names the metric and
the query, and the judge's own reason is printed in the assertion rather than
just the number.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(REPO_ROOT / ".env")

from eval.semantic.dataset import build_test_cases, load_goldens  # noqa: E402
from eval.semantic.metrics import (  # noqa: E402
    applicable_metrics,
    build_metrics,
    load_thresholds,
)

pytestmark = pytest.mark.skipif(
    not os.getenv("NVIDIA_API_KEY"),
    reason="NVIDIA_API_KEY not set — semantic metrics need a judge",
)

THRESHOLDS = load_thresholds()
CASES, SKIPPED = build_test_cases()
METRIC_NAMES = applicable_metrics(bool(load_goldens()))


@pytest.fixture(scope="session")
def judge():
    from eval.semantic.judge import JudgeUnavailable, NvidiaJudge

    try:
        return NvidiaJudge()
    except JudgeUnavailable as exc:
        pytest.skip(str(exc))


def test_captures_exist():
    """A green suite that scored nothing is worse than a red one."""
    assert CASES, (
        "No usable captures. Run:\n"
        "  python eval/run_eval.py --queries 6 --save-payloads\n"
        + "".join(f"\n  skipped {r['file']}: {r['skip']}" for r in SKIPPED)
    )


def test_thresholds_are_calibrated():
    """Placeholder thresholds gate nothing, so say so out loud rather than
    letting a suite pass against numbers nobody measured."""
    if not THRESHOLDS.get("calibrated"):
        pytest.skip(
            "thresholds.json is uncalibrated — run "
            "`python eval/semantic/run_semantic.py --calibrate` against a "
            "healthy pipeline first"
        )


@pytest.mark.parametrize("metric_name", METRIC_NAMES)
@pytest.mark.parametrize(
    "case", CASES, ids=[c.name or c.input[:40] for c in CASES]
)
def test_metric(judge, case, metric_name):
    metric = build_metrics(judge, (metric_name,), THRESHOLDS)[0]
    metric.measure(case)

    threshold = THRESHOLDS["metrics"][metric_name]
    assert metric.score is not None, f"{metric_name} produced no score"
    assert metric.score >= threshold, (
        f"{metric_name} {metric.score:.3f} < {threshold:.2f}\n"
        f"query:  {case.input}\n"
        f"judge:  {metric.reason}"
    )
