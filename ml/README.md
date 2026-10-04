# Aviator AI Lab — ML service

FastAPI + scikit-learn. The full methodology is in the root `README.md`.

```bash
pip install -r requirements-dev.txt
uvicorn aviator_ml.api.main:app --port 8000   # dev
python -m pytest -q                            # tests
docker build -t aviator-ml .                   # deploy
```

Environment variables: `ML_SERVICE_TOKEN`, `ML_ARTIFACT_DIR`,
`ML_RATE_LIMIT_PER_MINUTE` (default 30), `ML_MAX_ROUNDS` (default 250000),
`ML_ALLOWED_ORIGINS`.
