"""Chronological walk-forward backtesting (online simulation).

The simulator replays the test period exactly as it would happen live:

    for each test round t:
        1. (re)train  — only on rounds whose outcomes are already revealed
        2. features   — computed from revealed history only
        3. predict    — probabilities for every threshold
        4. record     — prediction + feature snapshot + training-window end
        5. reveal     — only now is round t's multiplier pulled from the stream
        6. advance    — the revealed round joins the history

Future outcomes arrive through an iterator that is advanced *after* the
prediction is recorded, so the simulator cannot see round t before predicting
it. Refitting every round is supported (``refit_every=1``); larger values
refit on an expanding window every N rounds, which can only make the model
less informed — never leak.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Iterable, Iterator

import numpy as np
from sklearn.base import BaseEstimator

from ..config import MIN_HISTORY, THRESHOLDS
from ..features.engineering import build_feature_frame, build_targets, next_round_features
from ..models.registry import fit_safely, positive_proba


@dataclass
class WalkForwardRecord:
    round_index: int
    features: dict[str, float]
    probabilities: np.ndarray  # monotone, one per threshold
    baseline: np.ndarray  # training-window base rates, one per threshold
    train_end_index: int  # last round index whose outcome the model trained on
    history_length: int  # rounds revealed when the prediction was made
    actual: float | None = None


def enforce_monotone(prob_matrix: np.ndarray) -> np.ndarray:
    """Make P(>=k) non-increasing in k (thresholds are modelled independently)."""
    out = np.array(prob_matrix, dtype=float, copy=True)
    for j in range(1, out.shape[1]):
        out[:, j] = np.minimum(out[:, j], out[:, j - 1])
    return out


def fit_on_history(history: np.ndarray, factories: dict[float, Callable[[], BaseEstimator]]):
    """Fit one model per threshold on fully revealed history."""
    X = build_feature_frame(history).to_numpy(dtype=float)[MIN_HISTORY:]  # noqa: N806
    y = build_targets(history)
    models = {k: fit_safely(factories[k], X, y[k][MIN_HISTORY:]) for k in THRESHOLDS}
    base = np.array([float(y[k][MIN_HISTORY:].mean()) for k in THRESHOLDS])
    return models, base


def predict_from_features(models: dict, features: dict[str, float], feature_names: list[str]) -> np.ndarray:
    x = np.array([[features[f] for f in feature_names]])
    probs = np.array([[positive_proba(models[k], x)[0] for k in THRESHOLDS]])
    return enforce_monotone(probs)[0]


def walk_forward(
    initial_history: np.ndarray | list[float],
    future: Iterable[float],
    factories: dict[float, Callable[[], BaseEstimator]],
    feature_names: list[str],
    refit_every: int = 50,
) -> list[WalkForwardRecord]:
    history = list(np.asarray(initial_history, dtype=float))
    stream: Iterator[float] = iter(future)
    records: list[WalkForwardRecord] = []
    models, base, fitted_len = None, None, -1
    while True:
        t = len(history)
        if models is None or t - fitted_len >= refit_every:
            models, base = fit_on_history(np.array(history), factories)  # 1. train on revealed rounds
            fitted_len = t
        feats = next_round_features(history)  # 2. features from revealed history only
        probs = predict_from_features(models, feats, feature_names)  # 3. predict
        rec = WalkForwardRecord(  # 4. record before the outcome exists for us
            round_index=t,
            features=feats,
            probabilities=probs,
            baseline=base.copy(),
            train_end_index=fitted_len - 1,
            history_length=t,
        )
        try:
            actual = float(next(stream))  # 5. reveal
        except StopIteration:
            break  # no further rounds: the unrecorded final prediction is discarded
        assert rec.train_end_index < rec.round_index, "model trained on its own target"
        rec.actual = actual
        records.append(rec)
        history.append(actual)  # 6. advance
    return records
