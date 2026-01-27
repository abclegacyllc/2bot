#!/bin/bash
# Phase 6.9 Enterprise Migration Smoke Test
# Tests the new subdomain architecture (api.2bot.org, dash.2bot.org, admin.2bot.org)
#
# Usage:
#   Development: ./scripts/smoke-test-6.9.sh dev
#   Production:  TOKEN=<jwt> ./scripts/smoke-test-6.9.sh prod
#   With token:  TOKEN=<jwt> ./scripts/smoke-test-6.9.sh dev

# Don't use set -e because ((0)) returns false and would exit
# set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Environment: dev or prod
ENV="${1:-dev}"
TOKEN="${TOKEN:-}"

# Set base URLs based on environment
if [ "$ENV" = "prod" ] || [ "$ENV" = "production" ]; then
  API_BASE="https://api.2bot.org"
  DASHBOARD_BASE="https://dash.2bot.org"
  ADMIN_BASE="https://admin.2bot.org"
  MAIN_BASE="https://2bot.org"
  API_PREFIX=""
else
  # Development mode - mirrors production (no /api prefix)
  # Production-like development ensures dev/prod parity
  API_BASE="http://localhost:3001"
  DASHBOARD_BASE="http://localhost:3000"
  ADMIN_BASE="http://localhost:3000"  # Same as dashboard in dev
  MAIN_BASE="http://localhost:3000"
  API_PREFIX=""  # Same as production - no prefix
fi

echo "==================================================="
echo "Phase 6.9 Enterprise Migration Smoke Test"
echo "==================================================="
echo "Environment: $ENV"
echo "API Base: $API_BASE"
echo "Dashboard: $DASHBOARD_BASE"
echo ""

if [ -z "$TOKEN" ]; then
  echo -e "${YELLOW}Warning: No JWT token provided. Auth-required endpoints will be skipped.${NC}"
  echo "Usage: TOKEN=<jwt> ./scripts/smoke-test-6.9.sh $ENV"
  echo ""
fi

# Counters for results
PASS=0
FAIL=0
SKIP=0

# Helper function to test an endpoint
test_endpoint() {
  local method=$1
  local path=$2
  local expected_code=$3
  local description=$4
  local auth_required=${5:-true}
  
  local full_url="$API_BASE$API_PREFIX$path"
  
  if [ "$auth_required" = "true" ] && [ -z "$TOKEN" ]; then
    echo -e "${YELLOW}SKIP${NC} $method $full_url - No token"
    ((SKIP++))
    return
  fi
  
  local http_code
  
  if [ -n "$TOKEN" ]; then
    http_code=$(curl -s -o /dev/null -w "%{http_code}" -X "$method" "$full_url" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $TOKEN")
  else
    http_code=$(curl -s -o /dev/null -w "%{http_code}" -X "$method" "$full_url" \
      -H "Content-Type: application/json")
  fi
  
  if [ "$http_code" = "$expected_code" ]; then
    echo -e "${GREEN}PASS${NC} $method $path → $http_code ($description)"
    ((PASS++))
  else
    echo -e "${RED}FAIL${NC} $method $path → $http_code (expected $expected_code - $description)"
    ((FAIL++))
  fi
}

# Helper function to test CORS headers
test_cors() {
  local origin=$1
  local description=$2
  
  local full_url="$API_BASE$API_PREFIX/health"
  
  local cors_header
  cors_header=$(curl -s -I -X OPTIONS "$full_url" \
    -H "Origin: $origin" \
    -H "Access-Control-Request-Method: GET" 2>/dev/null | grep -i "access-control-allow-origin" | tr -d '\r')
  
  if echo "$cors_header" | grep -qi "$origin\|*"; then
    echo -e "${GREEN}PASS${NC} CORS allows $origin ($description)"
    ((PASS++))
  else
    echo -e "${RED}FAIL${NC} CORS does not allow $origin ($description)"
    echo "       Header: $cors_header"
    ((FAIL++))
  fi
}

# Helper to test a frontend URL
test_frontend() {
  local base=$1
  local path=$2
  local expected_code=$3
  local description=$4
  
  local full_url="$base$path"
  
  local http_code
  http_code=$(curl -s -o /dev/null -w "%{http_code}" "$full_url")
  
  if [ "$http_code" = "$expected_code" ]; then
    echo -e "${GREEN}PASS${NC} GET $full_url → $http_code ($description)"
    ((PASS++))
  else
    echo -e "${RED}FAIL${NC} GET $full_url → $http_code (expected $expected_code - $description)"
    ((FAIL++))
  fi
}

echo "--- Section 1: Health Check ---"
test_endpoint "GET" "/health" "200" "API health check" false

echo ""
echo "--- Section 2: Auth Endpoints (No Auth Required) ---"
# These should return 4xx with invalid credentials, not 500
echo "Testing auth endpoints return proper responses..."
AUTH_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_BASE$API_PREFIX/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@invalid.com","password":"wrongpass"}')
if [ "$AUTH_RESPONSE" = "401" ] || [ "$AUTH_RESPONSE" = "400" ]; then
  echo -e "${GREEN}PASS${NC} POST /auth/login → $AUTH_RESPONSE (returns auth error, not server error)"
  ((PASS++))
else
  echo -e "${RED}FAIL${NC} POST /auth/login → $AUTH_RESPONSE (expected 401 or 400)"
  ((FAIL++))
fi

echo ""
echo "--- Section 3: User Endpoints (Auth Required) ---"
test_endpoint "GET" "/user/gateways" "200" "List personal gateways"
test_endpoint "GET" "/user/plugins" "200" "List personal plugins"
test_endpoint "GET" "/user/quota" "200" "Personal quota status"
test_endpoint "GET" "/user/organizations" "200" "List user organizations"

echo ""
echo "--- Section 4: CORS Configuration ---"
if [ "$ENV" = "prod" ] || [ "$ENV" = "production" ]; then
  test_cors "https://dash.2bot.org" "Dashboard subdomain"
  test_cors "https://admin.2bot.org" "Admin subdomain"
  test_cors "https://2bot.org" "Main domain"
else
  test_cors "http://localhost:3000" "Local frontend"
fi

echo ""
echo "--- Section 5: Frontend Health ---"
test_frontend "$DASHBOARD_BASE" "/" "200" "Dashboard home"
if [ "$ENV" = "prod" ] || [ "$ENV" = "production" ]; then
  test_frontend "$ADMIN_BASE" "/" "200" "Admin panel home"
  test_frontend "$MAIN_BASE" "/" "200" "Main site home"
fi

echo ""
echo "--- Section 6: No /api Prefix Verification ---"
# Verify routes work at root (no /api prefix)
ROOT_ROUTE=$(curl -s -o /dev/null -w "%{http_code}" "$API_BASE/health")
if [ "$ROOT_ROUTE" = "200" ]; then
  echo -e "${GREEN}PASS${NC} GET /health → 200 (routes at root, no /api prefix)"
  ((PASS++))
else
  echo -e "${RED}FAIL${NC} GET /health → $ROOT_ROUTE (expected 200)"
  ((FAIL++))
fi

# In production, /api/* should NOT exist (404)
if [ "$ENV" = "prod" ] || [ "$ENV" = "production" ]; then
  OLD_ROUTE=$(curl -s -o /dev/null -w "%{http_code}" "$API_BASE/api/health")
  if [ "$OLD_ROUTE" = "404" ]; then
    echo -e "${GREEN}PASS${NC} GET /api/health → 404 (old route correctly removed)"
    ((PASS++))
  else
    echo -e "${YELLOW}WARN${NC} GET /api/health → $OLD_ROUTE (expected 404 - old route still exists)"
  fi
fi

echo ""
echo "==================================================="
echo "Results Summary"
echo "==================================================="
echo -e "${GREEN}PASSED:${NC} $PASS"
echo -e "${RED}FAILED:${NC} $FAIL"
echo -e "${YELLOW}SKIPPED:${NC} $SKIP"
echo ""

if [ $FAIL -gt 0 ]; then
  echo -e "${RED}❌ Some tests failed!${NC}"
  exit 1
else
  echo -e "${GREEN}✅ All tests passed!${NC}"
  exit 0
fi
