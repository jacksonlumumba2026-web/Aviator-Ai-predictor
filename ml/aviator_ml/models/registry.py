"""Candidate baseline models.

Deliberately simple and regularised. Sequence models (LSTM / Transformer) are
intentionally *not* included: they should only be considered after these
baselines have been shown to beat the base rate on unseen data.
"""

from __future__ import annotations

from typing import Callable

import numpy as np
from sklearn.base import BaseEstimator, ClassifierMixin
from sklearn.ensemble import HistGradientBoostingClassifier, RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from ..config import RANDOM_STATE


class ConstantProbability(ClassifierMixin, BaseEstimator):
    """Predicts the training base rate for every row.

    Used both as the statistical baseline and as a fallback when a training
    window contains only one class (e.g. no >= 10x rounds yet).
    """

    def fit(self, X, y):  # noqa: N803 - sklearn convention
        y = np.asarray(y)
        self.p_ = float(y.mean()) if len(y) else 0.0
        self.classes_ = np.array([0, 1])
        return self

    def predict_proba(self, X):  # noqa: N803
        n = len(X)
        return np.column_stack([np.full(n, 1 - self.p_), np.full(n, self.p_)])

    def predict(self, X):  # noqa: N803
        return (self.predict_proba(X)[:, 1] >= 0.5).astype(int)


def _logistic() -> BaseEstimator:
    return Pipeline(
        [("scale", StandardScaler()), ("clf", LogisticRegression(C=0.5, max_iter=2000))]
    )


def _random_forest() -> BaseEstimator:
    return RandomForestClassifier(
        n_estimators=200,
        max_depth=6,
        min_samples_leaf=25,
        n_jobs=-1,
        random_state=RANDOM_STATE,
    )


def _gradient_boosting() -> BaseEstimator:
    return HistGradientBoostingClassifier(
        max_depth=3,
        learning_rate=0.05,
        max_iter=150,
        l2_regularization=1.0,
        min_samples_leaf=40,
        random_state=RANDOM_STATE,
    )


def _xgboost_factory() -> Callable[[], BaseEstimator] | None:
    try:
        from xgboost import XGBClassifier  # type: ignore
    except Exception:  # pragma: no cover - optional dependency
        return None

    def make() -> BaseEstimator:
        return XGBClassifier(
            n_estimators=200,
            max_depth=3,
            learning_rate=0.05,
            subsample=0.8,
            colsample_bytree=0.8,
            reg_lambda=1.0,
            eval_metric="logloss",
            random_state=RANDOM_STATE,
            n_jobs=2,
        )

    return make


def candidate_factories() -> dict[str, Callable[[], BaseEstimator]]:
    factories: dict[str, Callable[[], BaseEstimator]] = {
        "logistic_regression": _logistic,
        "random_forest": _random_forest,
        "gradient_boosting": _gradient_boosting,
    }
    xgb = _xgboost_factory()
    if xgb is not None:
        factories["xgboost"] = xgb
    return factories


def fit_safely(factory: Callable[[], BaseEstimator], X, y) -> BaseEstimator:  # noqa: N803
    """Fit a model, falling back to the base rate if ``y`` has one class."""
    y = np.asarray(y)
    if len(np.unique(y)) < 2:
        return ConstantProbability().fit(X, y)
    model = factory().fit(X, y)
    # Fit in parallel, but predict single-threaded: walk-forward predicts one
    # row at a time and a thread pool per call costs ~100x the prediction.
    if hasattr(model, "n_jobs"):
        model.set_params(n_jobs=1)
    return model


def positive_proba(model: BaseEstimator, X) -> np.ndarray:  # noqa: N803
    proba = model.predict_proba(X)
    classes = list(getattr(model, "classes_", [0, 1]))
    if 1 not in classes:
        return np.zeros(len(X))
    return np.clip(proba[:, classes.index(1)], 0.0, 1.0)
