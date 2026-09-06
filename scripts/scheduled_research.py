#!/usr/bin/env python3
"""
Run one Chronicle research query against the hosted API and write the report.

Built for unattended use (cron, CI, a Claude Code scheduled routine). It uses
the async job endpoints rather than POST /api/research so a 30-90s pipeline
run never sits on a single blocking HTTP request that a proxy might drop.

    enqueue  POST /api/research/jobs      -> job_id (or a 24h cache hit)
    poll     GET  /api/research/jobs/{id} -> status
    export   GET  /api/export/{id}/markdown

Only the stdlib is used, so it runs anywhere python3 does — no pip install.

Usage:
    python3 scripts/scheduled_research.py "TAM for AI coding assistants 2025"
    python3 scripts/scheduled_research.py --out reports/ --json-summary "..."

Environment:
    CHRONICLE_API_URL    API base (default: Fly production)
    CHRONICLE_API_TOKEN  Optional bearer JWT; scopes the run to a user

Exit codes:
    0 success   1 pipeline error   2 usage error   3 network/timeout
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

DEFAULT_API_URL = "https://multi-agent-deep-research-api.fly.dev"
POLL_INTERVAL_SEC = 5.0
DEFAULT_TIMEOUT_SEC = 600


class ChronicleError(Exception):
    """Any non-recoverable failure talking to the Chronicle API."""


def _headers(accept: str = "application/json") -> dict[str, str]:
    headers = {"Content-Type": "application/json", "Accept": accept}
    token = os.getenv("CHRONICLE_API_TOKEN")
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def _call(method: str, url: str, payload: dict | None = None,
          timeout: float = 30.0, raw: bool = False):
    body = json.dumps(payload).encode() if payload is not None else None
    accept = "text/markdown" if raw else "application/json"
    req = Request(url, data=body, method=method, headers=_headers(accept))
    try:
        with urlopen(req, timeout=timeout) as resp:
            text = resp.read().decode("utf-8")
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:400]
        raise ChronicleError(f"HTTP {exc.code} on {method} {url}: {detail}") from exc
    except (URLError, TimeoutError) as exc:
        raise ChronicleError(f"Network error on {method} {url}: {exc}") from exc
    if raw:
        return text
    return json.loads(text) if text else {}


def enqueue(base: str, query: str) -> tuple[str, bool]:
    data = _call("POST", f"{base}/api/research/jobs", {"query": query})
    job_id = data.get("job_id")
    if not job_id:
        raise ChronicleError(f"No job_id in enqueue response: {data}")
    return job_id, bool(data.get("cache_hit"))


def poll(base: str, job_id: str, timeout: float, log) -> dict:
    """Block until the job reaches a terminal state. Returns the job row."""
    deadline = time.monotonic() + timeout
    last_status = None
    while time.monotonic() < deadline:
        row = _call("GET", f"{base}/api/research/jobs/{job_id}")
        # The detail endpoint nests the payload under `data`.
        data = row.get("data") or row
        status = data.get("status") or row.get("status")
        if status != last_status:
            log(f"  status: {status}")
            last_status = status
        if status in ("success", "error", "failed"):
            return data
        time.sleep(POLL_INTERVAL_SEC)
    raise ChronicleError(f"Timed out after {timeout:.0f}s waiting for job {job_id}")


def slugify(text: str, limit: int = 60) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return (slug[:limit].rstrip("-")) or "research"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Run one Chronicle research query and save the report.")
    parser.add_argument("query", help="Research question to run")
    parser.add_argument("--out", default=None, metavar="DIR",
                        help="Directory to write the markdown report into. "
                             "Omit to print the report to stdout.")
    parser.add_argument("--timeout", type=float, default=DEFAULT_TIMEOUT_SEC,
                        help=f"Seconds to wait for completion (default {DEFAULT_TIMEOUT_SEC})")
    parser.add_argument("--json-summary", action="store_true",
                        help="Print a one-line JSON summary to stderr (for log scraping)")
    parser.add_argument("--quiet", action="store_true", help="Suppress progress logs")
    args = parser.parse_args(argv)

    if len(args.query.strip()) < 8:
        print("Query must be at least 8 characters.", file=sys.stderr)
        return 2

    base = os.getenv("CHRONICLE_API_URL", DEFAULT_API_URL).rstrip("/")
    log = (lambda m: None) if args.quiet else (lambda m: print(m, file=sys.stderr))

    started = time.monotonic()
    log(f"Chronicle: {base}")
    log(f"Query: {args.query}")

    try:
        job_id, cached = enqueue(base, args.query)
        log(f"  job_id: {job_id}{' (cache hit)' if cached else ''}")
        row = poll(base, job_id, args.timeout, log)

        status = row.get("status")
        if status not in ("success",):
            err = row.get("error") or "unknown error"
            log(f"Pipeline reported failure: {err}")
            if args.json_summary:
                print(json.dumps({"job_id": job_id, "status": status, "error": err}),
                      file=sys.stderr)
            return 1

        markdown = _call("GET", f"{base}/api/export/{job_id}/markdown", raw=True)
    except ChronicleError as exc:
        log(f"ERROR: {exc}")
        if args.json_summary:
            print(json.dumps({"status": "error", "error": str(exc)}), file=sys.stderr)
        return 3

    elapsed = time.monotonic() - started

    if args.out:
        out_dir = Path(args.out)
        out_dir.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
        path = out_dir / f"{stamp}-{slugify(args.query)}.md"
        path.write_text(markdown, encoding="utf-8")
        log(f"Wrote {path} ({len(markdown):,} bytes) in {elapsed:.0f}s")
        print(path)
    else:
        print(markdown)
        log(f"Completed in {elapsed:.0f}s")

    if args.json_summary:
        print(json.dumps({
            "job_id": job_id,
            "status": "success",
            "cache_hit": cached,
            "elapsed_sec": round(elapsed, 1),
            "bytes": len(markdown),
            "share_url": f"https://deep-research.intelliforge.tech/history/{job_id}",
        }), file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
