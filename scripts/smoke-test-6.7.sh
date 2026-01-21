#!/bin/bash
# Phase 6.7 Architecture Alignment Smoke Test
# Run this script with a valid JWT token to test the new URL-based API routes
#
# Usage: TOKEN=<your-jwt-token> ./scripts/smoke-test-6.7.sh
# Or:    ./scripts/smoke-test-6.7.sh <your-jwt-token>

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

API_BASE="${API_BASE:-http://localhost:3001}"
TOKEN="${1:-$TOKEN}"

if [ -z "$TOKEN" ]; then
  echo -e "${YELLOW}Warning: No JWT token provided. Auth-required endpoints will fail.${NC}"
  echo "Usage: TOKEN=<jwt> ./scripts/smoke-test-6.7.sh"
  echo ""
fi

echo "==================================================="
echo "Phase 6.7 Architecture Alignment Smoke Test"
echo "==================================================="
echo "API Base: $API_BASE"
echo ""

# Counter for results
PASS=0
FAIL=0

# Helper function to test an endpoint
test_endpoint() {
  local method=$1
  local path=$2
  local expected_code=$3
  local description=$4
  local auth_required=${5:-true}
  
  if [ "$auth_required" = "true" ] && [ -z "$TOKEN" ]; then
    echo -e "${YELLOW}SKIP${NC} $method $path - No token"
    return
  fi
  
  local auth_header=""
  if [ -n "$TOKEN" ]; then
    auth_header="-H \"Authorization: Bearer $TOKEN\""
  fi
  
  local response
  local http_code
  
  http_code=$(curl -s -o /dev/null -w "%{http_code}" -X "$method" "$API_BASE$path" \
    -H "Content-Type: application/json" \
    ${auth_header:+-H "Authorization: Bearer $TOKEN"})
  
  if [ "$http_code" = "$expected_code" ]; then
    echo -e "${GREEN}PASS${NC} $method $path → $http_code ($description)"
    ((PASS++))
  else
    echo -e "${RED}FAIL${NC} $method $path → $http_code (expected $expected_code - $description)"
    ((FAIL++))
  fi
}

# Helper to test deprecation headers
test_deprecated() {
  local path=$1
  local description=$2
  
  if [ -z "$TOKEN" ]; then
    echo -e "${YELLOW}SKIP${NC} GET $path (deprecated) - No token"
    return
  fi
  
  local headers
  headers=$(curl -s -I -X GET "$API_BASE$path" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" 2>/dev/null | grep -i "deprecation\|sunset\|link")
  
  if echo "$headers" | grep -qi "deprecation"; then
    echo -e "${GREEN}PASS${NC} GET $path has deprecation headers ($description)"
    ((PASS++))
  else
    echo -e "${RED}FAIL${NC} GET $path missing deprecation headers ($description)"
    ((FAIL++))
  fi
}

echo "--- Health Check ---"
test_endpoint "GET" "/api/health" "200" "Health check" false

echo ""
echo "--- Personal Routes (/api/user/*) ---"
test_endpoint "GET" "/api/user/gateways" "200" "List personal gateways"
test_endpoint "GET" "/api/user/plugins" "200" "List personal plugins"
test_endpoint "GET" "/api/user/quota" "200" "Personal quota status"
test_endpoint "GET" "/api/user/organizations" "200" "List user's organizations"

echo ""
echo "--- Organization Routes (/api/orgs/:orgId/*) ---"
echo "(Using placeholder org ID - expects 404 or 403)"
test_endpoint "GET" "/api/orgs/nonexistent123/gateways" "403" "Non-member org access denied"
test_endpoint "GET" "/api/orgs/nonexistent123/plugins" "403" "Non-member org access denied"
test_endpoint "GET" "/api/orgs/nonexistent123/quota" "403" "Non-member org access denied"
test_endpoint "GET" "/api/orgs/nonexistent123/members" "403" "Non-member org access denied"
test_endpoint "GET" "/api/orgs/nonexistent123/departments" "403" "Non-member org access denied"

echo ""
echo "--- Deprecated Routes (should still work with deprecation headers) ---"
test_deprecated "/api/gateways" "Old gateway route deprecated"
test_deprecated "/api/quota/status" "Old quota route deprecated"

echo ""
echo "==================================================="
echo "Results: ${GREEN}$PASS passed${NC}, ${RED}$FAIL failed${NC}"
echo "==================================================="

if [ $FAIL -gt 0 ]; then
  exit 1
fi
