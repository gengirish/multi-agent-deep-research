"""HTTP client for the Chronicle research API."""

from __future__ import annotations

import json
import os
import time
from typing import Any, Optional
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from urllib.parse import quote

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
    """Fetch a job and flatten it to {job_id, status, error, result}.

    The endpoint answers with the ConversationDetail envelope, which nests
    the payload two levels deep:

        {"id": <job_id>, "data": {..., "status", "error", "data": {report}}}

    Callers here want a flat row, and reading `row["status"]` off the raw
    envelope silently yields None — which is what made `wait_for_job` poll
    until its 600s timeout on jobs that had already succeeded. Normalising in
    one place keeps that shape mismatch from leaking into every caller.
    """
    raw = _request(
        "GET",
        f"{base_url.rstrip('/')}/api/research/jobs/{job_id}",
        timeout=30.0,
    )
    detail = raw.get("data")
    if not isinstance(detail, dict):
        # Unexpected envelope — hand it back rather than masking it as empty.
        return raw
    return {
        "job_id": raw.get("id") or job_id,
        "status": detail.get("status"),
        "error": detail.get("error") or "",
        "query": detail.get("query"),
        "result": detail.get("data") or {},
    }


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


def broadcast(
    app_url: str,
    job_id: str,
    note: str = "",
    dry_run: bool = True,
) -> dict[str, Any]:
    """Send (or preview) a briefing to the newsletter list.

    Talks to the Next.js app rather than the research API: the subscriber
    list, the email template and the mail credentials all live there.

    Unlike the other helpers this does not raise on a 4xx. The interesting
    outcomes — 409 already_broadcast, 400 no subscribers — are answers the
    caller must relay verbatim, not transport failures.
    """
    token = (os.getenv("CHRONICLE_SERVICE_TOKEN") or "").strip()
    if not token:
        return {
            "ok": False,
            "error": "not_configured",
            "message": (
                "Set CHRONICLE_SERVICE_TOKEN to the value configured in the "
                "Chronicle web app to enable broadcasting."
            ),
        }

    payload: dict[str, Any] = {"dryRun": dry_run}
    if note:
        payload["note"] = note

    url = f"{app_url.rstrip('/')}/api/reports/{quote(job_id, safe='')}/broadcast"
    req = Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Authorization": f"Bearer {token}",
        },
    )
    try:
        with urlopen(req, timeout=120.0) as resp:
            body = resp.read().decode("utf-8")
            data = json.loads(body) if body else {}
            data.setdefault("ok", True)
            data["http_status"] = resp.status
            return data
    except HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        try:
            data = json.loads(raw)
        except ValueError:
            data = {"message": raw[:300]}
        data.setdefault("ok", False)
        data["http_status"] = exc.code
        return data
    except URLError as exc:
        return {"ok": False, "error": "unreachable",
                "message": f"Network error: {exc.reason}"}


def broadcast_newsletter(
    app_url: str,
    subject: str,
    html: str,
    text: str = "",
    segment: str = "",
    dedupe_key: str = "",
    dry_run: bool = True,
) -> dict[str, Any]:
    """Send (or preview) an externally-composed briefing to the newsletter list.

    Sibling of `broadcast`: same app, same auth, same relay-the-answer
    contract, but the caller supplies the finished email instead of naming a
    stored report, and names its own send-once key.
    """
    token = (os.getenv("CHRONICLE_SERVICE_TOKEN") or "").strip()
    if not token:
        return {
            "ok": False,
            "error": "not_configured",
            "message": (
                "Set CHRONICLE_SERVICE_TOKEN to the value configured in the "
                "Chronicle web app to enable broadcasting."
            ),
        }

    payload: dict[str, Any] = {
        "subject": subject,
        "html": html,
        "dedupeKey": dedupe_key,
        "dryRun": dry_run,
    }
    if text:
        payload["text"] = text
    if segment:
        payload["segment"] = segment

    url = f"{app_url.rstrip('/')}/api/newsletter/broadcast"
    req = Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Authorization": f"Bearer {token}",
        },
    )
    try:
        with urlopen(req, timeout=120.0) as resp:
            body = resp.read().decode("utf-8")
            data = json.loads(body) if body else {}
            data.setdefault("ok", True)
            data["http_status"] = resp.status
            return data
    except HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        try:
            data = json.loads(raw)
        except ValueError:
            data = {"message": raw[:300]}
        data.setdefault("ok", False)
        data["http_status"] = exc.code
        return data
    except URLError as exc:
        return {"ok": False, "error": "unreachable",
                "message": f"Network error: {exc.reason}"}
