"""HTTP client for the Chronicle research API."""

from __future__ import annotations

import json
import time
from typing import Any, Optional
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

DEFAULT_API_URL = "https://multi-agent-deep-research-api.fly.dev"
POLL_INTERVAL_SEC = 2.0
MAX_POLL_SEC = 600


class ChronicleAPIError(Exception):
    """Raised when the Chronicle API returns an error."""


def _request(
    method: str,
    url: str,
    payload: Optional[dict[str, Any]] = None,
    timeout: float = 120.0,
) -> dict[str, Any]:
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    req = Request(
        url,
        data=data,
        method=method,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
    )
    try:
        with urlopen(req, timeout=timeout) as resp:
            body = resp.read().decode("utf-8")
            return json.loads(body) if body else {}
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise ChronicleAPIError(f"HTTP {exc.code}: {detail}") from exc
    except URLError as exc:
        raise ChronicleAPIError(f"Network error: {exc.reason}") from exc


def health(base_url: str) -> dict[str, Any]:
    return _request("GET", f"{base_url.rstrip('/')}/api/health", timeout=15.0)


def demo_queries(base_url: str) -> list[str]:
    data = _request("GET", f"{base_url.rstrip('/')}/api/demo-queries", timeout=15.0)
    return list(data.get("queries") or [])


def research_sync(base_url: str, query: str) -> dict[str, Any]:
    """Run research synchronously (blocks until the pipeline completes)."""
    return _request(
        "POST",
        f"{base_url.rstrip('/')}/api/research",
        {"query": query},
        timeout=MAX_POLL_SEC,
    )


def create_job(base_url: str, query: str) -> dict[str, Any]:
    return _request(
        "POST",
        f"{base_url.rstrip('/')}/api/research/jobs",
        {"query": query},
        timeout=30.0,
    )


def get_job(base_url: str, job_id: str) -> dict[str, Any]:
    return _request(
        "GET",
        f"{base_url.rstrip('/')}/api/research/jobs/{job_id}",
        timeout=30.0,
    )


def wait_for_job(base_url: str, job_id: str) -> dict[str, Any]:
    """Poll until the job succeeds, errors, or times out."""
    deadline = time.monotonic() + MAX_POLL_SEC
    while time.monotonic() < deadline:
        row = get_job(base_url, job_id)
        status = row.get("status")
        if status in ("success", "error"):
            return row
        time.sleep(POLL_INTERVAL_SEC)
    raise ChronicleAPIError(f"Timed out waiting for job {job_id}")


def export_markdown(base_url: str, job_id: str) -> str:
    url = f"{base_url.rstrip('/')}/api/export/{job_id}/markdown"
    req = Request(url, method="GET", headers={"Accept": "text/markdown"})
    try:
        with urlopen(req, timeout=30.0) as resp:
            return resp.read().decode("utf-8")
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise ChronicleAPIError(f"HTTP {exc.code}: {detail}") from exc
    except URLError as exc:
        raise ChronicleAPIError(f"Network error: {exc.reason}") from exc
