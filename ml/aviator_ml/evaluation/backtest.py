"""Chronological walk-forward backtesting.

For every test round ``t``:

1. Only rounds strictly before ``t`` are used — both for the features (by
   construction of the feature builder) and for fitting the model (the model
   used for ``t`` was fit on rows whose *target* index is < the block start).
2. A probability is generated and recorded.
3. The actual multiplier is then revealed and compared.

Refitting after every single round is accurate but expensive, so the model is
refit every ``refit_every`` rounds on an expanding window. Within a block the
model is frozen, which can only make it *less* informed, never leak.
"""

from __future__ import annotations

from typing import Callable

import numpy as np
from sklearn.base import BaseEstimator

from ..models.registry import fit_safely, positive_proba


def walk_forward(
    X: np.ndarray,  # noqa: N803
    y: np.ndarray,
    fit_start: int,
    test_start: int,
    test_end: int,
    factory: Callable[[], BaseEstimator],
    refit_every: int,
) -> tuple[np.ndarray, np.ndarray]:
    """Return (model probabilities, baseline probabilities) for rows [test_start, test_end).

    The baseline is the base rate of ``y`` over the same expanding training
    window, so both predictors see exactly the same past information.
    """
    n_test = test_end - test_start
    p_model = np.empty(n_test)
    p_base = np.empty(n_test)
    for block_start in range(test_start, test_end, refit_every):
        block_end = min(block_start + refit_every, test_end)
        X_fit, y_fit = X[fit_start:block_start], y[fit_start:block_start]  # noqa: N806
        model = fit_safely(factory, X_fit, y_fit)
        sl = slice(block_start - test_start, block_end - test_start)
        p_model[sl] = positive_proba(model, X[block_start:block_end])
        p_base[sl] = float(y_fit.mean()) if len(y_fit) else 0.0
    return p_model, p_base


def enforce_monotone(prob_matrix: np.ndarray) -> np.ndarray:
    """Make P(>=k) non-increasing in k.

    Thresholds are modelled independently, so e.g. P(>=3x) could exceed
    P(>=2x). Since {X >= 3} is a subset of {X >= 2}, we cap each column by the
    previous one. This is applied identically in backtests and live prediction.
    """
    out = prob_matrix.copy()
    for j in range(1, out.shape[1]):
        out[:, j] = np.minimum(out[:, j], out[:, j - 1])
    return out
