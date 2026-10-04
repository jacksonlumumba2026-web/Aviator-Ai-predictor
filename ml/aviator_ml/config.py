"""Shared constants and runtime settings."""

from __future__ import annotations

import os
from dataclasses import dataclass

# Classification targets: "will the next round reach >= k x?"
THRESHOLDS: tuple[float, ...] = (1.5, 2.0, 3.0, 5.0, 10.0)

# The primary target summarised in model_runs' flat columns.
PRIMARY_THRESHOLD = 2.0

# Rolling windows used by the feature builder (in rounds).
WINDOWS: tuple[int, ...] = (3, 5, 10, 20)
N_LAGS = 10

# Rows before this index lack a full feature history and are dropped.
MIN_HISTORY = max(WINDOWS)

# Minimum number of usable rows to run an experiment at all.
MIN_ROUNDS = 300

# Chronological split fractions (train / validation / test).
TRAIN_FRACTION = 0.70
VALIDATION_FRACTION = 0.15

# Statistical testing.
ALPHA = 0.05
MIN_TEST_SAMPLES = 200
MIN_CLASS_COUNT = 10

DECISION_THRESHOLD = 0.5
CALIBRATION_BINS = 10
RANDOM_STATE = 42


@dataclass(frozen=True)
class Settings:
    artifact_dir: str
    service_token: str | None
    rate_limit_per_minute: int
    max_rounds: int
    allowed_origins: list[str]


def load_settings() -> Settings:
    origins = os.getenv("ML_ALLOWED_ORIGINS", "")
    return Settings(
        artifact_dir=os.getenv("ML_ARTIFACT_DIR", os.path.join(os.path.dirname(__file__), "..", "artifacts")),
        service_token=os.getenv("ML_SERVICE_TOKEN") or None,
        rate_limit_per_minute=int(os.getenv("ML_RATE_LIMIT_PER_MINUTE", "30")),
        max_rounds=int(os.getenv("ML_MAX_ROUNDS", "250000")),
        allowed_origins=[o.strip() for o in origins.split(",") if o.strip()],
    )
