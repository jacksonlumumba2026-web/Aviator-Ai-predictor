# Aviator AI Lab — Audit & Technical Report

*Audit date: 2026-10-04 · model `v20261004102644-58a656` · test-window fingerprint `0a37d4a1ca8d6102`*

> **Headline: testing has not demonstrated a reliable predictive advantage.**
> Classification: **NO RELIABLE EDGE**. On 447 unseen future rounds the model's
> out-of-sample skill relative to the base rate was **slightly negative on all five
> targets**, and no ROC-AUC interval excluded 0.5.

> **Scope warning.** The only dataset available is the synthetic
> **DEMO DATA — NOT REAL GAME RESULTS** set: 3,000 independent draws from
> P(X ≥ m) ≈ 0.97/m. It contains no signal by construction. This audit shows that
> the *pipeline* is correct and honest. It says **nothing** about whether real Aviator
> rounds are predictable. No real data was imported, and no synthetic "successful"
> predictions were created.

## How the audit was run

The app ran against a **Supabase-equivalent stack**: Postgres 16 with the project's real
migrations, Supabase's roles and RLS, and PostgREST (the REST layer `supabase-js` uses)
behind a `/rest/v1` proxy. Reproduce it with `scripts/local-supabase.sh start`. Your hosted
Supabase projects belong to other apps and were not touched.

## 1. Data pipeline

| Check | How | Result |
|---|---|---|
| CSV import end-to-end | `tests/integration/supabase.int.test.ts` → app ingestion → PostgREST → Postgres | ✅ |
| Multiplier validation | < 1, non-numeric, > 1,000,000 and future timestamps rejected with line numbers. DB `CHECK (multiplier >= 1)` also enforced (`23514`). | ✅ |
| Chronological ordering | Out-of-order CSV sorted. 2,500-row import read back in exact order through paginated reads (> PostgREST's 1,000-row page). | ✅ |
| Duplicate detection | Within file (same instant in different formats), against the DB on re-import, mixed batches, and a DB `UNIQUE (is_demo, round_time)` constraint (`23505`). | ✅ |
| Storage & retrieval | Values, types, timestamps, filters, pagination, deletes, demo/real separation, model-run JSON, predictions with feature snapshots | ✅ 9/9 integration tests |
| RLS | anon cannot write (`42501`) and cannot read `data_sources` | ✅ |

## 2. Statistics engine

`scripts/audit/stats_audit.py` checks the app's engine (`lib/stats.ts`, reading through
`SupabaseRepository`) against **raw SQL in Postgres** and **numpy**. **39/39 checks agree**
to 1e-9.

| Statistic | App | SQL | numpy |
|---|---|---|---|
| Rounds | 3,000 | 3,000 | 3,000 |
| Mean | 12.0787 | 12.0787 | 12.0787 |
| Median | 1.885 | 1.885 | 1.885 |
| Std. dev. (n−1) | 223.36 | 223.36 | 223.36 |
| Min / max | 1.00 / 10,000.00 | same | same |
| < 1.2x / < 1.5x / < 2x | 572 / 1,091 / 1,588 | same | same |
| ≥ 1.5x / 2x / 3x / 5x / 10x | 1,909 / 1,412 / 932 / 556 / 277 | same | same |
| Histogram (10 bins) | 572, 519, 497, 480, 376, 279, 161, 67, 26, 23 | same | same |
| Rolling-50 mean / median / σ(log), rounds 951–1000 | 5.161 / 2.07 / 0.9412 | same | same |
| Longest streak < 2x / ≥ 2x / < 1.5x | 11 / 12 / 7 | 11 / 12 / — | 11 / 12 / 7 |

The mean and standard deviation are dominated by the heavy tail: one 10,000x round, which
is the demo generator's cap. Median and threshold frequencies are the more informative
summaries.

Independence checks on the same data: lag-1 autocorrelation of log(multiplier) is
**0.012** (95% band ±0.036). The runs test on ≥2x gives z = −0.73, **p = 0.47**.
P(≥2x | k prior rounds < 2x) for k = 0…5 is 47.1%, 46.4%, 47.3%, 48.8%, 50.7%, 51.3%.
Every interval overlaps the unconditional rate, so there is no "due" effect.

## 3. ML pipeline integrity (leakage)

| Guarantee | Enforced by |
|---|---|
| Features use only earlier rounds | Built from the series shifted by one. Test: changing round *t* and later leaves every feature row ≤ *t* unchanged. |
| Live, backtest and training use identical features | `next_round_features()` is the only feature path. Test: equal to the batch frame for every *t* (atol 1e-12). Streak capped at 50 so a 200-round look-back is exact. |
| Splits are chronological, never shuffled | Train ends 11:05:09, validation 11:05:26–13:27:18, test 13:27:39–15:51:35 |
| Model selection never sees the test period | `select_models()` receives only train+validation. A spy test asserts the length. |
| Test rounds are genuinely unseen | **Online simulator**: outcomes come from an iterator that is advanced only *after* the prediction is recorded. Test: poisoning round *t*'s outcome changes no prediction ≤ *t*. |
| Model trained only before its target | Runtime assert, and DB `CHECK (train_end_round_time < target_round_time)`. DB query: **0** violating rows out of 447. |
| Predictions come from the model, not hardcoded values | p(≥2x) varies (>10 distinct values). Live estimate replayed from its stored snapshot through the stored artifact: **Δp = 0**. A different history gives a different estimate. |

### Walk-forward procedure

For each test round: (1) train on revealed rounds → (2) compute features from revealed
history → (3) predict → (4) record (features, probabilities, base rates, training-window
end) → (5) reveal the outcome → (6) advance.

Refitting happens every 50 rounds on an expanding window (9 refits); `refit_every=1` is
supported and tested. A frozen model can only be *less* informed, never leaked.

### Prediction audit

Every prediction stores: timestamp, model version, **feature snapshot**, input-history end,
training-window end, target round, probabilities, baseline, confidence, actual multiplier
and outcome.

`GET /api/predictions/:id/audit` (and the page at `/predictions/:id`) re-derives each one
from the database:
- the input history ends where recorded;
- the target is the next stored round;
- features recomputed from the DB match the snapshot (Δ = 0);
- the model was trained before the target;
- for live estimates, the artifact replay matches;
- the outcome matches the stored round and the scoring rule.

**Tamper test:** altering a stored feature or outcome makes the audit fail.

## 4. Results — the report

1. **Rounds used:** 3,000 (synthetic demo). The first 20 provide feature history only.
2. **Training:** 2,086 rounds (70%).
3. **Validation:** 447 rounds (15%).
4. **Test:** 447 rounds (15%). These are the final, chronologically latest rounds.
5. **Features (31):**
   - log multiplier lags 1–10;
   - rolling mean, median and std of log multiplier over 3/5/10/20 rounds;
   - counts < 1.2x, ≥ 2x and ≥ 5x over the last 10 and 20 rounds;
   - σ5/σ20 volatility ratio;
   - max over the last 20;
   - signed ≥2x streak, capped at ±50.
6. **Models tested:** Logistic Regression, Random Forest, HistGradientBoosting. XGBoost is
   supported but wasn't installed. Selection was by validation Brier score; LSTM and
   Transformer models were deliberately not tried.
7. **Baseline:** the training-window base rate (the same information the model had). It
   predicts the majority class at the 50% threshold.
8. **Best model on validation.** No candidate beat the base rate on validation for **any**
   target (lower Brier is better):

   | Target | Base rate | LR | RF | GB | Selected |
   |---|---|---|---|---|---|
   | ≥1.5x | **0.23544** | 0.24349 | 0.24044 | 0.24862 | RF |
   | ≥2x | **0.24881** | 0.25242 | 0.25108 | 0.25773 | RF |
   | ≥3x | **0.21594** | 0.21781 | 0.21813 | 0.22126 | LR |
   | ≥5x | **0.16240** | 0.16613 | 0.16410 | 0.16852 | RF |
   | ≥10x | **0.09062** | 0.09266 | 0.09140 | 0.09242 | RF |

9. **Out-of-sample (447 walk-forward test rounds; Δ = model − baseline).** Recomputed from
   stored rows in TS; matches Python to 1.4e-8.

   | Target | Base rate | Acc. model / base (Δ) | Precision model / base | Recall model / base | F1 model / base | ROC-AUC [95% CI] (base 0.5) | Brier model / base | Skill | p | ECE model / base | Verdict |
   |---|---|---|---|---|---|---|---|---|---|---|---|
   | ≥1.5x | 63.5% | 63.5 / 63.5 (+0.0 pp) | 63.5% / 63.5% | 100 / 100% | 0.777 / 0.777 | 0.492 [0.436, 0.548] | 0.2324 / 0.2318 | −0.26% | 0.67 | 0.8% / 0.2% | no edge |
   | ≥2x | 48.1% | 51.7 / 51.9 (**−0.2 pp**) | 49.3% / — | 16.7 / 0% | 0.250 / 0.000 | 0.481 [0.428, 0.535] | 0.2517 / 0.2498 | −0.72% | 0.88 | 1.7% / 1.2% | no edge |
   | ≥3x | 29.5% | 70.5 / 70.5 (+0.0 pp) | — / — | 0 / 0% | 0 / 0 | 0.473 [0.415, 0.531] | 0.2129 / 0.2084 | −2.12% | 0.98 | 4.2% / 1.7% | no edge |
   | ≥5x | 15.9% | 84.1 / 84.1 (+0.0 pp) | — / — | 0 / 0% | 0 / 0 | 0.519 [0.445, 0.593] | 0.1349 / 0.1345 | −0.26% | 0.64 | 3.2% / 3.0% | no edge |
   | ≥10x | 8.7% | 91.3 / 91.3 (+0.0 pp) | — / — | 0 / 0% | 0 / 0 | 0.448 [0.356, 0.539] | 0.0803 / 0.0797 | −0.79% | 0.93 | 3.0% / 0.6% | no edge |

   - "—" means no positive calls were made, so precision is undefined.
   - McNemar p = 1.0 on every target.
   - Calibration for ≥2x: predictions sit between 0.39 and 0.52 against observed rates of
     0.48–0.67 (6 / 368 / 73 rounds per bin).
   - On ≥3x/5x/10x the model never assigns ≥50%, so accuracy equals the majority baseline.
     Brier score and AUC are the meaningful comparisons there, and both are slightly
     *worse* than the baseline.

10. **Evidence of predictive signal: none.**
    - The model's Brier score is worse than the base rate on all 5 targets.
    - No ROC-AUC interval excludes 0.5, and no p-value comes close to the
      Bonferroni α = 0.01.
    - Skill was negative in at least one half of the test period for every target.
    - Classification: **NO RELIABLE EDGE**, confidence **LOW**.
    - This is the expected result for i.i.d. data, so the pipeline is not manufacturing
      signal. Conversely, a planted dependency in synthetic data **is** detected
      (`test_planted_signal_is_detected`), so the pipeline isn't blind either.

11. **Potential data leakage.** None was found; the guarantees are in section 3. Residual
    caveats:
    - Missing rounds (gaps in imported history) are treated as consecutive.
    - The baseline is refreshed only at refits, so it lags at most 49 rounds, the same as
      the model.
    - Random Forest's parallel averaging is not bit-reproducible (differences ~1e-16).
    - **Repeated looks at the test window.** This demo test window has been evaluated 3
      times in total:
      - by the original engine;
      - after the walk-forward rework;
      - in a restore run after the integration suite wiped the local DB.

      Nothing about the model or features changed between runs, and the last two were
      bit-identical. The app now fingerprints test windows and warns when one is reused.
12. **Limitations.**
    - **Synthetic data only.**
    - **Low power.** With 447 test rounds the AUC CI is ±0.054 (≥2x) to ±0.092 (≥10x),
      so only large edges (AUC ≳ 0.55) would be detectable.
    - Crash games of this kind derive outcomes from server/client seeds. If that RNG is
      sound, no sequence model can beat the base rate. The strong prior is "no edge".
    - Five correlated targets are corrected conservatively with Bonferroni.
    - The in-memory rate limiter is per instance.
    - The local stack does not exercise hosted Supabase Realtime or Auth.
13. **Recommended next experiment (pre-registered).** Import ≥ 45,000 legitimately
    obtained real rounds, then:
    1. Run the independence tests first. They are cheap: if the runs test and
       autocorrelation show nothing, ML is unlikely to help.
    2. Freeze the code, features and hyperparameters. Record the commit and the
       test-window fingerprint.
    3. Evaluate **once** on a test window of ≥ 6,500 rounds. That gives 80% power to
       detect AUC 0.52, versus 1,047 rounds for 0.55.
    4. Collect a *second*, later window that is never touched during development, and use
       it only to confirm any PROMISING result.
    5. Only after that consider richer models, evaluated on newer untouched data.

## Bugs found and fixed during the audit

| # | Bug | Impact | Fix |
|---|---|---|---|
| 1 | Supabase returned `timestamptz` as `…+00:00`, but the app compared ISO `Z` strings | **On Supabase, live estimates could be scored against their own input round, and duplicate estimates could be created.** Not visible on the local dev store. | Normalise every timestamp in `toPrediction`. A regression test fails without the fix and passes with it. |
| 2 | Baseline ROC-AUC computed from the drifting base rate (0.43–0.47) | Made the model look "+0.06 AUC better" | Baseline AUC = 0.5 by definition |
| 3 | Precision reported as 0% when no positive calls were made | Fake "+49 pp precision" gain shown in green | Precision undefined (—); precision/recall/F1 deltas shown neutrally |
| 4 | Realtime subscription failure left the Live page neither subscribed nor polling | Stale Live page | Fall back to polling on error, timeout or close |
| 5 | Random Forest used a thread pool for every single-row predict | 350 ms per round; walk-forward impractically slow | Predict single-threaded after a parallel fit (≈4× faster) |
| 6 | Destructive integration tests had no target guard | Could wipe a real Supabase project if misconfigured | Refuse unless the host is localhost and `AAL_INTEGRATION_DB=disposable` |
| 7 | Old walk-forward predicted in index-sliced blocks | Correct, but leak-freedom relied on index arithmetic | Online predict → record → reveal → advance simulator with feature snapshots |

## Reproduce

```bash
scripts/local-supabase.sh start            # Postgres + PostgREST (Supabase-equivalent)
npm run test:integration                   # 9 data-pipeline tests (wipes the LOCAL stack only)
cd ml && python -m pytest -q               # 32 ML tests incl. leakage + planted-signal
# with the app running against the stack and data loaded:
node --conditions=react-server --import tsx scripts/audit/stats-ts.mts demo > /tmp/s.json
python3 scripts/audit/stats_audit.py /tmp/s.json demo      # 39 statistics checks
node --conditions=react-server --import tsx scripts/audit/backtest-report.mts demo
```
