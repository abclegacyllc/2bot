# 🤖 AI-First Development Workflow

> **100% AI-Generated Codebase - Optimized for AI Pair Programming**

---

## 📖 How to Use This System

### Starting a New Session

**Tell AI:**
```
Read CURRENT-STATE.md first, then continue with the next task.
```

### The AI Will:
1. Read CURRENT-STATE.md to understand where we are
2. Read the relevant phase file (e.g., docs/tasks/phase-0-setup.md)
3. Execute the next task
4. Validate the task is complete
5. Update CURRENT-STATE.md

---

## 📁 Documentation Structure

```
/home/abcdev/projects/2bot/
├── CURRENT-STATE.md     ← AI READS THIS FIRST (current progress)
├── MVP.md               ← V1 scope definition (what we're building)
├── AI-WORKFLOW.md       ← THIS FILE (how we work)
├── ROADMAP.md           ← Full reference (V1+V2+V3, don't build all of it)
├── docs/
│   ├── ARCHITECTURE-RECOMMENDATIONS.md  ← AI Auditor architectural guidance
│   └── tasks/
│       ├── phase-0-setup.md         ← Project setup (15 tasks)
│       ├── phase-1-auth.md          ← Authentication (20 tasks)
│       ├── phase-1.5-architecture.md← Architecture Foundation (14 tasks) ⭐ NEW
│       ├── phase-2-gateway.md       ← Gateway system (15 tasks)
│       ├── phase-3-plugin.md        ← Plugin system (12 tasks)
│       ├── phase-4-billing.md       ← Billing + Workspace (15 tasks)
│       └── phase-5-launch.md        ← Polish + Launch (12 tasks)
```

> **Phase 1.5 Note:** Added based on AI Auditor architectural review.
> Prepares database schema, types, and patterns to prevent painful refactoring later.

---

## 🎯 Project Context

```yaml
Project: 2Bot Platform
Type: SaaS automation platform for Telegram + AI
Stack: Next.js 14 + TypeScript + Express + PostgreSQL + Redis + Docker
ORM: Prisma
UI: shadcn/ui + Tailwind CSS
Queue: BullMQ
Payments: Stripe
Pattern: Platform (shared) + Workspace containers (per-user)
```

---

## ✅ Task Execution Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  EVERY AI SESSION FOLLOWS THIS FLOW                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1️⃣  READ CONTEXT                                               │
│     └─ Read CURRENT-STATE.md                                    │
│     └─ Read the current phase file                              │
│     └─ Read any related source files                            │
│                                                                 │
│  2️⃣  UNDERSTAND TASK                                            │
│     └─ What are the deliverables?                               │
│     └─ What are the done criteria?                              │
│     └─ What files need to be created/modified?                  │
│                                                                 │
│  3️⃣  IMPLEMENT                                                  │
│     └─ Create/edit files                                        │
│     └─ Follow existing patterns                                 │
│     └─ Add proper error handling                                │
│     └─ Add types + validation                                   │
│                                                                 │
│  4️⃣  VALIDATE                                                   │
│     └─ Run the validation command                               │
│     └─ Check done criteria                                      │
│     └─ Fix any issues                                           │
│                                                                 │
│  5️⃣  UPDATE STATE                                               │
│     └─ Mark task complete in CURRENT-STATE.md                   │
│     └─ Note any decisions made                                  │
│     └─ Set next task                                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📝 Task Template

Each task in the phase files follows this format:

```markdown
### Task X.Y.Z: [Task Name]

**Session Type:** Backend | Frontend | Database | Config | Testing
**Estimated Time:** X minutes
**Prerequisites:** [What must be done first]

#### Context Files:
- [Files AI should read before starting]

#### Deliverables:
- [ ] [Specific file or feature to create]
- [ ] [Another deliverable]

#### Implementation Notes:
[Code snippets, patterns to follow, etc.]

#### Done Criteria:
- [ ] [How to verify this task is complete]
- [ ] [Another verification step]

#### Validation Command:
```bash
[Command to run to verify]
```
```

---

## 📏 Task Sizing Rules

| Size | Files | Time | Example |
|------|-------|------|---------|
| **XS** | 1 | 10 min | Fix typo, update config |
| **S** | 1-2 | 15 min | Add endpoint, new component |
| **M** | 2-4 | 25 min | New service, API + validation |
| **L** | 4-8 | 35 min | New module with routes |
| **XL** | 8+ | 45+ min | SPLIT INTO SMALLER TASKS |

**Rule:** If a task touches 8+ files, split it.

---

## 📁 Code Organization

```
src/
├── app/                    # Next.js pages (App Router)
│   ├── (auth)/            # Auth pages (login, register)
│   ├── (dashboard)/       # Protected dashboard pages
│   └── api/               # API routes (Next.js style, minimal)
├── components/
│   ├── ui/                # shadcn/ui components
│   ├── forms/             # Form components
│   └── layouts/           # Layout components
├── lib/                   # Core utilities
│   ├── prisma.ts          # Prisma client
│   ├── redis.ts           # Redis client
│   ├── stripe.ts          # Stripe client
│   └── utils.ts           # General utilities
├── modules/               # Feature modules (business logic)
│   ├── auth/
│   ├── user/
│   ├── gateway/
│   ├── plugin/
│   └── billing/
├── shared/
│   ├── types/             # Shared TypeScript types
│   ├── constants/         # App constants, plan limits
│   ├── errors/            # Error classes
│   └── middleware/        # Express middleware
└── server/                # Express API server
    ├── routes/            # Route definitions
    ├── middleware/        # Server middleware
    └── index.ts           # Server entry point
```

---

## 🏷️ Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Files | kebab-case | `user-service.ts` |
| Components | PascalCase | `UserProfile.tsx` |
| Functions | camelCase | `getUserById` |
| Constants | SCREAMING_SNAKE | `MAX_RETRIES` |
| Types | PascalCase | `UserResponse` |
| DB Tables | snake_case | `user_sessions` |
| Env Vars | SCREAMING_SNAKE | `DATABASE_URL` |

---

## ✅ Code Quality Checklist

Before completing ANY task, verify:

- [ ] Files in correct location per folder structure
- [ ] Follows existing patterns in codebase
- [ ] All inputs validated with Zod
- [ ] Errors use AppError class hierarchy
- [ ] Types are explicit (NO `any`)
- [ ] JSDoc on public functions
- [ ] Related files updated (routes, exports, types)
- [ ] No TypeScript errors
- [ ] No ESLint errors

---

## 🚫 AI Must NOT

1. ❌ Use `any` type (use `unknown` + type guards)
2. ❌ Skip validation on user inputs
3. ❌ Hardcode secrets or URLs
4. ❌ Create files outside defined structure
5. ❌ Modify files without showing changes
6. ❌ Assume requirements - ask if unclear
7. ❌ Make breaking changes without warning
8. ❌ Skip error handling
9. ❌ Use deprecated APIs
10. ❌ Leave TODO comments without tracking

---

## 🔄 Session Handoff Format

When ending a session, AI updates CURRENT-STATE.md with:

```markdown
**Last Updated:** [date]
**Last Session:** Task X.Y.Z - [name]
**Next Task:** Task X.Y.Z - [name]

## Completed This Session:
- [x] Task X.Y.Z - [description]
- [x] Task X.Y.Z - [description]

## Files Changed:
- created: [list]
- modified: [list]

## Decisions Made:
- [Any architectural or implementation decisions]

## Issues Encountered:
- [Any problems and how they were resolved]
```

---

## 📋 Prompt Templates

### Template 1: Continue Development
```
Read CURRENT-STATE.md first, then continue with the next task.
```

### Template 2: Specific Task
```
Read CURRENT-STATE.md, then complete task [X.Y.Z] from phase [N].
```

### Template 3: Fix Issue
```
There's an issue with [description]. 
Read CURRENT-STATE.md for context, then fix it.
The error is: [error message]
```

### Template 4: Review Code
```
Read CURRENT-STATE.md, then review [file/module] for:
- Security issues
- Performance problems
- Code quality
```

---

## 🎯 V1 MVP Summary

Building only these features (see MVP.md for details):

| ✅ V1 Include | ❌ V2 Defer |
|---------------|-------------|
| Email/password auth | OAuth providers |
| Telegram Bot gateway | Telegram MTProto |
| AI gateway (OpenAI) | Multiple AI providers |
| 1 Analytics plugin | Plugin marketplace |
| Basic dashboard | Widgets, themes |
| Stripe subscriptions | Credit system |
| User workspaces | Organizations |
| 2 plans (Free + Pro) | 5 plan tiers |

**Total: ~87 tasks across 6 phases**
**Estimated: 56-69 AI sessions**

---

## 🚀 Quick Start

1. **First Session:**
   ```
   Read CURRENT-STATE.md and start with task 0.1.1
   ```

2. **Subsequent Sessions:**
   ```
   Read CURRENT-STATE.md and continue with the next task
   ```

3. **After Each Task:**
   - AI validates the work
   - AI updates CURRENT-STATE.md
   - Ready for next session

---

*Let's build this! 🚀*
