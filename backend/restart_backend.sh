#!/usr/bin/env bash
# Kill any process on port 8000 and start the backend (so you pick up latest code).
cd "$(dirname "$0")"
echo "Stopping any process on port 8000..."
lsof -ti:8000 | xargs kill -9 2>/dev/null || true
sleep 1
echo "Starting backend..."
source .venv/bin/activate 2>/dev/null || true
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
