# Real-Data Validation Protocol (`real-data-v1`)

This is the pre-registered experiment that decides whether any predictive signal exists in
**legitimately obtained real** Aviator round history. It is designed so the answer cannot be
tuned toward a desired result.

> The purpose of the protocol is to **test** for signal, not to find one. If the model does not
> demonstrate a robust out-of-sample advantage, the report concludes
> **"NO RELIABLE PREDICTIVE EDGE DETECTED."**

## 0. Frozen baseline (Phase 1)

| | |
|---|---|
| Audited version | tag `v0.2.0-audited` → commit `f137a1503bd92c53240c222cd4dfbd97158fa56c` |
| Manifest | `release/v0.2.0-audited/manifest.json` (component hashes, 31 features, schema `20261004100000`) |
| Verify | `python3 scripts/freeze/manifest.py verify v0.2.0-audited` (exit 1 if the methodology changed) |
| Protocol freeze | `ml/aviator_ml/protocol/FROZEN_PROTOCOL.json` (sha256 over every file that defines the experiment) |
| Enforced in CI | `ml/tests/test_protocol.py::test_protocol_is_frozen_and_code_unchanged` fails if frozen code changes |

The protocol only *composes* the audited functions — `select_models`, `walk_forward`,
`evaluate_threshold` — and changes no feature, model, hyperparameter, target, baseline or metric.

To publish the tag (the session could not push tags):

```bash
git tag -a v0.2.0-audited f137a1503bd92c53240c222cd4dfbd97158fa56c -m "Audited synthetic-data version"
git push origin v0.2.0-audited
gh release create v0.2.0-audited --notes-file release/v0.2.0-audited/README.md
```

## 1. Data provenance (Phases 2, 10)

Every round carries a `dataset` label — **REAL DATA**, **DEMO DATA** or **TEST DATA** — that is
shown on every page. The three are never mixed.

| Rule | Enforced by |
|---|---|
| Real data must be attested as genuine observations obtained through a permitted mechanism | UI checkbox, API schema, service, DB `CHECK` on `import_batches` |
| Synthetic data can never be REAL | `collection_method = 'synthetic'` is rejected for real (service + DB). Files with DEMO/TEST/synthetic banners, demo-like file names or `dataset=demo/test` columns are refused as real. |
| Every import is a batch | `import_batches`: source, method, provenance notes, attestation, file and content sha256, row counts, first/last round, collection period, quality report |
| Strict validation | ISO-8601 with seconds and timezone (normalised to UTC). Multiplier ≥ 1.00 with ≤ 2 decimals and ≤ 1,000,000. No future or pre-2018 timestamps. Real calendar dates (`2026-02-30` is rejected). Malformed and missing values are rejected with line numbers. Exact duplicates are skipped. **Conflicting** duplicates (same instant, different multiplier) are dropped entirely. Input is sorted chronologically. |
| Missing data | Time-gap analysis: gaps > max(3 × median interval, 60 s), with an estimated number of missing rounds; intervals < 2 s are flagged as implausible |
| Dirty files | Blocked unless the user explicitly accepts importing only the valid rows. Synthetic markers can never be overridden for real data. |

## 2. Data quality and independence (Phases 3, 4)

The **Data Quality** page and every batch's `quality_report` include:
- totals, unique rounds, duplicates, rejected rows, gaps;
- distribution, threshold frequencies, min/max/mean/median/std;
- sequential-dependence diagnostics.

Multipliers are heavy-tailed and discrete, so **no test assumes normality**:

| Family | Test |
|---|---|
| Autocorrelation | Ljung–Box (lags 1–20) on **rank** autocorrelation (identical for m and ln m), and on the ≥2x indicator |
| Runs | Wald–Wolfowitz runs test for each threshold indicator |
| Lag dependence | Pearson χ² on lag-1 transitions between 5 tiers, with Cramér's V |
| Conditional frequencies | P(next ≥ 2x \| condition) vs its complement, for 6 conditions (two-proportion z) |
| Stability | χ² homogeneity of tiers across 10 consecutive blocks, and a two-sample KS test of the first half vs the second half |

All p-values form one family and are **Holm–Bonferroni** adjusted. The two questions are kept
apart:

- **Evidence of dependence** means a diagnostic rejects independence after correction. It is
  reported together with an effect size, because tiny effects become significant at large n.
- **Evidence that dependence is exploitable** can come *only* from the frozen out-of-sample
  protocol below. The diagnostics never claim it.

## 3. Requirements (Phase 5)

For REAL data these **cannot be overridden**; overrides are allowed only for TEST data dry runs.

| Requirement | Value |
|---|---|
| Rounds before the final test can run | ≥ 45,000 |
| Final test window (latest rounds) | ≥ 6,500 (max of 6,500 and 15% of usable rounds) |
| Training rounds after reserving test + validation | ≥ 20,000 |
| Confirmation window (rounds collected **after** the final test window) | ≥ 6,500 |
| Significance level | α = 0.05, family-wise |

## 4. Stage 1 — final test (Phase 6)

1. **Window.** The window is the latest ≥ 6,500 rounds. It is fingerprinted and **registered in
   `validation_runs` before evaluation**, together with the protocol hash and the data sha256.
2. **Development data** is everything earlier: train (≥ 20,000), then validation (15%).
3. **Model selection.** Three candidates per target are compared on validation only. The final
   window is not passed to `select_models` at all.
4. **Online walk-forward over the final window.** For each round: train on revealed rounds →
   compute features → predict → record → reveal → advance. Every prediction stores its feature
   snapshot and training-window end, so it is auditable at `/predictions/:id`.
5. **Metrics per target:** accuracy (Wilson CI), baseline accuracy, ROC-AUC (Hanley–McNeil CI),
   Brier and baseline Brier, precision, recall, F1, calibration bins and ECE, and sample size.
6. **Once only.** The DB constraint `unique (dataset, protocol_sha256, stage, window_fingerprint)`
   makes a second evaluation of the same window impossible. A *failed* run produced no metrics,
   so it may be retried.

## 5. Multiple testing (Phase 7)

- **Targets.** Five hypotheses per evidence type. Holm–Bonferroni step-down controls the
  family-wise error rate at 0.05.
- **Evidence types.** Holm is applied separately to:
  - the one-sided paired Brier-improvement test;
  - the one-sided ROC-AUC > 0.5 test (Hanley–McNeil SE under H0).

  A target counts as an edge only if **both** adjusted p-values are < 0.05 *and* Brier skill is
  positive. This is an intersection–union test, so the conjunction needs no further correction.
- **Models.** Model choice happens on validation; exactly one pre-selected model per target is
  evaluated on each test window. Model multiplicity therefore adds no test-set comparisons.
- **Confirmation.** The family is only the targets that passed stage 1.
- **No metric-shopping.** Accuracy, precision, recall and F1 are reported but never used to
  declare success.

## 6. Stage 2 — confirmation window (Phase 8)

The confirmation stage is allowed only after stage 1 completes, and only on rounds strictly
**later** than the stage-1 data. Those rounds did not exist during development.

It uses the same frozen features, the same model chosen per target in stage 1, the same
hyperparameters and the same refit cadence. It is refused if the protocol hash has changed since
stage 1. A promising stage-1 result is **never** reported as robust until it survives this stage.

## 7. Classification (Phase 9)

These criteria are coded in `ml/aviator_ml/protocol/protocol.py → CLASSIFICATION_CRITERIA` and
rendered verbatim in the app and the report.

| Class | Criterion |
|---|---|
| **NO RELIABLE EDGE** | No target passes the Holm-corrected tests and none shows even nominal improvement; or a stage-1 result failed to replicate. |
| **WEAK SIGNAL** | No corrected pass, but some target has positive skill, AUC > 0.5 and uncorrected p < 0.05. Expected by chance; **not evidence**. |
| **PROMISING SIGNAL** | At least one target passes both Holm-corrected tests on the final window. **Unconfirmed.** |
| **STRONGER SIGNAL** | A target that passed stage 1 also passes both Holm-corrected tests on the later confirmation window. |

Conclusion text:
- **STRONGER SIGNAL** → "signal detected and confirmed … not of profitability, not a guarantee";
- **everything else** → **"NO RELIABLE PREDICTIVE EDGE DETECTED."**

Language such as "guaranteed prediction", "next multiplier", "winning signal", "safe bet" or
"guaranteed profit" is banned. A test (`lib/__tests__/language.test.ts`) scans all user-facing
code for it.

## 8. Report (Phase 11)

```bash
node --conditions=react-server --import tsx scripts/reports/validation-report.mts real docs/REAL_DATA_VALIDATION_REPORT.md
```

The report has 18 sections, all read from stored data:

1. data source
2. number of rounds
3. collection period
4. data quality
5. independence tests
6. feature set
7. models
8. baseline
9. training period
10. validation period
11. final test period
12. test metrics
13. multiple-testing correction
14. first test-window result
15. second confirmation-window result
16. evidence for/against predictive signal
17. limitations
18. reproducibility

## 9. Running it on real data — checklist

1. Obtain history only through an authorised or permitted mechanism, such as your own account's
   history export or an official results feed. Never use private APIs, hidden endpoints, tokens or
   WebSockets.
2. **Data → Strict CSV import**, as REAL DATA: fill in the provenance, attest, and fix any
   rejected rows.
3. **Data Quality**: investigate gaps, conflicts and instability *before* testing.
4. Confirm at least 45,000 rounds, then **Validation → Evaluate final test (once)**.
5. Keep collecting. Once at least 6,500 newer rounds exist, run **Evaluate confirmation (once)**.
6. Generate the report. Do not change the model after seeing results. Any change requires a new
   protocol version *and* new, untouched data.
7. Do not move to more complex models (LSTM, Transformer) unless this baseline reaches STRONGER
   SIGNAL.
