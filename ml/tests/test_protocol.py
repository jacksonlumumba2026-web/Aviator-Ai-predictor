import importlib
import time

import numpy as np
import pytest
from fastapi.testclient import TestClient

from aviator_ml.protocol import protocol as P
from aviator_ml.protocol.freeze import is_frozen_and_unchanged, load_frozen
from aviator_ml.protocol.multiple_testing import auc_p_value, holm

from .conftest import iid_multipliers, to_rounds

SMALL = {"min_total_rounds": 1000, "min_final_test_rounds": 300, "min_confirmation_rounds": 300, "min_training_rounds": 500}


def planted(n, seed=11):
    rng = np.random.default_rng(seed)
    m = [1.5]
    for _ in range(n - 1):
        if m[-1] < 1.3:
            m.append(float(rng.uniform(2.0, 4.0)) if rng.random() < 0.9 else 1.1)
        else:
            m.append(float(rng.choice([1.05, 1.2, 1.5, 2.5, 6.0])))
    return m


def test_protocol_is_frozen_and_code_unchanged():
    """Fails if features/models/hyperparameters/targets/baseline/metrics changed after freezing."""
    assert load_frozen().get("protocol_version") == P.PROTOCOL_VERSION
    assert is_frozen_and_unchanged(), "frozen protocol code changed — bump PROTOCOL_VERSION and re-freeze explicitly"


def test_holm_and_auc_p():
    assert holm([0.01, 0.04, 0.03, 0.005, 0.2]) == pytest.approx([0.04, 0.09, 0.09, 0.025, 0.2])
    assert auc_p_value(0.5, 100, 100) == pytest.approx(0.5)
    assert auc_p_value(0.6, 500, 500) < 1e-4
    assert auc_p_value(0.4, 500, 500) > 0.99


def test_real_data_requirements_cannot_be_overridden():
    with pytest.raises(P.ProtocolError):
        P.plan_final_test(50_000, "real", overrides={"min_final_test_rounds": 10})
    with pytest.raises(P.ProtocolError, match="45,000"):
        P.plan_final_test(44_999, "real")
    p = P.plan_final_test(45_000, "real")
    assert p.n_test >= 6_500 and p.val_end + p.n_test == 45_000
    assert p.first < p.train_end < p.val_end


def test_final_window_is_latest_and_never_used_for_selection(monkeypatch):
    seen = {}
    real = P.select_models

    def spy(m_seen, train_end):
        seen["n"] = len(m_seen)
        return real(m_seen, train_end)

    monkeypatch.setattr(P, "select_models", spy)
    rounds = to_rounds(iid_multipliers(1200, seed=3))
    res = P.run_final_test(rounds, "test", SMALL)
    assert seen["n"] == res["development_rounds"]
    assert res["window_rounds"] == 1200 - res["development_rounds"] >= 300
    assert res["periods"]["validation"][1] < res["periods"]["final_test"][0] == res["window_start"]
    assert res["window_end"] == rounds[-1].round_time
    assert all(p["train_end_round_time"] < p["round_time"] for p in res["predictions"])


def test_iid_concludes_no_reliable_edge():
    res = P.run_final_test(to_rounds(iid_multipliers(1500, seed=9)), "test", SMALL)
    assert res["classification"] in ("NO_RELIABLE_EDGE", "WEAK_SIGNAL")
    assert res["conclusion"] == "NO RELIABLE PREDICTIVE EDGE DETECTED."
    fam = res["multiple_testing"]
    assert set(fam["family"]) == {"1.5x", "2x", "3x", "5x", "10x"}
    for t in fam["targets"].values():
        assert t["brier_p_holm"] >= t["brier_p"] and t["auc_p_holm"] >= t["auc_p"]


def test_signal_must_survive_confirmation():
    m = planted(2600)
    rounds = to_rounds(m)
    stage1_rounds = rounds[:1500]
    s1 = P.run_final_test(stage1_rounds, "test", SMALL)
    assert s1["classification"] == "PROMISING_SIGNAL"
    assert "NO RELIABLE PREDICTIVE EDGE DETECTED" in s1["conclusion"]  # not robust until confirmed

    # (a) the dependence persists in later data -> confirmed
    s2 = P.run_confirmation(rounds, "test", {k: v for k, v in s1.items() if k != "predictions"}, SMALL)
    assert s2["window_start"] > s1["window_end"]
    assert s2["development_rounds"] == 1500
    assert s2["classification"] == "STRONGER_SIGNAL"

    # (b) the dependence disappears later -> not confirmed
    later_iid = to_rounds(m[:1500] + list(iid_multipliers(1100, seed=5)))
    s2b = P.run_confirmation(later_iid, "test", {k: v for k, v in s1.items() if k != "predictions"}, SMALL)
    assert s2b["classification"] == "NO_RELIABLE_EDGE"
    assert s2b["conclusion"] == "NO RELIABLE PREDICTIVE EDGE DETECTED."


def test_confirmation_requires_later_rounds_and_same_protocol(monkeypatch):
    rounds = to_rounds(iid_multipliers(1300, seed=2))
    s1 = P.run_final_test(rounds[:1100], "test", SMALL)
    with pytest.raises(P.ProtocolError, match="AFTER the final test"):
        P.run_confirmation(rounds, "test", s1, SMALL)  # only 200 later rounds
    more = to_rounds(iid_multipliers(1500, seed=2))
    monkeypatch.setattr(P, "protocol_sha256", lambda: "changed")
    with pytest.raises(P.ProtocolError, match="protocol code changed"):
        P.run_confirmation(more, "test", s1, SMALL)


def _client(monkeypatch, tmp_path):
    monkeypatch.setenv("ML_ARTIFACT_DIR", str(tmp_path))
    monkeypatch.delenv("ML_SERVICE_TOKEN", raising=False)
    import aviator_ml.api.main as main

    importlib.reload(main)
    return TestClient(main.app), main


def test_api_refuses_real_data_shortcuts(monkeypatch, tmp_path):
    c, main = _client(monkeypatch, tmp_path)
    body = {"rounds": [{"multiplier": r.multiplier, "round_time": r.round_time} for r in to_rounds(iid_multipliers(1200, 1))], "stage": "final_test"}
    r = c.post("/protocol/describe", json={**body, "dataset": "real"})
    assert r.status_code == 422 and "45,000" in r.json()["detail"]
    r = c.post("/protocol/describe", json={**body, "dataset": "real", "overrides": SMALL})
    assert r.status_code == 422 and "cannot be overridden" in r.json()["detail"]
    monkeypatch.setattr(main, "is_frozen_and_unchanged", lambda: False)
    r = c.post("/protocol/describe", json={**body, "dataset": "real"})
    assert r.status_code == 409
    info = c.get("/protocol/info").json()
    assert info["requirements"]["min_final_test_rounds"] == 6500 and "STRONGER_SIGNAL" in info["criteria"]


def test_api_job_flow(monkeypatch, tmp_path):
    c, _ = _client(monkeypatch, tmp_path)
    body = {
        "rounds": [{"multiplier": r.multiplier, "round_time": r.round_time} for r in to_rounds(iid_multipliers(1200, 4))],
        "dataset": "test",
        "stage": "final_test",
        "overrides": SMALL,
    }
    d = c.post("/protocol/describe", json=body).json()
    job = c.post("/protocol/jobs", json=body).json()
    for _ in range(600):
        j = c.get(f"/protocol/jobs/{job['id']}").json()
        if j["status"] in ("completed", "failed"):
            break
        time.sleep(0.5)
    assert j["status"] == "completed", j.get("error")
    assert j["result"]["window_fingerprint"] == d["window_fingerprint"]
    assert c.get("/protocol/jobs/../../etc").status_code in (400, 404)
