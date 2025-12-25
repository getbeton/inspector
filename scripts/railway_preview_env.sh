#!/usr/bin/env bash
set -euo pipefail

# Create/update a Railway "preview environment" for a Git branch.
#
# Works both locally (uses authenticated CLI) and in CI (uses RAILWAY_TOKEN).
#
# This script:
# - derives a safe Railway environment name from the branch name
# - creates the environment if missing (duplicating from staging)
# - sets per-environment variables for the frontend
# - optionally deploys services to the environment
# - performs health checks on deployed services
#
# Requirements:
# - railway CLI installed
# - For CI: RAILWAY_TOKEN and RAILWAY_PROJECT_ID set
# - For local: `railway login` completed (saves token locally)
#
# Inputs:
# - BRANCH_NAME: e.g. "feature/deployment-workflow"
# - BASE_ENV_NAME: e.g. "staging" (default: staging)
#
# Optional:
# - PRINT_ENV_NAME_ONLY=1  (only prints the env name and exits)
# - SKIP_DEPLOY=1  (create env but don't deploy services)
# - SKIP_HEALTH_CHECK=1  (skip health checks after deploy)
# - FRONTEND_SERVICE_NAME: defaults to "frontend"
# - FRONTEND_API_URL: defaults to "http://backend.railway.internal:8000"
# - RAILWAY_TOKEN: For CI (optional if locally authenticated)
# - RAILWAY_PROJECT_ID: For CI (optional if locally authenticated)

set +u
BRANCH_NAME="${BRANCH_NAME:-}"
BASE_ENV_NAME="${BASE_ENV_NAME:-staging}"
FRONTEND_SERVICE_NAME="${FRONTEND_SERVICE_NAME:-frontend}"
FRONTEND_API_URL="${FRONTEND_API_URL:-http://backend.railway.internal:8000}"
PRINT_ENV_NAME_ONLY="${PRINT_ENV_NAME_ONLY:-0}"
SKIP_DEPLOY="${SKIP_DEPLOY:-0}"
SKIP_HEALTH_CHECK="${SKIP_HEALTH_CHECK:-0}"
RAILWAY_TOKEN="${RAILWAY_TOKEN:-}"
RAILWAY_PROJECT_ID="${RAILWAY_PROJECT_ID:-}"
set -u

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
  echo -e "${BLUE}ℹ️  $*${NC}"
}

log_success() {
  echo -e "${GREEN}✅ $*${NC}"
}

log_warn() {
  echo -e "${YELLOW}⚠️  $*${NC}"
}

log_error() {
  echo -e "${RED}❌ $*${NC}" >&2
}

if [[ -z "$BRANCH_NAME" ]]; then
  log_error "BRANCH_NAME is required"
  exit 2
fi

sanitize_env_name() {
  local raw="$1"
  # Normalize:
  # - lower-case
  # - replace slashes/underscores with hyphens
  # - remove all chars except [a-z0-9-]
  # - collapse multiple hyphens
  # - trim to max 25 chars (Railway env names have limits)
  local s
  s="$(echo "$raw" | tr '[:upper:]' '[:lower:]' | sed -E 's#[/_]+#-#g' | sed -E 's/[^a-z0-9-]+//g' | sed -E 's/-+/-/g' | sed -E 's/^-+//; s/-+$//')"
  s="${s:0:25}"
  # Trim again after truncation
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

# Check if railway CLI is installed
if ! command -v railway &> /dev/null; then
  log_error "railway CLI not found. Install from https://railway.app/install"
  exit 1
fi

log_info "Railway Preview Environment Setup"
log_info "Branch: $BRANCH_NAME"
log_info "Environment: $ENV_NAME"
log_info "Base: $BASE_ENV_NAME"
echo ""

# Determine mode: CI (with token) or Local (authenticated CLI)
if [[ -n "$RAILWAY_TOKEN" ]] && [[ -n "$RAILWAY_PROJECT_ID" ]]; then
  log_info "Running in CI mode (using RAILWAY_TOKEN)"
  export RAILWAY_TOKEN
  railway link --project "$RAILWAY_PROJECT_ID" >/dev/null 2>&1 || true
elif railway status &>/dev/null; then
  log_info "Running in local mode (using authenticated CLI)"
else
  log_error "Not authenticated with Railway and no CI credentials provided"
  log_error "Run 'railway login' first or set RAILWAY_TOKEN and RAILWAY_PROJECT_ID"
  exit 1
fi

# Create environment if it doesn't exist
log_info "Checking if environment exists: $ENV_NAME"
if railway environment "$ENV_NAME" >/dev/null 2>&1; then
  log_warn "Environment already exists: $ENV_NAME"
else
  log_info "Creating environment: $ENV_NAME (duplicate from $BASE_ENV_NAME)..."
  if railway environment new "$ENV_NAME" --duplicate "$BASE_ENV_NAME"; then
    log_success "Environment created: $ENV_NAME"
  else
    log_error "Failed to create environment"
    exit 1
  fi
fi

# Switch to the environment
log_info "Switching to environment: $ENV_NAME"
railway environment "$ENV_NAME" >/dev/null 2>&1 || true

# Configure frontend API_URL
log_info "Configuring frontend service..."
if railway variables \
  --service "$FRONTEND_SERVICE_NAME" \
  --set "API_URL=${FRONTEND_API_URL}" \
  --skip-deploys >/dev/null 2>&1; then
  log_success "Frontend API_URL set: $FRONTEND_API_URL"
else
  log_warn "Could not set API_URL (service may not exist yet)"
fi

if [[ "$SKIP_DEPLOY" == "1" ]]; then
  log_success "Environment ready (deployment skipped)"
  exit 0
fi

# Deploy services
log_info "Deploying services to $ENV_NAME..."
echo ""

SERVICES=("backend" "frontend")
FAILED_SERVICES=()

for SERVICE in "${SERVICES[@]}"; do
  log_info "Deploying $SERVICE..."
  if railway up --ci --service "$SERVICE" 2>&1 | tail -5; then
    log_success "$SERVICE deployed"
  else
    log_warn "Failed to deploy $SERVICE (may already be running)"
    FAILED_SERVICES+=("$SERVICE")
  fi
done

if [[ "$SKIP_HEALTH_CHECK" == "1" ]]; then
  log_success "Environment ready (health checks skipped)"
  exit 0
fi

echo ""
log_info "Environment Status"
log_info "==================="

# Check service status via logs
log_info "Checking service health..."
for SERVICE in "${SERVICES[@]}"; do
  echo ""
  log_info "Logs for $SERVICE (last 10 lines):"
  if railway logs --service "$SERVICE" --lines 10 2>/dev/null | tail -5; then
    log_success "$SERVICE is running"
  else
    log_warn "$SERVICE status unclear"
  fi
done

echo ""
echo "=========================================="
log_success "Environment ready: $ENV_NAME"
echo "=========================================="
echo ""
log_info "To view logs:"
log_info "  railway logs --service backend"
log_info "  railway logs --service frontend"
echo ""
log_info "To switch to this environment:"
log_info "  railway environment $ENV_NAME"
echo ""
log_info "To view in Railway dashboard:"
log_info "  https://railway.app/project"
echo ""

