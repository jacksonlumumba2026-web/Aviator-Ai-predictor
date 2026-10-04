"""On-disk model artifact store (joblib).

Artifacts are written to ``ML_ARTIFACT_DIR``. For multi-instance deployments
mount a persistent volume or swap this module for object storage.
"""

from __future__ import annotations

import os
import re
from typing import Any

import joblib

_VERSION_RE = re.compile(r"^v\d{14}-[0-9a-f]{6}$")


def _path(artifact_dir: str, version: str) -> str:
    if not _VERSION_RE.match(version):
        raise ValueError("invalid model version")
    return os.path.join(artifact_dir, f"{version}.joblib")


def save_artifact(artifact_dir: str, version: str, payload: dict[str, Any]) -> str:
    os.makedirs(artifact_dir, exist_ok=True)
    path = _path(artifact_dir, version)
    joblib.dump(payload, path)
    return path


def load_artifact(artifact_dir: str, version: str) -> dict[str, Any] | None:
    path = _path(artifact_dir, version)
    if not os.path.exists(path):
        return None
    return joblib.load(path)


def list_versions(artifact_dir: str) -> list[str]:
    if not os.path.isdir(artifact_dir):
        return []
    names = [f[: -len(".joblib")] for f in os.listdir(artifact_dir) if f.endswith(".joblib")]
    return sorted(n for n in names if _VERSION_RE.match(n))
