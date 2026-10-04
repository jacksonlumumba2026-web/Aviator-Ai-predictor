FROM python:3.11-slim
WORKDIR /srv
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 ML_ARTIFACT_DIR=/srv/artifacts
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY aviator_ml ./aviator_ml
RUN useradd -m app && mkdir -p /srv/artifacts && chown app /srv/artifacts
USER app
EXPOSE 8000
CMD ["sh", "-c", "uvicorn aviator_ml.api.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
