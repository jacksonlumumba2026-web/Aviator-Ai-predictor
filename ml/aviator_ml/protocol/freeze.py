"""Freeze the validation protocol: python -m aviator_ml.protocol.freeze

Writes FROZEN_PROTOCOL.json with the protocol hash. REAL-data evaluations are
refused while the code hash differs from this record, so the feature set,
models, hyperparameters, targets, baseline and metrics cannot silently change
between freezing and the final test.
"""

from __future__ import annotations

import hashlib
import json
import os
import sys
from datetime import datetime, timezone

from .protocol import FROZEN_FILES, PROTOCOL_VERSION, REQUIREMENTS, _PKG, protocol_sha256

FROZEN_PATH = os.path.join(os.path.dirname(__file__), "FROZEN_PROTOCOL.json")


def load_frozen() -> dict:
    try:
        with open(FROZEN_PATH) as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return {}


def is_frozen_and_unchanged() -> bool:
    f = load_frozen()
    return bool(f.get("protocol_sha256")) and f["protocol_sha256"] == protocol_sha256() and f.get("protocol_version") == PROTOCOL_VERSION


def main() -> None:
    existing = load_frozen()
    if existing.get("protocol_version") == PROTOCOL_VERSION and existing.get("protocol_sha256") != protocol_sha256() and "--new-version" not in sys.argv:
        sys.exit(
            f"{PROTOCOL_VERSION} is already frozen with a different hash. Changing a frozen protocol is not allowed: "
            "bump PROTOCOL_VERSION (any earlier final-test window stays 'used') and pass --new-version."
        )
    files = {}
    for rel in FROZEN_FILES:
        with open(os.path.join(_PKG, rel), "rb") as fh:
            files[rel] = hashlib.sha256(fh.read()).hexdigest()
    record = {
        "protocol_version": PROTOCOL_VERSION,
        "protocol_sha256": protocol_sha256(),
        "frozen_at": datetime.now(timezone.utc).isoformat(),
        "requirements": REQUIREMENTS,
        "files": files,
        "based_on": "v0.2.0-audited (features, models, hyperparameters, targets, baseline and metrics unchanged)",
    }
    with open(FROZEN_PATH, "w") as fh:
        json.dump(record, fh, indent=2)
        fh.write("\n")
    print(f"froze {PROTOCOL_VERSION}: {record['protocol_sha256']}")


if __name__ == "__main__":
    main()
