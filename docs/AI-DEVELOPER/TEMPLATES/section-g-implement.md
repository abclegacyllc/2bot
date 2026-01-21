# Section G: Task Implementation (Universal)

> **Purpose:** Implement the task following discovered patterns
> **When:** After completing Section F (Understanding)
> **Works With:** Any language, framework, or project structure

---

## Prerequisites

Before using this section:
- [ ] Section F completed
- [ ] Project patterns discovered (NOT assumed)
- [ ] Similar code files identified
- [ ] Implementation plan created

---

## Step G.1: Verify Current State

Before writing code, verify the starting state:

```bash
# Check for uncommitted changes
git status

# Check if required files/directories exist
ls -la [path-from-plan]

# Check current state of files you'll modify
head -20 [file-to-modify]
```

---

## Step G.2: Follow the Implementation Plan

Execute each step from your Section F plan. For EACH step:

### 2a. Before Writing Code

```markdown
### Implementing: [Step X Description]

**File:** [path/to/file]
**Action:** create / modify
**Pattern Source:** [similar file discovered in F.4]
```

### 2b. Reference the Pattern

```bash
# Always have the pattern file open/visible
cat [pattern-source-file] | head -100
```

### 2c. Implement Following Patterns

**Key Rules:**
- Match naming conventions of existing code
- Match file organization of existing code
- Match import style of existing code
- Match error handling of existing code
- Match formatting of existing code

### 2d. For NEW Files

1. Check similar file structure
2. Copy structure, adapt content
3. Use same header patterns
4. Use same import patterns
5. Use same export patterns

### 2e. For MODIFYING Files

1. Understand the full file context
2. Find the right location for changes
3. Match surrounding code style
4. Keep changes minimal and focused

---

## Step G.3: Code Quality Checks

**After writing each piece of code, verify:**

```markdown
### Quality Check for [file]

**Pattern Alignment:**
- [ ] Naming matches project conventions
- [ ] File location matches project structure
- [ ] Import style matches existing code
- [ ] Code organization matches similar files

**Completeness:**
- [ ] All required functionality implemented
- [ ] Error cases handled (following existing patterns)
- [ ] Edge cases considered

**Integration:**
- [ ] Imports/exports correct
- [ ] Connects properly to other code
```

---

## Step G.4: Verify Syntax

**Run appropriate checks for the project's language:**

```bash
# First, find out how the project checks code
# Look in package.json, Makefile, pyproject.toml, etc.

# Common patterns (use what exists in the project):
# - npm run lint (Node.js)
# - python -m py_compile file.py (Python)
# - cargo check (Rust)
# - go build ./... (Go)

# Or manually check file is valid:
head -100 [your-new-file]
```

---

## Step G.5: Document Decisions

For any non-obvious decisions made during implementation:

```markdown
### Implementation Decisions

1. **Decision:** [What you decided]
   - **Why:** [Reasoning based on discovered patterns]
   - **Alternative:** [What you didn't do]

2. **Decision:** [Continue as needed]
```

---

## Step G.6: Per-Task Verification

After implementing EACH task in the plan:

```markdown
### Task Verification: [Step X]

**File(s) Changed:**
- [file1] - [lines added/modified]
- [file2] - [lines added/modified]

**Patterns Followed:**
- [x] Naming from [pattern-source]
- [x] Structure from [pattern-source]
- [x] Style from [pattern-source]

**Functional Check:**
- [ ] Code runs without errors
- [ ] Integrates with existing code
- [ ] Meets task requirements

**Status:** ✅ Complete / ❌ Failed / ⚠️ Partial
```

---

## Step G.7: Implementation Summary

After all steps complete:

```markdown
## Section G Complete: Implementation ✅

### Files Created
| File | Purpose | Pattern Source |
|------|---------|----------------|
| [path] | [purpose] | [similar file used] |

### Files Modified
| File | Changes | Lines Changed |
|------|---------|---------------|
| [path] | [description] | [count] |

### Patterns Applied
- [Pattern 1] from [source]
- [Pattern 2] from [source]

### Decisions Made
- [Decision 1]: [brief reason]
- [Decision 2]: [brief reason]

### Known Limitations
- [Any trade-offs or limitations]

**Ready for:** Section H (Verification)
```

---

## Common Pitfalls

### ❌ Pattern Mistakes

| Wrong | Right |
|-------|-------|
| Assume standard structure | Use discovered structure |
| Use personal conventions | Follow project conventions |
| Import what you "know" | Import what exists in project |
| Create new patterns | Extend existing patterns |

### ❌ Implementation Mistakes

| Wrong | Right |
|-------|-------|
| Implement entire feature at once | Implement step by step with verification |
| Modify multiple files without checking | Modify one file, verify, then next |
| Write complex solution first | Write simple solution, then enhance |

---

## Integration Points

**When your code needs to connect with existing code:**

1. Find where similar integrations exist
2. Read how they're done
3. Follow the exact same pattern
4. Verify the connection works

```bash
# Find how existing features integrate
grep -rn "[function-or-pattern-name]" [source-dir]/ | head -10
```

---

## Critical Rules

1. **Pattern Over Preference:** Your coding preferences don't matter. Project patterns matter.

2. **Verify Often:** Check each file works before moving to the next.

3. **Minimal Changes:** Do the minimum needed. Don't refactor, don't "improve."

4. **One Thing at a Time:** Complete one step fully before starting the next.

5. **Document Why:** If something isn't obvious, write why you did it.

---

**End of Section G**
