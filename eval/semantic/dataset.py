"""Turn captured pipeline payloads into DeepEval test cases.

The structural harness (`eval/run_eval.py`) keeps only aggregates, so scoring
the same run semantically would otherwise mean re-running the pipeline -- 50s
per query against free-tier quota -- every time a threshold or judge model
changes. Instead:

    python eval/run_eval.py --queries 6 --save-payloads

writes the raw payloads to `eval/semantic/captures/`, and everything here
scores them offline, as many times as needed, with no pipeline calls at all.

Mapping to DeepEval's test-case fields:

    input             the research question
    actual_output     the generated report
    retrieval_context the snippets the retriever actually fetched
    expected_output   optional, from goldens.json -- only Contextual
                      Precision/Recall need it, and only those two are
                      gated on it
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Optional

REPO_ROOT = Path(__file__).resolve().parents[2]
CAPTURE_DIR = REPO_ROOT / "eval" / "semantic" / "captures"
GOLDENS = REPO_ROOT / "eval" / "semantic" / "goldens.json"

# A retrieval chunk under this many characters carries no proposition for the
# judge to check a claim against, and a context list padded with title-only
# stubs drags contextual precision down for a reason that has nothing to do
# with retrieval quality.
MIN_CHUNK_CHARS = 60


def _chunks(payload: dict) -> list[str]:
    """Flatten the retriever's buckets into judge-readable context chunks.

    The source URL is kept in the chunk text on purpose: it is what lets a
    faithfulness verdict be traced back to a specific retrieved source rather
    than to the context blob as a whole.
    """
    sources = payload.get("sources") or {}
    out: list[str] = []
    for bucket in ("web", "papers", "news"):
        for item in sources.get(bucket) or []:
            if not isinstance(item, dict):
                continue
            text = (item.get("snippet") or item.get("summary") or "").strip()
            if len(text) < MIN_CHUNK_CHARS:
                continue
            title = (item.get("title") or "").strip()
            url = (item.get("url") or "").strip()
            header = " - ".join(p for p in (title, url) if p)
            out.append(f"[{bucket}] {header}\n{text}" if header else f"[{bucket}] {text}")
    return out


def load_captures(capture_dir: Path = CAPTURE_DIR) -> list[dict]:
    """Every capture on disk, with its usability already determined.

    A run whose stages fell back is not a judgeable sample -- the report is
    empty or carries an `[unavailable]` marker by design (see
    `utils/degraded.py`), and scoring it measures the outage, not the pipeline.
    Such runs are returned but flagged, so the suite can skip them loudly
    instead of silently averaging them in.
    """
    if not capture_dir.exists():
        return []

    records: list[dict] = []
    for path in sorted(capture_dir.glob("*.json")):
        try:
            raw = json.loads(path.read_text())
        except json.JSONDecodeError:
            continue
        payload: dict[str, Any] = raw.get("payload") or {}
        report = payload.get("report") or ""
        chunks = _chunks(payload)
        degraded = payload.get("degraded") or []

        skip: Optional[str] = None
        if not isinstance(report, str) or not report.strip():
            skip = "empty report"
        elif not chunks:
            skip = "no retrieval context"
        elif degraded:
            skip = f"degraded stages: {', '.join(map(str, degraded))}"

        records.append(
            {
                "file": path.name,
                "query": raw.get("query") or payload.get("query") or "",
                "report": report if isinstance(report, str) else "",
                "context": chunks,
                "degraded": degraded,
                "latency_s": raw.get("latency_s"),
                "skip": skip,
            }
        )
    return records


def load_goldens() -> dict[str, str]:
    """query -> expected_output. Absent for most; that is the normal case."""
    if not GOLDENS.exists():
        return {}
    data = json.loads(GOLDENS.read_text())
    if isinstance(data, dict):
        return {k: v for k, v in data.items() if isinstance(v, str) and v.strip()}
    return {
        item["query"]: item["expected_output"]
        for item in data
        if item.get("query") and item.get("expected_output")
    }


def build_test_cases(capture_dir: Path = CAPTURE_DIR) -> tuple[list, list[dict]]:
    """(usable LLMTestCases, skipped records)."""
    from deepeval.test_case import LLMTestCase

    goldens = load_goldens()
    cases, skipped = [], []
    for record in load_captures(capture_dir):
        if record["skip"]:
            skipped.append(record)
            continue
        cases.append(
            LLMTestCase(
                input=record["query"],
                actual_output=record["report"],
                retrieval_context=record["context"],
                expected_output=goldens.get(record["query"]),
                name=record["file"],
            )
        )
    return cases, skipped


if __name__ == "__main__":
    records = load_captures()
    if not records:
        print(
            f"No captures in {CAPTURE_DIR.relative_to(REPO_ROOT)}.\n"
            "Run:  python eval/run_eval.py --queries 6 --save-payloads"
        )
        raise SystemExit(1)

    goldens = load_goldens()
    print(f"{len(records)} capture(s) in {CAPTURE_DIR.relative_to(REPO_ROOT)}\n")
    for record in records:
        mark = "SKIP" if record["skip"] else " OK "
        note = f"  ({record['skip']})" if record["skip"] else ""
        gold = " +golden" if record["query"] in goldens else ""
        print(
            f"[{mark}] {record['file']:<48} "
            f"{len(record['context']):>2} chunks  "
            f"{len(record['report'].split()):>4} words{gold}{note}"
        )
    usable = sum(1 for r in records if not r["skip"])
    print(f"\nUsable: {usable}/{len(records)}   goldens: {len(goldens)}")
