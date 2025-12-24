#!/usr/bin/env bash
set -euo pipefail

# Delete a Railway "preview environment" for a Git branch.
#
# Requirements:
# - railway CLI installed
# - RAILWAY_TOKEN set
# - RAILWAY_PROJECT_ID set
#
# Inputs:
# - BRANCH_NAME: the feature branch name (head ref)
# - BASE_ENV_NAME: optional, not used here but kept for symmetry

BRANCH_NAME="${BRANCH_NAME:-}"

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
  local s
  s="$(echo "$raw" | tr '[:upper:]' '[:lower:]' | sed -E 's#[/_]+#-#g' | sed -E 's/[^a-z0-9-]+//g' | sed -E 's/-+/-/g' | sed -E 's/^-+//; s/-+$//')"
  s="${s:0:30}"
  if [[ -z "$s" ]]; then
    s="preview"
  fi
  echo "pr-${s}"
}

ENV_NAME="$(sanitize_env_name "$BRANCH_NAME")"

echo "Cleaning up preview env:"
echo "  BRANCH_NAME=$BRANCH_NAME"
echo "  ENV_NAME=$ENV_NAME"

railway link --project "$RAILWAY_PROJECT_ID" >/dev/null 2>&1 || true

if railway environment "$ENV_NAME" >/dev/null 2>&1; then
  echo "Deleting environment: $ENV_NAME"
  railway environment delete "$ENV_NAME" --yes
else
  echo "Environment does not exist (nothing to delete): $ENV_NAME"
fi

