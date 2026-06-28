# syntax=docker/dockerfile:1.7

FROM python:3.11-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PORT=8080 \
    PYTHONPATH=/app

WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --upgrade pip \
 && pip install -r requirements.txt

# Project source — kept as siblings so the worker (running `python -m arq
# backend.queue.worker_settings.WorkerSettings`) and the web process
# (running `uvicorn backend.main:app`) can both import from a single
# WORKDIR=/app.
COPY agents/ ./agents/
COPY orchestration/ ./orchestration/
COPY utils/ ./utils/
COPY backend/ ./backend/

EXPOSE 8080

# Healthcheck only meaningful for the web process; Fly's process-group
# config below scopes /api/health to processes=["web"].
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${PORT}/api/health" || exit 1

# Default CMD runs the web (FastAPI) process. The Fly [processes] block
# overrides per-process so the worker uses `arq ...` instead.
CMD ["sh", "-c", "uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8080}"]
