# v0.2.0-audited — frozen audited version

| | |
|---|---|
| Tag | `v0.2.0-audited` |
| Commit | `f137a1503bd92c53240c222cd4dfbd97158fa56c` |
| Database schema version | `20261004100000` (migrations `20261004000000_init.sql`, `20261004100000_prediction_audit.sql`) |
| Audit model version | `v20261004102644-58a656` (DEMO DATA, synthetic; artifacts not committed — deterministic retrain reproduces it) |
| Features | 31 (see `manifest.json → features`) |
| Evaluation code | sha256 per file in `manifest.json → components` |
| Python environment | `ml/requirements.lock.txt` |

Audit result (synthetic data only): **NO RELIABLE EDGE** — see `docs/AUDIT_REPORT.md`.

## Reproduce the audit exactly

```bash
git checkout v0.2.0-audited
pip install -r ml/requirements.lock.txt     # lock file added after the tag; same versions
scripts/local-supabase.sh start              # (added in the audit commit)
# load demo data + train via the app, then:
node --conditions=react-server --import tsx scripts/audit/backtest-report.mts demo
```

## Check that a later checkout still uses the frozen methodology

```bash
python3 scripts/freeze/manifest.py verify v0.2.0-audited
```

Exit code 1 means feature engineering, model architecture, training protocol or evaluation
code changed — results would no longer be comparable.
