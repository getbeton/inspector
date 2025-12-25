#!/usr/bin/env bash
set -euo pipefail

# Delete a Railway "preview environment" for a Git branch.
#
# Requirements:
# - railway CLI installed
# - RAILWAY_TOKEN set
# - RAILWAY_PROJECT_ID set
# - RAILWAY_WORKSPACE_ID set (workspace id or exact workspace name) to keep `railway link` non-interactive in CI
#
# Inputs:
# - BRANCH_NAME: the feature branch name (head ref)
# - BASE_ENV_NAME: optional; used only to make `railway link` deterministic (defaults to "staging")

BRANCH_NAME="${BRANCH_NAME:-}"
BASE_ENV_NAME="${BASE_ENV_NAME:-staging}"
RAILWAY_WORKSPACE_ID="${RAILWAY_WORKSPACE_ID:-}"

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

if [[ -z "${RAILWAY_WORKSPACE_ID:-}" ]]; then
  echo "RAILWAY_WORKSPACE_ID is required" >&2
  echo "Why:" >&2
  echo "  - Railway CLI may prompt to select a workspace even if --project is provided." >&2
  echo "  - Interactive prompts break GitHub Actions and prevent preview env cleanup." >&2
  exit 2
fi

sanitize_env_name() {
  local raw="$1"
  local s
  s="$(echo "$raw" | tr '[:upper:]' '[:lower:]' | sed -E 's#[/_]+#-#g' | sed -E 's/[^a-z0-9-]+//g' | sed -E 's/-+/-/g' | sed -E 's/^-+//; s/-+$//')"
  s="${s:0:30}"
  # Truncation can reintroduce a trailing '-' (e.g. cutting at a dash boundary).
  # Trim again so cleanup targets the same valid name creation uses.
  s="$(echo "$s" | sed -E 's/^-+//; s/-+$//')"
  if [[ -z "$s" ]]; then
    s="preview"
  fi
  echo "pr-${s}"
}

ENV_NAME="$(sanitize_env_name "$BRANCH_NAME")"

echo "Cleaning up preview env:"
echo "  BRANCH_NAME=$BRANCH_NAME"
echo "  ENV_NAME=$ENV_NAME"
echo "  BASE_ENV_NAME=$BASE_ENV_NAME"
echo "  RAILWAY_PROJECT_ID=$RAILWAY_PROJECT_ID"
echo "  RAILWAY_WORKSPACE_ID=$RAILWAY_WORKSPACE_ID"

echo "Railway CLI:"
railway --version || true

# Link MUST be non-interactive and MUST fail loudly; otherwise we can end up attempting to delete the wrong env.
if ! railway link --workspace "$RAILWAY_WORKSPACE_ID" --project "$RAILWAY_PROJECT_ID" --environment "$BASE_ENV_NAME" >/dev/null 2>&1; then
  echo "ERROR: Failed to link Railway project (project id: $RAILWAY_PROJECT_ID)." >&2
  echo "Fix:" >&2
  echo "  - Confirm GitHub secret RAILWAY_PROJECT_ID is correct for this Railway project." >&2
  echo "  - Confirm GitHub secret RAILWAY_WORKSPACE_ID matches the project workspace (id or exact name)." >&2
  echo "  - Confirm RAILWAY_TOKEN has access to that project." >&2
  exit 1
fi

echo "Verifying Railway token..."
if ! railway whoami >/dev/null 2>&1; then
  echo "ERROR: Railway token is not authorized for this project (railway whoami failed)." >&2
  echo "Fix:" >&2
  echo "  - Ensure GitHub secret RAILWAY_TOKEN is a valid Railway CI/API token with access to this project." >&2
  exit 1
fi

# Delete by explicit name to avoid relying on "currently linked env" state.
if railway environment "$ENV_NAME" >/dev/null 2>&1; then
  echo "Deleting environment: $ENV_NAME"
  railway environment delete "$ENV_NAME" --yes
else
  echo "Environment does not exist (nothing to delete): $ENV_NAME"
fi

