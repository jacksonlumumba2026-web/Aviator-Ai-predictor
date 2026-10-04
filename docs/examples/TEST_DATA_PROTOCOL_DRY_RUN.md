# Real-Data Validation Report — TEST DATA — SYNTHETIC, NOT REAL GAME RESULTS

> **Dataset label: TEST DATA — SYNTHETIC, NOT REAL GAME RESULTS.** This report describes synthetic data used to test the protocol machinery. It says nothing about real game observations.

*Generated 2026-10-04T13:12:57.888Z from commit `2a1807d` by `scripts/reports/validation-report.mts`. All figures are read from stored data.*

## Conclusion

**NO RELIABLE PREDICTIVE EDGE DETECTED.**

Classification: **NO RELIABLE EDGE**

## 1. Data source

| Batch | Source | Method | Attested | Rows read | Inserted | Rejected | Period | Rows sha256 |
|---|---|---|---|---|---|---|---|---|
| `636fbb15` | protocol_dry_run | synthetic | no | 7,000 | 7,000 | 0 | 2026-06-11T02:42:08 → 2026-06-12T14:53:04 | `048276f15fff3b78…` |
| `e1c3660c` | protocol_dry_run | synthetic | no | 46,000 | 46,000 | 0 | 2026-06-01T00:00:00 → 2026-06-10T20:41:40 | `9d89a2e43c54e6d1…` |

- `636fbb15` provenance: Synthetic i.i.d. crash-distribution rounds generated for a protocol dry run (seed 20261005). NOT REAL GAME RESULTS.
- `e1c3660c` provenance: Synthetic i.i.d. crash-distribution rounds generated for a protocol dry run (seed 20261005). NOT REAL GAME RESULTS.

## 2. Number of rounds

53,000 stored rounds.

## 3. Collection period

2026-06-01T00:00:00.000Z → 2026-06-12T14:53:04.000Z (UTC).

## 4. Data-quality results

| Total | Unique | Duplicates skipped | Rejected rows | Time gaps | ≈ missing rounds | Median interval |
|---|---|---|---|---|---|---|
| 53,000 | 53,000 | 0 | 0 | 1 | 1,137 | 19.0 s |

Min 1.00x · max 10000.00x · mean 9.9257 · median 1.95 · σ 134.4082.

Threshold frequencies: ≥1.5x 64.98% · ≥2x 48.76% · ≥3x 32.37% · ≥5x 19.28% · ≥10x 9.53%.

Distribution: 1–1.2x 10,008 · 1.2–1.5x 8,551 · 1.5–2x 8,600 · 2–3x 8,686 · 3–5x 6,936 · 5–10x 5,167 · 10–20x 2,489 · 20–50x 1,565 · 50–100x 467 · 100x+ 531.

## 5. Independence tests

**No evidence of dependence.** No evidence of dependence: none of 16 tests rejects independence after Holm correction (α = 0.05). This does not prove independence — small effects may be undetectable at n = 53,000.

**Exploitability:** Exploitability is NOT established by these diagnostics. Detected dependence is only exploitable if a frozen model, chosen without the test data, beats the base rate on untouched future rounds — see the validation protocol.

| Test | Statistic | Effect | p | p (Holm) |
|---|---|---|---|---|
| Ljung–Box on rank autocorrelation, lags 1–20 | Q = 16.78, dof 20 | max |ρ| = 0.0109 at lag 9 | 0.6671 | 1.0000 |
| Ljung–Box on ≥2x indicator autocorrelation, lags 1–20 | Q = 18.50, dof 20 | max |ρ| = 0.0089 at lag 20 | 0.5544 | 1.0000 |
| Wald–Wolfowitz runs test, ≥1.5x indicator | runs 24204 vs expected 24121.4, z = 0.79 | 0.34% vs expected | 0.4305 | 1.0000 |
| Wald–Wolfowitz runs test, ≥2x indicator | runs 26475 vs expected 26484.6, z = -0.08 | -0.04% vs expected | 0.9334 | 1.0000 |
| Wald–Wolfowitz runs test, ≥3x indicator | runs 23009 vs expected 23205.6, z = -1.95 | -0.85% vs expected | 0.0512 | 0.7162 |
| Wald–Wolfowitz runs test, ≥5x indicator | runs 16393 vs expected 16498.3, z = -1.47 | -0.64% vs expected | 0.1416 | 1.0000 |
| Wald–Wolfowitz runs test, ≥10x indicator | runs 9047 vs expected 9141.9, z = -2.39 | -1.04% vs expected | 0.0169 | 0.2698 |
| Lag-1 tier transition χ² test (5×5) | χ² = 20.50, dof 16, min expected 481.6 | Cramér's V = 0.0098 | 0.1985 | 1.0000 |
| P(next ≥ 2x | previous < 1.2x) vs otherwise | 48.0% (n 10007) vs 48.9%, z = -1.65 | -0.92 pp | 0.0988 | 1.0000 |
| P(next ≥ 2x | previous ≥ 2x) vs otherwise | 48.8% (n 25841) vs 48.7%, z = 0.07 | 0.03 pp | 0.9431 | 1.0000 |
| P(next ≥ 2x | previous ≥ 10x) vs otherwise | 50.1% (n 5052) vs 48.6%, z = 2.03 | 1.50 pp | 0.0421 | 0.6317 |
| P(next ≥ 2x | previous 3 all < 2x) vs otherwise | 49.1% (n 7154) vs 48.7%, z = 0.68 | 0.43 pp | 0.4962 | 1.0000 |
| P(next ≥ 2x | previous 5 all < 2x) vs otherwise | 49.7% (n 1853) vs 48.7%, z = 0.83 | 0.98 pp | 0.4080 | 1.0000 |
| P(next ≥ 2x | previous 3 all ≥ 2x) vs otherwise | 49.5% (n 6188) vs 48.7%, z = 1.32 | 0.89 pp | 0.1869 | 1.0000 |
| Tier distribution homogeneity across 10 consecutive blocks | χ² = 40.32, dof 36 | Cramér's V = 0.0138 | 0.2851 | 1.0000 |
| Kolmogorov–Smirnov, first half vs second half | D = 0.0068 | D = 0.0068 | 0.5654 | 1.0000 |

## 6. Feature set

31 features, frozen since v0.2.0-audited: `lag_log_1`, `lag_log_2`, `lag_log_3`, `lag_log_4`, `lag_log_5`, `lag_log_6`, `lag_log_7`, `lag_log_8`, `lag_log_9`, `lag_log_10`, `mean_log_3`, `median_log_3`, `std_log_3`, `mean_log_5`, `median_log_5`, `std_log_5`, `mean_log_10`, `median_log_10`, `std_log_10`, `mean_log_20`, `median_log_20`, `std_log_20`, `n_below_1_2_10`, `n_at_least_2_10`, `n_at_least_5_10`, `n_below_1_2_20`, `n_at_least_2_20`, `n_at_least_5_20`, `volatility_ratio_5_20`, `max_log_20`, `streak_2x`.

## 7. Models

Candidates: logistic_regression, random_forest, gradient_boosting (fixed hyperparameters, `ml/aviator_ml/models/registry.py`). One model per target chosen on the validation window only. Chosen: ≥2x → logistic_regression, ≥3x → random_forest, ≥5x → gradient_boosting, ≥10x → gradient_boosting, ≥1.5x → gradient_boosting.

## 8. Baseline

Training-window base rate for each target — the same information the model had. It predicts the majority class at the 50% threshold.

## 9–11. Training, validation and final test periods

| Period | From | To | Rounds |
|---|---|---|---|
| training | 2026-06-01T00:06:24.000Z | 2026-06-07T21:43:15.000Z | 32,186 |
| final test | 2026-06-09T09:14:02.000Z | 2026-06-10T20:41:40.000Z | 6,897 |
| validation | 2026-06-07T21:43:34.000Z | 2026-06-09T09:13:37.000Z | 6,897 |

## 12. Test metrics

| Target | Model | n | Base rate | Accuracy / baseline | ROC-AUC [95% CI] | Brier / baseline | Precision | Recall | F1 | ECE | Brier p → Holm | AUC p → Holm | Result |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ≥1.5x | gradient_boosting | 6,897 | 65.2% | 65.2% / 65.2% | 0.497 [0.483, 0.511] | 0.2269 / 0.2269 | 65.2% | 100.0% | 0.789 | 0.16% | 0.4998 → 1.0000 | 0.6578 → 1.0000 | no edge |
| ≥2x | logistic_regression | 6,897 | 49.1% | 50.1% / 50.9% | 0.504 [0.491, 0.518] | 0.2501 / 0.2499 | 47.9% | 19.3% | 0.275 | 1.46% | 0.8615 → 1.0000 | 0.2672 → 1.0000 | no edge |
| ≥3x | random_forest | 6,897 | 33.1% | 66.9% / 66.9% | 0.491 [0.477, 0.506] | 0.2216 / 0.2215 | — | 0.0% | 0.000 | 0.69% | 0.9669 → 1.0000 | 0.8862 → 1.0000 | no edge |
| ≥5x | gradient_boosting | 6,897 | 20.0% | 80.0% / 80.0% | 0.485 [0.468, 0.502] | 0.1604 / 0.1603 | — | 0.0% | 0.000 | 1.20% | 0.9853 → 1.0000 | 0.9547 → 1.0000 | no edge |
| ≥10x | gradient_boosting | 6,897 | 9.9% | 90.1% / 90.1% | 0.501 [0.479, 0.524] | 0.0896 / 0.0896 | — | 0.0% | 0.000 | 0.49% | 0.7419 → 1.0000 | 0.4513 → 1.0000 | no edge |

Calibration (mean predicted → observed rate, rounds per bin):

- ≥1.5x: 65%→65% (6892), 71%→80% (5)
- ≥2x: 48%→49% (5533), 51%→48% (1364)
- ≥3x: 27%→32% (56), 32%→33% (6841)
- ≥5x: 19%→20% (6735), 20%→13% (162)
- ≥10x: 9%→10% (6570), 10%→12% (327)

## 13. Multiple-testing correction

Holm–Bonferroni across the five targets (family-wise α = 0.05), applied separately to the paired Brier-improvement test and the ROC-AUC > 0.5 test. A target counts as an edge only if **both** adjusted p-values are below 0.05 *and* Brier skill is positive (an intersection–union test). Three candidate models per target are compared only on the validation window; exactly one pre-selected model per target is evaluated on each test window, so model choice adds no test-set comparisons. In the confirmation window, the family is restricted to the targets that passed stage 1.

## 14. First test-window result

Classification **NO_RELIABLE_EDGE**. Window 2026-06-09T09:14:02.000Z → 2026-06-10T20:41:40.000Z, 6,897 rounds, fingerprint `488bad22b2d6bcc9`, data sha256 `2b0af10d0f5ef28d…`, evaluated once at 2026-10-04T13:07:22.762Z.

## 15. Second confirmation-window result

Classification **NO_RELIABLE_EDGE**. Window 2026-06-11T02:42:08.000Z → 2026-06-12T14:53:04.000Z, 7,000 rounds collected after the final test window, fingerprint `c4b602764a634f79`.

| Target | Model | n | Base rate | Accuracy / baseline | ROC-AUC [95% CI] | Brier / baseline | Precision | Recall | F1 | ECE | Brier p → Holm | AUC p → Holm | Result |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ≥1.5x | gradient_boosting | 7,000 | 64.5% | 64.5% / 64.5% | 0.507 [0.493, 0.521] | 0.2288 / 0.2289 | 64.5% | 100.0% | 0.784 | 0.47% | 0.1382 → 0.6908 | 0.1600 → 0.7999 | no edge |
| ≥2x | logistic_regression | 7,000 | 48.2% | 51.4% / 51.8% | 0.507 [0.493, 0.520] | 0.2497 / 0.2497 | 48.9% | 18.0% | 0.263 | 0.63% | 0.4236 → 1.0000 | 0.1674 → 0.7999 | no edge |
| ≥3x | random_forest | 7,000 | 32.1% | 67.9% / 67.9% | 0.499 [0.484, 0.513] | 0.2180 / 0.2178 | — | 0.0% | 0.000 | 0.47% | 0.9269 → 1.0000 | 0.5747 → 1.0000 | no edge |
| ≥5x | gradient_boosting | 7,000 | 19.5% | 80.5% / 80.5% | 0.491 [0.474, 0.508] | 0.1573 / 0.1572 | — | 0.0% | 0.000 | 0.37% | 0.5618 → 1.0000 | 0.8557 → 1.0000 | no edge |
| ≥10x | gradient_boosting | 7,000 | 9.7% | 90.3% / 90.3% | 0.505 [0.483, 0.528] | 0.0877 / 0.0877 | — | 0.0% | 0.000 | 0.32% | 0.4020 → 1.0000 | 0.3214 → 0.9643 | no edge |

Calibration (mean predicted → observed rate, rounds per bin):

- ≥1.5x: 59%→100% (1), 65%→65% (6986), 71%→69% (13)
- ≥2x: 48%→48% (5757), 51%→49% (1243)
- ≥3x: 28%→39% (46), 32%→32% (6954)
- ≥5x: 19%→20% (6840), 21%→19% (160)
- ≥10x: 9%→10% (6625), 10%→9% (375)

## 16. Evidence for / against predictive signal

- Sequential dependence in the data: not detected (see §5).
- Out-of-sample, frozen-model evidence: NO_RELIABLE_EDGE, confirmation NO_RELIABLE_EDGE.
- Conclusion: **NO RELIABLE PREDICTIVE EDGE DETECTED.**

## 17. Limitations

- Results apply only to this dataset and period; game parameters or data collection may change.
- Missing rounds (time gaps, §4) make lag features span non-adjacent rounds.
- Statistical predictability is not profitability: payouts, house edge and risk are not modelled, and nothing here is betting advice.
- A significant dependence test with a tiny effect size can be practically meaningless.
- Only the baseline model family was tested; no conclusion is drawn about other model classes (by design — complex models are not justified unless this baseline shows signal).

## 18. Exact reproducibility instructions

```bash
git checkout 2a1807d3c240234479c89b5e6452ada569d1bed3
pip install -r ml/requirements.lock.txt && npm ci
python3 scripts/freeze/manifest.py verify v0.2.0-audited      # methodology unchanged
(cd ml && python -m pytest -q tests/test_protocol.py)          # protocol hash still frozen
# restore the same rows (verify rows_sha256 per batch in §1), then via the app: Validation → evaluate.
# Protocol real-data-v1, sha256 8be1f69c1b346fd211089e97b5493aae02cc7fc73be5db5bd6059a7c7caa6ece
```

Data sha256 of the stage-1 snapshot: `2b0af10d0f5ef28d38ceba4fef69cbbf419f9e350abeecc167aaf6954f6a74a2`. Each window can only be evaluated once per protocol hash; re-running requires a new protocol version and new, untouched data.
