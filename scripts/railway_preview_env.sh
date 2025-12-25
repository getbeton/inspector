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
# - RAILWAY_WORKSPACE_ID set (workspace id or exact workspace name) to keep `railway link` non-interactive in CI
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
RAILWAY_WORKSPACE_ID="${RAILWAY_WORKSPACE_ID:-}"

if [[ -z "$BRANCH_NAME" ]]; then
  echo "BRANCH_NAME is required" >&2
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
  # Truncation can reintroduce a trailing '-' (e.g. cutting at a dash boundary).
  # Trim again to keep env names valid and predictable.
  s="$(echo "$s" | sed -E 's/^-+//; s/-+$//')"
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

if [[ -z "${RAILWAY_TOKEN:-}" ]]; then
  echo "RAILWAY_TOKEN is required" >&2
  exit 2
fi

if [[ -z "${RAILWAY_PROJECT_ID:-}" ]]; then
  echo "RAILWAY_PROJECT_ID is required" >&2
  exit 2
fi

if [[ -z "${RAILWAY_WORKSPACE_ID:-}" ]]; then
  echo "RAILWAY_WORKSPACE_ID is required" >&2
  echo "Why:" >&2
  echo "  - Railway CLI may prompt to select a workspace even if --project is provided." >&2
  echo "  - Interactive prompts break GitHub Actions and prevent preview env creation." >&2
  exit 2
fi

print_token_diagnostics() {
  # IMPORTANT: Never print the token itself. Only print metadata that helps debug copy/paste issues.
  local token="${RAILWAY_TOKEN:-}"
  echo "Railway token diagnostics (safe):"
  echo "  token_length=${#token}"
  if [[ "$token" =~ [[:space:]] ]]; then
    echo "  token_contains_whitespace=true"
  else
    echo "  token_contains_whitespace=false"
  fi
  if [[ "$token" == *$'\n'* ]]; then
    echo "  token_contains_newline=true"
  else
    echo "  token_contains_newline=false"
  fi
  if [[ "$token" == *$'\r'* ]]; then
    echo "  token_contains_carriage_return=true"
  else
    echo "  token_contains_carriage_return=false"
  fi
}

echo "Preview env for branch:"
echo "  BRANCH_NAME=$BRANCH_NAME"
echo "  ENV_NAME=$ENV_NAME"
echo "  BASE_ENV_NAME=$BASE_ENV_NAME"
echo "  RAILWAY_PROJECT_ID=$RAILWAY_PROJECT_ID"
echo "  RAILWAY_WORKSPACE_ID=$RAILWAY_WORKSPACE_ID"

echo "Railway CLI:"
railway --version || true

echo "Verifying Railway token..."
# We intentionally capture stderr so CI logs contain the real Railway CLI error message.
# This is usually enough to distinguish:
# - invalid token
# - revoked/expired token
# - copy/paste token with whitespace/newlines
# - token type that isn't accepted by the CLI auth endpoint
WHOAMI_OUTPUT=""
if ! WHOAMI_OUTPUT="$(railway whoami --json 2>&1)"; then
  echo "ERROR: Railway token is not authorized (railway whoami failed)." >&2
  echo "Railway whoami output:" >&2
  echo "$WHOAMI_OUTPUT" >&2
  print_token_diagnostics >&2
  echo "Fix:" >&2
  echo "  - Ensure GitHub secret RAILWAY_TOKEN is a valid Railway CI/API token with access to this project." >&2
  exit 1
fi
echo "Railway token OK (whoami succeeded)."

# Link the Railway project for this repo (CI-safe).
# IMPORTANT: do NOT swallow errors here; if linking fails, subsequent commands give confusing errors
# like \"Project Token not found\".
#
# We pass workspace + environment explicitly to avoid any interactive selection prompts.
if ! railway link --workspace "$RAILWAY_WORKSPACE_ID" --project "$RAILWAY_PROJECT_ID" --environment "$BASE_ENV_NAME" >/dev/null 2>&1; then
  echo "ERROR: Failed to link Railway project (project id: $RAILWAY_PROJECT_ID)." >&2
  echo "Fix:" >&2
  echo "  - Confirm GitHub secret RAILWAY_PROJECT_ID is correct for this Railway project." >&2
  echo "  - Confirm GitHub secret RAILWAY_WORKSPACE_ID matches the project workspace (id or exact name)." >&2
  echo "  - Confirm RAILWAY_TOKEN has access to that project." >&2
  exit 1
fi

# Create environment if it doesn't exist.
# We detect existence by attempting to link to it (non-interactive). If it fails, we create it.
if railway environment "$ENV_NAME" >/dev/null 2>&1; then
  echo "Environment already exists: $ENV_NAME"
else
  echo "Creating environment: $ENV_NAME (duplicate from $BASE_ENV_NAME)"
  if ! railway environment new "$ENV_NAME" --duplicate "$BASE_ENV_NAME"; then
    echo "ERROR: Failed to create preview environment: $ENV_NAME" >&2
    echo "Common causes:" >&2
    echo "  - RAILWAY_TOKEN can deploy but does not have permission to create/delete environments." >&2
    echo "  - The project id is wrong or the token cannot access it." >&2
    exit 1
  fi
  # Link again after creation.
  railway environment "$ENV_NAME" >/dev/null 2>&1 || true
fi

# Ensure frontend has a correct API_URL inside this environment.
# This avoids common preview-env failures where frontend points at the wrong backend host.
echo "Setting ${FRONTEND_SERVICE_NAME}.API_URL for env ${ENV_NAME}"
railway variables --environment "$ENV_NAME" --service "$FRONTEND_SERVICE_NAME" --set "API_URL=${FRONTEND_API_URL}" --skip-deploys >/dev/null

echo "Preview environment ready: $ENV_NAME"

