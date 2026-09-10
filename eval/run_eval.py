"""
Chronicle evaluation harness.

Measures the multi-agent pipeline on the dimensions the project actually
claims: how fast a cited report is produced, how many distinct sources it
synthesizes, how the credibility stage scores them, and — the one that
matters — what fraction of the citations in the final report are *grounded*,
i.e. point at a URL that was genuinely retrieved rather than invented.

Two modes:

  api    (default) POST each query to a running backend. Needs no API keys;
         hits /api/research, which runs the workflow fresh (the 24h query
         cache sits on the /api/research/jobs queue path, not this one).

  local  Import ResearchWorkflow and run in-process. Needs OPEN_ROUTER_KEY
         etc. in .env, but reports per-stage timing the HTTP path can't see.

--research-loop decides how the retriever runs: `env` (default) honours
RESEARCH_LOOP_ENABLED, `on`/`off` force one arm, and `ab` runs both over the
same queries in one process and prints a comparison table. `ab` needs
--mode local, and doubles the sweep's cost.

Optionally runs a single-LLM baseline (--baseline) for the ablation: one model,
one prompt, no retrieval and no verification, asked for the same cited report.
That baseline uses the strongest provider available (ANTHROPIC_API_KEY, then
OPEN_ROUTER_KEY, then GROQ_API_KEY, overridable via BASELINE_MODEL); without any
key it is skipped and the multi-agent numbers are still produced.

Usage
-----
    python eval/run_eval.py                        # live API, default queries
    python eval/run_eval.py --queries 3 --check-urls
    python eval/run_eval.py --mode local --baseline
    python eval/run_eval.py --api-url http://localhost:8000
    python eval/run_eval.py --mode local --research-loop ab --queries 2

Writes eval/results/eval-<label>.json plus a markdown summary next to it, and
prints the slide-ready aggregate to stdout.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import statistics
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional
from urllib.parse import urlparse

import requests

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))

DEFAULT_API_URL = os.getenv(
    "CHRONICLE_API_URL", "https://multi-agent-deep-research-api.fly.dev"
)

# Founder-style research questions — the workload the product is built for.
# Deliberately spans market sizing, competitive, regulatory and technical, so
# the retrieval mix (web / news / arXiv) gets exercised differently per query.
DEFAULT_QUERIES = [
    "What is the total addressable market for AI coding assistants in 2025?",
    "Who are the main competitors in the AI research assistant space and how do they differ?",
    "What regulatory requirements apply to AI-generated medical advice in the EU?",
    "What are the latest techniques for reducing hallucination in retrieval-augmented generation?",
    "How much venture funding went into AI agent startups in the last twelve months?",
    "What are the dominant pricing models for developer-tool SaaS in 2025?",
]

MD_LINK = re.compile(r"\[([^\]]{1,300})\]\((https?://[^\s)]+)\)")
BARE_URL = re.compile(r"(?<!\()\bhttps?://[^\s<>\]\)]+")

# A "claim sentence" for grounding purposes: a bulleted or numbered line, or a
# sentence long enough to assert something. Keeps the denominator honest rather
# than counting headings and fragments.
CLAIM_MIN_WORDS = 8


# ---------------------------------------------------------------------------
# Source / citation extraction
# ---------------------------------------------------------------------------


def _normalize_url(url: str) -> str:
    """Strip tracking noise so a cited URL matches the retrieved one."""
    url = url.strip().rstrip(".,);]'\"")
    parsed = urlparse(url)
    host = (parsed.netloc or "").lower().removeprefix("www.")
    path = (parsed.path or "").rstrip("/")
    return f"{host}{path}"


def _domain(url: str) -> str:
    return (urlparse(url).netloc or "").lower().removeprefix("www.")


def collect_retrieved(sources: Dict[str, Any]) -> Dict[str, Any]:
    """Flatten the retriever's web/papers/news buckets into URL sets."""
    per_type: Dict[str, List[Dict[str, Any]]] = {}
    urls: set[str] = set()
    domains: set[str] = set()

    for bucket in ("web", "papers", "news"):
        items = sources.get(bucket) or []
        if not isinstance(items, list):
            items = []
        per_type[bucket] = items
        for item in items:
            if not isinstance(item, dict):
                continue
            url = item.get("url") or ""
            if url.startswith("http"):
                urls.add(_normalize_url(url))
                domains.add(_domain(url))

    return {
        "counts": {k: len(v) for k, v in per_type.items()},
        "total": sum(len(v) for v in per_type.values()),
        "urls": urls,
        "domains": domains,
    }


def extract_citations(report: str) -> List[Dict[str, str]]:
    """Every URL the report points at, markdown-linked or bare."""
    seen: set[str] = set()
    citations: List[Dict[str, str]] = []

    for text, url in MD_LINK.findall(report):
        key = _normalize_url(url)
        if key in seen:
            continue
        seen.add(key)
        citations.append({"text": text.strip(), "url": url.strip(), "key": key})

    for url in BARE_URL.findall(report):
        key = _normalize_url(url)
        if key in seen:
            continue
        seen.add(key)
        citations.append({"text": "", "url": url.strip(), "key": key})

    return citations


def count_claims(report: str) -> int:
    """Assertion-bearing lines in the report body (excludes headings/sources)."""
    claims = 0
    in_sources = False
    for raw in report.splitlines():
        line = raw.strip()
        if not line:
            continue
        if line.startswith("#"):
            in_sources = "source" in line.lower() and "cited" in line.lower()
            continue
        if in_sources:
            continue
        body = re.sub(r"^[-*\d.)\s]+", "", line)
        if len(body.split()) >= CLAIM_MIN_WORDS:
            claims += 1
    return claims


def check_urls(citations: Iterable[Dict[str, str]], timeout: int = 12) -> Dict[str, Any]:
    """Resolve each cited URL. A citation nobody can open isn't a citation."""
    live, dead, errors = 0, 0, []
    for cite in citations:
        url = cite["url"]
        try:
            resp = requests.get(
                url,
                timeout=timeout,
                allow_redirects=True,
                headers={"User-Agent": "chronicle-eval/1.0"},
            )
            if resp.status_code < 400:
                live += 1
                cite["resolves"] = True
            else:
                dead += 1
                cite["resolves"] = False
                errors.append({"url": url, "status": resp.status_code})
        except Exception as exc:  # network failure counts as unresolvable
            dead += 1
            cite["resolves"] = False
            errors.append({"url": url, "status": type(exc).__name__})
    total = live + dead
    return {
        "checked": total,
        "resolved": live,
        "unresolved": dead,
        "resolve_rate": round(live / total, 4) if total else None,
        "failures": errors,
    }


# ---------------------------------------------------------------------------
# Scoring one pipeline run
# ---------------------------------------------------------------------------


def score_run(
    query: str,
    payload: Dict[str, Any],
    latency_s: float,
    verify_urls: bool,
) -> Dict[str, Any]:
    sources = payload.get("sources") or {}
    analysis = payload.get("analysis") or {}
    insights = payload.get("insights") or {}
    credibility = payload.get("credibility") or {}
    report = payload.get("report") or ""

    retrieved = collect_retrieved(sources)
    citations = extract_citations(report)
    loop_trace = sources.get("research_loop") or {}

    # Grounded == the cited URL was actually retrieved by the pipeline. Exact
    # normalized match first, then same-domain, which catches a reporter that
    # cites a section of a retrieved page.
    grounded_exact, grounded_domain, ungrounded = 0, 0, []
    for cite in citations:
        if cite["key"] in retrieved["urls"]:
            grounded_exact += 1
            cite["grounding"] = "exact"
        elif _domain(cite["url"]) in retrieved["domains"]:
            grounded_domain += 1
            cite["grounding"] = "domain"
        else:
            ungrounded.append(cite["url"])
            cite["grounding"] = "none"

    n_cites = len(citations)
    grounded = grounded_exact + grounded_domain
    overall = credibility.get("overall_credibility") or {}

    result: Dict[str, Any] = {
        "query": query,
        "status": payload.get("status", "unknown"),
        "error": payload.get("error") or None,
        # Populated once the backend exposes it; a non-empty list means some
        # stage fell back and the analysis-side numbers describe the fallback.
        "degraded": payload.get("degraded") or [],
        "latency_s": round(latency_s, 2),
        "sources": {
            **retrieved["counts"],
            "total": retrieved["total"],
            "distinct_domains": len(retrieved["domains"]),
        },
        "report": {
            "words": len(report.split()),
            "claim_lines": count_claims(report),
        },
        "citations": {
            "total": n_cites,
            "grounded_exact": grounded_exact,
            "grounded_same_domain": grounded_domain,
            "ungrounded": len(ungrounded),
            "grounding_rate": round(grounded / n_cites, 4) if n_cites else None,
            "ungrounded_urls": ungrounded[:10],
        },
        "credibility": {
            "average_score": overall.get("average_score"),
            "high": overall.get("high_credibility_count"),
            "medium": overall.get("medium_credibility_count"),
            "low": overall.get("low_credibility_count"),
            "scored_sources": overall.get("total_sources"),
        },
        "analysis": {
            "key_claims": len(analysis.get("key_claims") or []),
            "contradictions_flagged": len(analysis.get("contradictions") or []),
            "summary_points": len(analysis.get("summary") or []),
        },
        "insights": {
            "insights": len(insights.get("insights") or []),
            "hypotheses": len(insights.get("hypotheses") or []),
            "trends": len(insights.get("trends") or []),
            "reasoning_chains": len(insights.get("reasoning_chains") or []),
        },
        # Absent (all zeros) on a single-shot run, which is what makes the two
        # arms comparable in the same results file.
        "research_loop": {
            "enabled": bool(loop_trace),
            "iterations": loop_trace.get("iterations", 0),
            "queries_issued": len(loop_trace.get("queries") or []) or (1 if report else 0),
            "gaps_identified": len(loop_trace.get("gaps") or []),
            "stopped_because": loop_trace.get("stopped_because"),
            # Sources found before compression trimmed the set, so a run that
            # gathered 30 and kept 12 is distinguishable from one that only
            # ever found 12.
            "sources_merged": loop_trace.get("merged_source_count"),
            "sources_kept": loop_trace.get("final_source_count"),
        },
    }

    if verify_urls:
        result["url_check"] = check_urls(citations)

    return result


# ---------------------------------------------------------------------------
# Runners
# ---------------------------------------------------------------------------


def run_via_api(query: str, api_url: str, timeout: int) -> tuple[Dict[str, Any], float]:
    start = time.perf_counter()
    resp = requests.post(
        f"{api_url.rstrip('/')}/api/research",
        json={"query": query},
        timeout=timeout,
    )
    latency = time.perf_counter() - start
    resp.raise_for_status()
    return resp.json(), latency


# One workflow per arm, reused across queries. Constructing a workflow builds
# six agents and their model clients; doing that per query added seconds of
# setup to every measurement and made the latency numbers describe the harness
# as much as the pipeline.
_WORKFLOW_CACHE: Dict[Any, Any] = {}


def _local_workflow(research_loop: Optional[bool]):
    from dotenv import load_dotenv

    load_dotenv(REPO_ROOT / ".env")
    from orchestration.coordinator import ResearchWorkflow

    if research_loop not in _WORKFLOW_CACHE:
        _WORKFLOW_CACHE[research_loop] = ResearchWorkflow(
            enable_research_loop=research_loop
        )
    return _WORKFLOW_CACHE[research_loop]


def run_local(
    query: str, research_loop: Optional[bool] = None
) -> tuple[Dict[str, Any], float]:
    """Run in-process.

    `research_loop` overrides RESEARCH_LOOP_ENABLED for this run: True forces
    the iterative retriever, False forces single-shot, None inherits the
    environment. Passing it explicitly is what lets one process measure both
    arms over the same queries.
    """
    workflow = _local_workflow(research_loop)
    start = time.perf_counter()
    result = workflow.run(query)
    latency = time.perf_counter() - start
    return result, latency


# ---------------------------------------------------------------------------
# Single-LLM baseline (the ablation)
# ---------------------------------------------------------------------------

BASELINE_PROMPT = """You are a research analyst. Answer the research question below \
as a short report.

Requirements:
- Include concrete figures and named sources.
- Cite every factual claim inline as a markdown link: [Source title](https://url)
- End with a "## Sources Cited" section listing every URL you used.

RESEARCH QUESTION: {query}
"""


def run_baseline(query: str, timeout: int = 180) -> Optional[tuple[Dict[str, Any], float]]:
    """One model, one prompt, no retrieval, no verification."""
    from dotenv import load_dotenv

    load_dotenv(REPO_ROOT / ".env")

    anthropic_key = os.getenv("ANTHROPIC_API_KEY")
    groq_key = os.getenv("GROQ_API_KEY")
    or_key = os.getenv("OPEN_ROUTER_KEY") or os.getenv("OPENROUTER_API_KEY")

    # Prefer the strongest single model available — the ablation is only
    # interesting if the baseline is a fair fight for the pipeline.
    if anthropic_key:
        url = "https://api.anthropic.com/v1/messages"
        headers = {
            "x-api-key": anthropic_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        }
        model = os.getenv("BASELINE_MODEL", "claude-sonnet-4-5")
        body = {
            "model": model,
            "max_tokens": 2000,
            "temperature": 0.2,
            "messages": [{"role": "user", "content": BASELINE_PROMPT.format(query=query)}],
        }
        extract = lambda data: "".join(
            block.get("text", "") for block in data.get("content", [])
        )
    elif or_key:
        url = "https://openrouter.ai/api/v1/chat/completions"
        headers = {"Authorization": f"Bearer {or_key}"}
        model = os.getenv("BASELINE_MODEL", "openai/gpt-4o")
        body = {
            "model": model,
            "messages": [{"role": "user", "content": BASELINE_PROMPT.format(query=query)}],
            "temperature": 0.2,
        }
        extract = lambda data: data["choices"][0]["message"]["content"]
    elif groq_key:
        url = "https://api.groq.com/openai/v1/chat/completions"
        headers = {"Authorization": f"Bearer {groq_key}"}
        model = os.getenv("BASELINE_MODEL", "llama-3.3-70b-versatile")
        body = {
            "model": model,
            "messages": [{"role": "user", "content": BASELINE_PROMPT.format(query=query)}],
            "temperature": 0.2,
        }
        extract = lambda data: data["choices"][0]["message"]["content"]
    else:
        return None

    start = time.perf_counter()
    resp = requests.post(url, headers=headers, json=body, timeout=timeout)
    latency = time.perf_counter() - start
    resp.raise_for_status()
    report = extract(resp.json())

    # Shaped like a pipeline payload with an empty retrieval set: every citation
    # is by construction ungrounded, which is exactly the thing being measured.
    return (
        {
            "sources": {"web": [], "papers": [], "news": []},
            "analysis": {},
            "insights": {},
            "credibility": {},
            "report": report,
            "status": "success",
            "_model": model,
        },
        latency,
    )


# ---------------------------------------------------------------------------
# Aggregation + reporting
# ---------------------------------------------------------------------------


def _mean(values: List[float]) -> Optional[float]:
    vals = [v for v in values if isinstance(v, (int, float))]
    return round(statistics.mean(vals), 2) if vals else None


def aggregate(runs: List[Dict[str, Any]]) -> Dict[str, Any]:
    ok = [r for r in runs if r.get("status") == "success" and not r.get("error")]
    if not ok:
        return {"runs": len(runs), "successful": 0}

    latencies = [r["latency_s"] for r in ok]
    cite_totals = sum(r["citations"]["total"] for r in ok)
    cite_grounded = sum(
        r["citations"]["grounded_exact"] + r["citations"]["grounded_same_domain"]
        for r in ok
    )
    url_checked = sum(r.get("url_check", {}).get("checked", 0) for r in ok)
    url_resolved = sum(r.get("url_check", {}).get("resolved", 0) for r in ok)

    return {
        "runs": len(runs),
        "successful": len(ok),
        "latency_s": {
            "mean": _mean(latencies),
            "median": round(statistics.median(latencies), 2),
            "min": round(min(latencies), 2),
            "max": round(max(latencies), 2),
        },
        "sources_per_report": {
            "mean_total": _mean([r["sources"]["total"] for r in ok]),
            "mean_distinct_domains": _mean(
                [r["sources"]["distinct_domains"] for r in ok]
            ),
            "mean_web": _mean([r["sources"]["web"] for r in ok]),
            "mean_papers": _mean([r["sources"]["papers"] for r in ok]),
            "mean_news": _mean([r["sources"]["news"] for r in ok]),
        },
        "citations": {
            "total": cite_totals,
            "grounded": cite_grounded,
            "grounding_rate": round(cite_grounded / cite_totals, 4)
            if cite_totals
            else None,
            "mean_per_report": _mean([r["citations"]["total"] for r in ok]),
        },
        "url_check": {
            "checked": url_checked,
            "resolved": url_resolved,
            "resolve_rate": round(url_resolved / url_checked, 4) if url_checked else None,
        }
        if url_checked
        else None,
        "credibility": {
            "mean_average_score": _mean(
                [r["credibility"]["average_score"] for r in ok]
            ),
            "mean_high": _mean([r["credibility"]["high"] for r in ok]),
            "mean_medium": _mean([r["credibility"]["medium"] for r in ok]),
            "mean_low": _mean([r["credibility"]["low"] for r in ok]),
        },
        "analysis": {
            "mean_key_claims": _mean([r["analysis"]["key_claims"] for r in ok]),
            "mean_contradictions": _mean(
                [r["analysis"]["contradictions_flagged"] for r in ok]
            ),
            "reports_with_contradictions": sum(
                1 for r in ok if r["analysis"]["contradictions_flagged"] > 0
            ),
        },
        "report": {
            "mean_words": _mean([r["report"]["words"] for r in ok]),
            "mean_claim_lines": _mean([r["report"]["claim_lines"] for r in ok]),
        },
        "research_loop": {
            "runs_with_loop": sum(
                1 for r in ok if (r.get("research_loop") or {}).get("enabled")
            ),
            "mean_iterations": _mean(
                [(r.get("research_loop") or {}).get("iterations", 0) for r in ok]
            ),
            "mean_queries_issued": _mean(
                [(r.get("research_loop") or {}).get("queries_issued", 1) for r in ok]
            ),
            "stop_reasons": sorted(
                {
                    (r.get("research_loop") or {}).get("stopped_because")
                    for r in ok
                    if (r.get("research_loop") or {}).get("stopped_because")
                }
            ),
        },
    }


# Metrics the A/B table compares, as
# (label, dotted path into an aggregate, higher_is_better or None).
AB_METRICS = [
    ("Time to cited report (mean s)", "latency_s.mean", False),
    ("Search queries issued (mean)", "research_loop.mean_queries_issued", None),
    ("Sources retrieved (mean)", "sources_per_report.mean_total", True),
    ("Distinct domains (mean)", "sources_per_report.mean_distinct_domains", True),
    ("Citations per report (mean)", "citations.mean_per_report", True),
    ("Citation grounding rate", "citations.grounding_rate", True),
    ("Mean credibility of sources", "credibility.mean_average_score", True),
    ("Contradictions flagged (mean)", "analysis.mean_contradictions", True),
    ("Report length (mean words)", "report.mean_words", None),
]


def _dig(payload: Dict[str, Any], path: str) -> Any:
    node: Any = payload
    for part in path.split("."):
        if not isinstance(node, dict):
            return None
        node = node.get(part)
    return node


def _fmt(value: Any, path: str) -> str:
    if value is None:
        return "n/a"
    if path.endswith("grounding_rate"):
        return f"{round(value * 100, 1)}%"
    return str(value)


def ab_comparison(arms: Dict[str, Any]) -> List[str]:
    """Render the single-shot vs iterative table.

    The verdict column is deliberately blunt: the loop costs extra searches and
    model calls per run, so "it retrieved more sources" is not on its own a
    reason to ship it. What matters is whether grounding rate and credibility
    moved.
    """
    base_label, cand_label = "single-shot", "iterative"
    base = (arms.get(base_label) or {}).get("aggregate") or {}
    cand = (arms.get(cand_label) or {}).get("aggregate") or {}

    lines = [
        "",
        "## Retrieval A/B: single-shot vs iterative loop",
        "",
        f"Same {base.get('runs', 0)} queries through both arms, one process, "
        "identical models. `single-shot` is the original retriever; `iterative` "
        "is `RESEARCH_LOOP_ENABLED=true`.",
        "",
        "| Metric | Single-shot | Iterative | Change |",
        "| --- | --- | --- | --- |",
    ]

    for label, path, higher_is_better in AB_METRICS:
        b, c = _dig(base, path), _dig(cand, path)
        change = "—"
        if isinstance(b, (int, float)) and isinstance(c, (int, float)):
            delta = c - b
            if path.endswith("grounding_rate"):
                change = f"{delta * 100:+.1f} pp"
            else:
                change = f"{delta:+.2f}"
                if b:
                    change += f" ({delta / b * 100:+.0f}%)"
            if higher_is_better is not None and abs(delta) > 1e-9:
                improved = (delta > 0) == higher_is_better
                change += " ✅" if improved else " ⚠️"
        lines.append(
            f"| {label} | {_fmt(b, path)} | {_fmt(c, path)} | {change} |"
        )

    stop_reasons = _dig(cand, "research_loop.stop_reasons") or []
    if stop_reasons:
        lines += ["", f"Loop stop reasons observed: {', '.join(stop_reasons)}."]

    successes = (base.get("successful"), cand.get("successful"))
    if successes[0] != successes[1]:
        lines += [
            "",
            f"⚠️ Arms completed a different number of runs "
            f"({successes[0]} vs {successes[1]}), so these means are not "
            f"strictly comparable — most likely a provider rate-limited "
            f"mid-sweep.",
        ]

    return lines


def markdown_summary(payload: Dict[str, Any]) -> str:
    multi = payload["multi_agent"]["aggregate"]
    base = (payload.get("baseline") or {}).get("aggregate")
    meta = payload["meta"]

    lines = [
        "# Chronicle evaluation results",
        "",
        f"- Run at: {meta['timestamp']}",
        f"- Mode: `{meta['mode']}`" + (f" against `{meta['api_url']}`" if meta.get("api_url") else ""),
        f"- Queries: {meta['query_count']} ({multi.get('successful', 0)} completed successfully)",
        "",
        "## Multi-agent pipeline",
        "",
        "| Metric | Value |",
        "| --- | --- |",
    ]

    def row(label: str, value: Any) -> None:
        lines.append(f"| {label} | {value} |")

    lat = multi.get("latency_s", {})
    src = multi.get("sources_per_report", {})
    cit = multi.get("citations", {})
    cred = multi.get("credibility", {})
    ana = multi.get("analysis", {})
    rep = multi.get("report", {})

    row("Time to cited report (mean)", f"{lat.get('mean')} s")
    row("Time to cited report (median)", f"{lat.get('median')} s")
    row("Time range", f"{lat.get('min')}–{lat.get('max')} s")
    row("Sources retrieved per report (mean)", src.get("mean_total"))
    row("Distinct domains per report (mean)", src.get("mean_distinct_domains"))
    row("Retrieval mix (web / papers / news)", f"{src.get('mean_web')} / {src.get('mean_papers')} / {src.get('mean_news')}")
    row("Citations per report (mean)", cit.get("mean_per_report"))
    grate = cit.get("grounding_rate")
    row("Citation grounding rate", f"{round(grate * 100, 1)}%" if grate is not None else "n/a")
    if multi.get("url_check"):
        urate = multi["url_check"].get("resolve_rate")
        row("Cited URLs that resolve", f"{round(urate * 100, 1)}%" if urate is not None else "n/a")
    row("Mean credibility score of sources", cred.get("mean_average_score"))
    row("High / medium / low credibility sources", f"{cred.get('mean_high')} / {cred.get('mean_medium')} / {cred.get('mean_low')}")
    row("Contradictions flagged per report (mean)", ana.get("mean_contradictions"))
    row("Reports where a contradiction was found", f"{ana.get('reports_with_contradictions')} / {multi.get('successful')}")
    row("Report length (mean words)", rep.get("mean_words"))

    if base:
        lines += [
            "",
            "## Single-LLM baseline (no retrieval, no verification)",
            "",
            f"Model: `{payload['baseline']['model']}`",
            "",
            "| Metric | Multi-agent | Single LLM |",
            "| --- | --- | --- |",
        ]
        bcit = base.get("citations", {})
        blat = base.get("latency_s", {})
        lines.append(f"| Time to report (mean) | {lat.get('mean')} s | {blat.get('mean')} s |")
        lines.append(f"| Citations per report (mean) | {cit.get('mean_per_report')} | {bcit.get('mean_per_report')} |")
        bg = bcit.get("grounding_rate")
        lines.append(
            f"| Citations grounded in retrieved sources | "
            f"{round(grate * 100, 1)}% | {round(bg * 100, 1) if bg is not None else 0.0}% |"
        )
        if base.get("url_check") and multi.get("url_check"):
            lines.append(
                f"| Cited URLs that resolve | "
                f"{round(multi['url_check']['resolve_rate'] * 100, 1)}% | "
                f"{round(base['url_check']['resolve_rate'] * 100, 1)}% |"
            )
    else:
        lines += [
            "",
            "## Single-LLM baseline",
            "",
            "Not run — no `OPEN_ROUTER_KEY` or `GROQ_API_KEY` available in this "
            "environment. Re-run with `--baseline` once a key is set to produce "
            "the ablation column.",
        ]

    if payload.get("arms"):
        lines += ab_comparison(payload["arms"])

    lines += ["", "## Per-query detail", "", "| Query | Latency (s) | Sources | Citations | Grounded | Contradictions |", "| --- | --- | --- | --- | --- | --- |"]
    for r in payload["multi_agent"]["runs"]:
        q = r["query"][:60] + ("…" if len(r["query"]) > 60 else "")
        if "citations" not in r:
            # Run failed before producing a payload — say so rather than
            # dropping the row, which would understate the failure rate.
            lines.append(f"| {q} | — | — | — | — | failed: {r.get('error', 'unknown')} |")
            continue
        gr = r["citations"]["grounding_rate"]
        lines.append(
            f"| {q} | {r['latency_s']} | {r['sources']['total']} | "
            f"{r['citations']['total']} | "
            f"{round(gr * 100, 1) if gr is not None else 'n/a'}% | "
            f"{r['analysis']['contradictions_flagged']} |"
        )

    return "\n".join(lines) + "\n"


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def execute_queries(
    queries: List[str],
    args: Any,
    capture_dir: Optional[Path],
    research_loop: Optional[bool] = None,
    arm_label: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Run every query once and score it. One call per A/B arm."""
    runs: List[Dict[str, Any]] = []
    prefix = f"[{arm_label}] " if arm_label else ""

    for i, query in enumerate(queries, 1):
        print(f"\n{prefix}[{i}/{len(queries)}] {query}", flush=True)
        try:
            if args.mode == "api":
                payload, latency = run_via_api(query, args.api_url, args.timeout)
            else:
                payload, latency = run_local(query, research_loop)
        except Exception as exc:
            print(f"  FAILED: {type(exc).__name__}: {exc}", flush=True)
            runs.append({
                "query": query,
                "status": "error",
                "error": f"{type(exc).__name__}: {exc}",
                "latency_s": None,
            })
            continue

        if capture_dir is not None:
            slug = re.sub(r"[^a-z0-9]+", "-", query.lower()).strip("-")[:60]
            # Arm-prefixed so an A/B sweep does not have its second arm
            # overwrite the first arm's captures.
            stem = f"{arm_label}-{i:02d}-{slug}" if arm_label else f"{i:02d}-{slug}"
            (capture_dir / f"{stem}.json").write_text(
                json.dumps(
                    {
                        "query": query,
                        "latency_s": round(latency, 2),
                        "arm": arm_label,
                        "payload": payload,
                    },
                    indent=2,
                ),
                encoding="utf-8",
            )

        scored = score_run(query, payload, latency, args.check_urls)
        runs.append(scored)
        gr = scored["citations"]["grounding_rate"]
        loop = scored.get("research_loop") or {}
        loop_note = (
            f" · {loop['iterations']} loop iter / {loop['queries_issued']} queries"
            if loop.get("enabled")
            else ""
        )
        print(
            f"  {scored['latency_s']}s · {scored['sources']['total']} sources · "
            f"{scored['citations']['total']} citations · "
            f"grounded {round(gr * 100, 1) if gr is not None else 'n/a'}% · "
            f"{scored['analysis']['contradictions_flagged']} contradictions"
            f"{loop_note}",
            flush=True,
        )

    return runs


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mode", choices=["api", "local"], default="api")
    parser.add_argument("--api-url", default=DEFAULT_API_URL)
    parser.add_argument("--queries", type=int, default=len(DEFAULT_QUERIES),
                        help="How many of the default queries to run")
    parser.add_argument("--query", action="append", dest="custom_queries",
                        help="Run a specific query (repeatable); overrides --queries")
    parser.add_argument("--timeout", type=int, default=600,
                        help="Per-query HTTP timeout in seconds")
    parser.add_argument("--check-urls", action="store_true",
                        help="Fetch every cited URL and record whether it resolves")
    parser.add_argument("--baseline", action="store_true",
                        help="Also run the single-LLM ablation (needs an API key)")
    parser.add_argument("--research-loop", choices=["env", "on", "off", "ab"],
                        default="env",
                        help="Iterative retrieval: 'env' honours "
                             "RESEARCH_LOOP_ENABLED (default), 'on'/'off' force "
                             "it, 'ab' runs both arms over the same queries and "
                             "prints a comparison. 'ab' needs --mode local, "
                             "since the flag is process-level and the deployed "
                             "API cannot be toggled per request.")
    parser.add_argument("--label", default="live",
                        help="Filename label for the results files")
    parser.add_argument("--save-payloads", nargs="?", const="eval/semantic/captures",
                        default=None, metavar="DIR",
                        help="Also write each raw API payload to DIR, for the "
                             "semantic suite to score offline (default "
                             "eval/semantic/captures)")
    args = parser.parse_args()

    if args.research_loop == "ab" and args.mode != "local":
        parser.error(
            "--research-loop ab requires --mode local: RESEARCH_LOOP_ENABLED is "
            "read when the workflow is constructed, so the deployed API serves "
            "whichever arm it was started with and cannot be switched per request."
        )

    queries = args.custom_queries or DEFAULT_QUERIES[: args.queries]
    out_dir = Path(__file__).parent / "results"
    out_dir.mkdir(parents=True, exist_ok=True)

    # The scored results keep only aggregates, so a semantic re-scoring would
    # otherwise mean re-running the whole 50s/query pipeline against free-tier
    # quota. Capturing the raw payload lets eval/semantic score the same run
    # offline, as many times as the judge needs.
    capture_dir: Optional[Path] = None
    if args.save_payloads:
        capture_dir = Path(args.save_payloads)
        if not capture_dir.is_absolute():
            capture_dir = REPO_ROOT / capture_dir
        capture_dir.mkdir(parents=True, exist_ok=True)

    print(
        f"Chronicle eval — mode={args.mode} queries={len(queries)} "
        f"research-loop={args.research_loop}",
        flush=True,
    )
    if args.mode == "api":
        print(f"  target: {args.api_url}", flush=True)

    arms_block: Optional[Dict[str, Any]] = None

    if args.research_loop == "ab":
        # Both arms in one process against the same queries, so provider,
        # models and query set are held constant and the only difference is
        # the retrieval strategy. Note this doubles the run's cost.
        print(
            "  A/B: running every query twice (single-shot, then iterative). "
            "This doubles search and model spend for the sweep.",
            flush=True,
        )
        single_runs = execute_queries(queries, args, capture_dir, False, "single-shot")
        loop_runs = execute_queries(queries, args, capture_dir, True, "iterative")
        arms_block = {
            "single-shot": {
                "research_loop": False,
                "runs": single_runs,
                "aggregate": aggregate(single_runs),
            },
            "iterative": {
                "research_loop": True,
                "runs": loop_runs,
                "aggregate": aggregate(loop_runs),
            },
        }
        # The iterative arm is the candidate, so it is what the headline
        # multi-agent block describes.
        runs = loop_runs
    else:
        forced = {"env": None, "on": True, "off": False}[args.research_loop]
        runs = execute_queries(queries, args, capture_dir, forced)

    baseline_block: Optional[Dict[str, Any]] = None
    if args.baseline:
        print("\n--- single-LLM baseline ---", flush=True)
        b_runs: List[Dict[str, Any]] = []
        model = None
        for i, query in enumerate(queries, 1):
            out = run_baseline(query, args.timeout)
            if out is None:
                print("  skipped: no OPEN_ROUTER_KEY / GROQ_API_KEY set", flush=True)
                break
            payload, latency = out
            model = payload.get("_model")
            scored = score_run(query, payload, latency, args.check_urls)
            b_runs.append(scored)
            print(f"  [{i}/{len(queries)}] {scored['latency_s']}s · "
                  f"{scored['citations']['total']} citations", flush=True)
        if b_runs:
            baseline_block = {
                "model": model,
                "runs": b_runs,
                "aggregate": aggregate(b_runs),
            }

    payload = {
        "meta": {
            "timestamp": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "mode": args.mode,
            "api_url": args.api_url if args.mode == "api" else None,
            "query_count": len(queries),
            "url_check_enabled": args.check_urls,
            "research_loop": args.research_loop,
        },
        "multi_agent": {"runs": runs, "aggregate": aggregate(runs)},
        "arms": arms_block,
        "baseline": baseline_block,
    }

    json_path = out_dir / f"eval-{args.label}.json"
    md_path = out_dir / f"eval-{args.label}.md"
    json_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    md_path.write_text(markdown_summary(payload), encoding="utf-8")

    print("\n" + "=" * 70)
    print(markdown_summary(payload))
    print("=" * 70)
    print(f"Wrote {json_path.relative_to(REPO_ROOT)}")
    print(f"Wrote {md_path.relative_to(REPO_ROOT)}")

    return 0 if payload["multi_agent"]["aggregate"].get("successful") else 1


if __name__ == "__main__":
    raise SystemExit(main())
