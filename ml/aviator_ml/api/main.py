"""FastAPI service exposing training, backtesting and prediction.

Deploy separately from the Next.js frontend. The frontend's *server* calls
this service with a shared bearer token (``ML_SERVICE_TOKEN``); browsers never
talk to it directly.
"""

from __future__ import annotations

import hmac
import logging
import threading
import time
from collections import defaultdict, deque
from datetime import datetime

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator

from .. import __version__
from ..config import MIN_HISTORY, THRESHOLDS, load_settings
from ..models.store import list_versions, load_artifact, save_artifact
from ..features.engineering import next_round_features
from ..training.experiment import InsufficientDataError, Round, predict_from_snapshot, predict_next, run_experiment

log = logging.getLogger("aviator_ml")
settings = load_settings()

app = FastAPI(
    title="Aviator AI Lab — ML service",
    version=__version__,
    description=(
        "Experimental statistical estimates only. Outputs are uncertain and do not "
        "guarantee future outcomes or profits."
    ),
)
if settings.allowed_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_methods=["GET", "POST"],
        allow_headers=["Authorization", "Content-Type"],
    )


# --------------------------------------------------------------------------- #
# Security: bearer token + per-client rate limiting
# --------------------------------------------------------------------------- #
_hits: dict[str, deque[float]] = defaultdict(deque)
_hits_lock = threading.Lock()


def require_auth(request: Request) -> None:
    token = settings.service_token
    if token:
        header = request.headers.get("authorization", "")
        supplied = header[7:] if header.lower().startswith("bearer ") else ""
        if not hmac.compare_digest(supplied.encode(), token.encode()):
            raise HTTPException(status_code=401, detail="invalid or missing service token")

    client = request.client.host if request.client else "unknown"
    now = time.monotonic()
    with _hits_lock:
        q = _hits[client]
        while q and now - q[0] > 60:
            q.popleft()
        if len(q) >= settings.rate_limit_per_minute:
            raise HTTPException(status_code=429, detail="rate limit exceeded")
        q.append(now)


# --------------------------------------------------------------------------- #
# Schemas
# --------------------------------------------------------------------------- #
class RoundIn(BaseModel):
    multiplier: float = Field(ge=1.0, le=1_000_000)
    round_time: str

    @field_validator("round_time")
    @classmethod
    def _iso(cls, v: str) -> str:
        try:
            datetime.fromisoformat(v.replace("Z", "+00:00"))
        except ValueError as exc:  # pragma: no cover - message path
            raise ValueError("round_time must be ISO-8601") from exc
        return v


class TrainRequest(BaseModel):
    rounds: list[RoundIn]
    dataset: str = Field(default="real", pattern="^(real|demo)$")
    refit_every: int | None = Field(default=None, ge=10, le=10_000)


class PredictRequest(BaseModel):
    model_version: str
    multipliers: list[float] = Field(min_length=MIN_HISTORY)

    @field_validator("multipliers")
    @classmethod
    def _valid(cls, v: list[float]) -> list[float]:
        if any(x < 1 or x != x for x in v):
            raise ValueError("multipliers must be >= 1")
        return v[-2000:]


# --------------------------------------------------------------------------- #
# Routes
# --------------------------------------------------------------------------- #
@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "service_version": __version__,
        "auth_enabled": settings.service_token is not None,
        "thresholds": list(THRESHOLDS),
        "models_available": list_versions(settings.artifact_dir)[-10:],
    }


@app.post("/train", dependencies=[Depends(require_auth)])
def train(req: TrainRequest) -> dict:
    if len(req.rounds) > settings.max_rounds:
        raise HTTPException(413, f"too many rounds (max {settings.max_rounds})")
    rounds = [Round(multiplier=r.multiplier, round_time=r.round_time) for r in req.rounds]
    try:
        result = run_experiment(rounds, dataset=req.dataset, refit_every=req.refit_every)
    except InsufficientDataError as exc:
        raise HTTPException(422, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc

    save_artifact(
        settings.artifact_dir,
        result.model_version,
        {
            "version": result.model_version,
            "created_at": result.created_at,
            "dataset": result.dataset,
            "thresholds": list(THRESHOLDS),
            "models": result.final_models,
            "feature_names": result.feature_names,
            "verdict": result.verdict,
            "signal": result.signal,
            "confidence": result.confidence,
            "selection": result.selection,
        },
    )
    log.info("trained %s verdict=%s", result.model_version, result.verdict)
    return {
        "summary": result.summary(),
        "splits": result.splits,
        "selection": result.selection,
        "metrics": result.metrics,
        "verdict": result.verdict,
        "signal": result.signal,
        "confidence": result.confidence,
        "feature_names": result.feature_names,
        "test_predictions": result.test_predictions,
    }


def _artifact(version: str) -> dict:
    try:
        artifact = load_artifact(settings.artifact_dir, version)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    if artifact is None:
        raise HTTPException(404, "model artifact not found — retrain the model")
    return artifact


@app.post("/predict", dependencies=[Depends(require_auth)])
def predict(req: PredictRequest) -> dict:
    artifact = _artifact(req.model_version)
    out = predict_next(artifact["models"], req.multipliers, artifact["feature_names"])
    return {
        "model_version": artifact["version"],
        "dataset": artifact["dataset"],
        **out,
        "confidence": artifact["confidence"],
        "verdict": artifact["verdict"],
        "signal": artifact.get("signal", "NO_RELIABLE_EDGE"),
        "disclaimer": "Experimental statistical estimate — not a guaranteed prediction.",
    }


class ReplayRequest(BaseModel):
    model_version: str
    features: dict[str, float]


@app.post("/audit/replay", dependencies=[Depends(require_auth)])
def replay(req: ReplayRequest) -> dict:
    """Re-run a stored feature snapshot through the stored model artifact."""
    artifact = _artifact(req.model_version)
    try:
        return predict_from_snapshot(artifact["models"], req.features, artifact["feature_names"])
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


class FeaturesRequest(BaseModel):
    multipliers: list[float] = Field(min_length=MIN_HISTORY, max_length=5000)


@app.post("/audit/features", dependencies=[Depends(require_auth)])
def features(req: FeaturesRequest) -> dict:
    """Recompute next-round features from a history (to check stored snapshots)."""
    if any(x < 1 or x != x for x in req.multipliers):
        raise HTTPException(422, "multipliers must be >= 1")
    return {"features": next_round_features(req.multipliers)}
