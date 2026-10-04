"""Background job runner for long protocol evaluations (one at a time).

State is persisted as JSON under <artifact_dir>/jobs so results survive a restart.
"""

from __future__ import annotations

import json
import os
import threading
import traceback
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from typing import Any, Callable

_executor = ThreadPoolExecutor(max_workers=1)
_lock = threading.Lock()


def _path(job_dir: str, job_id: str) -> str:
    if not all(c in "0123456789abcdef-" for c in job_id):
        raise ValueError("invalid job id")
    return os.path.join(job_dir, f"{job_id}.json")


def _write(job_dir: str, job: dict[str, Any]) -> None:
    os.makedirs(job_dir, exist_ok=True)
    tmp = _path(job_dir, job["id"]) + ".tmp"
    with open(tmp, "w") as fh:
        json.dump(job, fh)
    os.replace(tmp, _path(job_dir, job["id"]))


def submit(job_dir: str, kind: str, fn: Callable[[], dict[str, Any]]) -> dict[str, Any]:
    job = {"id": str(uuid.uuid4()), "kind": kind, "status": "queued", "submitted_at": datetime.now(timezone.utc).isoformat()}
    _write(job_dir, job)

    def run() -> None:
        with _lock:
            job.update(status="running", started_at=datetime.now(timezone.utc).isoformat())
            _write(job_dir, job)
        try:
            result = fn()
            job.update(status="completed", result=result)
        except Exception as exc:  # report, never crash the worker
            job.update(status="failed", error=f"{type(exc).__name__}: {exc}", trace=traceback.format_exc()[-2000:])
        job["finished_at"] = datetime.now(timezone.utc).isoformat()
        _write(job_dir, job)

    _executor.submit(run)
    return {k: v for k, v in job.items() if k != "result"}


def get(job_dir: str, job_id: str) -> dict[str, Any] | None:
    p = _path(job_dir, job_id)
    if not os.path.exists(p):
        return None
    with open(p) as fh:
        return json.load(fh)
