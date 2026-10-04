"""Real-data validation protocol v1.

STAGE 1 — final test
    Development rounds = everything before the final test window.
    Train / validation split of development data, model selection on
    validation only (frozen `select_models`), then an online walk-forward over
    the final test window (frozen `walk_forward`). The final test window is the
    latest >= 6,500 rounds and is never used for training, feature selection or
    tuning. It may be evaluated exactly once (enforced by the app's database).

STAGE 2 — confirmation
    Only after stage 1. Uses rounds strictly LATER than the stage-1 data, which
    did not exist / were never seen during development. Same frozen features,
    same pre-selected model per target, same hyperparameters, same refit
    cadence; walk-forward continues from all earlier rounds.

Nothing here changes the model, features, targets, baseline or metrics.
"""

from __future__ import annotations

import hashlib
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

import numpy as np

from ..config import ALPHA, MIN_CLASS_COUNT, MIN_HISTORY, THRESHOLDS, TRAIN_FRACTION, VALIDATION_FRACTION
from ..evaluation.backtest import walk_forward
from ..evaluation.metrics import evaluate_threshold
from ..features.engineering import build_targets, feature_names
from ..models.registry import candidate_factories
from ..training.experiment import _parse_time, actual_tier, select_models, test_fingerprint, threshold_key, Round
from .multiple_testing import auc_p_value, holm

PROTOCOL_VERSION = "real-data-v1"

# Hard requirements for REAL data. Never overridable for dataset == "real".
REQUIREMENTS = {
    "min_total_rounds": 45_000,
    "min_final_test_rounds": 6_500,
    "min_confirmation_rounds": 6_500,
    "min_training_rounds": 20_000,
    "alpha": ALPHA,
}

# Files whose content defines the experiment. Any change => new protocol hash.
_PKG = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FROZEN_FILES = [
    "config.py",
    "features/engineering.py",
    "models/registry.py",
    "training/experiment.py",
    "evaluation/metrics.py",
    "evaluation/backtest.py",
    "protocol/multiple_testing.py",
    "protocol/protocol.py",
]

# ---------------------------------------------------------------------------
# Explicit classification criteria (also rendered verbatim into reports).
# ---------------------------------------------------------------------------
CLASSIFICATION_CRITERIA = {
    "INSUFFICIENT_DATA": "Protocol requirements not met (rounds, window sizes, or class counts).",
    "NO_RELIABLE_EDGE": "No target passes the Holm-corrected tests, and no target shows even nominal (uncorrected) improvement; "
    "or a stage-1 result failed to replicate in the confirmation window.",
    "WEAK_SIGNAL": "No target passes the Holm-corrected tests, but at least one target has positive Brier skill, AUC > 0.5 and "
    "uncorrected p < alpha on the Brier test. Expected by chance under no signal; NOT evidence of an edge.",
    "PROMISING_SIGNAL": "At least one target passes BOTH Holm-corrected tests (Brier improvement and AUC > 0.5) with positive skill "
    "on the final test window. Unconfirmed: requires the second window before any conclusion.",
    "STRONGER_SIGNAL": "At least one target that passed on the final test window ALSO passes both Holm-corrected tests (family = "
    "targets that passed stage 1) with positive skill on the later, untouched confirmation window.",
}

CONCLUSION_NO_EDGE = "NO RELIABLE PREDICTIVE EDGE DETECTED."


def protocol_sha256() -> str:
    h = hashlib.sha256()
    for rel in FROZEN_FILES:
        with open(os.path.join(_PKG, rel), "rb") as fh:
            h.update(rel.encode() + b"\0" + fh.read() + b"\0")
    return h.hexdigest()


def data_sha256(rounds: list[Round]) -> str:
    h = hashlib.sha256()
    for r in rounds:
        h.update(f"{r.multiplier:.2f},{_parse_time(r.round_time).isoformat()}\n".encode())
    return h.hexdigest()


class ProtocolError(ValueError):
    pass


@dataclass
class Plan:
    n_total: int
    first: int
    train_end: int
    val_end: int  # == start of the final test window
    n_test: int
    refit_every: int


def plan_final_test(n: int, dataset: str, overrides: dict[str, int] | None = None) -> Plan:
    req = dict(REQUIREMENTS)
    if overrides:
        if dataset == "real":
            raise ProtocolError("protocol requirements cannot be overridden for REAL data")
        req.update({k: v for k, v in overrides.items() if k in REQUIREMENTS})
    if n < req["min_total_rounds"]:
        raise ProtocolError(f"need at least {req['min_total_rounds']:,} rounds for the final test (have {n:,})")
    usable = n - MIN_HISTORY
    n_test = max(req["min_final_test_rounds"], int(round(usable * (1 - TRAIN_FRACTION - VALIDATION_FRACTION))))
    dev = usable - n_test
    n_val = int(round(usable * VALIDATION_FRACTION))
    if dev - n_val < req["min_training_rounds"]:
        raise ProtocolError(
            f"only {dev - n_val:,} training rounds remain after reserving the final test and validation windows "
            f"(need {req['min_training_rounds']:,})"
        )
    train_end = MIN_HISTORY + dev - n_val
    val_end = MIN_HISTORY + dev
    return Plan(n, MIN_HISTORY, train_end, val_end, n - val_end, max(50, n_test // 10))


def _family_evaluation(metrics: dict[str, dict[str, Any]], keys: list[str]) -> dict[str, Any]:
    """Holm-corrected decisions for the given targets (the test family)."""
    brier_p = [metrics[k]["brier_p_value"] for k in keys]
    auc_p = [auc_p_value(metrics[k]["roc_auc"], metrics[k]["positives"], metrics[k]["n"] - metrics[k]["positives"]) for k in keys]
    brier_adj = holm(brier_p)
    auc_adj = holm(auc_p)
    out = {}
    for i, k in enumerate(keys):
        r = metrics[k]
        sufficient = r["positives"] >= MIN_CLASS_COUNT and (r["n"] - r["positives"]) >= MIN_CLASS_COUNT
        passed = bool(sufficient and r["brier_skill_score"] > 0 and brier_adj[i] < ALPHA and auc_adj[i] < ALPHA)
        nominal = bool(sufficient and r["brier_skill_score"] > 0 and (r["roc_auc"] or 0) > 0.5 and brier_p[i] < ALPHA)
        out[k] = {
            "brier_p": brier_p[i],
            "brier_p_holm": brier_adj[i],
            "auc_p": auc_p[i],
            "auc_p_holm": auc_adj[i],
            "sufficient": sufficient,
            "passed": passed,
            "nominal_only": nominal and not passed,
        }
    return {"method": "Holm–Bonferroni within the Brier family and within the AUC family; edge requires both adjusted p < alpha",
            "alpha": ALPHA, "family": keys, "targets": out}


def classify_stage1(family: dict[str, Any]) -> str:
    t = family["targets"].values()
    if any(x["passed"] for x in t):
        return "PROMISING_SIGNAL"
    if any(x["nominal_only"] for x in t):
        return "WEAK_SIGNAL"
    return "NO_RELIABLE_EDGE"


def classify_confirmation(stage1_family: dict[str, Any], family: dict[str, Any] | None) -> str:
    if family is None or not any(x["passed"] for x in stage1_family["targets"].values()):
        return classify_stage1(stage1_family) if family is None else "NO_RELIABLE_EDGE"
    if any(x["passed"] for x in family["targets"].values()):
        return "STRONGER_SIGNAL"
    if any(x["nominal_only"] for x in family["targets"].values()):
        return "WEAK_SIGNAL"
    return "NO_RELIABLE_EDGE"


def conclusion(classification: str) -> str:
    if classification == "STRONGER_SIGNAL":
        return ("Out-of-sample predictive signal detected on the final test window and confirmed on a later untouched window. "
                "This is evidence of statistical predictability in this data only — not of profitability, and not a guarantee.")
    if classification == "PROMISING_SIGNAL":
        return f"{CONCLUSION_NO_EDGE} A promising final-test result awaits the confirmation window; it is not yet robust."
    return CONCLUSION_NO_EDGE


def _evaluate_window(m: np.ndarray, rounds: list[Round], start: int, chosen: dict[float, str], refit: int) -> tuple[dict, list[dict]]:
    factories = candidate_factories()
    chosen_factories = {k: factories[chosen[k]] for k in THRESHOLDS}
    records = walk_forward(m[:start], iter(m[start:]), chosen_factories, feature_names(), refit)
    assert [r.round_index for r in records] == list(range(start, len(m)))
    assert all(r.train_end_index < r.round_index for r in records)
    p_model = np.array([r.probabilities for r in records])
    p_base = np.array([r.baseline for r in records])
    targets = build_targets(m)
    metrics = {threshold_key(k): evaluate_threshold(targets[k][start:], p_model[:, j], p_base[:, j]) for j, k in enumerate(THRESHOLDS)}
    preds = []
    for rec in records:
        t = rec.round_index
        preds.append({
            "round_time": rounds[t].round_time,
            "based_on_round_time": rounds[t - 1].round_time,
            "train_end_round_time": rounds[rec.train_end_index].round_time,
            "probabilities": {threshold_key(k): float(rec.probabilities[j]) for j, k in enumerate(THRESHOLDS)},
            "baseline_probabilities": {threshold_key(k): float(rec.baseline[j]) for j, k in enumerate(THRESHOLDS)},
            "features": rec.features,
            "actual_multiplier": float(rec.actual),
            "actual_class": actual_tier(float(rec.actual)),
        })
    return metrics, preds


def _sorted(rounds: list[Round]) -> tuple[list[Round], np.ndarray]:
    rounds = sorted(rounds, key=lambda r: _parse_time(r.round_time))
    times = [_parse_time(r.round_time) for r in rounds]
    if any(b <= a for a, b in zip(times, times[1:])):
        raise ProtocolError("round_time values must be unique")
    m = np.array([r.multiplier for r in rounds], dtype=float)
    if np.any(~np.isfinite(m)) or np.any(m < 1):
        raise ProtocolError("multipliers must be finite and >= 1")
    return rounds, m


def describe_final_test(rounds: list[Round], dataset: str, overrides: dict[str, int] | None = None) -> dict[str, Any]:
    """Window plan + fingerprints, computed BEFORE any evaluation (for pre-registration)."""
    rounds, _ = _sorted(rounds)
    p = plan_final_test(len(rounds), dataset, overrides)
    test = rounds[p.val_end:]
    return {
        "protocol_version": PROTOCOL_VERSION,
        "protocol_sha256": protocol_sha256(),
        "data_sha256": data_sha256(rounds),
        "window_fingerprint": test_fingerprint(test),
        "window_start": test[0].round_time,
        "window_end": test[-1].round_time,
        "window_rounds": len(test),
        "development_rounds": p.val_end,
        "plan": p.__dict__,
        "overrides": overrides or {},
    }


def run_final_test(rounds: list[Round], dataset: str, overrides: dict[str, int] | None = None) -> dict[str, Any]:
    rounds, m = _sorted(rounds)
    desc = describe_final_test(rounds, dataset, overrides)
    p = plan_final_test(len(rounds), dataset, overrides)
    # Model selection: the final test window is NOT passed in.
    selection, chosen = select_models(m[: p.val_end], p.train_end)
    metrics, preds = _evaluate_window(m, rounds, p.val_end, chosen, p.refit_every)
    family = _family_evaluation(metrics, [threshold_key(k) for k in THRESHOLDS])
    cls = classify_stage1(family)
    return {
        **desc,
        "stage": "final_test",
        "completed_at": datetime.now(timezone.utc).isoformat(),
        "periods": {
            "training": [rounds[p.first].round_time, rounds[p.train_end - 1].round_time, p.train_end - p.first],
            "validation": [rounds[p.train_end].round_time, rounds[p.val_end - 1].round_time, p.val_end - p.train_end],
            "final_test": [rounds[p.val_end].round_time, rounds[-1].round_time, len(rounds) - p.val_end],
        },
        "selection": selection,
        "chosen_models": {threshold_key(k): v for k, v in chosen.items()},
        "refit_every": p.refit_every,
        "metrics": metrics,
        "multiple_testing": family,
        "classification": cls,
        "criteria": CLASSIFICATION_CRITERIA,
        "conclusion": conclusion(cls),
        "predictions": preds,
    }


def describe_confirmation(rounds: list[Round], dataset: str, stage1_window_end: str, overrides: dict[str, int] | None = None) -> dict[str, Any]:
    rounds, _ = _sorted(rounds)
    req = dict(REQUIREMENTS)
    if overrides:
        if dataset == "real":
            raise ProtocolError("protocol requirements cannot be overridden for REAL data")
        req.update({k: v for k, v in overrides.items() if k in REQUIREMENTS})
    end = _parse_time(stage1_window_end)
    start = next((i for i, r in enumerate(rounds) if _parse_time(r.round_time) > end), len(rounds))
    window = rounds[start:]
    if len(window) < req["min_confirmation_rounds"]:
        raise ProtocolError(
            f"confirmation needs at least {req['min_confirmation_rounds']:,} rounds collected AFTER the final test window "
            f"(have {len(window):,})"
        )
    return {
        "protocol_version": PROTOCOL_VERSION,
        "protocol_sha256": protocol_sha256(),
        "data_sha256": data_sha256(rounds),
        "window_fingerprint": test_fingerprint(window),
        "window_start": window[0].round_time,
        "window_end": window[-1].round_time,
        "window_rounds": len(window),
        "development_rounds": start,
        "start_index": start,
        "overrides": overrides or {},
    }


def run_confirmation(rounds: list[Round], dataset: str, stage1: dict[str, Any], overrides: dict[str, int] | None = None) -> dict[str, Any]:
    rounds, m = _sorted(rounds)
    desc = describe_confirmation(rounds, dataset, stage1["window_end"], overrides)
    if stage1.get("protocol_sha256") != protocol_sha256():
        raise ProtocolError("protocol code changed since the final test — confirmation would not test the same frozen model")
    chosen = {k: stage1["chosen_models"][threshold_key(k)] for k in THRESHOLDS}
    metrics, preds = _evaluate_window(m, rounds, desc["start_index"], chosen, int(stage1["refit_every"]))
    passed_stage1 = [k for k, v in stage1["multiple_testing"]["targets"].items() if v["passed"]]
    family = _family_evaluation(metrics, passed_stage1) if passed_stage1 else None
    all_targets = _family_evaluation(metrics, [threshold_key(k) for k in THRESHOLDS])  # descriptive only
    cls = classify_confirmation(stage1["multiple_testing"], family) if passed_stage1 else "NO_RELIABLE_EDGE"
    return {
        **desc,
        "stage": "confirmation",
        "completed_at": datetime.now(timezone.utc).isoformat(),
        "chosen_models": stage1["chosen_models"],
        "refit_every": stage1["refit_every"],
        "metrics": metrics,
        "confirmation_family": family,
        "multiple_testing": all_targets,
        "stage1_classification": stage1["classification"],
        "classification": cls,
        "criteria": CLASSIFICATION_CRITERIA,
        "conclusion": conclusion(cls),
        "predictions": preds,
    }
