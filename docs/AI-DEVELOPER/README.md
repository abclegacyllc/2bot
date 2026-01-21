# AI Developer Template System

> **Universal templates for AI agents to implement tasks from phase documents**
> **Version:** 1.0

---

## Overview

This system guides AI agents through implementing tasks defined in phase documents. Templates are designed to be followed sequentially (F → G → H → I) for each task.

---

## Template Index

| Section | File | Purpose | When |
|---------|------|---------|------|
| F | [section-f-understand.md](TEMPLATES/section-f-understand.md) | Understand the task | Before coding |
| G | [section-g-implement.md](TEMPLATES/section-g-implement.md) | Write the code | During coding |
| H | [section-h-verify.md](TEMPLATES/section-h-verify.md) | Test and validate | After coding |
| I | [section-i-complete.md](TEMPLATES/section-i-complete.md) | Mark done, update docs | When verified |
| J | [section-j-error.md](TEMPLATES/section-j-error.md) | Handle errors | When things fail |

---

## Usage Patterns

### Pattern 1: Single Task (All Sections)

```
User: Read AI-DEVELOPER/TEMPLATES/ sections F through I 
      and implement [phase-name] task [X.Y.Z], then verify and complete
```

**AI will:**
1. Read all templates (F, G, H, I)
2. Execute Section F (understand task 5.1.1)
3. Execute Section G (implement task 5.1.1)
4. Execute Section H (verify task 5.1.1)
5. Execute Section I (complete task 5.1.1, update docs)
6. Report: "Task 5.1.1 complete"

---

### Pattern 2: Multiple Tasks in Section

```
User: Read AI-DEVELOPER/TEMPLATES/ sections F through I
      and implement [phase-name] section [X.Y.x] (tasks [X.Y.1] through [X.Y.N])
```

**AI will:**
1. Read all templates (F, G, H, I)
2. For each task (5.1.1, 5.1.2, 5.1.3, 5.1.4):
   - Execute F → G → H → I
   - Verify each task works
3. After all tasks: Section verification
4. Report: "Section 5.1.x complete (4 tasks)"

---

### Pattern 3: Full Phase

```
User: Read AI-DEVELOPER/TEMPLATES/ sections F through I
      and implement [phase-name] (all tasks)
```

**AI will:**
1. Read all templates and phase document
2. For each section (5.1.x, 5.2.x, 5.3.x, 5.4.x):
   - Execute all tasks sequentially
   - Verify section when complete
3. Report: "Phase 5 complete (12 tasks)"

---

## Workflow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    FOR EACH TASK                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   ┌─────────────┐                                           │
│   │ Section F   │ Read task, understand requirements        │
│   │ UNDERSTAND  │ Check prerequisites, identify patterns    │
│   └──────┬──────┘                                           │
│          │                                                  │
│          ▼                                                  │
│   ┌─────────────┐                                           │
│   │ Section G   │ Create files, write code                  │
│   │ IMPLEMENT   │ Follow discovered patterns                │
│   └──────┬──────┘                                           │
│          │                                                  │
│          ▼                                                  │
│   ┌─────────────┐                                           │
│   │ Section H   │ Check for errors, test functionality      │
│   │ VERIFY      │ Run related tests if exist                │
│   └──────┬──────┘                                           │
│          │                                                  │
│       Success?───No──→ Section J (Recovery)                 │
│          │                                                  │
│         Yes                                                 │
│          │                                                  │
│          ▼                                                  │
│   ┌─────────────┐                                           │
│   │ Section I   │ Update CURRENT-STATE.md                   │
│   │ COMPLETE    │ Mark checkboxes, report status            │
│   └─────────────┘                                           │
│                                                             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│              AFTER ALL TASKS IN SECTION                     │
├─────────────────────────────────────────────────────────────┤
│   Section H (again) - Verify entire section works together  │
└─────────────────────────────────────────────────────────────┘
```

---

## Key Principles

### 1. Self-Discover Patterns
Do NOT use hardcoded patterns. Instead:
- Look at existing code in the project
- Follow established conventions
- Match existing file structures

### 2. Sequential Execution
- Complete Task N before starting Task N+1
- Never skip tasks
- Verify before proceeding

### 3. Documentation First
- Always update CURRENT-STATE.md after each task
- Mark checkboxes in phase document
- Keep progress visible

### 4. User Handles Commits
- AI does NOT commit
- AI does NOT push
- User controls version control

---

## Output Format

After completing work, AI should report:

### Single Task Complete
```
## Task X.Y.Z Complete ✅

**Task:** [Task title]
**Files Created/Modified:**
- [path/to/file] (created)
- [path/to/other] (modified)

**Verification:**
- [x] No syntax errors
- [x] No runtime errors
- [x] Functionality works

**CURRENT-STATE.md:** Updated

**Next:** Task X.Y.Z+1 or Section complete
```

### Section Complete
```
## Section X.Y Complete ✅

**Tasks Completed:** 4/4
- [x] Task X.Y.1: [title]
- [x] Task X.Y.2: [title]
- [x] Task X.Y.3: [title]
- [x] Task X.Y.4: [title]

**Section Verification:**
- [x] All tasks verified individually
- [x] Integration verified
- [x] No errors

**Ready for:** Section X.Y+1
```

---

## Related Templates

- **AI-AUDIT:** For auditing completed work
- **Phase Documents:** Task definitions in `docs/tasks/`
- **CURRENT-STATE.md:** Progress tracking

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-01-20 | Initial template system |
