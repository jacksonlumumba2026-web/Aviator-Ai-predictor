import numpy as np

from aviator_ml.config import MIN_HISTORY
from aviator_ml.evaluation.backtest import enforce_monotone, walk_forward
from aviator_ml.models.registry import ConstantProbability
from aviator_ml.training.experiment import predict_next, run_experiment

from .conftest import iid_multipliers, to_rounds


def test_chronological_split_and_no_shuffle(iid_rounds):
    res = run_experiment(iid_rounds, dataset="demo", refit_every=200)
    s = res.splits
    assert s["train_end_time"] < s["validation_end_time"] < s["test_start_time"] <= s["test_end_time"]
    times = [p["round_time"] for p in res.test_predictions]
    assert times == sorted(times)
    assert len(res.test_predictions) == s["test"]
    assert s["train"] + s["validation"] + s["test"] == len(iid_rounds) - MIN_HISTORY


def test_iid_data_reports_no_edge(iid_rounds):
    res = run_experiment(iid_rounds, dataset="demo", refit_every=200)
    assert res.verdict in ("no_edge", "insufficient_data")
    assert res.confidence == "LOW"


def test_planted_signal_is_detected():
    # Synthetic dependency: after a round below 1.3x, the next round is very likely >= 2x.
    rng = np.random.default_rng(11)
    m = [1.5]
    for _ in range(2999):
        if m[-1] < 1.3:
            m.append(float(rng.uniform(2.0, 4.0)) if rng.random() < 0.9 else 1.1)
        else:
            m.append(float(rng.choice([1.05, 1.2, 1.5, 2.5, 6.0])))
    res = run_experiment(to_rounds(m), dataset="demo", refit_every=150)
    assert res.metrics["2x"]["verdict"] == "edge_detected"
    assert res.verdict == "edge_detected"


def test_walk_forward_only_fits_on_past():
    seen = []

    class Spy(ConstantProbability):
        def fit(self, X, y):  # noqa: N803
            seen.append(len(X))
            return super().fit(X, y)

    X = np.arange(100, dtype=float).reshape(-1, 1)  # noqa: N806
    y = np.tile([0, 1], 50)
    walk_forward(X, y, fit_start=0, test_start=60, test_end=100, factory=Spy, refit_every=15)
    assert seen == [60, 75, 90]  # each block fit on strictly earlier rows


def test_monotone_probabilities():
    p = enforce_monotone(np.array([[0.6, 0.7, 0.2, 0.3, 0.1]]))
    assert list(p[0]) == [0.6, 0.6, 0.2, 0.2, 0.1]


def test_predict_next_returns_probabilities(iid_rounds):
    res = run_experiment(iid_rounds, dataset="demo", refit_every=200)
    out = predict_next(res.final_models, iid_multipliers(100, seed=5).tolist())
    probs = list(out["probabilities"].values())
    assert all(0 <= p <= 1 for p in probs)
    assert probs == sorted(probs, reverse=True)
