#!/bin/bash
set -e

# Run database migrations (if alembic is set up)
if [ -f "backend/alembic.ini" ]; then
  echo "Running alembic migrations..."
  alembic -c backend/alembic.ini upgrade head
fi

# Start the FastAPI backend
exec uvicorn app.main:app --host 0.0.0.0 --port $PORT
