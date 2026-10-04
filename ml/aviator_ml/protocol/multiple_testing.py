"""Multiple-comparison control for the validation protocol.

Method (documented in docs/VALIDATION_PROTOCOL.md):

* Model multiplicity: three candidate models per target are compared ONLY on
  the validation window. Exactly one pre-selected model per target is ever
  evaluated on a test window, so model choice adds no tests to the test family.
* Target multiplicity: five targets => five hypotheses per evidence type.
  Holm–Bonferroni (step-down) controls the family-wise error rate at alpha.
* Two evidence types per target (calibrated-probability skill via the paired
  Brier test; discrimination via ROC-AUC > 0.5). Holm is applied within each
  family, and a target counts as an edge only if BOTH adjusted p-values are
  below alpha (an intersection–union test, which needs no further correction).
"""

from __future__ import annotations

import math

from ..evaluation.metrics import normal_sf


def holm(pvalues: list[float]) -> list[float]:
    """Holm–Bonferroni adjusted p-values, in input order."""
    m = len(pvalues)
    order = sorted(range(m), key=lambda i: pvalues[i])
    adjusted = [1.0] * m
    running = 0.0
    for rank, i in enumerate(order):
        running = max(running, min(1.0, (m - rank) * pvalues[i]))
        adjusted[i] = running
    return adjusted


def auc_p_value(auc: float | None, n_pos: int, n_neg: int) -> float:
    """One-sided p-value for H0: AUC <= 0.5, Hanley–McNeil standard error at AUC = 0.5."""
    if auc is None or n_pos == 0 or n_neg == 0:
        return 1.0
    # Under H0 (AUC = 0.5) the Hanley–McNeil variance reduces to (n_pos + n_neg + 1) / (12 n_pos n_neg).
    se0 = math.sqrt((n_pos + n_neg + 1) / (12 * n_pos * n_neg))
    return normal_sf((auc - 0.5) / se0)
