# Real-Data Validation Report

> **Dataset label: REAL DATA.**

*Generated 2026-10-04T13:03:09.299Z from commit `6b822cf` by `scripts/reports/validation-report.mts`. All figures are read from stored data.*

## Conclusion

**NO RELIABLE PREDICTIVE EDGE DETECTED. No validation window has been evaluated on this dataset, so no predictive advantage has been demonstrated.**

Classification: **NOT EVALUATED**

## 1. Data source

No data has been imported into this dataset.

## 2. Number of rounds

0 stored rounds.

## 3. Collection period

—

## 4. Data-quality results

—

## 5. Independence tests

Not enough rounds for dependence diagnostics.

## 6. Feature set

31 features, frozen since v0.2.0-audited: `lag_log_1`, `lag_log_2`, `lag_log_3`, `lag_log_4`, `lag_log_5`, `lag_log_6`, `lag_log_7`, `lag_log_8`, `lag_log_9`, `lag_log_10`, `mean_log_3`, `median_log_3`, `std_log_3`, `mean_log_5`, `median_log_5`, `std_log_5`, `mean_log_10`, `median_log_10`, `std_log_10`, `mean_log_20`, `median_log_20`, `std_log_20`, `n_below_1_2_10`, `n_at_least_2_10`, `n_at_least_5_10`, `n_below_1_2_20`, `n_at_least_2_20`, `n_at_least_5_20`, `volatility_ratio_5_20`, `max_log_20`, `streak_2x`.

## 7. Models

Candidates: logistic_regression, random_forest, gradient_boosting (fixed hyperparameters, `ml/aviator_ml/models/registry.py`). One model per target chosen on the validation window only.

## 8. Baseline

Training-window base rate for each target — the same information the model had. It predicts the majority class at the 50% threshold.

## 9–11. Training, validation and final test periods

Not evaluated — no final test window has been run.

## 12. Test metrics

Not evaluated.

## 13. Multiple-testing correction

Holm–Bonferroni across the five targets (family-wise α = 0.05), applied separately to the paired Brier-improvement test and the ROC-AUC > 0.5 test. A target counts as an edge only if **both** adjusted p-values are below 0.05 *and* Brier skill is positive (an intersection–union test). Three candidate models per target are compared only on the validation window; exactly one pre-selected model per target is evaluated on each test window, so model choice adds no test-set comparisons. In the confirmation window, the family is restricted to the targets that passed stage 1.

## 14. First test-window result

Not evaluated.

## 15. Second confirmation-window result

Not evaluated.

## 16. Evidence for / against predictive signal

- Sequential dependence in the data: not assessed.
- Out-of-sample, frozen-model evidence: none — not evaluated.
- Conclusion: **NO RELIABLE PREDICTIVE EDGE DETECTED. No validation window has been evaluated on this dataset, so no predictive advantage has been demonstrated.**

## 17. Limitations

- Results apply only to this dataset and period; game parameters or data collection may change.
- Missing rounds (time gaps, §4) make lag features span non-adjacent rounds.
- Statistical predictability is not profitability: payouts, house edge and risk are not modelled, and nothing here is betting advice.
- A significant dependence test with a tiny effect size can be practically meaningless.
- Only the baseline model family was tested; no conclusion is drawn about other model classes (by design — complex models are not justified unless this baseline shows signal).

## 18. Exact reproducibility instructions

```bash
git checkout 6b822cfe610a5c80a51b65cb0e694beecbe68157
pip install -r ml/requirements.lock.txt && npm ci
python3 scripts/freeze/manifest.py verify v0.2.0-audited      # methodology unchanged
(cd ml && python -m pytest -q tests/test_protocol.py)          # protocol hash still frozen
# restore the same rows (verify rows_sha256 per batch in §1), then via the app: Validation → evaluate.
# Protocol real-data-v1, sha256 8be1f69c1b346fd211089e97b5493aae02cc7fc73be5db5bd6059a7c7caa6ece
```

Data sha256 of the stage-1 snapshot: —. Each window can only be evaluated once per protocol hash; re-running requires a new protocol version and new, untouched data.
