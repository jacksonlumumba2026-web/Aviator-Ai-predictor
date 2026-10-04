"""Leak-free feature engineering.

Every feature in row ``t`` is computed exclusively from multipliers at indices
``< t`` (i.e. rounds that had already finished before round ``t`` started).
The multiplier of round ``t`` itself is only ever used as the *target*.

This is enforced structurally: all features are derived from ``past``, which
is the multiplier series shifted forward by one position.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from ..config import FEATURE_LOOKBACK, MIN_HISTORY, N_LAGS, STREAK_CAP, THRESHOLDS, WINDOWS


def _signed_streak(values: np.ndarray, cut: float) -> np.ndarray:
    """Signed run length ending at each index (inclusive).

    ``+k`` means the last ``k`` values were all ``>= cut``; ``-k`` means the
    last ``k`` were all ``< cut``. NaN inputs reset the streak to NaN.
    """
    out = np.full(values.shape, np.nan)
    run = 0
    for i, v in enumerate(values):
        if np.isnan(v):
            run = 0
            continue
        if v >= cut:
            run = run + 1 if run > 0 else 1
        else:
            run = run - 1 if run < 0 else -1
        out[i] = run
    return out


def build_feature_frame(multipliers: np.ndarray | list[float], include_next: bool = False) -> pd.DataFrame:
    """Build the feature matrix for a chronologically ordered multiplier series.

    Args:
        multipliers: chronologically ordered crash multipliers (>= 1).
        include_next: if True, append one extra row describing the *next*,
            not-yet-played round (used for live prediction).

    Returns:
        DataFrame indexed 0..n-1 (or 0..n with ``include_next``). Rows with an
        incomplete history contain NaNs; use :func:`usable_mask` to filter.
    """
    m = np.asarray(multipliers, dtype=float)
    if include_next:
        m = np.append(m, np.nan)

    s = pd.Series(m)
    past = s.shift(1)  # value of round t-1, as seen at the start of round t
    past_log = np.log(past)
    feats: dict[str, pd.Series] = {}

    for k in range(1, N_LAGS + 1):
        feats[f"lag_log_{k}"] = past_log.shift(k - 1)

    for w in WINDOWS:
        roll = past_log.rolling(w, min_periods=w)
        feats[f"mean_log_{w}"] = roll.mean()
        feats[f"median_log_{w}"] = roll.median()
        feats[f"std_log_{w}"] = roll.std(ddof=0)

    known = past.notna()
    for w in (10, 20):
        feats[f"n_below_1_2_{w}"] = past.lt(1.2).where(known).rolling(w, min_periods=w).sum()
        feats[f"n_at_least_2_{w}"] = past.ge(2.0).where(known).rolling(w, min_periods=w).sum()
        feats[f"n_at_least_5_{w}"] = past.ge(5.0).where(known).rolling(w, min_periods=w).sum()

    feats["volatility_ratio_5_20"] = feats["std_log_5"] / (feats["std_log_20"] + 1e-9)
    feats["max_log_20"] = past_log.rolling(20, min_periods=20).max()
    feats["streak_2x"] = pd.Series(np.clip(_signed_streak(past.to_numpy(), 2.0), -STREAK_CAP, STREAK_CAP))

    return pd.DataFrame(feats)


def feature_names() -> list[str]:
    return list(build_feature_frame(np.ones(MIN_HISTORY + 2)).columns)


def usable_mask(n_rows: int) -> np.ndarray:
    """Rows with a complete ``MIN_HISTORY`` look-back."""
    idx = np.arange(n_rows)
    return idx >= MIN_HISTORY


def build_targets(multipliers: np.ndarray | list[float]) -> dict[float, np.ndarray]:
    """Binary targets ``y_k[t] = multiplier[t] >= k`` for every threshold."""
    m = np.asarray(multipliers, dtype=float)
    return {k: (m >= k).astype(int) for k in THRESHOLDS}


def next_round_features(history: np.ndarray | list[float]) -> dict[str, float]:
    """Features for the round *after* ``history`` — using only ``history``.

    This is the single code path used for live estimates and for every
    walk-forward backtest prediction. Only the last ``FEATURE_LOOKBACK``
    rounds are needed; results are identical to the full-history frame.
    """
    h = np.asarray(history, dtype=float)
    if len(h) < MIN_HISTORY:
        raise ValueError(f"need at least {MIN_HISTORY} previous rounds")
    row = build_feature_frame(h[-FEATURE_LOOKBACK:], include_next=True).iloc[-1]
    return {k: float(v) for k, v in row.items()}
