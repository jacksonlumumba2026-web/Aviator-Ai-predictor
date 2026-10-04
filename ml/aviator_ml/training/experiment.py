"""End-to-end experiment: features → chronological split → model selection →
walk-forward backtest → significance testing → final model fit.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

import numpy as np

from ..config import (
    MIN_HISTORY,
    MIN_ROUNDS,
    PRIMARY_THRESHOLD,
    THRESHOLDS,
    TRAIN_FRACTION,
    VALIDATION_FRACTION,
)
from ..evaluation.backtest import fit_on_history, predict_from_features, walk_forward
from ..evaluation.metrics import classify_signal, confidence_level, evaluate_threshold, overall_verdict, roc_auc
from ..features.engineering import build_feature_frame, build_targets, next_round_features
from ..features.engineering import feature_names as feature_names_list
from ..models.registry import candidate_factories, fit_safely, positive_proba


class InsufficientDataError(ValueError):
    pass


@dataclass
class Round:
    multiplier: float
    round_time: str


@dataclass
class ExperimentResult:
    model_version: str
    created_at: str
    dataset: str
    splits: dict[str, int]
    selection: dict[str, Any]
    metrics: dict[str, Any]
    verdict: str
    signal: str
    confidence: str
    test_predictions: list[dict[str, Any]]
    final_models: dict[float, Any] = field(repr=False)
    feature_names: list[str] = field(default_factory=list)

    def summary(self) -> dict[str, Any]:
        primary = self.metrics[threshold_key(PRIMARY_THRESHOLD)]
        return {
            "model_version": self.model_version,
            "created_at": self.created_at,
            "dataset": self.dataset,
            "training_samples": self.splits["train"] + self.splits["validation"],
            "test_samples": self.splits["test"],
            "accuracy": primary["accuracy"],
            "precision": primary["precision"],
            "recall": primary["recall"],
            "roc_auc": primary["roc_auc"],
            "brier_score": primary["brier"],
            "baseline_accuracy": primary["baseline_accuracy"],
        }


def threshold_key(k: float) -> str:
    return f"{k:g}x"


def chronological_split(n_usable: int) -> tuple[int, int]:
    """Return (train_end, val_end) offsets into the usable rows. Never shuffles."""
    train_end = int(round(n_usable * TRAIN_FRACTION))
    val_end = int(round(n_usable * (TRAIN_FRACTION + VALIDATION_FRACTION)))
    return train_end, val_end


def _brier(y: np.ndarray, p: np.ndarray) -> float:
    return float(np.mean((p - y) ** 2))


def _log_loss(y: np.ndarray, p: np.ndarray) -> float:
    p = np.clip(p, 1e-6, 1 - 1e-6)
    return float(-np.mean(y * np.log(p) + (1 - y) * np.log(1 - p)))


def _tier(probabilities: list[float]) -> str:
    """Highest threshold whose estimated probability is >= 50%."""
    label = f"<{THRESHOLDS[0]:g}x"
    for k, p in zip(THRESHOLDS, probabilities):
        if p >= 0.5:
            label = f">={k:g}x"
    return label


def actual_tier(multiplier: float) -> str:
    label = f"<{THRESHOLDS[0]:g}x"
    for k in THRESHOLDS:
        if multiplier >= k:
            label = f">={k:g}x"
    return label


def _parse_time(value: str) -> datetime:
    dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def select_models(m_seen: np.ndarray, train_end: int) -> tuple[dict[str, Any], dict[float, str]]:
    """Choose one candidate per threshold on the validation window.

    Receives ONLY train + validation rounds — the test period is not passed in,
    so it cannot influence model choice.
    """
    first = MIN_HISTORY
    X = build_feature_frame(m_seen).to_numpy(dtype=float)  # noqa: N806
    targets = build_targets(m_seen)
    factories = candidate_factories()
    selection: dict[str, Any] = {}
    chosen: dict[float, str] = {}
    for k in THRESHOLDS:
        y = targets[k]
        y_tr, y_va = y[first:train_end], y[train_end:]
        p_base = np.full(len(y_va), float(y_tr.mean()))
        scores: dict[str, dict[str, float | None]] = {
            "base_rate": {"brier": _brier(y_va, p_base), "log_loss": _log_loss(y_va, p_base), "roc_auc": None}
        }
        for name, factory in factories.items():
            model = fit_safely(factory, X[first:train_end], y_tr)
            p = positive_proba(model, X[train_end:])
            scores[name] = {"brier": _brier(y_va, p), "log_loss": _log_loss(y_va, p), "roc_auc": roc_auc(y_va, p)}
        best = min(factories, key=lambda nm: (scores[nm]["brier"], list(factories).index(nm)))
        chosen[k] = best
        selection[threshold_key(k)] = {
            "selected_model": best,
            "validation_scores": scores,
            "beats_base_rate_on_validation": scores[best]["brier"] < scores["base_rate"]["brier"],
        }
    return selection, chosen


def test_fingerprint(rounds: list[Round]) -> str:
    """Stable identity of a test window, to track how often it has been evaluated."""
    h = hashlib.sha256()
    for r in rounds:
        h.update(f"{_parse_time(r.round_time).isoformat()}|{r.multiplier:.2f};".encode())
    return h.hexdigest()[:16]


def run_experiment(
    rounds: list[Round],
    dataset: str = "real",
    refit_every: int | None = None,
) -> ExperimentResult:
    rounds = sorted(rounds, key=lambda r: _parse_time(r.round_time))
    m = np.array([r.multiplier for r in rounds], dtype=float)
    if np.any(~np.isfinite(m)) or np.any(m < 1):
        raise ValueError("multipliers must be finite and >= 1")
    times = [_parse_time(r.round_time) for r in rounds]
    if any(b <= a for a, b in zip(times, times[1:])):
        raise ValueError("round_time values must be unique")

    n = len(m)
    first = MIN_HISTORY
    n_usable = n - first
    if n_usable < MIN_ROUNDS:
        raise InsufficientDataError(
            f"need at least {MIN_ROUNDS + MIN_HISTORY} rounds (have {n}); "
            f"the first {MIN_HISTORY} rounds only provide feature history"
        )

    train_off, val_off = chronological_split(n_usable)
    train_end, val_end = first + train_off, first + val_off
    n_test = n - val_end
    refit = refit_every or max(50, n_test // 10)
    feature_names = feature_names_list()

    # 1) Model selection: the test period is sealed (not even passed in).
    selection, chosen = select_models(m[:val_end], train_end)
    factories = candidate_factories()
    chosen_factories = {k: factories[chosen[k]] for k in THRESHOLDS}

    # 2) Walk-forward over the untouched test period, one round at a time.
    records = walk_forward(m[:val_end], iter(m[val_end:]), chosen_factories, feature_names, refit)
    assert [r.round_index for r in records] == list(range(val_end, n))
    p_model = np.array([r.probabilities for r in records])
    p_base = np.array([r.baseline for r in records])

    metrics: dict[str, Any] = {}
    targets = build_targets(m)
    for j, k in enumerate(THRESHOLDS):
        metrics[threshold_key(k)] = evaluate_threshold(targets[k][val_end:], p_model[:, j], p_base[:, j])

    verdict = overall_verdict(metrics)
    signal = classify_signal(metrics)
    confidence = confidence_level(metrics)

    test_predictions = []
    for rec in records:
        t = rec.round_index
        probs = [float(x) for x in rec.probabilities]
        test_predictions.append(
            {
                "round_index": t,
                "round_time": rounds[t].round_time,
                "based_on_round_time": rounds[t - 1].round_time,
                "train_end_round_time": rounds[rec.train_end_index].round_time,
                "probabilities": {threshold_key(k): probs[j] for j, k in enumerate(THRESHOLDS)},
                "baseline_probabilities": {threshold_key(k): float(rec.baseline[j]) for j, k in enumerate(THRESHOLDS)},
                "features": rec.features,
                "predicted_class": _tier(probs),
                "actual_multiplier": float(rec.actual),
                "actual_class": actual_tier(float(rec.actual)),
            }
        )

    # 3) Final models on all data, for live next-round estimates only.
    final_models, _ = fit_on_history(m, chosen_factories)

    now = datetime.now(timezone.utc)
    digest = hashlib.sha256(m.tobytes()).hexdigest()[:6]
    version = f"v{now:%Y%m%d%H%M%S}-{digest}"

    return ExperimentResult(
        model_version=version,
        created_at=now.isoformat(),
        dataset=dataset,
        splits={
            "total_rounds": n,
            "history_rows": first,
            "train": train_end - first,
            "validation": val_end - train_end,
            "test": n_test,
            "refit_every": refit,
            "train_start_time": rounds[first].round_time,
            "train_end_time": rounds[train_end - 1].round_time,
            "validation_start_time": rounds[train_end].round_time,
            "validation_end_time": rounds[val_end - 1].round_time,
            "test_start_time": rounds[val_end].round_time,
            "test_end_time": rounds[-1].round_time,
            "test_fingerprint": test_fingerprint(rounds[val_end:]),
            "walk_forward": "online: predict -> record -> reveal -> advance",
        },
        selection=selection,
        metrics=metrics,
        verdict=verdict,
        signal=signal,
        confidence=confidence,
        test_predictions=test_predictions,
        final_models=final_models,
        feature_names=feature_names,
    )


def predict_next(final_models: dict[float, Any], multipliers: list[float], feature_names: list[str]) -> dict[str, Any]:
    """Probability estimates for the round *after* the given history."""
    m = np.asarray(multipliers, dtype=float)
    if len(m) < MIN_HISTORY:
        raise InsufficientDataError(f"need at least {MIN_HISTORY} previous rounds")
    feats = next_round_features(m)
    return predict_from_snapshot(final_models, feats, feature_names)


def predict_from_snapshot(final_models: dict[float, Any], features: dict[str, float], feature_names: list[str]) -> dict[str, Any]:
    """Deterministic replay: same model + same feature snapshot -> same probabilities."""
    missing = [f for f in feature_names if f not in features]
    if missing:
        raise ValueError(f"feature snapshot missing: {missing[:5]}")
    probs = [float(p) for p in predict_from_features(final_models, features, feature_names)]
    return {
        "probabilities": {threshold_key(k): probs[j] for j, k in enumerate(THRESHOLDS)},
        "predicted_class": _tier(probs),
        "features": {f: float(features[f]) for f in feature_names},
    }
