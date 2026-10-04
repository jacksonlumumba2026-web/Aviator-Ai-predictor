# Aviator AI Lab

An experimental statistics and machine-learning lab that **tests whether historical
crash-game multipliers contain any measurable predictive signal** — and reports the
answer honestly.

> **Experimental statistical analysis. Results are uncertain and do not guarantee
> future outcomes or profits.**

The lab does not assume that past rounds predict future ones. Its central question is:

> *Does this model perform better than a reasonable baseline on unseen historical data?*

If it doesn't, the UI says so, in plain words: **"No statistically meaningful predictive
edge detected."** On the bundled demo data (independent random draws, so there is no
signal by construction), that is exactly what it reports.

### What it won't do

- Claim to know, guarantee or reveal the next multiplier. Every output is a probability
  labelled *"Experimental statistical estimate — not a guaranteed prediction."*
- Scrape, reverse-engineer or connect to private Betika / Spribe APIs, WebSockets,
  authentication systems or hidden endpoints, or get around any of their controls.
- Use gambler's-fallacy logic ("five low rounds, so a high round is due"). Streaks are
  shown only as descriptive facts. The Dashboard's statistics give you the data to check
  that claim for yourself.
- Present synthetic data as real. Demo rows have `is_demo = true`, carry the label
  **DEMO DATA — NOT REAL GAME RESULTS**, and are never mixed with real data.

---

## Real-data validation (start here for real data)

| Step | Where | Doc |
|---|---|---|
| Frozen audited version | tag `v0.2.0-audited` (`f137a15`) | `release/v0.2.0-audited/` |
| Import attested real history (provenance, checksums, strict validation) | **Data** | [VALIDATION_PROTOCOL.md §1](docs/VALIDATION_PROTOCOL.md) |
| Data quality + independence diagnostics (Holm-corrected) | **Data Quality** | §2 |
| Frozen protocol: ≥45k rounds, untouched ≥6.5k final test, later ≥6.5k confirmation, Holm | **Validation** | §3–§7 |
| Final scientific report | `docs/REAL_DATA_VALIDATION_REPORT.md` | §8 |

Every page shows a provenance label (**REAL DATA**, **DEMO DATA** or **TEST DATA**), and the three
datasets are never mixed. A full-scale protocol dry run on synthetic **TEST DATA** is in
[`docs/examples/TEST_DATA_PROTOCOL_DRY_RUN.md`](docs/examples/TEST_DATA_PROTOCOL_DRY_RUN.md); it
says nothing about real games.

## Architecture

```
┌──────────────────────── Next.js 16 (Vercel) ────────────────────────┐
│ app/(lab)/*        Server-rendered pages (Dashboard, Live, …)        │
│ app/api/*          Route handlers: validation · auth · rate limits   │
│ services/*         Ingestion, training, prediction, repository       │
│ lib/*              Pure TS: CSV parser, stats engine, evaluation     │
└───────────┬───────────────────────────────┬─────────────────────────┘
            │ service-role key (server only)│ bearer ML_SERVICE_TOKEN
            ▼                               ▼
   Supabase / PostgreSQL            Python FastAPI ML service (ml/)
   RLS: anon = SELECT only          features · models · walk-forward
   Realtime → browser (anon key)    backtest · significance tests
```

Live data pipeline (once an **authorised** source is available):

```
Authorised source → POST /api/ingest → validation → Supabase → score pending estimates
  → features → ML /predict → predictions table → Supabase Realtime → Live page
```

The browser never talks to third-party APIs or to the ML service. It only reads from
Supabase Realtime with the anon key, and RLS allows only `SELECT`.

### Project structure

```
app/
  (lab)/dashboard  live  predictions  backtest  data  quality  validation  models  settings
  api/             rounds, rounds/import, rounds/export, demo, models/train,
                   predictions/next, ingest, auth/*, settings/dataset, data-sources
components/        ui/ (design system) · layout/ · charts/ · lab/
lib/               csv.ts · stats.ts · evaluation.ts · auth.ts · http.ts · schemas.ts …
services/          repository/ (supabase + local) · ingestion · training · prediction · ml-client
types/             shared TypeScript types
supabase/          migrations/ (schema, indexes, RLS, realtime)
ml/aviator_ml/     features/ · models/ · training/ · evaluation/ · protocol/ (frozen validation) · api/
data/demo/         DEMO_DATA_NOT_REAL_rounds.csv (synthetic)
scripts/           generate-demo-data.ts
```

---

## Quick start (local)

Requirements: Node 20.9+, Python 3.11+.

```bash
# 1. Frontend
npm install
cp .env.example .env.local        # fill in what you have; blanks are fine for dev

# 2. ML service (separate terminal)
cd ml
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn aviator_ml.api.main:app --port 8000

# 3. Run
npm run dev                        # http://localhost:3000
```

If Supabase isn't configured, the app uses a **local JSON dev store** in `./.data/`, so
you can try everything offline. The sidebar shows "Local dev store" while it's in use.
Don't use it in production.

In development with `ADMIN_PASSWORD` unset, write actions are open. In production,
writes are **refused** until `ADMIN_PASSWORD` is set.

Try it: **Data → Load demo data → Models → Train & backtest → Backtest**.

---

## Supabase setup

1. Create a project and run `supabase/migrations/20261004000000_init.sql` (SQL editor,
   or `supabase db push`).
2. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and
   `SUPABASE_SERVICE_ROLE_KEY` (server only, **never** with a `NEXT_PUBLIC_` prefix).

Tables:

| Table            | Purpose |
|------------------|---------|
| `aviator_rounds` | `id, multiplier (≥1), round_time, source, is_demo, created_at`. Unique `(is_demo, round_time)` for duplicate detection; indexed by dataset and time. |
| `predictions`    | The required probability, confidence, class, actual and result columns, plus `kind` (`backtest`/`live`), `model_run_id`, `based_on_round_time` and `baseline` (base-rate probabilities, so metrics can be recomputed from rows). |
| `model_runs`     | Required metrics for the primary ≥2x target, plus `verdict`, `confidence` and the full `report` JSON (all thresholds, model selection, splits). |
| `data_sources`   | `source_name, source_type (manual/csv/api/live_feed/demo), enabled, last_update, notes`. |

RLS is on for every table. Only `SELECT` is granted to `anon`/`authenticated` (for
Realtime), and `data_sources` isn't publicly readable. All writes go through the Next.js
server using the service-role key. To make the lab fully private, change the policies to
`authenticated` and add Supabase Auth.

---

## Data ingestion

All paths go through `services/ingestion.ts`:

| Path | How |
|---|---|
| **CSV import** | Data page, or `POST /api/rounds/import`. Columns `multiplier,round_time` (extra columns and `#` comment lines are ignored). |
| **Manual entry** | Data page, or `POST /api/rounds`. |
| **Authorised source** | `POST /api/ingest` with `Authorization: Bearer $INGEST_API_KEY`. The source must be registered and enabled in Settings. |
| **Demo** | Data page → *Load demo data*. Goes into the separate demo dataset. |

Validation (in the browser for preview, and again on the server): multiplier must be a
number ≥ 1.00 (an `x` suffix is allowed), timestamps must be ISO-8601 (no timezone means
UTC, with a warning), and rows in the future are rejected. Malformed rows are rejected
with line numbers. Duplicates are detected both within the file and against stored rows.
Rows are sorted chronologically.

---

## Statistics engine (`lib/stats.ts`)

Total, mean, median, min/max, standard deviation; share below 1.2x / 1.5x / 2x; share
reaching 1.5x / 2x / 3x / 5x / 10x (95% Wilson intervals); rolling mean, median and
volatility; streaks; histogram.

The engine also includes two independence checks and a conditional-rate table:

- Lag-1 autocorrelation and a Wald–Wolfowitz runs test.
- **P(next ≥ 2x | k previous rounds below 2x)** for k = 0…5. If rounds are independent,
  every row overlaps the unconditional rate.

These describe the data. They aren't used to predict anything.

---

## Machine learning (`ml/`)

**Targets.** Five binary classifiers: will the next round reach ≥1.5x, ≥2x, ≥3x, ≥5x,
≥10x?

**Features** (`features/engineering.py`) use only rounds that finished **before** the
predicted round. Everything is derived from the series shifted by one position: log lags
1–10; rolling mean, median and std of log multipliers over 3/5/10/20 rounds; counts below
1.2x, ≥2x and ≥5x over the last 10 and 20 rounds; volatility ratio; rolling max; signed
streak. A unit test changes round *t* and every later round, then checks that the
features for rows ≤ *t* don't move.

**Models** (`models/registry.py`): Logistic Regression, Random Forest, Gradient Boosting
(XGBoost too, if installed). All are regularised. LSTM/Transformer models are left out on
purpose until a baseline shows real out-of-sample value.

**Protocol** (`training/experiment.py`):

1. Drop the first 20 rounds (they only supply feature history).
2. Split **chronologically, never shuffled**: 70% train · 15% validation · 15% test.
3. For each target, choose the candidate with the lowest validation Brier score.
4. **Walk-forward backtest** (`evaluation/backtest.py`): an online simulation of the test
   window. For each round it trains on revealed rounds, computes features from revealed
   history, predicts, records, and only then reveals the outcome and advances. Outcomes
   come from an iterator, so the simulator cannot see a round before predicting it. Refits
   happen every N rounds on an expanding window (`refit_every=1` is supported). The
   baseline is the base rate over the same past window.
5. Make probabilities monotone, so P(≥3x) ≤ P(≥2x).
6. Fit final models on all data for live estimates.

**Evaluation** (`evaluation/metrics.py`, mirrored exactly in `lib/evaluation.ts`):
accuracy (Wilson CI), precision, recall, F1, ROC-AUC (Hanley–McNeil CI), Brier score,
Brier skill score, calibration bins and ECE, confusion matrix, and a McNemar test against
the baseline.

**Verdict.** An edge is claimed for a target only if **all** of these hold:

- ≥ 200 test rounds, with ≥ 10 of each class;
- the paired per-round Brier improvement over the baseline is significant (one-sided
  z-test, α = 0.05 / 5, Bonferroni);
- the lower bound of the ROC-AUC 95% CI is above 0.5.

Accuracy above 50% is never treated as success on its own.

**Confidence** (`LOW` / `MEDIUM` / `HIGH`) comes only from that backtest evidence. It is
`LOW` whenever no edge was found.

The **Backtest** page recomputes every metric in TypeScript from the stored prediction
rows. A shared test fixture keeps the Python and TS results identical.

### ML API

| Method | Path | Body |
|---|---|---|
| GET  | `/health` | — |
| POST | `/train` | `{ rounds: [{multiplier, round_time}], dataset: "real"\|"demo", refit_every? }` |
| POST | `/predict` | `{ model_version, multipliers: number[] (≥20, chronological) }` → probabilities + feature snapshot |
| POST | `/audit/replay` | `{ model_version, features }`: replays a stored snapshot |
| POST | `/audit/features` | `{ multipliers }`: recomputes next-round features |

Authentication is `Authorization: Bearer $ML_SERVICE_TOKEN` (enforced when the token is
set). Requests are rate-limited per client. Artifacts are saved as joblib files in
`ML_ARTIFACT_DIR`; mount a persistent volume in production.

---

## Security

- Secrets come only from environment variables. The service-role key, ML token, ingest
  key and admin password are read in `server-only` modules.
- Admin sessions use an HMAC-signed, HTTP-only, `SameSite=strict` cookie, and password
  checks are timing-safe. Write endpoints require an admin session.
- Every input is validated with Zod and body size limits. Errors come back as JSON
  without stack traces.
- Per-IP sliding-window rate limits apply to every endpoint. They are per instance, so
  add Vercel Firewall or Upstash for global limits.
- Security headers: `X-Frame-Options: DENY`, `nosniff`, a referrer policy and a
  permissions policy.
- No credential harvesting, no third-party calls from the browser, no unauthorised API
  access.

---

## Deployment

- **Frontend → Vercel.** Import the repo and set the env vars from `.env.example`.
  `/api/models/train` uses `maxDuration = 300`.
- **ML service → any container host** (Fly, Render, Railway, Cloud Run):
  `docker build -t aviator-ml ml/`. Set `ML_SERVICE_TOKEN` and `ML_ARTIFACT_DIR` on a
  persistent volume, then point `ML_SERVICE_URL` at it.

## Testing & audit

```bash
npm run lint && npm run typecheck && npm test && npm run build
cd ml && python -m pytest -q
scripts/local-supabase.sh start && npm run test:integration   # Postgres + PostgREST, local only
```

See **[docs/AUDIT_REPORT.md](docs/AUDIT_REPORT.md)** for the full audit: data-pipeline and
statistics verification against SQL, leakage guarantees, per-target model-vs-baseline
results, and the bugs it found.

**Prediction audit trail.** Every prediction stores its feature snapshot, input-history
end, training-window end and target round. Open any row on the Predictions page, or call
`GET /api/predictions/:id/audit`, to re-derive it from the database: features are
recomputed and compared, live estimates are replayed through the stored model artifact,
and outcomes are re-scored.

**Signal classification** (Dashboard → Model performance):

- **NO RELIABLE EDGE**: nothing beats the base rate.
- **WEAK SIGNAL**: nominal only. It fails multiple-comparison correction and is not
  evidence.
- **PROMISING SIGNAL**: at least one target passes the corrected test.
- **STRONGER SIGNAL**: at least two targets pass, each on ≥1,000 test rounds, with positive
  skill in both halves of the test period.

Whenever the result isn't PROMISING or STRONGER, the UI shows *"Testing has not
demonstrated a reliable predictive advantage."*

The Python suite covers: no feature leakage, chronological splits, walk-forward fitting
only on the past, **i.i.d. data → no edge**, **planted synthetic signal → edge
detected**, the API, auth, and validation. The TS suite covers the CSV parser, the stats
engine, and evaluation parity with Python. CI runs both (`.github/workflows/ci.yml`).

## Development stages

| Stage | Status |
|---|---|
| 1. Next.js frontend + Supabase schema | ✅ |
| 2. CSV / manual ingestion | ✅ |
| 3. Statistical analysis | ✅ |
| 4. Baseline ML models | ✅ |
| 5. Chronological backtesting | ✅ |
| 6. Prediction API | ✅ |
| 7. Dashboard | ✅ |
| 8. Live integration | ✅ Generic authorised `/api/ingest` + Realtime. **No live source is connected**, because no authorised public Aviator feed is known; the UI shows "Live feed not connected — using stored historical data." |
| 9. Tests, security, deployment config | ✅ |

---

Aviator AI Lab is a research tool. It isn't affiliated with Spribe or Betika, and it
isn't betting advice.
