#!/bin/bash
# ============================================
# 2Bot Platform - Production Deployment Script
# ============================================
set -e

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║           2Bot Platform - Production Deployment              ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
  echo -e "${YELLOW}Warning: Running without root. Some operations may fail.${NC}"
fi

# Load environment variables
if [ -f .env.production ]; then
  export $(cat .env.production | grep -v '^#' | xargs)
  echo -e "${GREEN}✓${NC} Loaded .env.production"
else
  echo -e "${RED}✗${NC} .env.production not found!"
  echo "  Copy .env.production.example to .env.production and fill in values"
  exit 1
fi

# Check required environment variables
check_env() {
  if [ -z "${!1}" ]; then
    echo -e "${RED}✗${NC} Missing required env var: $1"
    exit 1
  fi
}

echo ""
echo "Checking required environment variables..."
check_env "DATABASE_URL"
check_env "REDIS_URL"
check_env "JWT_SECRET"
check_env "STRIPE_SECRET_KEY"
check_env "NEXT_PUBLIC_APP_URL"
echo -e "${GREEN}✓${NC} All required env vars present"

# Step 1: Pull latest code (if using git)
echo ""
echo "Step 1: Preparing codebase..."
if [ -d ".git" ]; then
  git pull origin main 2>/dev/null || echo "  Skipping git pull (not on main or no remote)"
fi
echo -e "${GREEN}✓${NC} Codebase ready"

# Step 2: Build Docker images
echo ""
echo "Step 2: Building Docker images..."
docker compose -f docker-compose.prod.yml build --no-cache
echo -e "${GREEN}✓${NC} Docker images built"

# Step 3: Stop existing containers
echo ""
echo "Step 3: Stopping existing containers..."
docker compose -f docker-compose.prod.yml down 2>/dev/null || true
echo -e "${GREEN}✓${NC} Existing containers stopped"

# Step 4: Start database and redis first
echo ""
echo "Step 4: Starting database services..."
docker compose -f docker-compose.prod.yml up -d postgres redis
echo "  Waiting for database to be ready..."
sleep 10
echo -e "${GREEN}✓${NC} Database services running"

# Step 5: Run database migrations
echo ""
echo "Step 5: Running database migrations..."
docker compose -f docker-compose.prod.yml run --rm api npx prisma migrate deploy
echo -e "${GREEN}✓${NC} Migrations applied"

# Step 6: Start application services
echo ""
echo "Step 6: Starting application services..."
docker compose -f docker-compose.prod.yml up -d app api
echo -e "${GREEN}✓${NC} Application services started"

# Step 7: Start nginx
echo ""
echo "Step 7: Starting nginx reverse proxy..."
docker compose -f docker-compose.prod.yml up -d nginx
echo -e "${GREEN}✓${NC} Nginx started"

# Step 8: Health checks
echo ""
echo "Step 8: Running health checks..."
sleep 10

# Check API health
API_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/api/health)
if [ "$API_HEALTH" = "200" ]; then
  echo -e "${GREEN}✓${NC} API health check passed"
else
  echo -e "${RED}✗${NC} API health check failed (HTTP $API_HEALTH)"
fi

# Check app health
APP_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/)
if [ "$APP_HEALTH" = "200" ]; then
  echo -e "${GREEN}✓${NC} App health check passed"
else
  echo -e "${RED}✗${NC} App health check failed (HTTP $APP_HEALTH)"
fi

# Summary
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                    Deployment Complete!                       ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  App URL:     ${NEXT_PUBLIC_APP_URL:-https://2bot.org}"
echo "║  API URL:     ${NEXT_PUBLIC_API_URL:-https://2bot.org/api}"
echo "║                                                               ║"
echo "║  Useful Commands:                                             ║"
echo "║  - View logs:     docker compose -f docker-compose.prod.yml logs -f  ║"
echo "║  - Stop all:      docker compose -f docker-compose.prod.yml down     ║"
echo "║  - Restart:       ./scripts/deploy/deploy.sh                  ║"
echo "╚══════════════════════════════════════════════════════════════╝"
