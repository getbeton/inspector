#!/bin/bash
set -e

# Change to backend directory
cd backend

# Run database migrations (if alembic is set up)
if [ -f "alembic.ini" ]; then
  echo "Running alembic migrations..."
  python -m alembic upgrade head || echo "Migrations skipped (no database configured)"
fi

# Start the FastAPI backend
exec python -m uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
