"""Metric construction and threshold policy, shared by the runner and pytest.

Two families, split by what they need:

  ungated   Faithfulness, Answer Relevancy, Contextual Relevancy -- scored from
            the query, the report and the retrieved context, all of which the
            pipeline already produces. These run on any capture.

  gated     Contextual Precision, Contextual Recall -- these compare retrieval
            against a human-written expected answer. Without goldens.json they
            are not "zero", they are unmeasurable, so they are skipped rather
            than scored.

What each one adds over the structural harness: `eval/run_eval.py` already
proves a cited URL was really fetched. Faithfulness is the claim-level
counterpart -- whether the sentence attached to that citation follows from what
the source actually said. A report can score 100% grounding and low
faithfulness, and that gap is the interesting number.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

THRESHOLDS_PATH = Path(__file__).with_name("thresholds.json")

UNGATED = ("faithfulness", "answer_relevancy", "contextual_relevancy")
GOLDEN_GATED = ("contextual_precision", "contextual_recall")


def load_thresholds() -> dict:
    return json.loads(THRESHOLDS_PATH.read_text())


def build_metrics(judge: Any, names: tuple[str, ...], thresholds: dict) -> list:
    from deepeval.metrics import (
        AnswerRelevancyMetric,
        ContextualPrecisionMetric,
        ContextualRecallMetric,
        ContextualRelevancyMetric,
        FaithfulnessMetric,
    )

    classes = {
        "faithfulness": FaithfulnessMetric,
        "answer_relevancy": AnswerRelevancyMetric,
        "contextual_relevancy": ContextualRelevancyMetric,
        "contextual_precision": ContextualPrecisionMetric,
        "contextual_recall": ContextualRecallMetric,
    }
    metrics = []
    for name in names:
        metrics.append(
            classes[name](
                threshold=thresholds["metrics"][name],
                model=judge,
                include_reason=True,
                # The judge is a rate-limited free tier; deepeval's default
                # async fan-out (20 concurrent) trips it. Scoring is sequential
                # so a run degrades in latency rather than in errors.
                async_mode=False,
            )
        )
    return metrics


def applicable_metrics(has_goldens: bool) -> tuple[str, ...]:
    return UNGATED + (GOLDEN_GATED if has_goldens else ())
