#!/bin/bash
# Starts the FastAPI backend for local development.
# `backend/main.py` exposes the ASGI app but has no __main__ block, so it must
# be launched through uvicorn — running the file directly does nothing.

set -e

if [ -z "$VIRTUAL_ENV" ]; then
  echo "Warning: no virtualenv active. Run 'source venv/bin/activate' first."
  echo ""
fi

exec uvicorn backend.main:app --reload --host 0.0.0.0 --port "${PORT:-8000}"
