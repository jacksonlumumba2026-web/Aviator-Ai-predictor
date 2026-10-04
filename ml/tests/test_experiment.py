import numpy as np
import pytest

from aviator_ml.config import FEATURE_LOOKBACK, MIN_HISTORY, THRESHOLDS
from aviator_ml.evaluation.backtest import enforce_monotone, fit_on_history, predict_from_features, walk_forward
from aviator_ml.features.engineering import build_feature_frame, feature_names, next_round_features
from aviator_ml.models.registry import ConstantProbability, candidate_factories
from aviator_ml.training import experiment
from aviator_ml.training.experiment import predict_from_snapshot, predict_next, run_experiment

from .conftest import iid_multipliers, to_rounds

LR = {k: candidate_factories()["logistic_regression"] for k in THRESHOLDS}


def test_chronological_split_and_no_shuffle(iid_rounds):
    res = run_experiment(iid_rounds, dataset="demo", refit_every=200)
    s = res.splits
    assert s["train_start_time"] <= s["train_end_time"] < s["validation_start_time"]
    assert s["validation_end_time"] < s["test_start_time"] <= s["test_end_time"]
    times = [p["round_time"] for p in res.test_predictions]
    assert times == sorted(times)
    assert len(res.test_predictions) == s["test"]
    assert s["train"] + s["validation"] + s["test"] == len(iid_rounds) - MIN_HISTORY
    # Every test prediction came from a model trained strictly before its round.
    assert all(p["train_end_round_time"] < p["round_time"] for p in res.test_predictions)
    assert all(p["based_on_round_time"] < p["round_time"] for p in res.test_predictions)
    # The test rounds are exactly the final 15%: unseen future observations.
    assert res.test_predictions[0]["round_time"] == s["test_start_time"]


def test_model_selection_never_sees_test_period(iid_rounds, monkeypatch):
    seen = {}
    real = experiment.select_models

    def spy(m_seen, train_end):
        seen["n"] = len(m_seen)
        return real(m_seen, train_end)

    monkeypatch.setattr(experiment, "select_models", spy)
    res = run_experiment(iid_rounds, dataset="demo", refit_every=200)
    assert seen["n"] == len(iid_rounds) - res.splits["test"]


def test_walk_forward_cannot_see_future_outcomes():
    """Changing round t and later must not change any prediction for rounds <= t."""
    m = iid_multipliers(700, seed=21)
    hist, fut = m[:500], m[500:]
    names = feature_names()
    a = walk_forward(hist, iter(fut), LR, names, refit_every=40)
    for k in (0, 37, 120):
        fut2 = fut.copy()
        fut2[k:] = 50.0  # poison the outcome of round 500+k and everything after
        b = walk_forward(hist, iter(fut2), LR, names, refit_every=40)
        for ra, rb in zip(a[: k + 1], b[: k + 1]):
            np.testing.assert_array_equal(ra.probabilities, rb.probabilities)
            assert ra.features == rb.features
        assert b[k].actual == 50.0  # the poisoned value is only revealed afterwards


def test_walk_forward_refit_every_round_trains_on_strictly_earlier_rounds():
    m = iid_multipliers(330, seed=4)
    recs = walk_forward(m[:300], iter(m[300:]), LR, feature_names(), refit_every=1)
    assert len(recs) == 30
    assert [r.round_index for r in recs] == list(range(300, 330))
    assert all(r.train_end_index == r.round_index - 1 for r in recs)
    assert [r.actual for r in recs] == list(m[300:])


def test_walk_forward_fit_windows():
    seen = []

    class Spy(ConstantProbability):
        def fit(self, X, y):  # noqa: N803
            seen.append(len(X))
            return super().fit(X, y)

    m = iid_multipliers(100, seed=1)
    walk_forward(m[:60], iter(m[60:]), {k: Spy for k in THRESHOLDS}, feature_names(), refit_every=15)
    per_threshold = seen[:: len(THRESHOLDS)]
    # Fits on 60, 75, 90 revealed rounds (minus the feature-history rows), plus the
    # discarded fit after the stream ends.
    assert per_threshold[:3] == [60 - MIN_HISTORY, 75 - MIN_HISTORY, 90 - MIN_HISTORY]


def test_live_and_backtest_features_identical_to_training_frame():
    m = iid_multipliers(FEATURE_LOOKBACK + 300, seed=8)
    m[100:170] = 1.01  # long low streak exercises the streak cap
    frame = build_feature_frame(m)
    for t in range(MIN_HISTORY, len(m)):
        live = next_round_features(m[:t])
        np.testing.assert_allclose(list(live.values()), frame.iloc[t].to_numpy(), rtol=0, atol=1e-12)


def test_predictions_come_from_the_model_not_constants(iid_rounds):
    res = run_experiment(iid_rounds, dataset="demo", refit_every=100)
    p2 = np.array([p["probabilities"]["2x"] for p in res.test_predictions])
    assert p2.std() > 0  # varies with inputs
    assert len(np.unique(np.round(p2, 6))) > 10
    # Deterministic replay of a stored snapshot through the final model.
    hist = [r.multiplier for r in iid_rounds]
    live = predict_next(res.final_models, hist, res.feature_names)
    again = predict_from_snapshot(res.final_models, live["features"], res.feature_names)
    for k, v in live["probabilities"].items():
        assert abs(again["probabilities"][k] - v) < 1e-12
    # A different history gives a different estimate.
    other = predict_next(res.final_models, hist[:-7], res.feature_names)
    assert other["probabilities"] != live["probabilities"]


def test_backtest_record_is_reproducible_from_its_audit_trail():
    m = iid_multipliers(520, seed=13)
    names = feature_names()
    recs = walk_forward(m[:450], iter(m[450:]), LR, names, refit_every=25)
    r = recs[33]
    models, base = fit_on_history(m[: r.train_end_index + 1], LR)
    np.testing.assert_allclose(predict_from_features(models, r.features, names), r.probabilities)
    np.testing.assert_allclose(base, r.baseline)


def test_iid_data_reports_no_edge(iid_rounds):
    res = run_experiment(iid_rounds, dataset="demo", refit_every=200)
    assert res.verdict in ("no_edge", "insufficient_data")
    assert res.signal in ("NO_RELIABLE_EDGE", "WEAK_SIGNAL", "INSUFFICIENT_DATA")
    assert res.confidence == "LOW"


def test_planted_signal_is_detected():
    rng = np.random.default_rng(11)
    m = [1.5]
    for _ in range(2999):
        if m[-1] < 1.3:
            m.append(float(rng.uniform(2.0, 4.0)) if rng.random() < 0.9 else 1.1)
        else:
            m.append(float(rng.choice([1.05, 1.2, 1.5, 2.5, 6.0])))
    res = run_experiment(to_rounds(m), dataset="demo", refit_every=150)
    assert res.metrics["2x"]["verdict"] == "edge_detected"
    assert res.signal in ("PROMISING_SIGNAL", "STRONGER_SIGNAL")


def test_duplicate_times_rejected():
    rounds = to_rounds(iid_multipliers(400, seed=1))
    rounds[10].round_time = rounds[9].round_time
    with pytest.raises(ValueError):
        run_experiment(rounds)


def test_monotone_probabilities():
    p = enforce_monotone(np.array([[0.6, 0.7, 0.2, 0.3, 0.1]]))
    assert list(p[0]) == [0.6, 0.6, 0.2, 0.2, 0.1]
