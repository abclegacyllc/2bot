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

.PHONY: dev dev-infra dev-frontend dev-backend dev-all stop stop-all stop-dev stop-prod logs \
        start restart deploy \
        db-setup db-migrate db-seed db-reset db-studio db-generate \
        test test-watch test-coverage lint lint-fix format check typecheck \
        build build-frontend build-backend clean \
        prod-build prod-up prod-down prod-logs prod-restart prod-status \
        workspace-image proxy-image \
        deploy backup backup-source ssl-setup \
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

# Docker Compose with project name
DC := docker-compose -p 2bot

# ===========================================
# STATUS CHECKS
# ===========================================

check-ports:                ## Check if required ports are available
	@echo "$(CYAN)Checking port availability...$(RESET)"
	@for port_desc in "3000:Landing prod" "3001:Dashboard prod" "3002:Express API prod" "3005:Dashboard dev" "3006:Express API dev" "3007:Admin dev"; do \
		port=$${port_desc%%:*}; desc=$${port_desc#*:}; \
		if fuser $${port}/tcp >/dev/null 2>&1 || sudo -n fuser $${port}/tcp >/dev/null 2>&1; then \
			echo "$(YELLOW)⚠️  Port $$port is in use ($$desc)$(RESET)"; \
		else \
			echo "$(GREEN)✅ Port $$port is available ($$desc)$(RESET)"; \
		fi; \
	done
	@if fuser 5432/tcp >/dev/null 2>&1; then \
		echo "$(GREEN)✅ Port 5432 is in use (Postgres running)$(RESET)"; \
	else \
		echo "$(YELLOW)⚠️  Port 5432 is free (Postgres not running)$(RESET)"; \
	fi
	@if fuser 6379/tcp >/dev/null 2>&1; then \
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
	@$(DC) ps 2>/dev/null || echo "  No containers running"
	@echo ""
	@echo "$(CYAN)Node Processes:$(RESET)"
	@if pgrep -f "next-server" >/dev/null 2>&1; then \
		echo "  $(GREEN)✅ Next.js is running$(RESET)"; \
	else \
		echo "  $(YELLOW)○  Next.js is not running$(RESET)"; \
	fi
	@if pgrep -f "tsx.*server" >/dev/null 2>&1; then \
		echo "  $(GREEN)✅ Express API server is running$(RESET)"; \
	else \
		echo "  $(YELLOW)○  Express API server is not running$(RESET)"; \
	fi
	@echo ""
	@echo "$(CYAN)Port Status:$(RESET)"
	@make check-ports 2>/dev/null | grep -E "✅|⚠️|❌" | sed 's/^/  /'
	@echo ""

# ===========================================
# PRODUCTION (local process - no Docker)
# ===========================================

start: check-deps check-docker  ## Build and start production servers (no HMR, no auto-refresh)
	@echo "$(CYAN)Starting 2Bot in production mode...$(RESET)"
	@# Kill any stale processes on production ports (regular + root-owned)
	@for port in 3000 3001 3002; do \
		pids=$$(fuser $${port}/tcp 2>/dev/null || true); \
		if [ -n "$$pids" ]; then \
			echo "$(YELLOW)⚠️  Killing stale process(es) on port $$port: $$pids$(RESET)"; \
			kill -9 $$pids 2>/dev/null || true; \
			sleep 1; \
		fi; \
		if sudo -n fuser $${port}/tcp >/dev/null 2>&1; then \
			echo "$(YELLOW)⚠️  Root-owned process on port $$port — killing with sudo$(RESET)"; \
			sudo -n fuser -k $${port}/tcp 2>/dev/null || true; \
			sleep 1; \
		fi; \
	done
	@# Build workspace + proxy Docker images (ensures SDK changes are baked in)
	@echo "$(CYAN)Building workspace container image...$(RESET)"
	@docker build -t 2bot-workspace:latest -f docker/workspace/Dockerfile.workspace docker/workspace
	@echo "$(GREEN)✅ Workspace image built$(RESET)"
	@echo "$(CYAN)Building egress proxy image...$(RESET)"
	@docker build -t 2bot-proxy:latest -f docker/squid-proxy/Dockerfile.proxy docker/squid-proxy
	@echo "$(GREEN)✅ Proxy image built$(RESET)"
	@# Start infrastructure
	@make dev-infra
	@echo ""
	@# Build frontend for production
	@echo "$(CYAN)Building Next.js for production (this takes 2-3 minutes)...$(RESET)"
	@npm run build
	@echo "$(GREEN)✅ Next.js build complete$(RESET)"
	@echo ""
	@# Create log directory
	@mkdir -p /tmp/2bot-logs
	@echo "$(CYAN)Starting production servers in background...$(RESET)"
	@# Start landing/marketing site (port 3000 for www.2bot.org)
	@echo "Starting Landing site on port 3000..."
	@bash -c 'set -a; source .env.local 2>/dev/null; source .env.production 2>/dev/null; source .env 2>/dev/null; set +a; NODE_ENV=production nohup npx next start -p 3000 > /tmp/2bot-logs/landing.log 2>&1 & echo $$! > /tmp/2bot-logs/landing.pid'
	@# Wait for landing to start (up to 10 seconds)
	@for i in 1 2 3 4 5 6 7 8 9 10; do \
		if ss -tlnp 2>/dev/null | grep -q ":3000 "; then \
			break; \
		fi; \
		sleep 1; \
	done
	@# Verify landing started
	@if ss -tlnp 2>/dev/null | grep -q ":3000 "; then \
		echo "$(GREEN)✅ Landing site running on http://localhost:3000$(RESET)"; \
	else \
		echo "$(RED)❌ Landing site failed to start. Check /tmp/2bot-logs/landing.log$(RESET)"; \
		cat /tmp/2bot-logs/landing.log | tail -20; \
	fi
	@# Start backend (production mode, port 3002)
	@echo "Starting Express API server on port 3002..."
	@bash -c 'set -a; source .env.local 2>/dev/null; source .env.production 2>/dev/null; source .env 2>/dev/null; set +a; NODE_ENV=production SERVER_PORT=3002 nohup npx tsx src/server/start.ts > /tmp/2bot-logs/backend.log 2>&1 & echo $$! > /tmp/2bot-logs/backend.pid'
	@# Wait for backend to start (up to 20 seconds — includes bridge recovery + provider validation)
	@for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do \
		if ss -tlnp 2>/dev/null | grep -q ":3002 "; then \
			break; \
		fi; \
		sleep 1; \
	done
	@# Verify backend started
	@if ss -tlnp 2>/dev/null | grep -q ":3002 "; then \
		echo "$(GREEN)✅ Express API running on http://localhost:3002$(RESET)"; \
	else \
		echo "$(RED)❌ Express API failed to start. Check /tmp/2bot-logs/backend.log$(RESET)"; \
		cat /tmp/2bot-logs/backend.log | tail -20; \
		exit 1; \
	fi
	@# Start frontend in production mode (port 3001)
	@echo "Starting Next.js (production) on port 3001..."
	@bash -c 'set -a; source .env.local 2>/dev/null; source .env.production 2>/dev/null; source .env 2>/dev/null; set +a; NODE_ENV=production nohup npx next start -p 3001 > /tmp/2bot-logs/frontend.log 2>&1 & echo $$! > /tmp/2bot-logs/frontend.pid'
	@# Wait for frontend to start (up to 15 seconds)
	@for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do \
		if ss -tlnp 2>/dev/null | grep -q ":3001 "; then \
			break; \
		fi; \
		sleep 1; \
	done
	@# Verify frontend started
	@if ss -tlnp 2>/dev/null | grep -q ":3001 "; then \
		echo "$(GREEN)✅ Next.js (production) running on http://localhost:3001$(RESET)"; \
	else \
		echo "$(RED)❌ Next.js failed to start. Check /tmp/2bot-logs/frontend.log$(RESET)"; \
		cat /tmp/2bot-logs/frontend.log | tail -20; \
		exit 1; \
	fi
	@echo ""
	@echo "$(GREEN)🚀 Production environment started successfully!$(RESET)"
	@echo ""
	@echo "   Landing:   http://localhost:3000  → www.2bot.org"
	@echo "   Dashboard: http://localhost:3001  → dash.2bot.org"
	@echo "   API:       http://localhost:3002  → api.2bot.org"
	@echo "   Health:    http://localhost:3002/health"
	@echo ""
	@echo "$(CYAN)Note: Admin panel runs only in dev mode (make dev)$(RESET)"
	@echo ""
	@echo "   View logs:  make logs-dev"
	@echo "   Stop all:   make stop"
	@echo "   Restart:    make restart"

restart: stop-prod start    ## Rebuild and restart production servers (dev stays running)

deploy: restart              ## Alias for restart (build + deploy changes to production)

# ===========================================
# DEVELOPMENT
# ===========================================

dev: check-deps             ## Start dev environment on dev.2bot.org (ports 3005/3006/3007)
	@echo "$(CYAN)Starting 2Bot development environment...$(RESET)"
	@# Kill any stale processes on dev ports (regular + root-owned)
	@for port in 3005 3006 3007; do \
		pids=$$(fuser $${port}/tcp 2>/dev/null || true); \
		if [ -n "$$pids" ]; then \
			echo "$(YELLOW)⚠️  Killing stale process(es) on port $$port: $$pids$(RESET)"; \
			kill -9 $$pids 2>/dev/null || true; \
			sleep 1; \
		fi; \
		if sudo -n fuser $${port}/tcp >/dev/null 2>&1; then \
			echo "$(YELLOW)⚠️  Root-owned process on port $$port — killing with sudo$(RESET)"; \
			sudo -n fuser -k $${port}/tcp 2>/dev/null || true; \
			sleep 1; \
		fi; \
	done
	@# Start infrastructure first
	@make dev-infra
	@echo ""
	@# Create log directory
	@mkdir -p /tmp/2bot-logs
	@echo "$(CYAN)Starting dev servers in background...$(RESET)"
	@# Start dev backend (watch mode, port 3006) - serves ALL routes (user + admin)
	@echo "Starting Express API dev server on port 3006..."
	@bash -c 'set -a; source .env.local 2>/dev/null; source .env.development 2>/dev/null; source .env 2>/dev/null; set +a; NODE_ENV=development SERVER_PORT=3006 nohup npm run dev:server > /tmp/2bot-logs/dev-backend.log 2>&1 & echo $$! > /tmp/2bot-logs/dev-backend.pid'
	@# Wait for backend to start (up to 20 seconds — includes bridge recovery + provider validation)
	@for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do \
		if ss -tlnp 2>/dev/null | grep -q ":3006 "; then \
			break; \
		fi; \
		sleep 1; \
	done
	@# Verify backend started
	@if ss -tlnp 2>/dev/null | grep -q ":3006 "; then \
		echo "$(GREEN)✅ Express API (dev) running on http://localhost:3006$(RESET)"; \
	else \
		echo "$(RED)❌ Express API (dev) failed to start. Check /tmp/2bot-logs/dev-backend.log$(RESET)"; \
		cat /tmp/2bot-logs/dev-backend.log | tail -20; \
		exit 1; \
	fi
	@# Start dev frontend (port 3005) - serves dev.2bot.org
	@echo "Starting Next.js dev on port 3005..."
	@nohup npx next dev -p 3005 > /tmp/2bot-logs/dev-frontend.log 2>&1 & echo $$! > /tmp/2bot-logs/dev-frontend.pid
	@# Wait for frontend to start (up to 30 seconds - Next.js is slower)
	@for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30; do \
		if ss -tlnp 2>/dev/null | grep -q ":3005 "; then \
			break; \
		fi; \
		sleep 1; \
	done
	@# Verify frontend started
	@if ss -tlnp 2>/dev/null | grep -q ":3005 "; then \
		echo "$(GREEN)✅ Next.js (dev) running on http://localhost:3005$(RESET)"; \
	else \
		echo "$(RED)❌ Next.js (dev) failed to start. Check /tmp/2bot-logs/dev-frontend.log$(RESET)"; \
		cat /tmp/2bot-logs/dev-frontend.log | tail -20; \
		exit 1; \
	fi
	@# Start admin panel (port 3007) - separate instance with own build dir
	@echo "Starting Admin Panel on port 3007 (isolated instance)..."
	@NEXT_DIST_DIR=.next-admin nohup npx next dev -p 3007 > /tmp/2bot-logs/dev-admin.log 2>&1 & echo $$! > /tmp/2bot-logs/dev-admin.pid
	@# Wait for admin to start (up to 30 seconds)
	@for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30; do \
		if ss -tlnp 2>/dev/null | grep -q ":3007 "; then \
			break; \
		fi; \
		sleep 1; \
	done
	@# Verify admin started
	@if ss -tlnp 2>/dev/null | grep -q ":3007 "; then \
		echo "$(GREEN)✅ Admin Panel (dev) running on http://localhost:3007$(RESET)"; \
	else \
		echo "$(RED)❌ Admin Panel (dev) failed to start. Check /tmp/2bot-logs/dev-admin.log$(RESET)"; \
		cat /tmp/2bot-logs/dev-admin.log | tail -20; \
		exit 1; \
	fi
	@echo ""
	@echo "$(GREEN)🚀 Development environment started successfully!$(RESET)"
	@echo ""
	@echo "   Frontend: http://localhost:3005  → dev.2bot.org"
	@echo "   Admin:    http://localhost:3007  → admin.2bot.org (isolated)"
	@echo "   API:      http://localhost:3006  → dev-api.2bot.org (user + admin routes)"
	@echo "   Health:   http://localhost:3006/health"
	@echo ""
	@echo "   View logs:  make logs-dev"
	@echo "   Stop dev:   make stop-dev"

dev-fg: check-deps          ## Start dev environment in foreground (shows logs, Ctrl+C to stop)
	@echo "$(CYAN)Starting 2Bot development environment (foreground)...$(RESET)"
	@# Check if already running
	@if fuser 3005/tcp >/dev/null 2>&1 || fuser 3006/tcp >/dev/null 2>&1 || sudo -n fuser 3005/tcp >/dev/null 2>&1 || sudo -n fuser 3006/tcp >/dev/null 2>&1; then \
		echo "$(YELLOW)⚠️  Development servers are already running!$(RESET)"; \
		echo "Run 'make stop-dev' first."; \
		exit 1; \
	fi
	@# Start infrastructure first
	@make dev-infra
	@echo ""
	@echo "$(CYAN)Starting application servers...$(RESET)"
	@echo "$(YELLOW)Press Ctrl+C to stop all servers$(RESET)"
	@echo ""
	@# Run frontend and backend in parallel on dev ports
	@trap 'make stop-dev; exit 0' INT; \
	(npx next dev -p 3005 &) && (sleep 2 && SERVER_PORT=3006 npm run dev:server)

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
	@if $(DC) ps postgres 2>/dev/null | grep -q "Up"; then \
		echo "$(GREEN)✅ Postgres already running$(RESET)"; \
	else \
		echo "Starting Postgres..."; \
		$(DC) up -d postgres; \
	fi
	@if $(DC) ps redis 2>/dev/null | grep -q "Up"; then \
		echo "$(GREEN)✅ Redis already running$(RESET)"; \
	else \
		echo "Starting Redis..."; \
		$(DC) up -d redis; \
	fi
	@echo "$(CYAN)Waiting for services to be healthy...$(RESET)"
	@sleep 3
	@$(DC) ps

dev-frontend: check-deps    ## Start Next.js dev server only (port 3005)
	@if pgrep -f "next dev" >/dev/null 2>&1; then \
		echo "$(YELLOW)⚠️  Next.js dev is already running$(RESET)"; \
		echo "Run 'make stop-frontend' to stop it first."; \
		exit 1; \
	fi
	@if fuser 3005/tcp >/dev/null 2>&1 || sudo -n fuser 3005/tcp >/dev/null 2>&1; then \
		echo "$(RED)❌ Port 3005 is already in use by another process$(RESET)"; \
		ss -tlnp sport = :3005; \
		exit 1; \
	fi
	@echo "$(CYAN)Starting Next.js dev server on port 3005...$(RESET)"
	npx next dev -p 3005

dev-backend: check-deps     ## Start Express API dev server only (port 3006)
	@if pgrep -f "tsx watch.*server" >/dev/null 2>&1; then \
		echo "$(YELLOW)⚠️  Express API dev is already running$(RESET)"; \
		echo "Run 'make stop-backend' to stop it first."; \
		exit 1; \
	fi
	@if fuser 3006/tcp >/dev/null 2>&1 || sudo -n fuser 3006/tcp >/dev/null 2>&1; then \
		echo "$(RED)❌ Port 3006 is already in use by another process$(RESET)"; \
		ss -tlnp sport = :3006; \
		exit 1; \
	fi
	@echo "$(CYAN)Starting Express API dev server on port 3006...$(RESET)"
	SERVER_PORT=3006 npm run dev:server

stop:                       ## Stop all services (dev and production)
	@echo "$(CYAN)Stopping all services...$(RESET)"
	@# Helper: kill a PID and ALL its descendants (children, grandchildren, etc.)
	@# tsx watch spawns child node processes that survive if only the parent is killed
	@kill_tree() { \
		local pid=$$1; \
		local descendants=$$(pstree -p "$$pid" 2>/dev/null | grep -oP '\(\K[0-9]+' || true); \
		if [ -n "$$descendants" ]; then \
			kill -9 $$descendants 2>/dev/null || true; \
		fi; \
	}; \
	for pidfile in \
		/tmp/2bot-logs/landing.pid \
		/tmp/2bot-logs/frontend.pid \
		/tmp/2bot-logs/backend.pid \
		/tmp/2bot-logs/dev-frontend.pid \
		/tmp/2bot-logs/dev-backend.pid \
		/tmp/2bot-logs/dev-admin.pid; do \
		if [ -f "$$pidfile" ]; then \
			pid=$$(cat "$$pidfile" 2>/dev/null); \
			if [ -n "$$pid" ] && kill -0 "$$pid" 2>/dev/null; then \
				kill_tree "$$pid"; \
			fi; \
			rm -f "$$pidfile"; \
		fi; \
	done
	@echo "Stopped servers from PID files"
	@# Step 2: Port sweep — catch any orphans on ALL app ports (use fuser, works for IPv4+IPv6)
	@for port in 3000 3001 3002 3005 3006 3007; do \
		pids=$$(fuser $${port}/tcp 2>/dev/null || true); \
		if [ -n "$$pids" ]; then \
			echo "Killing orphaned process(es) on port $$port:$$pids"; \
			kill -9 $$pids 2>/dev/null || true; \
		fi; \
	done
	@sleep 1
	@# Step 3: Escalate with sudo for root-owned processes that survived
	@needs_sudo=""; \
	for port in 3000 3001 3002 3005 3006 3007; do \
		if sudo -n fuser $${port}/tcp >/dev/null 2>&1; then \
			needs_sudo="$$needs_sudo $$port"; \
		fi; \
	done; \
	if [ -n "$$needs_sudo" ]; then \
		echo "$(YELLOW)Root-owned processes detected on:$$needs_sudo — escalating with sudo$(RESET)"; \
		for port in $$needs_sudo; do \
			sudo -n fuser -k $${port}/tcp 2>/dev/null || true; \
		done; \
		sleep 1; \
	fi
	@# Step 4: Kill zombie node/tsx processes that lost their ports but still hold Redis connections
	@my_pgid=$$(ps -o pgid= -p $$$$ 2>/dev/null | tr -d ' '); \
	zombies=""; \
	for pid in $$(pgrep -f 'tsx watch src/server/start.ts' 2>/dev/null || true); do \
		pgid=$$(ps -o pgid= -p $$pid 2>/dev/null | tr -d ' '); \
		if [ "$$pgid" != "$$my_pgid" ]; then zombies="$$zombies $$pid"; fi; \
	done; \
	if [ -n "$$zombies" ]; then \
		echo "Killing zombie tsx watch processes:$$zombies"; \
		echo "$$zombies" | xargs kill -9 2>/dev/null || true; \
	fi
	@# Step 5: Verify all ports are free
	@remaining=""; \
	for port in 3000 3001 3002 3005 3006 3007; do \
		if sudo -n fuser $${port}/tcp >/dev/null 2>&1; then \
			remaining="$$remaining $$port"; \
		fi; \
	done; \
	if [ -n "$$remaining" ]; then \
		echo "$(YELLOW)⚠️  Ports still in use:$$remaining$(RESET)"; \
	else \
		echo "$(GREEN)✅ All application servers stopped$(RESET)"; \
	fi
	@# Step 6: Clear stale bridge leases from Redis (killed servers can't release them gracefully)
	@leases=$$(docker exec 2bot-redis redis-cli --no-auth-warning KEYS 'bridge:lease:*' 2>/dev/null | head -20); \
	if [ -n "$$leases" ]; then \
		echo "Clearing stale bridge leases from Redis..."; \
		echo "$$leases" | xargs docker exec -i 2bot-redis redis-cli --no-auth-warning DEL 2>/dev/null || true; \
	fi

stop-dev:                   ## Stop only dev servers (ports 3005/3006/3007)
	@echo "$(CYAN)Stopping dev services...$(RESET)"
	@kill_tree() { \
		local pid=$$1; \
		local descendants=$$(pstree -p "$$pid" 2>/dev/null | grep -oP '\(\K[0-9]+' || true); \
		if [ -n "$$descendants" ]; then kill -9 $$descendants 2>/dev/null || true; fi; \
	}; \
	for pidfile in /tmp/2bot-logs/dev-frontend.pid /tmp/2bot-logs/dev-backend.pid /tmp/2bot-logs/dev-admin.pid; do \
		if [ -f "$$pidfile" ]; then \
			pid=$$(cat "$$pidfile" 2>/dev/null); \
			if [ -n "$$pid" ] && kill -0 "$$pid" 2>/dev/null; then \
				kill_tree "$$pid"; \
			fi; \
			rm -f "$$pidfile"; \
		fi; \
	done
	@for port in 3005 3006 3007; do \
		pids=$$(fuser $${port}/tcp 2>/dev/null || true); \
		if [ -n "$$pids" ]; then kill -9 $$pids 2>/dev/null || true; fi; \
	done
	@sleep 1
	@# Escalate with sudo if root-owned processes survive
	@for port in 3005 3006 3007; do \
		if sudo -n fuser $${port}/tcp >/dev/null 2>&1; then \
			echo "$(YELLOW)Root-owned process on port $$port — killing with sudo$(RESET)"; \
			sudo -n fuser -k $${port}/tcp 2>/dev/null || true; \
		fi; \
	done
	@echo "$(GREEN)✅ Dev servers stopped$(RESET)"

stop-prod:                  ## Stop only production servers (ports 3000/3001/3002)
	@echo "$(CYAN)Stopping production services...$(RESET)"
	@# Kill by PID files first (with full process tree)
	@kill_tree() { \
		local pid=$$1; \
		local descendants=$$(pstree -p "$$pid" 2>/dev/null | grep -oP '\(\K[0-9]+' || true); \
		if [ -n "$$descendants" ]; then kill -9 $$descendants 2>/dev/null || true; fi; \
	}; \
	for pidfile in /tmp/2bot-logs/landing.pid /tmp/2bot-logs/frontend.pid /tmp/2bot-logs/backend.pid; do \
		if [ -f "$$pidfile" ]; then \
			pid=$$(cat "$$pidfile" 2>/dev/null); \
			if [ -n "$$pid" ] && kill -0 "$$pid" 2>/dev/null; then \
				kill_tree "$$pid"; \
			fi; \
			rm -f "$$pidfile"; \
		fi; \
	done
	@for port in 3000 3001 3002; do \
		pids=$$(fuser $${port}/tcp 2>/dev/null || true); \
		if [ -n "$$pids" ]; then \
			echo "Killing orphaned process(es) on port $$port..."; \
			kill -9 $$pids 2>/dev/null || true; \
		fi; \
	done
	@sleep 1
	@# Escalate with sudo if root-owned processes survive
	@for port in 3000 3001 3002; do \
		if sudo -n fuser $${port}/tcp >/dev/null 2>&1; then \
			echo "$(YELLOW)Root-owned process on port $$port — killing with sudo$(RESET)"; \
			sudo -n fuser -k $${port}/tcp 2>/dev/null || true; \
		fi; \
	done
	@echo "$(GREEN)✅ Production servers stopped$(RESET)"

stop-all: stop              ## Stop everything including Docker containers
	@echo "$(CYAN)Stopping Docker containers...$(RESET)"
	$(DC) down
	@echo "$(GREEN)✅ All services stopped$(RESET)"

stop-frontend:              ## Stop only Next.js (dev or production)
	@if pgrep -f "next dev" >/dev/null 2>&1 || pgrep -f "next start" >/dev/null 2>&1 || pgrep -f "next-server" >/dev/null 2>&1; then \
		pkill -f "next dev" 2>/dev/null || true; \
		pkill -f "next start" 2>/dev/null || true; \
		pkill -f "next-server" 2>/dev/null || true; \
		echo "$(GREEN)✅ Next.js stopped$(RESET)"; \
	else \
		echo "$(YELLOW)Next.js is not running$(RESET)"; \
	fi

stop-backend:               ## Stop only Express API (dev or production)
	@if pgrep -f "tsx watch" >/dev/null 2>&1 || pgrep -f "tsx.*server" >/dev/null 2>&1; then \
		pkill -f "tsx watch" 2>/dev/null || true; \
		pkill -f "tsx.*server" 2>/dev/null || true; \
		echo "$(GREEN)✅ Express API stopped$(RESET)"; \
	else \
		echo "$(YELLOW)Express API is not running$(RESET)"; \
	fi

logs:                       ## View Docker container logs
	$(DC) logs -f

# ===========================================
# DATABASE
# ===========================================

db-setup: check-deps        ## First-time database setup (generate + push + seed)
	@echo "$(CYAN)Setting up database...$(RESET)"
	@# Check if Postgres is running
	@if ! $(DC) ps postgres 2>/dev/null | grep -q "Up"; then \
		echo "$(YELLOW)Postgres not running. Starting...$(RESET)"; \
		make dev-infra; \
		sleep 3; \
	fi
	npm run db:generate
	npm run db:push
	npm run db:seed
	@echo "$(GREEN)✅ Database setup complete$(RESET)"

db-migrate: check-deps      ## Run database migrations
	@if ! $(DC) ps postgres 2>/dev/null | grep -q "Up"; then \
		echo "$(RED)❌ Postgres is not running. Run 'make dev-infra' first.$(RESET)"; \
		exit 1; \
	fi
	npm run db:migrate

db-generate:                ## Generate Prisma client
	npm run db:generate

db-seed: check-deps         ## Seed database with initial data
	@if ! $(DC) ps postgres 2>/dev/null | grep -q "Up"; then \
		echo "$(RED)❌ Postgres is not running. Run 'make dev-infra' first.$(RESET)"; \
		exit 1; \
	fi
	npm run db:seed

db-reset: check-deps        ## Reset database (drop + recreate + seed)
	@echo "$(YELLOW)⚠️  This will DELETE all data in the database!$(RESET)"
	@read -p "Are you sure? [y/N] " confirm && [ "$$confirm" = "y" ] || exit 1
	@if ! $(DC) ps postgres 2>/dev/null | grep -q "Up"; then \
		echo "$(YELLOW)Postgres not running. Starting...$(RESET)"; \
		make dev-infra; \
		sleep 3; \
	fi
	npx prisma migrate reset --force
	@echo "$(GREEN)✅ Database reset complete$(RESET)"

db-studio: check-deps       ## Open Prisma Studio (database GUI)
	@if ! $(DC) ps postgres 2>/dev/null | grep -q "Up"; then \
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

clean:                      ## Clean all build caches for a fresh build (keeps DB, source, node_modules)
	@echo "$(CYAN)Cleaning build artifacts and caches...$(RESET)"
	@echo ""
	@# Next.js build output + dev cache (both main and admin instances)
	@rm -rf .next .next-admin
	@echo "  Removed .next/ .next-admin/"
	@# TypeScript incremental build info
	@rm -f tsconfig.tsbuildinfo
	@echo "  Removed tsconfig.tsbuildinfo"
	@# Compiled server output
	@rm -rf dist
	@echo "  Removed dist/"
	@# Test coverage reports
	@rm -rf coverage
	@echo "  Removed coverage/"
	@# Node module caches (eslint, babel, turbopack, etc.)
	@rm -rf node_modules/.cache
	@echo "  Removed node_modules/.cache/"
	@# Server log files (not needed for builds, can grow large)
	@rm -f /tmp/2bot-logs/*.log
	@echo "  Removed /tmp/2bot-logs/*.log"
	@# Stale PID files
	@rm -f /tmp/2bot-logs/*.pid
	@echo "  Removed stale PID files"
	@# ESLint / Prettier caches
	@rm -f .eslintcache .prettiercache
	@echo ""
	@echo "$(GREEN)✅ Clean complete — ready for fresh build$(RESET)"
	@echo "$(CYAN)  Run 'make dev' or 'make start' to rebuild$(RESET)"

clean-all: clean            ## Clean everything including node_modules
	@echo "$(YELLOW)⚠️  This will remove node_modules!$(RESET)"
	@read -p "Are you sure? [y/N] " confirm && [ "$$confirm" = "y" ] || exit 1
	rm -rf node_modules
	@echo "$(GREEN)✅ Full clean complete. Run 'make install' to reinstall.$(RESET)"

# ===========================================
# DOCKER PRODUCTION (full-container deployment)
# ===========================================

workspace-image: check-docker ## Build workspace container image (for plugin isolation)
	@echo "$(CYAN)Building workspace container image...$(RESET)"
	docker build -t 2bot-workspace:latest -f docker/workspace/Dockerfile.workspace docker/workspace
	@echo "$(GREEN)✅ Workspace image built: 2bot-workspace:latest$(RESET)"

proxy-image: check-docker   ## Build egress proxy image (Squid forward proxy for workspaces)
	@echo "$(CYAN)Building egress proxy image...$(RESET)"
	docker build -t 2bot-proxy:latest -f docker/squid-proxy/Dockerfile.proxy docker/squid-proxy
	@echo "$(GREEN)✅ Proxy image built: 2bot-proxy:latest$(RESET)"

prod-build: check-docker    ## Build production Docker images (includes workspace)
	@echo "$(CYAN)Building production Docker images...$(RESET)"
	docker compose build
	@echo "$(CYAN)Building workspace image...$(RESET)"
	docker build -t 2bot-workspace:latest -f docker/workspace/Dockerfile.workspace docker/workspace
	@echo "$(CYAN)Building proxy image...$(RESET)"
	docker build -t 2bot-proxy:latest -f docker/squid-proxy/Dockerfile.proxy docker/squid-proxy
	@echo "$(GREEN)✅ Production images built$(RESET)"

prod-up: check-docker       ## Start production stack (Docker)
	@echo "$(CYAN)Starting production stack...$(RESET)"
	@if docker compose ps 2>/dev/null | grep -q "Up"; then \
		echo "$(YELLOW)⚠️  Production stack is already running$(RESET)"; \
		docker compose ps; \
		exit 0; \
	fi
	docker compose up -d
	@echo "$(GREEN)✅ Production stack started$(RESET)"
	@make prod-status

prod-down:                  ## Stop production stack (Docker)
	@echo "$(CYAN)Stopping production stack...$(RESET)"
	docker compose down
	@echo "$(GREEN)✅ Production stack stopped$(RESET)"

prod-logs:                  ## View production logs (follow mode)
	docker compose logs -f

prod-restart: prod-down prod-up  ## Restart production stack (Docker)

prod-status:                ## Check production stack status
	@echo "$(CYAN)Production Stack Status:$(RESET)"
	@echo ""
	docker compose ps
	@echo ""
	@echo "$(CYAN)Health Checks:$(RESET)"
	@curl -sf http://localhost:3001/ >/dev/null 2>&1 && \
		echo "  $(GREEN)✅ Dashboard (3001): Healthy$(RESET)" || \
		echo "  $(RED)❌ Dashboard (3001): Not responding$(RESET)"
	@curl -sf http://localhost:3002/health >/dev/null 2>&1 && \
		echo "  $(GREEN)✅ API (3002): Healthy$(RESET)" || \
		echo "  $(RED)❌ API (3002): Not responding$(RESET)"

# ===========================================
# DOCKER DEPLOYMENT (full-container mode)
# ===========================================

docker-deploy: check-docker ## Full Docker deployment (pull + build + migrate + up)
	@echo "$(CYAN)Starting Docker deployment...$(RESET)"
	@echo "$(YELLOW)⚠️  This will update production!$(RESET)"
	@read -p "Are you sure? [y/N] " confirm && [ "$$confirm" = "y" ] || exit 1
	@echo "$(CYAN)Step 1/5: Pulling latest code...$(RESET)"
	git pull
	@echo "$(CYAN)Step 2/5: Building containers (this may take a few minutes)...$(RESET)"
	docker compose build
	@echo "$(CYAN)Step 3/5: Starting database services...$(RESET)"
	docker compose up -d postgres redis
	@sleep 5
	@echo "$(CYAN)Step 4/5: Running database migrations...$(RESET)"
	docker compose run --rm api npx prisma migrate deploy || echo "$(YELLOW)⚠️  Migration skipped (may need db push)$(RESET)"
	@echo "$(CYAN)Step 5/5: Starting all services...$(RESET)"
	docker compose up -d
	@echo "$(GREEN)✅ Docker deployment complete$(RESET)"
	@make prod-status

docker-deploy-quick: check-docker ## Quick Docker deploy (no build, just restart)
	@echo "$(CYAN)Quick deploy - restarting services...$(RESET)"
	docker compose up -d
	@make prod-status

backup:                     ## Backup database
	@echo "$(CYAN)Running database backup...$(RESET)"
	@if [ -f "./scripts/deploy/backup.sh" ]; then \
		./scripts/deploy/backup.sh; \
	else \
		echo "$(RED)❌ Backup script not found$(RESET)"; \
		exit 1; \
	fi

backup-source:              ## Backup source code (protects against git reset / accidental loss)
	@./scripts/deploy/backup-source.sh

ssl-setup:                  ## Setup SSL certificates
	@echo "$(CYAN)Setting up SSL...$(RESET)"
	@if [ -f "./scripts/deploy/setup-ssl.sh" ]; then \
		./scripts/deploy/setup-ssl.sh; \
	else \
		echo "$(RED)❌ SSL setup script not found$(RESET)"; \
		exit 1; \
	fi

setup-nginx:                ## Setup nginx: symlinks site config + gateway map, adds sudoers for reload
	@echo "$(CYAN)Setting up nginx configuration...$(RESET)"
	@# 1. Symlink main site config (if not already done)
	@if [ ! -L /etc/nginx/sites-enabled/2bot.conf ] || \
	   [ "$$(readlink -f /etc/nginx/sites-enabled/2bot.conf)" != "$$(readlink -f nginx/2bot.conf)" ]; then \
		echo "  Linking nginx/2bot.conf → /etc/nginx/sites-enabled/"; \
		sudo ln -sf "$$(pwd)/nginx/2bot.conf" /etc/nginx/sites-enabled/2bot.conf; \
	else \
		echo "  $(GREEN)✅ Site config already linked$(RESET)"; \
	fi
	@# 2. Symlink gateway-routes.map (webhook routing)
	@if [ ! -L /etc/nginx/conf.d/gateway-routes.map ] || \
	   [ "$$(readlink -f /etc/nginx/conf.d/gateway-routes.map)" != "$$(readlink -f nginx/gateway-routes.map)" ]; then \
		echo "  Linking nginx/gateway-routes.map → /etc/nginx/conf.d/"; \
		sudo ln -sf "$$(pwd)/nginx/gateway-routes.map" /etc/nginx/conf.d/gateway-routes.map; \
	else \
		echo "  $(GREEN)✅ Gateway routes map already linked$(RESET)"; \
	fi
	@# 3. Add passwordless sudo for nginx reload (required by gateway-route.service)
	@if [ ! -f /etc/sudoers.d/2bot-nginx ]; then \
		echo "  Adding sudoers entry for passwordless nginx reload"; \
		echo "$$(whoami) ALL=(root) NOPASSWD: /usr/sbin/nginx -s reload" | sudo tee /etc/sudoers.d/2bot-nginx > /dev/null; \
		sudo chmod 440 /etc/sudoers.d/2bot-nginx; \
	else \
		echo "  $(GREEN)✅ Sudoers entry already exists$(RESET)"; \
	fi
	@# 4. Validate and reload
	@sudo nginx -t && sudo nginx -s reload
	@echo "$(GREEN)✅ nginx setup complete$(RESET)"

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
	@if ! $(DC) ps postgres 2>/dev/null | grep -q "Up"; then \
		echo "$(RED)❌ Postgres is not running. Run 'make dev-infra' first.$(RESET)"; \
		exit 1; \
	fi
	$(DC) exec postgres psql -U postgres -d twobot

shell-redis:                ## Open Redis CLI
	@if ! $(DC) ps redis 2>/dev/null | grep -q "Up"; then \
		echo "$(RED)❌ Redis is not running. Run 'make dev-infra' first.$(RESET)"; \
		exit 1; \
	fi
	$(DC) exec redis redis-cli

health:                     ## Quick health check of all services
	@echo "$(CYAN)Health Check:$(RESET)"
	@curl -sf http://localhost:3000/ >/dev/null 2>&1 && \
		echo "  $(GREEN)✅ Frontend: OK$(RESET)" || \
		echo "  $(RED)❌ Frontend: DOWN$(RESET)"
	@curl -sf http://localhost:3001/health >/dev/null 2>&1 && \
		echo "  $(GREEN)✅ API: OK$(RESET)" || \
		echo "  $(RED)❌ API: DOWN$(RESET)"
	@$(DC) exec -T postgres pg_isready -U postgres >/dev/null 2>&1 && \
		echo "  $(GREEN)✅ Postgres: OK$(RESET)" || \
		echo "  $(RED)❌ Postgres: DOWN$(RESET)"
	@$(DC) exec -T redis redis-cli ping >/dev/null 2>&1 && \
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
