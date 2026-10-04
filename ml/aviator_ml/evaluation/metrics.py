"""Evaluation metrics and significance tests.

All tests here are deterministic (no bootstrap randomness) so the identical
computation in the TypeScript frontend (``lib/evaluation.ts``) reproduces the
same numbers from the stored prediction rows. Keep the two in sync.
"""

from __future__ import annotations

import math
from typing import Any

import numpy as np

from ..config import ALPHA, CALIBRATION_BINS, DECISION_THRESHOLD, MIN_CLASS_COUNT, MIN_TEST_SAMPLES, THRESHOLDS

Z95 = 1.959963984540054


def normal_sf(z: float) -> float:
    """Upper-tail probability of the standard normal."""
    return 0.5 * math.erfc(z / math.sqrt(2.0))


def wilson_interval(successes: int, n: int, z: float = Z95) -> tuple[float, float]:
    if n == 0:
        return (0.0, 1.0)
    p = successes / n
    denom = 1 + z * z / n
    centre = (p + z * z / (2 * n)) / denom
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denom
    return (max(0.0, centre - half), min(1.0, centre + half))


def roc_auc(y: np.ndarray, p: np.ndarray) -> float | None:
    """Mann-Whitney AUC with average ranks for ties. None if one class."""
    y = np.asarray(y, dtype=int)
    p = np.asarray(p, dtype=float)
    n1 = int(y.sum())
    n0 = len(y) - n1
    if n1 == 0 or n0 == 0:
        return None
    order = np.argsort(p, kind="mergesort")
    ranks = np.empty(len(p))
    sorted_p = p[order]
    i = 0
    while i < len(p):
        j = i
        while j + 1 < len(p) and sorted_p[j + 1] == sorted_p[i]:
            j += 1
        ranks[order[i : j + 1]] = (i + j) / 2.0 + 1.0
        i = j + 1
    return float((ranks[y == 1].sum() - n1 * (n1 + 1) / 2.0) / (n1 * n0))


def auc_interval(auc: float | None, n1: int, n0: int) -> tuple[float, float] | None:
    """Hanley & McNeil (1982) normal-approximation 95% CI."""
    if auc is None or n1 == 0 or n0 == 0:
        return None
    a = auc
    q1 = a / (2 - a)
    q2 = 2 * a * a / (1 + a)
    var = (a * (1 - a) + (n1 - 1) * (q1 - a * a) + (n0 - 1) * (q2 - a * a)) / (n1 * n0)
    se = math.sqrt(max(var, 0.0))
    return (max(0.0, a - Z95 * se), min(1.0, a + Z95 * se))


def calibration_bins(y: np.ndarray, p: np.ndarray, n_bins: int = CALIBRATION_BINS) -> list[dict[str, Any]]:
    bins: list[dict[str, Any]] = []
    idx = np.minimum((p * n_bins).astype(int), n_bins - 1)
    for b in range(n_bins):
        mask = idx == b
        count = int(mask.sum())
        bins.append(
            {
                "bin_lower": b / n_bins,
                "bin_upper": (b + 1) / n_bins,
                "count": count,
                "mean_predicted": float(p[mask].mean()) if count else None,
                "observed_rate": float(y[mask].mean()) if count else None,
            }
        )
    return bins


def expected_calibration_error(bins: list[dict[str, Any]], n: int) -> float:
    if n == 0:
        return 0.0
    return float(
        sum(b["count"] / n * abs(b["mean_predicted"] - b["observed_rate"]) for b in bins if b["count"])
    )


def mcnemar_p(model_correct: np.ndarray, baseline_correct: np.ndarray) -> float:
    """Two-sided McNemar test with continuity correction."""
    b = int(np.sum(model_correct & ~baseline_correct))
    c = int(np.sum(~model_correct & baseline_correct))
    if b + c == 0:
        return 1.0
    chi2 = (abs(b - c) - 1) ** 2 / (b + c)
    return float(math.erfc(math.sqrt(chi2 / 2.0)))


def evaluate_threshold(
    y: np.ndarray,
    p_model: np.ndarray,
    p_baseline: np.ndarray,
    n_comparisons: int = len(THRESHOLDS),
) -> dict[str, Any]:
    """Full evaluation of one binary target against its base-rate baseline."""
    y = np.asarray(y, dtype=int)
    p = np.asarray(p_model, dtype=float)
    b = np.asarray(p_baseline, dtype=float)
    n = len(y)
    n_pos = int(y.sum())
    n_neg = n - n_pos

    pred = (p >= DECISION_THRESHOLD).astype(int)
    base_pred = (b >= DECISION_THRESHOLD).astype(int)
    tp = int(np.sum((pred == 1) & (y == 1)))
    fp = int(np.sum((pred == 1) & (y == 0)))
    tn = int(np.sum((pred == 0) & (y == 0)))
    fn = int(np.sum((pred == 0) & (y == 1)))

    correct = pred == y
    base_correct = base_pred == y
    accuracy = float(correct.mean()) if n else 0.0
    baseline_accuracy = float(base_correct.mean()) if n else 0.0
    precision = tp / (tp + fp) if (tp + fp) else 0.0
    recall = tp / (tp + fn) if (tp + fn) else 0.0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) else 0.0

    brier = float(np.mean((p - y) ** 2)) if n else 0.0
    brier_base = float(np.mean((b - y) ** 2)) if n else 0.0
    bss = 1 - brier / brier_base if brier_base > 0 else 0.0

    # Paired test on per-round Brier improvement (positive = model better).
    d = (b - y) ** 2 - (p - y) ** 2
    d_mean = float(d.mean()) if n else 0.0
    d_se = float(d.std(ddof=1) / math.sqrt(n)) if n > 1 else 0.0
    if d_se > 0:
        z = d_mean / d_se
        p_brier = normal_sf(z)
        ci = (d_mean - Z95 * d_se, d_mean + Z95 * d_se)
    else:
        z = 0.0
        p_brier = 1.0 if d_mean <= 0 else 0.0
        ci = (d_mean, d_mean)

    auc = roc_auc(y, p)
    auc_ci = auc_interval(auc, n_pos, n_neg)
    bins = calibration_bins(y, p)

    alpha_adj = ALPHA / max(n_comparisons, 1)
    sufficient = n >= MIN_TEST_SAMPLES and n_pos >= MIN_CLASS_COUNT and n_neg >= MIN_CLASS_COUNT
    edge = bool(
        sufficient
        and p_brier < alpha_adj
        and auc_ci is not None
        and auc_ci[0] > 0.5
    )
    if not sufficient:
        verdict = "insufficient_data"
    elif edge:
        verdict = "edge_detected"
    else:
        verdict = "no_edge"

    return {
        "n": n,
        "positives": n_pos,
        "base_rate": n_pos / n if n else 0.0,
        "accuracy": accuracy,
        "accuracy_ci": list(wilson_interval(int(correct.sum()), n)),
        "baseline_accuracy": baseline_accuracy,
        "baseline_accuracy_ci": list(wilson_interval(int(base_correct.sum()), n)),
        "accuracy_improvement": accuracy - baseline_accuracy,
        "mcnemar_p": mcnemar_p(correct, base_correct),
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "positive_predictions": int(pred.sum()),
        "roc_auc": auc,
        "roc_auc_ci": list(auc_ci) if auc_ci else None,
        "brier": brier,
        "baseline_brier": brier_base,
        "brier_skill_score": bss,
        "brier_improvement": d_mean,
        "brier_improvement_ci": list(ci),
        "brier_z": z,
        "brier_p_value": p_brier,
        "alpha_adjusted": alpha_adj,
        "calibration": bins,
        "ece": expected_calibration_error(bins, n),
        "confusion_matrix": {"tp": tp, "fp": fp, "tn": tn, "fn": fn},
        "verdict": verdict,
    }


def overall_verdict(per_threshold: dict[str, dict[str, Any]]) -> str:
    verdicts = [r["verdict"] for r in per_threshold.values()]
    if any(v == "edge_detected" for v in verdicts):
        return "edge_detected"
    if all(v == "insufficient_data" for v in verdicts):
        return "insufficient_data"
    return "no_edge"


def confidence_level(per_threshold: dict[str, dict[str, Any]]) -> str:
    """Confidence label for live estimates, derived *only* from backtest evidence.

    LOW unless the out-of-sample backtest found a statistically significant
    edge. Even HIGH means "evidence of some signal", never certainty.
    """
    edges = [r for r in per_threshold.values() if r["verdict"] == "edge_detected"]
    if not edges:
        return "LOW"
    n = max(r["n"] for r in per_threshold.values())
    if len(edges) >= 3 and n >= 2000:
        return "HIGH"
    return "MEDIUM"
