FROM python:3.12-slim

WORKDIR /app

# System deps: curl for healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python deps (layer-cached on pyproject changes)
COPY pyproject.toml ./
COPY src ./src
RUN pip install --no-cache-dir .

COPY alembic.ini ./
COPY frontend ./frontend

EXPOSE 3137

# Apply migrations then serve. (single worker; scale via replicas — see appendix D)
CMD ["sh", "-c", "alembic upgrade head && uvicorn src.api.app:app --host 0.0.0.0 --port 3137"]
