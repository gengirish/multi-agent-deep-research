@echo off
REM Starts the FastAPI backend for local development.
REM backend\main.py exposes the ASGI app but has no __main__ block, so it must
REM be launched through uvicorn - running the file directly does nothing.

if "%VIRTUAL_ENV%"=="" (
  echo Warning: no virtualenv active. Run "venv\Scripts\activate" first.
  echo.
)

if "%PORT%"=="" set PORT=8000
uvicorn backend.main:app --reload --host 0.0.0.0 --port %PORT%

pause
