"""Verify that the analyzer, credibility and insight stages are running for real.

Each of these stages has a silent fallback: on any LLM failure the analyzer and
insight generator return canned mock text, and the credibility agent returns its
0.5 failure constant for the LLM half of the score. A degraded run still looks
like a normal HTTP 200 report, so the only way to know is to inspect the output.

This script replays a real retrieved source set through the three stages and
reports, per stage, whether the output is genuine or a fallback. It needs no
search keys — sources come from a captured retrieval payload.

Usage
-----
    python eval/verify_stages.py                     # uses eval/fixtures/sources.json
    python eval/verify_stages.py path/to/payload.json

The payload is anything shaped like an /api/research response: a dict with a
`sources` key holding `web` / `papers` / `news` lists.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(REPO_ROOT / ".env")

DEFAULT_FIXTURE = Path(__file__).parent / "fixtures" / "sources.json"

MOCK_MARKERS = {
    "analysis": "Mock analysis - LLM not configured",
    "insights": "Mock insights - LLM not configured",
}


def verdict(ok: bool) -> str:
    return "LIVE" if ok else "FALLBACK"


def main() -> int:
    payload_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_FIXTURE
    if not payload_path.exists():
        print(f"No payload at {payload_path}.")
        print("Capture one with:")
        print("  curl -s -X POST $CHRONICLE_API_URL/api/research \\")
        print("    -H 'Content-Type: application/json' \\")
        print('    -d \'{"query":"..."}\' > eval/fixtures/sources.json')
        return 2

    payload = json.loads(payload_path.read_text(encoding="utf-8"))
    sources = payload.get("sources") or {}
    query = sources.get("query") or payload.get("query") or "AI research tooling"
    counts = {k: len(sources.get(k) or []) for k in ("web", "papers", "news")}
    print(f"query:   {query}")
    print(f"sources: {counts} (total {sum(counts.values())})\n")

    from agents.analyzer import CriticalAnalysisAgent
    from agents.credibility import SourceCredibilityAgent
    from agents.insight_generator import InsightGenerationAgent

    results: dict[str, bool] = {}

    # --- credibility -------------------------------------------------------
    print("--- credibility ---")
    cred_agent = SourceCredibilityAgent()
    credibility = cred_agent.evaluate_credibility(sources)
    overall = credibility.get("overall_credibility", {})

    llm_scores, levels = [], []
    for bucket in ("web", "papers", "news"):
        for item in credibility.get(bucket) or []:
            if item.get("llm_score") is not None:
                llm_scores.append(item["llm_score"])
            levels.append(item.get("level"))

    # Every llm_score landing on exactly 0.5 is the failure constant, not a judgement.
    distinct = sorted(set(llm_scores))
    cred_live = bool(llm_scores) and distinct != [0.5]
    results["credibility"] = cred_live
    print(f"  llm_score values seen: {distinct}")
    print(f"  levels: {({lvl: levels.count(lvl) for lvl in set(levels)})}")
    print(f"  overall: {overall}")
    print(f"  -> {verdict(cred_live)}\n")

    # --- analyzer ----------------------------------------------------------
    print("--- analyzer ---")
    analyzer = CriticalAnalysisAgent()
    analysis = analyzer.analyze({**sources, "query": query})
    raw = analysis.get("raw_analysis", "")
    ana_live = MOCK_MARKERS["analysis"] not in raw
    results["analyzer"] = ana_live
    print(f"  raw_analysis: {raw[:80]!r}")
    for claim in (analysis.get("key_claims") or [])[:3]:
        print(f"  claim: {claim[:110]}")
    for contradiction in (analysis.get("contradictions") or [])[:2]:
        print(f"  contradiction: {contradiction[:110]}")
    print(f"  -> {verdict(ana_live)}\n")

    # --- insight -----------------------------------------------------------
    print("--- insight ---")
    insight_agent = InsightGenerationAgent()
    insights = insight_agent.generate(analysis, query)
    raw_i = insights.get("raw_insights", "")
    ins_live = MOCK_MARKERS["insights"] not in raw_i
    results["insight"] = ins_live
    print(f"  raw_insights: {raw_i[:80]!r}")
    for item in (insights.get("hypotheses") or [])[:2]:
        print(f"  hypothesis: {item[:110]}")
    print(f"  -> {verdict(ins_live)}\n")

    print("=" * 62)
    for stage, ok in results.items():
        print(f"  {stage:12s} {verdict(ok)}")
    print("=" * 62)

    return 0 if all(results.values()) else 1


if __name__ == "__main__":
    raise SystemExit(main())
