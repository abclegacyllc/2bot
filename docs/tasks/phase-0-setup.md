# Phase 0: Project Setup

> **Goal:** Set up the complete development environment and project foundation
> **Estimated Sessions:** 8-10
> **Prerequisites:** None (this is the first phase)

---

## 📋 Task Overview

| ID | Task | Status | Session |
|----|------|--------|---------|
| 0.1.1 | Initialize Next.js project | ✅ | 2026-01-12 |
| 0.1.2 | Configure TypeScript strictly | ✅ | 2026-01-12 |
| 0.1.3 | Setup Tailwind + shadcn/ui | ✅ | 2026-01-12 |
| 0.1.4 | Configure ESLint + Prettier | ✅ | 2026-01-12 |
| 0.2.1 | Create Docker Compose (Postgres + Redis) | ✅ | 2026-01-12 |
| 0.2.2 | Initialize Prisma + base schema | ✅ | 2026-01-12 |
| 0.2.3 | Create seed script structure | ✅ | 2026-01-12 |
| 0.3.1 | Create folder structure | ✅ | 2026-01-12 |
| 0.3.2 | Setup path aliases | ✅ | 2026-01-12 |
| 0.3.3 | Create base types + constants | ✅ | 2026-01-12 |
| 0.4.1 | Setup Express API structure | ✅ | 2026-01-12 |
| 0.4.2 | Create error handling system | ✅ | 2026-01-12 |
| 0.4.3 | Setup logging (Pino) | ✅ | 2026-01-12 |
| 0.4.4 | Create health check endpoints | ✅ | 2026-01-12 |
| 0.5.1 | Verify full setup works | ✅ | 2026-01-12 |

---

## 📝 Detailed Tasks

### Task 0.1.1: Initialize Next.js Project

**Session Type:** Setup
**Estimated Time:** 15-20 minutes
**Prerequisites:** Node.js 20+, pnpm installed

#### Context Files:
- None (fresh start)

#### Deliverables:
- [ ] Next.js 14 project with App Router
- [ ] TypeScript enabled
- [ ] package.json with correct scripts
- [ ] .gitignore configured

#### Commands to Run:
```bash
pnpm create next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
```

#### Done Criteria:
- [ ] `pnpm dev` starts without errors
- [ ] http://localhost:3000 shows Next.js page
- [ ] No TypeScript errors

#### Validation:
```bash
pnpm dev
# Visit http://localhost:3000
```

---

### Task 0.1.2: Configure TypeScript Strictly

**Session Type:** Config
**Estimated Time:** 10-15 minutes
**Prerequisites:** Task 0.1.1 complete

#### Context Files:
- tsconfig.json

#### Deliverables:
- [ ] Strict TypeScript configuration
- [ ] Path aliases configured
- [ ] Separate tsconfig for different concerns

#### Changes to Make:
```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

#### Done Criteria:
- [ ] `pnpm build` succeeds
- [ ] Strict mode catches type errors
- [ ] Path aliases work (@/ imports)

---

### Task 0.1.3: Setup Tailwind + shadcn/ui

**Session Type:** Setup
**Estimated Time:** 15-20 minutes
**Prerequisites:** Task 0.1.2 complete

#### Context Files:
- tailwind.config.ts
- src/app/globals.css

#### Deliverables:
- [ ] shadcn/ui initialized
- [ ] Base components installed (button, card, input, form)
- [ ] Theme variables configured
- [ ] Dark mode support

#### Commands to Run:
```bash
pnpm dlx shadcn@latest init
pnpm dlx shadcn@latest add button card input form label
```

#### Done Criteria:
- [ ] Can import Button from @/components/ui/button
- [ ] Dark mode toggle works
- [ ] No styling conflicts

---

### Task 0.1.4: Configure ESLint + Prettier

**Session Type:** Config
**Estimated Time:** 10-15 minutes
**Prerequisites:** Task 0.1.3 complete

#### Context Files:
- .eslintrc.json
- package.json

#### Deliverables:
- [ ] ESLint with strict rules
- [ ] Prettier configured
- [ ] Pre-commit hooks (optional)
- [ ] VS Code settings

#### Done Criteria:
- [ ] `pnpm lint` runs without errors
- [ ] `pnpm format` formats code
- [ ] ESLint catches common issues

---

### Task 0.2.1: Create Docker Compose (Postgres + Redis)

**Session Type:** Infrastructure
**Estimated Time:** 15-20 minutes
**Prerequisites:** Docker installed

#### Context Files:
- None (creating new)

#### Deliverables:
- [ ] docker-compose.yml with Postgres 15 + Redis 7
- [ ] .env.example with database URLs
- [ ] .env.local (gitignored)
- [ ] Healthchecks configured

#### docker-compose.yml structure:
```yaml
services:
  postgres:
    image: postgres:15-alpine
    ports: ["5432:5432"]
    environment: [...]
    volumes: [...]
    healthcheck: [...]
  
  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
    healthcheck: [...]
```

#### Done Criteria:
- [ ] `docker compose up -d` starts both services
- [ ] Can connect to Postgres on localhost:5432
- [ ] Can connect to Redis on localhost:6379

#### Validation:
```bash
docker compose up -d
docker compose ps  # Both healthy
psql -h localhost -U postgres -c "SELECT 1"
redis-cli ping
```

---

### Task 0.2.2: Initialize Prisma + Base Schema

**Session Type:** Database
**Estimated Time:** 20-30 minutes
**Prerequisites:** Task 0.2.1 complete

#### Context Files:
- package.json
- .env.local

#### Deliverables:
- [ ] Prisma installed and initialized
- [ ] Base schema with User model
- [ ] Initial migration created
- [ ] Prisma client generated

#### Schema (minimal for setup):
```prisma
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

#### Done Criteria:
- [ ] `pnpm prisma db push` succeeds
- [ ] `pnpm prisma studio` shows User table
- [ ] Can import PrismaClient

#### Validation:
```bash
pnpm prisma db push
pnpm prisma studio
```

---

### Task 0.2.3: Create Seed Script Structure

**Session Type:** Database
**Estimated Time:** 10-15 minutes
**Prerequisites:** Task 0.2.2 complete

#### Context Files:
- prisma/schema.prisma
- package.json

#### Deliverables:
- [ ] prisma/seed.ts file
- [ ] Seed script in package.json
- [ ] Basic test user seed

#### Done Criteria:
- [ ] `pnpm prisma db seed` works
- [ ] Test user created in database

---

### Task 0.3.1: Create Folder Structure

**Session Type:** Setup
**Estimated Time:** 15-20 minutes
**Prerequisites:** Task 0.1.4 complete

#### Deliverables:
- [ ] Full folder structure created
- [ ] Index files for exports
- [ ] README in key folders

#### Structure to Create:
```
src/
├── app/                    # Next.js pages
│   ├── (auth)/            # Auth group
│   ├── (dashboard)/       # Dashboard group
│   └── api/               # API routes
├── components/
│   ├── ui/                # shadcn components
│   ├── forms/             # Form components
│   └── layouts/           # Layout components
├── lib/                   # Utilities
│   ├── prisma.ts
│   ├── redis.ts
│   └── utils.ts
├── modules/               # Feature modules
│   ├── auth/
│   ├── user/
│   ├── gateway/
│   ├── plugin/
│   └── billing/
├── shared/
│   ├── types/
│   ├── constants/
│   ├── errors/
│   └── middleware/
└── server/                # Express API
    ├── routes/
    ├── middleware/
    └── index.ts
```

#### Done Criteria:
- [ ] All folders exist
- [ ] No import errors
- [ ] Structure matches plan

---

### Task 0.3.2: Setup Path Aliases

**Session Type:** Config
**Estimated Time:** 10 minutes
**Prerequisites:** Task 0.3.1 complete

#### Context Files:
- tsconfig.json

#### Deliverables:
- [ ] Path aliases for all major folders
- [ ] Working imports

#### Aliases:
```json
{
  "paths": {
    "@/*": ["./src/*"],
    "@/components/*": ["./src/components/*"],
    "@/lib/*": ["./src/lib/*"],
    "@/modules/*": ["./src/modules/*"],
    "@/shared/*": ["./src/shared/*"],
    "@/server/*": ["./src/server/*"]
  }
}
```

#### Done Criteria:
- [ ] Can import from @/lib/utils
- [ ] Can import from @/modules/auth
- [ ] VS Code resolves paths

---

### Task 0.3.3: Create Base Types + Constants

**Session Type:** Code
**Estimated Time:** 20-25 minutes
**Prerequisites:** Task 0.3.2 complete

#### Deliverables:
- [ ] src/shared/types/index.ts - Base types
- [ ] src/shared/constants/index.ts - App constants
- [ ] src/shared/constants/plans.ts - Plan definitions
- [ ] src/shared/constants/limits.ts - Resource limits

#### Types to Create:
```typescript
// API Response types
type ApiResponse<T>
type ApiError
type PaginatedResponse<T>

// Plan types
type PlanType = 'FREE' | 'PRO'
type Plan = { name, price, limits }
```

#### Done Criteria:
- [ ] Types importable from @/shared/types
- [ ] Constants importable from @/shared/constants
- [ ] No TypeScript errors

---

### Task 0.4.1: Setup Express API Structure

**Session Type:** Backend
**Estimated Time:** 25-30 minutes
**Prerequisites:** Task 0.3.3 complete

#### Deliverables:
- [ ] Express app setup in src/server/
- [ ] Base middleware (cors, json, etc.)
- [ ] Router structure
- [ ] API runs alongside Next.js

#### Files to Create:
```
src/server/
├── index.ts           # Express app setup
├── routes/
│   └── index.ts       # Route registration
└── middleware/
    ├── cors.ts
    ├── error-handler.ts
    └── rate-limit.ts
```

#### Done Criteria:
- [ ] GET /api/health returns { status: 'ok' }
- [ ] CORS configured
- [ ] JSON parsing works

---

### Task 0.4.2: Create Error Handling System

**Session Type:** Backend
**Estimated Time:** 20-25 minutes
**Prerequisites:** Task 0.4.1 complete

#### Deliverables:
- [ ] AppError base class
- [ ] Specific error classes (ValidationError, AuthError, etc.)
- [ ] Error handler middleware
- [ ] Standard error response format

#### Error Classes:
```typescript
class AppError extends Error
class ValidationError extends AppError
class AuthenticationError extends AppError
class AuthorizationError extends AppError
class NotFoundError extends AppError
class ConflictError extends AppError
class RateLimitError extends AppError
```

#### Done Criteria:
- [ ] Errors have proper status codes
- [ ] Error response format consistent
- [ ] Stack traces hidden in production

---

### Task 0.4.3: Setup Logging (Pino)

**Session Type:** Backend
**Estimated Time:** 15-20 minutes
**Prerequisites:** Task 0.4.2 complete

#### Deliverables:
- [ ] Pino logger configured
- [ ] Request logging middleware
- [ ] Log levels per environment
- [ ] Sensitive data redaction

#### Done Criteria:
- [ ] Logs appear in console (dev)
- [ ] JSON format (prod)
- [ ] Passwords/tokens redacted

---

### Task 0.4.4: Create Health Check Endpoints

**Session Type:** Backend
**Estimated Time:** 15 minutes
**Prerequisites:** Task 0.4.3 complete

#### Deliverables:
- [ ] GET /api/health - Basic health
- [ ] GET /api/health/ready - Readiness (DB + Redis)
- [ ] GET /api/health/live - Liveness

#### Done Criteria:
- [ ] /health returns 200 when app running
- [ ] /health/ready checks DB connection
- [ ] /health/live returns quickly

---

### Task 0.5.1: Verify Full Setup

**Session Type:** Verification
**Estimated Time:** 15-20 minutes
**Prerequisites:** All Phase 0 tasks complete

#### Verification Checklist:
- [ ] `pnpm dev` starts Next.js
- [ ] `docker compose up -d` starts DB + Redis
- [ ] http://localhost:3000 loads
- [ ] GET /api/health returns 200
- [ ] GET /api/health/ready returns 200
- [ ] Prisma Studio shows tables
- [ ] No TypeScript errors
- [ ] No ESLint errors

#### Commands:
```bash
docker compose up -d
pnpm dev
curl http://localhost:3000/api/health
curl http://localhost:3000/api/health/ready
pnpm prisma studio
pnpm lint
pnpm build
```

#### Done Criteria:
- [ ] All checks pass
- [ ] Ready for Phase 1

---

## ✅ Phase 0 Completion Checklist

- [ ] Next.js running
- [ ] TypeScript strict mode
- [ ] shadcn/ui working
- [ ] Docker Compose with Postgres + Redis
- [ ] Prisma connected and migrated
- [ ] Folder structure created
- [ ] Error handling system
- [ ] Logging configured
- [ ] Health endpoints working
- [ ] All tests pass

**When complete:** Update CURRENT-STATE.md and proceed to Phase 1
