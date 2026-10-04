import numpy as np
from sklearn.metrics import roc_auc_score

from aviator_ml.evaluation.metrics import (
    auc_interval,
    evaluate_threshold,
    mcnemar_p,
    roc_auc,
    wilson_interval,
)

# Shared fixture mirrored in lib/__tests__/evaluation.test.ts — keep in sync.
Y = np.array([1, 0, 1, 1, 0, 0, 1, 0, 0, 1, 0, 1])
P = np.array([0.9, 0.2, 0.6, 0.55, 0.4, 0.1, 0.7, 0.65, 0.3, 0.45, 0.5, 0.8])
B = np.full(12, 0.5)


def test_auc_matches_sklearn_with_ties():
    rng = np.random.default_rng(0)
    y = rng.integers(0, 2, 500)
    p = np.round(rng.random(500), 1)  # many ties
    assert np.isclose(roc_auc(y, p), roc_auc_score(y, p))


def test_auc_none_for_single_class():
    assert roc_auc(np.ones(5, dtype=int), np.linspace(0, 1, 5)) is None


def test_wilson_bounds():
    lo, hi = wilson_interval(50, 100)
    assert 0.40 < lo < 0.41 and 0.59 < hi < 0.60


def test_mcnemar_identical_is_one():
    c = np.array([True, False, True])
    assert mcnemar_p(c, c) == 1.0


def test_shared_fixture_values():
    r = evaluate_threshold(Y, P, B, n_comparisons=5)
    assert r["confusion_matrix"] == {"tp": 5, "fp": 2, "tn": 4, "fn": 1}
    assert np.isclose(r["accuracy"], 9 / 12)
    assert np.isclose(r["roc_auc"], roc_auc_score(Y, P))
    assert np.isclose(r["brier"], np.mean((P - Y) ** 2))
    assert r["verdict"] == "insufficient_data"  # far too few samples
    lo, hi = auc_interval(r["roc_auc"], 6, 6)
    assert lo < r["roc_auc"] < hi
    print(r["roc_auc_ci"], r["brier_p_value"], r["mcnemar_p"], r["accuracy_ci"])


def test_perfect_vs_baseline_detects_edge():
    rng = np.random.default_rng(1)
    y = rng.integers(0, 2, 1000)
    p = np.where(y == 1, 0.8, 0.2)
    r = evaluate_threshold(y, p, np.full(1000, y.mean()))
    assert r["verdict"] == "edge_detected"


def test_constant_model_has_no_edge():
    rng = np.random.default_rng(2)
    y = rng.integers(0, 2, 1000)
    r = evaluate_threshold(y, np.full(1000, 0.5), np.full(1000, 0.5))
    assert r["verdict"] == "no_edge"
    assert r["brier_skill_score"] == 0.0
