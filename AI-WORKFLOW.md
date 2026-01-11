# AI-First Development Workflow
> Minimal guide for 100% AI-generated codebase

## 🎯 Project Context (AI Reads This First)

```yaml
Project: 2Bot Platform
Type: SaaS automation platform
Stack: Next.js 14 + Node.js + Express + PostgreSQL + Redis + Docker
Pattern: Modular monolith with isolated user workspaces
ORM: Prisma
UI: shadcn/ui + Tailwind CSS
Queue: BullMQ
Payments: Stripe
```

**Key Architecture Rule:** Platform layer (shared) + Docker containers (per-user workspace)

---

## 📋 Prompt Templates

### Template 1: New Feature
```
TASK: [Feature name]
TYPE: New Feature

DESCRIPTION:
[What should this feature do?]

LOCATION:
- Module: src/modules/[module-name]/
- Related: [any related files]

MUST FOLLOW:
- Check ROADMAP.md for specifications
- Use existing patterns from similar modules
- Add Zod validation for all inputs
- Add error handling with AppError class
- Include JSDoc comments

OUTPUT:
- List all files created/modified
- Explain key decisions
```

### Template 2: Bug Fix
```
TASK: Fix [bug description]
TYPE: Bug Fix

SYMPTOMS:
[What's happening wrong?]

EXPECTED:
[What should happen?]

LOCATION:
[File or module if known]

MUST:
- Find root cause first
- Minimal change to fix
- Don't break other things
- Add test if missing
```

### Template 3: Add New Module
```
TASK: Create [module-name] module
TYPE: New Module

PURPOSE:
[What does this module do?]

STRUCTURE REQUIRED:
src/modules/[module-name]/
├── [module-name].controller.ts
├── [module-name].service.ts
├── [module-name].repository.ts
├── [module-name].routes.ts
├── [module-name].validation.ts
├── [module-name].types.ts
├── dto/
│   ├── create-[entity].dto.ts
│   └── update-[entity].dto.ts
└── __tests__/
    └── [module-name].test.ts

MUST INCLUDE:
- Zod schemas for validation
- Proper error handling
- Repository pattern for DB
- Route registration in app
```

### Template 4: Database Change
```
TASK: [Database change description]
TYPE: Database Migration

CHANGES:
- [ ] New table: [name]
- [ ] New column: [table.column]
- [ ] Modify: [what]

MUST:
- Update prisma/schema.prisma
- Create migration with descriptive name
- Update related types
- Update affected repositories
```

---

## 📏 Task Sizing Guide

| Size | Example | OK for Single Request? |
|------|---------|----------------------|
| **XS** | Fix typo, update config value | ✅ Yes |
| **S** | Add validation, new endpoint | ✅ Yes |
| **M** | New service method, new DTO | ✅ Yes |
| **L** | New module with 3-5 files | ✅ Yes (use template) |
| **XL** | New feature spanning multiple modules | ⚠️ Split into L tasks |
| **XXL** | Entire phase from roadmap | ❌ Must split |

**Rule:** If task needs more than ~10 files, split it.

---

## 📁 Where Things Go

```
src/
├── config/          → Environment, constants
├── modules/         → Feature modules (auth, billing, bots, etc.)
├── shared/          → Reusable utilities, types, middleware
├── platform/        → Core platform services
└── workspace/       → User workspace container code
```

**Naming Conventions:**
- Files: `kebab-case.ts` (e.g., `user-service.ts`)
- Classes: `PascalCase` (e.g., `UserService`)
- Functions: `camelCase` (e.g., `getUserById`)
- Constants: `SCREAMING_SNAKE_CASE` (e.g., `MAX_RETRIES`)
- Database tables: `snake_case` (e.g., `user_sessions`)

---

## ✅ Before Completing Any Task

AI must verify:
- [ ] Files in correct location per folder structure
- [ ] Follows existing patterns in codebase
- [ ] All inputs validated with Zod
- [ ] Errors use AppError class
- [ ] Types are explicit (no `any`)
- [ ] JSDoc on public functions
- [ ] Related files updated (routes, exports, types)

---

## 🔄 Session Handoff

When ending a session, AI provides:
```
SESSION SUMMARY:
- Completed: [list]
- In Progress: [list with status]
- Blocked: [list with reason]
- Next Steps: [what to do next]

FILES CHANGED:
- created: [list]
- modified: [list]

CONTEXT FOR NEXT SESSION:
[Any important decisions or state]
```

---

## 🚫 AI Must NOT

1. Use `any` type (use `unknown` + type guards)
2. Skip validation on user inputs
3. Hardcode secrets or URLs
4. Create files outside defined structure
5. Modify files without showing changes
6. Assume - ask if unclear
7. Make breaking changes without warning

---

## 💡 Quick Commands for Human

```bash
# When starting new AI session, tell AI:
"Read AI-WORKFLOW.md and ROADMAP.md first, then [your task]"

# When AI seems lost:
"Check the folder structure in ROADMAP.md section X"

# When output is wrong pattern:
"Look at src/modules/auth/ for the correct pattern"

# When task is too big:
"Split this into smaller tasks and list them"
```

---

*Version: 1.0 | Keep this file updated as project evolves*
