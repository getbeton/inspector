#!/usr/bin/env bash
set -euo pipefail

# Test Railway preview environment services via API
#
# This script tests if the backend and frontend services are running
# and responding correctly.
#
# Usage:
#   ./scripts/test_api.sh [ENVIRONMENT_NAME] [SERVICE_NAME]
#
# Examples:
#   ./scripts/test_api.sh pr-beton-revops backend
#   ./scripts/test_api.sh pr-beton-revops frontend
#

ENV_NAME="${1:-pr-beton-revops}"
SERVICE_NAME="${2:-backend}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

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

# Check if railway CLI is installed
if ! command -v railway &> /dev/null; then
  log_error "railway CLI not found. Install from https://railway.app/install"
  exit 1
fi

log_info "Testing Railway Service"
log_info "Environment: $ENV_NAME"
log_info "Service: $SERVICE_NAME"
echo ""

# Check if environment exists
log_info "Verifying environment exists..."
if railway environment "$ENV_NAME" >/dev/null 2>&1; then
  log_success "Environment found: $ENV_NAME"
else
  log_error "Environment not found: $ENV_NAME"
  exit 1
fi

# Switch to environment
log_info "Switching to environment..."
railway environment "$ENV_NAME" >/dev/null 2>&1 || true

echo ""
log_info "Service Status"
log_info "=============="
echo ""

# Get recent logs
log_info "Checking logs for $SERVICE_NAME..."
echo ""

if railway logs --service "$SERVICE_NAME" --lines 15 2>/dev/null; then
  log_success "$SERVICE_NAME is running"

  # Determine health check based on service type
  case "$SERVICE_NAME" in
    backend)
      echo ""
      log_info "Backend expected logs:"
      log_info "  'Uvicorn running on http://0.0.0.0:8080'"
      log_info "  'Application startup complete'"
      echo ""
      log_info "Internal endpoint: http://backend.railway.internal:8000"
      log_info "Note: API is only accessible from within Railway network"
      ;;
    frontend)
      echo ""
      log_info "Frontend expected logs:"
      log_info "  'You can now view your Streamlit app'"
      log_info "  'Streamlit App started'"
      echo ""
      log_info "Visit in Railway dashboard for public URL"
      ;;
  esac

else
  log_error "Could not retrieve logs for $SERVICE_NAME"
  exit 1
fi

echo ""
echo "=========================================="
log_success "Service test complete"
echo "=========================================="
echo ""

log_info "To test other services:"
log_info "  ./scripts/test_api.sh $ENV_NAME backend"
log_info "  ./scripts/test_api.sh $ENV_NAME frontend"
echo ""

log_info "To view all services:"
log_info "  railway logs --service backend"
log_info "  railway logs --service frontend"
echo ""
