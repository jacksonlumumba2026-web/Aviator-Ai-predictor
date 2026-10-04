import os
import sys
from datetime import datetime, timedelta, timezone

import numpy as np
import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from aviator_ml.training.experiment import Round  # noqa: E402


def iid_multipliers(n: int, seed: int = 0) -> np.ndarray:
    """Independent draws from a 3%-edge crash distribution (no signal by design)."""
    rng = np.random.default_rng(seed)
    u = rng.random(n)
    return np.maximum(1.0, np.floor(100 * 0.97 / (1 - u)) / 100)


def to_rounds(m) -> list[Round]:
    t0 = datetime(2026, 1, 1, tzinfo=timezone.utc)
    return [
        Round(multiplier=float(x), round_time=(t0 + timedelta(seconds=15 * i)).isoformat().replace("+00:00", "Z"))
        for i, x in enumerate(m)
    ]


@pytest.fixture
def iid_rounds():
    return to_rounds(iid_multipliers(1500, seed=7))
