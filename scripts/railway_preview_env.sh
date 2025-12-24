#!/usr/bin/env bash
set -euo pipefail

# Create/update a Railway "preview environment" for a Git branch.
#
# This script is intended for GitHub Actions (CI). It:
# - derives a safe Railway environment name from the branch name
# - creates the environment if missing (duplicating from staging)
# - sets minimal per-environment variables for the frontend
# - optionally prints the computed environment name for callers
#
# Requirements:
# - railway CLI installed
# - RAILWAY_TOKEN set (Railway CI token)
# - RAILWAY_PROJECT_ID set
#
# Inputs:
# - BRANCH_NAME: e.g. "feature/deployment-workflow"
# - BASE_ENV_NAME: e.g. "staging"
#
# Optional:
# - PRINT_ENV_NAME_ONLY=1  (only prints the env name and exits)
#
# Optional:
# - FRONTEND_SERVICE_NAME: defaults to "frontend"
# - FRONTEND_API_URL: defaults to "http://backend.railway.internal:8000"

BRANCH_NAME="${BRANCH_NAME:-}"
BASE_ENV_NAME="${BASE_ENV_NAME:-staging}"
FRONTEND_SERVICE_NAME="${FRONTEND_SERVICE_NAME:-frontend}"
FRONTEND_API_URL="${FRONTEND_API_URL:-http://backend.railway.internal:8000}"
PRINT_ENV_NAME_ONLY="${PRINT_ENV_NAME_ONLY:-0}"

if [[ -z "$BRANCH_NAME" ]]; then
  echo "BRANCH_NAME is required" >&2
  exit 2
fi

if [[ -z "${RAILWAY_TOKEN:-}" ]]; then
  echo "RAILWAY_TOKEN is required" >&2
  exit 2
fi

if [[ -z "${RAILWAY_PROJECT_ID:-}" ]]; then
  echo "RAILWAY_PROJECT_ID is required" >&2
  exit 2
fi

sanitize_env_name() {
  local raw="$1"
  # Normalize:
  # - lower-case
  # - replace slashes/underscores with hyphens
  # - remove all chars except [a-z0-9-]
  # - collapse multiple hyphens
  # - trim to max 30 chars (Railway env names should stay short)
  local s
  s="$(echo "$raw" | tr '[:upper:]' '[:lower:]' | sed -E 's#[/_]+#-#g' | sed -E 's/[^a-z0-9-]+//g' | sed -E 's/-+/-/g' | sed -E 's/^-+//; s/-+$//')"
  s="${s:0:30}"
  if [[ -z "$s" ]]; then
    s="preview"
  fi
  echo "pr-${s}"
}

ENV_NAME="$(sanitize_env_name "$BRANCH_NAME")"

if [[ "$PRINT_ENV_NAME_ONLY" == "1" ]]; then
  echo "$ENV_NAME"
  exit 0
fi

echo "Preview env for branch:"
echo "  BRANCH_NAME=$BRANCH_NAME"
echo "  ENV_NAME=$ENV_NAME"
echo "  BASE_ENV_NAME=$BASE_ENV_NAME"

# Link the Railway project for this repo (CI-safe).
railway link --project "$RAILWAY_PROJECT_ID" >/dev/null 2>&1 || true

# Create environment if it doesn't exist.
# We detect existence by attempting to link to it (non-interactive). If it fails, we create it.
if railway environment "$ENV_NAME" >/dev/null 2>&1; then
  echo "Environment already exists: $ENV_NAME"
else
  echo "Creating environment: $ENV_NAME (duplicate from $BASE_ENV_NAME)"
  railway environment new "$ENV_NAME" --duplicate "$BASE_ENV_NAME"
  # Link again after creation.
  railway environment "$ENV_NAME" >/dev/null 2>&1 || true
fi

# Ensure frontend has a correct API_URL inside this environment.
# This avoids common preview-env failures where frontend points at the wrong backend host.
echo "Setting ${FRONTEND_SERVICE_NAME}.API_URL for env ${ENV_NAME}"
railway variables --environment "$ENV_NAME" --service "$FRONTEND_SERVICE_NAME" --set "API_URL=${FRONTEND_API_URL}" --skip-deploys >/dev/null

echo "Preview environment ready: $ENV_NAME"

