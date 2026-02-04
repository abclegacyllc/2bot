# ===========================================
# 2Bot Platform - Makefile
# ===========================================
# Run `make help` to see all available commands
#
# Quick Start:
#   make install    # Install dependencies
#   make db-setup   # Setup database (first time)
#   make dev        # Start full dev environment
#
# ===========================================

.PHONY: dev dev-infra dev-frontend dev-backend dev-all stop stop-all logs \
        db-setup db-migrate db-seed db-reset db-studio db-generate \
        test test-watch test-coverage lint lint-fix format check typecheck \
        build build-frontend build-backend clean \
        prod-build prod-up prod-down prod-logs prod-restart prod-status \
        deploy backup ssl-setup \
        install update health status shell-db shell-redis help \
        check-ports check-docker check-deps

# Colors for output
CYAN := \033[36m
GREEN := \033[32m
YELLOW := \033[33m
RED := \033[31m
RESET := \033[0m

# Default target
.DEFAULT_GOAL := help

# ===========================================
# STATUS CHECKS
# ===========================================

check-ports:                ## Check if required ports are available
	@echo "$(CYAN)Checking port availability...$(RESET)"
	@if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null 2>&1; then \
		echo "$(YELLOW)⚠️  Port 3000 is in use (Next.js)$(RESET)"; \
		lsof -Pi :3000 -sTCP:LISTEN | head -3; \
	else \
		echo "$(GREEN)✅ Port 3000 is available$(RESET)"; \
	fi
	@if lsof -Pi :3001 -sTCP:LISTEN -t >/dev/null 2>&1; then \
		echo "$(YELLOW)⚠️  Port 3001 is in use (Express API)$(RESET)"; \
		lsof -Pi :3001 -sTCP:LISTEN | head -3; \
	else \
		echo "$(GREEN)✅ Port 3001 is available$(RESET)"; \
	fi
	@if lsof -Pi :5432 -sTCP:LISTEN -t >/dev/null 2>&1; then \
		echo "$(GREEN)✅ Port 5432 is in use (Postgres running)$(RESET)"; \
	else \
		echo "$(YELLOW)⚠️  Port 5432 is free (Postgres not running)$(RESET)"; \
	fi
	@if lsof -Pi :6379 -sTCP:LISTEN -t >/dev/null 2>&1; then \
		echo "$(GREEN)✅ Port 6379 is in use (Redis running)$(RESET)"; \
	else \
		echo "$(YELLOW)⚠️  Port 6379 is free (Redis not running)$(RESET)"; \
	fi

check-docker:               ## Check Docker status
	@echo "$(CYAN)Checking Docker status...$(RESET)"
	@if ! docker info >/dev/null 2>&1; then \
		echo "$(RED)❌ Docker is not running! Please start Docker first.$(RESET)"; \
		exit 1; \
	else \
		echo "$(GREEN)✅ Docker is running$(RESET)"; \
	fi

check-deps:                 ## Check if dependencies are installed
	@echo "$(CYAN)Checking dependencies...$(RESET)"
	@if [ ! -d "node_modules" ]; then \
		echo "$(RED)❌ node_modules not found. Run 'make install' first.$(RESET)"; \
		exit 1; \
	else \
		echo "$(GREEN)✅ Dependencies installed$(RESET)"; \
	fi

status:                     ## Show status of all services
	@echo ""
	@echo "$(CYAN)═══════════════════════════════════════$(RESET)"
	@echo "$(CYAN)       2Bot Platform Status$(RESET)"
	@echo "$(CYAN)═══════════════════════════════════════$(RESET)"
	@echo ""
	@echo "$(CYAN)Docker Containers:$(RESET)"
	@docker-compose ps 2>/dev/null || echo "  No containers running"
	@echo ""
	@echo "$(CYAN)Node Processes:$(RESET)"
	@if pgrep -f "next dev" >/dev/null 2>&1; then \
		echo "  $(GREEN)✅ Next.js dev server is running$(RESET)"; \
	else \
		echo "  $(YELLOW)○  Next.js dev server is not running$(RESET)"; \
	fi
	@if pgrep -f "tsx watch.*server" >/dev/null 2>&1; then \
		echo "  $(GREEN)✅ Express API server is running$(RESET)"; \
	else \
		echo "  $(YELLOW)○  Express API server is not running$(RESET)"; \
	fi
	@echo ""
	@echo "$(CYAN)Port Status:$(RESET)"
	@make check-ports 2>/dev/null | grep -E "✅|⚠️|❌" | sed 's/^/  /'
	@echo ""

# ===========================================
# DEVELOPMENT
# ===========================================

dev: check-deps             ## Start full dev environment (infra + frontend + backend in background)
	@echo "$(CYAN)Starting 2Bot development environment...$(RESET)"
	@# Check if already running
	@if ss -tlnp 2>/dev/null | grep -q ":3000 " && ss -tlnp 2>/dev/null | grep -q ":3001 "; then \
		echo "$(YELLOW)⚠️  Development servers are already running!$(RESET)"; \
		echo "   Frontend: http://localhost:3000"; \
		echo "   Backend:  http://localhost:3001"; \
		echo "Run 'make status' to check or 'make stop' to stop them."; \
		exit 0; \
	fi
	@# Start infrastructure first
	@make dev-infra
	@echo ""
	@# Create log directory
	@mkdir -p /tmp/2bot-logs
	@echo "$(CYAN)Starting application servers in background...$(RESET)"
	@# Start backend first (it's faster)
	@echo "Starting Express API server..."
	@nohup npm run dev:server > /tmp/2bot-logs/backend.log 2>&1 & echo $$! > /tmp/2bot-logs/backend.pid
	@# Wait for backend to start (up to 10 seconds)
	@for i in 1 2 3 4 5 6 7 8 9 10; do \
		if ss -tlnp 2>/dev/null | grep -q ":3001 "; then \
			break; \
		fi; \
		sleep 1; \
	done
	@# Verify backend started
	@if ss -tlnp 2>/dev/null | grep -q ":3001 "; then \
		echo "$(GREEN)✅ Express API running on http://localhost:3001$(RESET)"; \
	else \
		echo "$(RED)❌ Express API failed to start. Check /tmp/2bot-logs/backend.log$(RESET)"; \
		cat /tmp/2bot-logs/backend.log | tail -20; \
		exit 1; \
	fi
	@# Start frontend
	@echo "Starting Next.js..."
	@nohup npm run dev > /tmp/2bot-logs/frontend.log 2>&1 & echo $$! > /tmp/2bot-logs/frontend.pid
	@# Wait for frontend to start (up to 30 seconds - Next.js is slower)
	@for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30; do \
		if ss -tlnp 2>/dev/null | grep -q ":3000 "; then \
			break; \
		fi; \
		sleep 1; \
	done
	@# Verify frontend started
	@if ss -tlnp 2>/dev/null | grep -q ":3000 "; then \
		echo "$(GREEN)✅ Next.js running on http://localhost:3000$(RESET)"; \
	else \
		echo "$(RED)❌ Next.js failed to start. Check /tmp/2bot-logs/frontend.log$(RESET)"; \
		cat /tmp/2bot-logs/frontend.log | tail -20; \
		exit 1; \
	fi
	@echo ""
	@echo "$(GREEN)🚀 Development environment started successfully!$(RESET)"
	@echo ""
	@echo "   Frontend: http://localhost:3000"
	@echo "   Backend:  http://localhost:3001"
	@echo "   Health:   http://localhost:3001/health"
	@echo ""
	@echo "   View logs:  make logs-dev"
	@echo "   Stop all:   make stop"

dev-fg: check-deps          ## Start dev environment in foreground (shows logs, Ctrl+C to stop)
	@echo "$(CYAN)Starting 2Bot development environment (foreground)...$(RESET)"
	@# Check if already running
	@if lsof -ti:3000 >/dev/null 2>&1 || lsof -ti:3001 >/dev/null 2>&1; then \
		echo "$(YELLOW)⚠️  Development servers are already running!$(RESET)"; \
		echo "Run 'make stop' first."; \
		exit 1; \
	fi
	@# Start infrastructure first
	@make dev-infra
	@echo ""
	@echo "$(CYAN)Starting application servers...$(RESET)"
	@echo "$(YELLOW)Press Ctrl+C to stop all servers$(RESET)"
	@echo ""
	@# Run frontend and backend in parallel
	@trap 'make stop; exit 0' INT; \
	(npm run dev &) && (sleep 2 && npm run dev:server)

logs-dev:                   ## View development server logs (frontend and backend)
	@echo "$(CYAN)=== Backend Logs (last 50 lines) ===$(RESET)"
	@tail -50 /tmp/2bot-logs/backend.log 2>/dev/null || echo "No backend logs found"
	@echo ""
	@echo "$(CYAN)=== Frontend Logs (last 50 lines) ===$(RESET)"
	@tail -50 /tmp/2bot-logs/frontend.log 2>/dev/null || echo "No frontend logs found"

logs-dev-follow:            ## Follow development server logs in real-time
	@echo "$(CYAN)Following dev server logs (Ctrl+C to stop)...$(RESET)"
	@tail -f /tmp/2bot-logs/backend.log /tmp/2bot-logs/frontend.log 2>/dev/null || echo "No log files found"

dev-infra: check-docker     ## Start Postgres + Redis (if not running)
	@echo "$(CYAN)Starting infrastructure...$(RESET)"
	@if docker-compose ps postgres 2>/dev/null | grep -q "Up"; then \
		echo "$(GREEN)✅ Postgres already running$(RESET)"; \
	else \
		echo "Starting Postgres..."; \
		docker-compose up -d postgres; \
	fi
	@if docker-compose ps redis 2>/dev/null | grep -q "Up"; then \
		echo "$(GREEN)✅ Redis already running$(RESET)"; \
	else \
		echo "Starting Redis..."; \
		docker-compose up -d redis; \
	fi
	@echo "$(CYAN)Waiting for services to be healthy...$(RESET)"
	@sleep 3
	@docker-compose ps

dev-frontend: check-deps    ## Start Next.js dev server only
	@if pgrep -f "next dev" >/dev/null 2>&1; then \
		echo "$(YELLOW)⚠️  Next.js is already running on port 3000$(RESET)"; \
		echo "Run 'make stop-frontend' to stop it first."; \
		exit 1; \
	fi
	@if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null 2>&1; then \
		echo "$(RED)❌ Port 3000 is already in use by another process$(RESET)"; \
		lsof -Pi :3000 -sTCP:LISTEN; \
		exit 1; \
	fi
	@echo "$(CYAN)Starting Next.js dev server on port 3000...$(RESET)"
	npm run dev

dev-backend: check-deps     ## Start Express API server only
	@if pgrep -f "tsx watch.*server" >/dev/null 2>&1; then \
		echo "$(YELLOW)⚠️  Express API is already running on port 3001$(RESET)"; \
		echo "Run 'make stop-backend' to stop it first."; \
		exit 1; \
	fi
	@if lsof -Pi :3001 -sTCP:LISTEN -t >/dev/null 2>&1; then \
		echo "$(RED)❌ Port 3001 is already in use by another process$(RESET)"; \
		lsof -Pi :3001 -sTCP:LISTEN; \
		exit 1; \
	fi
	@echo "$(CYAN)Starting Express API server on port 3001...$(RESET)"
	npm run dev:server

stop:                       ## Stop all development services
	@echo "$(CYAN)Stopping all services...$(RESET)"
	@# Get current shell PID to avoid killing ourselves
	@current_pid=$$$$; \
	stopped_next=false; \
	stopped_tsx=false; \
	for pid in $$(pgrep -f "next-server" 2>/dev/null || true); do \
		if [ "$$pid" != "$$current_pid" ] && [ -n "$$pid" ]; then \
			kill -9 $$pid 2>/dev/null || true; \
			stopped_next=true; \
		fi; \
	done; \
	for pid in $$(pgrep -f "next dev" 2>/dev/null || true); do \
		if [ "$$pid" != "$$current_pid" ] && [ -n "$$pid" ]; then \
			kill -9 $$pid 2>/dev/null || true; \
			stopped_next=true; \
		fi; \
	done; \
	if [ "$$stopped_next" = "true" ]; then \
		echo "Stopped Next.js"; \
	fi; \
	for pid in $$(pgrep -f "tsx watch" 2>/dev/null || true); do \
		if [ "$$pid" != "$$current_pid" ] && [ -n "$$pid" ]; then \
			kill -9 $$pid 2>/dev/null || true; \
			stopped_tsx=true; \
		fi; \
	done; \
	for pid in $$(pgrep -f "tsx.*server" 2>/dev/null || true); do \
		if [ "$$pid" != "$$current_pid" ] && [ -n "$$pid" ]; then \
			kill -9 $$pid 2>/dev/null || true; \
			stopped_tsx=true; \
		fi; \
	done; \
	if [ "$$stopped_tsx" = "true" ]; then \
		echo "Stopped Express API"; \
	fi; \
	for port in 3000 3001; do \
		for pid in $$(lsof -ti:$$port 2>/dev/null || true); do \
			if [ "$$pid" != "$$current_pid" ] && [ -n "$$pid" ]; then \
				echo "Killing orphaned process $$pid on port $$port..."; \
				kill -9 $$pid 2>/dev/null || true; \
			fi; \
		done; \
	done; \
	sleep 1
	@if lsof -ti:3000 >/dev/null 2>&1 || lsof -ti:3001 >/dev/null 2>&1; then \
		echo "$(YELLOW)⚠️  Some processes may still be running on ports 3000/3001$(RESET)"; \
	else \
		echo "$(GREEN)✅ Application servers stopped$(RESET)"; \
	fi

stop-all: stop              ## Stop everything including Docker containers
	@echo "$(CYAN)Stopping Docker containers...$(RESET)"
	docker-compose down
	@echo "$(GREEN)✅ All services stopped$(RESET)"

stop-frontend:              ## Stop only Next.js
	@if pgrep -f "next dev" >/dev/null 2>&1; then \
		pkill -f "next dev"; \
		echo "$(GREEN)✅ Next.js stopped$(RESET)"; \
	else \
		echo "$(YELLOW)Next.js is not running$(RESET)"; \
	fi

stop-backend:               ## Stop only Express API
	@if pgrep -f "tsx watch" >/dev/null 2>&1; then \
		pkill -f "tsx watch"; \
		echo "$(GREEN)✅ Express API stopped$(RESET)"; \
	else \
		echo "$(YELLOW)Express API is not running$(RESET)"; \
	fi

logs:                       ## View Docker container logs
	docker-compose logs -f

# ===========================================
# DATABASE
# ===========================================

db-setup: check-deps        ## First-time database setup (generate + push + seed)
	@echo "$(CYAN)Setting up database...$(RESET)"
	@# Check if Postgres is running
	@if ! docker-compose ps postgres 2>/dev/null | grep -q "Up"; then \
		echo "$(YELLOW)Postgres not running. Starting...$(RESET)"; \
		make dev-infra; \
		sleep 3; \
	fi
	npm run db:generate
	npm run db:push
	npm run db:seed
	@echo "$(GREEN)✅ Database setup complete$(RESET)"

db-migrate: check-deps      ## Run database migrations
	@if ! docker-compose ps postgres 2>/dev/null | grep -q "Up"; then \
		echo "$(RED)❌ Postgres is not running. Run 'make dev-infra' first.$(RESET)"; \
		exit 1; \
	fi
	npm run db:migrate

db-generate:                ## Generate Prisma client
	npm run db:generate

db-seed: check-deps         ## Seed database with initial data
	@if ! docker-compose ps postgres 2>/dev/null | grep -q "Up"; then \
		echo "$(RED)❌ Postgres is not running. Run 'make dev-infra' first.$(RESET)"; \
		exit 1; \
	fi
	npm run db:seed

db-reset: check-deps        ## Reset database (drop + recreate + seed)
	@echo "$(YELLOW)⚠️  This will DELETE all data in the database!$(RESET)"
	@read -p "Are you sure? [y/N] " confirm && [ "$$confirm" = "y" ] || exit 1
	@if ! docker-compose ps postgres 2>/dev/null | grep -q "Up"; then \
		echo "$(YELLOW)Postgres not running. Starting...$(RESET)"; \
		make dev-infra; \
		sleep 3; \
	fi
	npx prisma migrate reset --force
	@echo "$(GREEN)✅ Database reset complete$(RESET)"

db-studio: check-deps       ## Open Prisma Studio (database GUI)
	@if ! docker-compose ps postgres 2>/dev/null | grep -q "Up"; then \
		echo "$(RED)❌ Postgres is not running. Run 'make dev-infra' first.$(RESET)"; \
		exit 1; \
	fi
	npm run db:studio

# ===========================================
# TESTING & QUALITY
# ===========================================

test: check-deps            ## Run unit tests (fast, mocked)
	npm run test:run

test-watch: check-deps      ## Run tests in watch mode
	npm run test

test-coverage: check-deps   ## Run tests with coverage report
	npm run test:coverage

test-integration: check-deps db-test-setup  ## Run integration tests (real test DB)
	@echo "$(CYAN)Running integration tests with test database...$(RESET)"
	npm run test:integration

test-all: test test-integration  ## Run all tests (unit + integration)
	@echo "$(GREEN)✅ All tests completed$(RESET)"

db-test-setup:              ## Setup test database (run once)
	@echo "$(CYAN)Setting up test database...$(RESET)"
	@if [ ! -f .env.test ]; then \
		echo "$(YELLOW)Creating .env.test from .env.test.example...$(RESET)"; \
		cp .env.test.example .env.test; \
		echo "$(YELLOW)⚠️  Please edit .env.test and set TEST_DATABASE_URL$(RESET)"; \
		echo "$(YELLOW)   Example: postgresql://user:pass@localhost:5432/2bot_test$(RESET)"; \
		exit 1; \
	fi
	@echo "$(GREEN)✅ Test database configuration found$(RESET)"
	@echo "$(CYAN)Creating test database schema...$(RESET)"
	@DATABASE_URL=$$(grep TEST_DATABASE_URL .env.test | cut -d '=' -f2) npx prisma db push --skip-generate
	@echo "$(GREEN)✅ Test database ready$(RESET)"

db-test-reset:              ## Reset test database (clean slate)
	@echo "$(YELLOW)⚠️  This will DELETE all data in the test database!$(RESET)"
	@read -p "Continue? (y/N): " confirm; \
	if [ "$$confirm" = "y" ] || [ "$$confirm" = "Y" ]; then \
		DATABASE_URL=$$(grep TEST_DATABASE_URL .env.test | cut -d '=' -f2) npx prisma db push --force-reset --skip-generate; \
		echo "$(GREEN)✅ Test database reset$(RESET)"; \
	else \
		echo "$(RED)Cancelled$(RESET)"; \
	fi

lint: check-deps            ## Run ESLint
	npm run lint

lint-fix: check-deps        ## Fix ESLint issues automatically
	npm run lint:fix

format: check-deps          ## Format code with Prettier
	npm run format

format-check: check-deps    ## Check code formatting
	npm run format:check

typecheck: check-deps       ## Run TypeScript type checking
	npx tsc --noEmit

check: lint format-check typecheck test  ## Full code quality check (lint + format + types + test)
	@echo "$(GREEN)✅ All checks passed$(RESET)"

# ===========================================
# BUILD
# ===========================================

build: check-deps build-frontend build-backend  ## Build all (frontend + backend)
	@echo "$(GREEN)✅ Build complete$(RESET)"

build-frontend: check-deps  ## Build Next.js for production
	@echo "$(CYAN)Building Next.js...$(RESET)"
	npm run build

build-backend: check-deps   ## Build Express API for production
	@echo "$(CYAN)Building Express API...$(RESET)"
	npm run build:server

clean:                      ## Clean all build artifacts
	@echo "$(CYAN)Cleaning build artifacts...$(RESET)"
	rm -rf .next dist coverage node_modules/.cache
	@echo "$(GREEN)✅ Clean complete$(RESET)"

clean-all: clean            ## Clean everything including node_modules
	@echo "$(YELLOW)⚠️  This will remove node_modules!$(RESET)"
	@read -p "Are you sure? [y/N] " confirm && [ "$$confirm" = "y" ] || exit 1
	rm -rf node_modules
	@echo "$(GREEN)✅ Full clean complete. Run 'make install' to reinstall.$(RESET)"

# ===========================================
# PRODUCTION
# ===========================================

prod-build: check-docker    ## Build production Docker images
	@echo "$(CYAN)Building production Docker images...$(RESET)"
	docker-compose -f docker-compose.prod.yml build
	@echo "$(GREEN)✅ Production images built$(RESET)"

prod-up: check-docker       ## Start production stack
	@echo "$(CYAN)Starting production stack...$(RESET)"
	@if docker-compose -f docker-compose.prod.yml ps 2>/dev/null | grep -q "Up"; then \
		echo "$(YELLOW)⚠️  Production stack is already running$(RESET)"; \
		docker-compose -f docker-compose.prod.yml ps; \
		exit 0; \
	fi
	docker-compose -f docker-compose.prod.yml up -d
	@echo "$(GREEN)✅ Production stack started$(RESET)"
	@make prod-status

prod-down:                  ## Stop production stack
	@echo "$(CYAN)Stopping production stack...$(RESET)"
	docker-compose -f docker-compose.prod.yml down
	@echo "$(GREEN)✅ Production stack stopped$(RESET)"

prod-logs:                  ## View production logs (follow mode)
	docker-compose -f docker-compose.prod.yml logs -f

prod-restart: prod-down prod-up  ## Restart production stack

prod-status:                ## Check production stack status
	@echo "$(CYAN)Production Stack Status:$(RESET)"
	@echo ""
	docker-compose -f docker-compose.prod.yml ps
	@echo ""
	@echo "$(CYAN)Health Checks:$(RESET)"
	@curl -sf http://localhost:3000/ >/dev/null 2>&1 && \
		echo "  $(GREEN)✅ Frontend (3000): Healthy$(RESET)" || \
		echo "  $(RED)❌ Frontend (3000): Not responding$(RESET)"
	@curl -sf http://localhost:3001/health >/dev/null 2>&1 && \
		echo "  $(GREEN)✅ API (3001): Healthy$(RESET)" || \
		echo "  $(RED)❌ API (3001): Not responding$(RESET)"

# ===========================================
# DEPLOYMENT
# ===========================================

deploy: check-docker        ## Full deployment (pull + build + migrate + up)
	@echo "$(CYAN)Starting deployment...$(RESET)"
	@echo "$(YELLOW)⚠️  This will update production!$(RESET)"
	@read -p "Are you sure? [y/N] " confirm && [ "$$confirm" = "y" ] || exit 1
	@echo "$(CYAN)Step 1/5: Pulling latest code...$(RESET)"
	git pull
	@echo "$(CYAN)Step 2/5: Building containers (this may take a few minutes)...$(RESET)"
	docker-compose -f docker-compose.prod.yml --env-file .env.production build
	@echo "$(CYAN)Step 3/5: Starting database services...$(RESET)"
	docker-compose -f docker-compose.prod.yml --env-file .env.production up -d postgres redis
	@sleep 5
	@echo "$(CYAN)Step 4/5: Running database migrations...$(RESET)"
	docker-compose -f docker-compose.prod.yml --env-file .env.production run --rm api npx prisma migrate deploy || echo "$(YELLOW)⚠️  Migration skipped (may need db push)$(RESET)"
	@echo "$(CYAN)Step 5/5: Starting all services...$(RESET)"
	docker-compose -f docker-compose.prod.yml --env-file .env.production up -d
	@echo "$(GREEN)✅ Deployment complete$(RESET)"
	@make prod-status

deploy-quick: check-docker  ## Quick deploy (no build, just restart)
	@echo "$(CYAN)Quick deploy - restarting services...$(RESET)"
	docker-compose -f docker-compose.prod.yml --env-file .env.production up -d
	@make prod-status

backup:                     ## Backup database
	@echo "$(CYAN)Running database backup...$(RESET)"
	@if [ -f "./scripts/deploy/backup.sh" ]; then \
		./scripts/deploy/backup.sh; \
	else \
		echo "$(RED)❌ Backup script not found$(RESET)"; \
		exit 1; \
	fi

ssl-setup:                  ## Setup SSL certificates
	@echo "$(CYAN)Setting up SSL...$(RESET)"
	@if [ -f "./scripts/deploy/setup-ssl.sh" ]; then \
		./scripts/deploy/setup-ssl.sh; \
	else \
		echo "$(RED)❌ SSL setup script not found$(RESET)"; \
		exit 1; \
	fi

# ===========================================
# UTILITIES
# ===========================================

install:                    ## Install all dependencies
	@echo "$(CYAN)Installing dependencies...$(RESET)"
	npm install
	@echo "$(GREEN)✅ Dependencies installed$(RESET)"

update:                     ## Update dependencies
	npm update

shell-db:                   ## Open PostgreSQL shell
	@if ! docker-compose ps postgres 2>/dev/null | grep -q "Up"; then \
		echo "$(RED)❌ Postgres is not running. Run 'make dev-infra' first.$(RESET)"; \
		exit 1; \
	fi
	docker-compose exec postgres psql -U postgres -d twobot

shell-redis:                ## Open Redis CLI
	@if ! docker-compose ps redis 2>/dev/null | grep -q "Up"; then \
		echo "$(RED)❌ Redis is not running. Run 'make dev-infra' first.$(RESET)"; \
		exit 1; \
	fi
	docker-compose exec redis redis-cli

health:                     ## Quick health check of all services
	@echo "$(CYAN)Health Check:$(RESET)"
	@curl -sf http://localhost:3000/ >/dev/null 2>&1 && \
		echo "  $(GREEN)✅ Frontend: OK$(RESET)" || \
		echo "  $(RED)❌ Frontend: DOWN$(RESET)"
	@curl -sf http://localhost:3001/health >/dev/null 2>&1 && \
		echo "  $(GREEN)✅ API: OK$(RESET)" || \
		echo "  $(RED)❌ API: DOWN$(RESET)"
	@docker-compose exec -T postgres pg_isready -U postgres >/dev/null 2>&1 && \
		echo "  $(GREEN)✅ Postgres: OK$(RESET)" || \
		echo "  $(RED)❌ Postgres: DOWN$(RESET)"
	@docker-compose exec -T redis redis-cli ping >/dev/null 2>&1 && \
		echo "  $(GREEN)✅ Redis: OK$(RESET)" || \
		echo "  $(RED)❌ Redis: DOWN$(RESET)"

# ===========================================
# SMOKE TESTS
# ===========================================

smoke-test:                 ## Run smoke test for development environment
	@echo "$(CYAN)Running Phase 6.9 smoke test (dev mode)...$(RESET)"
	@./scripts/smoke-test-6.9.sh dev

smoke-test-prod:            ## Run smoke test for production environment
	@echo "$(CYAN)Running Phase 6.9 smoke test (production mode)...$(RESET)"
	@if [ -z "$$TOKEN" ]; then \
		echo "$(YELLOW)Note: Set TOKEN env var for auth tests: TOKEN=<jwt> make smoke-test-prod$(RESET)"; \
	fi
	@./scripts/smoke-test-6.9.sh prod

smoke-test-auth:            ## Run smoke test with auth (requires TOKEN env var)
	@if [ -z "$$TOKEN" ]; then \
		echo "$(RED)❌ TOKEN environment variable is required$(RESET)"; \
		echo "Usage: TOKEN=<your-jwt-token> make smoke-test-auth"; \
		exit 1; \
	fi
	@./scripts/smoke-test-6.9.sh dev

# ===========================================
# HELP
# ===========================================

help:                       ## Show this help message
	@echo ""
	@echo "$(CYAN)═══════════════════════════════════════════════════════════$(RESET)"
	@echo "$(CYAN)                   2Bot Platform Commands$(RESET)"
	@echo "$(CYAN)═══════════════════════════════════════════════════════════$(RESET)"
	@echo ""
	@echo "$(GREEN)Quick Start:$(RESET)"
	@echo "  make install      Install dependencies"
	@echo "  make dev-infra    Start Postgres + Redis"
	@echo "  make db-setup     Setup database (first time)"
	@echo "  make dev          Start full dev environment"
	@echo ""
	@echo "$(YELLOW)Available Commands:$(RESET)"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  $(CYAN)%-18s$(RESET) %s\n", $$1, $$2}'
	@echo ""
