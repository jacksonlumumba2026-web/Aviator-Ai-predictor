import importlib

from fastapi.testclient import TestClient

from .conftest import iid_multipliers, to_rounds


def make_client(monkeypatch, tmp_path, token=None):
    monkeypatch.setenv("ML_ARTIFACT_DIR", str(tmp_path))
    if token:
        monkeypatch.setenv("ML_SERVICE_TOKEN", token)
    else:
        monkeypatch.delenv("ML_SERVICE_TOKEN", raising=False)
    import aviator_ml.api.main as main

    importlib.reload(main)
    return TestClient(main.app)


def payload(n=600):
    return {
        "dataset": "demo",
        "refit_every": 100,
        "rounds": [{"multiplier": r.multiplier, "round_time": r.round_time} for r in to_rounds(iid_multipliers(n, 3))],
    }


def test_train_then_predict(monkeypatch, tmp_path):
    c = make_client(monkeypatch, tmp_path)
    r = c.post("/train", json=payload())
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["verdict"] in ("no_edge", "insufficient_data", "edge_detected")
    version = body["summary"]["model_version"]
    p = c.post("/predict", json={"model_version": version, "multipliers": iid_multipliers(50, 9).tolist()})
    assert p.status_code == 200, p.text
    assert set(p.json()["probabilities"]) == {"1.5x", "2x", "3x", "5x", "10x"}
    assert "not a guaranteed prediction" in p.json()["disclaimer"]


def test_rejects_invalid_multiplier(monkeypatch, tmp_path):
    c = make_client(monkeypatch, tmp_path)
    bad = payload(400)
    bad["rounds"][5]["multiplier"] = 0.5
    assert c.post("/train", json=bad).status_code == 422


def test_insufficient_data(monkeypatch, tmp_path):
    c = make_client(monkeypatch, tmp_path)
    assert c.post("/train", json=payload(100)).status_code == 422


def test_auth_required_when_token_set(monkeypatch, tmp_path):
    c = make_client(monkeypatch, tmp_path, token="s3cret")
    assert c.post("/train", json=payload(400)).status_code == 401
    ok = c.post("/train", json=payload(400), headers={"Authorization": "Bearer s3cret"})
    assert ok.status_code == 200


def test_unknown_model_version(monkeypatch, tmp_path):
    c = make_client(monkeypatch, tmp_path)
    r = c.post("/predict", json={"model_version": "v20260101000000-abcdef", "multipliers": [1.5] * 30})
    assert r.status_code == 404
    r = c.post("/predict", json={"model_version": "../../etc/passwd", "multipliers": [1.5] * 30})
    assert r.status_code == 400
