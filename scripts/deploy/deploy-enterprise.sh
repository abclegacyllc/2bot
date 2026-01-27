#!/bin/bash
# ============================================
# 2Bot Platform - Enterprise Rolling Deployment
# ============================================
# Phase 6.9 - Zero-Downtime Production Deployment
#
# Deploys services sequentially with health checks:
#   1. API (api.2bot.org) 
#   2. Dashboard (dash.2bot.org)
#   3. Admin (admin.2bot.org)
#   4. Web (2bot.org)
#
# Usage:
#   ./scripts/deploy/deploy-enterprise.sh
#   ./scripts/deploy/deploy-enterprise.sh --dry-run
# ============================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
COMPOSE_FILE="docker-compose.yml"
HEALTH_CHECK_RETRIES=30
HEALTH_CHECK_INTERVAL=2

DRY_RUN=false
if [ "$1" = "--dry-run" ]; then
  DRY_RUN=true
  echo -e "${YELLOW}=== DRY RUN MODE - No changes will be made ===${NC}"
  echo ""
fi

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║       2Bot Enterprise - Rolling Deployment (Phase 6.9)       ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Check if running from project root
if [ ! -f "$COMPOSE_FILE" ]; then
  echo -e "${RED}❌ $COMPOSE_FILE not found! Run from project root.${NC}"
  exit 1
fi

# Load environment variables
if [ -f .env.production ]; then
  export $(cat .env.production | grep -v '^#' | xargs)
  echo -e "${GREEN}✓${NC} Loaded .env.production"
else
  echo -e "${RED}❌ .env.production not found!${NC}"
  exit 1
fi

# Helper function: Run command or echo in dry-run mode
run_cmd() {
  if [ "$DRY_RUN" = true ]; then
    echo -e "${CYAN}[DRY-RUN]${NC} $*"
  else
    "$@"
  fi
}

# Helper function: Wait for health check
wait_for_health() {
  local url=$1
  local service=$2
  local max_retries=${3:-$HEALTH_CHECK_RETRIES}
  
  if [ "$DRY_RUN" = true ]; then
    echo -e "${CYAN}[DRY-RUN]${NC} Would wait for $url to be healthy"
    return 0
  fi
  
  echo -n "  Waiting for $service..."
  for i in $(seq 1 $max_retries); do
    if curl -sf "$url" >/dev/null 2>&1; then
      echo -e " ${GREEN}✓${NC}"
      return 0
    fi
    echo -n "."
    sleep $HEALTH_CHECK_INTERVAL
  done
  
  echo -e " ${RED}✗${NC}"
  echo -e "${RED}❌ $service health check failed after $max_retries attempts${NC}"
  return 1
}

# Helper function: Check CORS headers
check_cors() {
  local api_url=$1
  local origin=$2
  
  if [ "$DRY_RUN" = true ]; then
    echo -e "${CYAN}[DRY-RUN]${NC} Would check CORS for $origin"
    return 0
  fi
  
  local cors_header
  cors_header=$(curl -s -I -X OPTIONS "$api_url/health" \
    -H "Origin: $origin" \
    -H "Access-Control-Request-Method: GET" 2>/dev/null | grep -i "access-control-allow-origin")
  
  if echo "$cors_header" | grep -qi "$origin"; then
    echo -e "  ${GREEN}✓${NC} CORS allows $origin"
    return 0
  else
    echo -e "  ${RED}✗${NC} CORS does not allow $origin"
    return 1
  fi
}

# =============================================
# Step 0: Pre-deployment checks
# =============================================
echo ""
echo "Step 0: Pre-deployment checks"
echo "────────────────────────────────────────"

echo "  Checking TypeScript..."
run_cmd npm run typecheck
echo -e "  ${GREEN}✓${NC} TypeScript OK"

echo "  Building project..."
run_cmd npm run build
echo -e "  ${GREEN}✓${NC} Build OK"

echo "  Running tests..."
run_cmd npm run test -- --run
echo -e "  ${GREEN}✓${NC} Tests OK"

# =============================================
# Step 1: Build all Docker images
# =============================================
echo ""
echo "Step 1: Building Docker images"
echo "────────────────────────────────────────"

run_cmd docker compose -f $COMPOSE_FILE build
echo -e "${GREEN}✓${NC} All images built"

# =============================================
# Step 2: Deploy API first (api.2bot.org)
# =============================================
echo ""
echo "Step 2: Deploying API (api.2bot.org)"
echo "────────────────────────────────────────"

run_cmd docker compose -f $COMPOSE_FILE up -d --no-deps api
wait_for_health "https://api.2bot.org/health" "API"
echo -e "${GREEN}✓${NC} API deployed and healthy"

# Verify CORS
echo ""
echo "  Checking CORS configuration..."
check_cors "https://api.2bot.org" "https://dash.2bot.org" || true
check_cors "https://api.2bot.org" "https://admin.2bot.org" || true
check_cors "https://api.2bot.org" "https://2bot.org" || true

# =============================================
# Step 3: Deploy Dashboard (dash.2bot.org)
# =============================================
echo ""
echo "Step 3: Deploying Dashboard (dash.2bot.org)"
echo "────────────────────────────────────────"

run_cmd docker compose -f $COMPOSE_FILE up -d --no-deps dashboard
wait_for_health "https://dash.2bot.org" "Dashboard"
echo -e "${GREEN}✓${NC} Dashboard deployed and healthy"

# =============================================
# Step 4: Deploy Admin (admin.2bot.org)
# =============================================
echo ""
echo "Step 4: Deploying Admin (admin.2bot.org)"
echo "────────────────────────────────────────"

run_cmd docker compose -f $COMPOSE_FILE up -d --no-deps admin
wait_for_health "https://admin.2bot.org" "Admin"
echo -e "${GREEN}✓${NC} Admin deployed and healthy"

# =============================================
# Step 5: Deploy Web (2bot.org)
# =============================================
echo ""
echo "Step 5: Deploying Web (2bot.org)"
echo "────────────────────────────────────────"

run_cmd docker compose -f $COMPOSE_FILE up -d --no-deps web
wait_for_health "https://2bot.org" "Web"
echo -e "${GREEN}✓${NC} Web deployed and healthy"

# =============================================
# Step 6: Post-deployment verification
# =============================================
echo ""
echo "Step 6: Post-deployment verification"
echo "────────────────────────────────────────"

if [ "$DRY_RUN" = false ]; then
  echo "  Running smoke tests..."
  ./scripts/smoke-test-6.9.sh prod
fi

# =============================================
# Summary
# =============================================
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                    Deployment Complete                       ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "Services deployed:"
echo "  • api.2bot.org     - API Server"
echo "  • dash.2bot.org    - Dashboard"
echo "  • admin.2bot.org   - Admin Panel"
echo "  • 2bot.org         - Main Website"
echo ""
echo "Next steps:"
echo "  1. Monitor logs: docker compose -f $COMPOSE_FILE logs -f"
echo "  2. Check status: docker compose -f $COMPOSE_FILE ps"
echo "  3. Run full test: TOKEN=<jwt> make smoke-test-prod"
echo ""

if [ "$DRY_RUN" = true ]; then
  echo -e "${YELLOW}=== DRY RUN COMPLETE - No changes were made ===${NC}"
fi
