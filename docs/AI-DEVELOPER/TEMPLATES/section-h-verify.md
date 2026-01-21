# Section H: Task Verification (Universal)

> **Purpose:** Verify implementation is correct and complete
> **When:** After completing Section G (Implementation)
> **Works With:** Any language, framework, or project structure

---

## Prerequisites

Before using this section:
- [ ] Section F completed (Understanding)
- [ ] Section G completed (Implementation)
- [ ] All code written
- [ ] Ready to verify

---

## Step H.1: Syntax Verification

**Verify code compiles/parses without errors:**

```bash
# First, find how this project checks syntax
# Look for scripts in package.json, Makefile, etc.

# Check for errors (method depends on project)
# The key is to find what the project uses:

# Check for linting/type config:
ls -la *.config.* 2>/dev/null
ls -la .* 2>/dev/null | grep -E "eslint|prettier|rubocop|flake8"

# Then run appropriate checks
```

```markdown
### Syntax Verification

**Tool Used:** [what you ran]
**Result:** ✅ Pass / ❌ Fail

**If errors, list them:**
- [ ] [Error 1] - [Fix status]
- [ ] [Error 2] - [Fix status]
```

---

## Step H.2: Integration Verification

**Verify your code integrates with existing code:**

```markdown
### Integration Check

**Imports/Dependencies:**
- [ ] All imports resolve correctly
- [ ] No circular dependencies introduced
- [ ] No missing dependencies

**Connections:**
- [ ] Functions/classes can be called from where needed
- [ ] Data types match expectations
- [ ] API contracts maintained
```

**Check with actual code:**
```bash
# Verify imports work by checking for errors
# Find how the project runs/builds
cat README.md | grep -A5 -i "run\|build\|start"

# Or check package manager scripts
# (depends on what you discovered in Section F)
```

---

## Step H.3: Functional Verification

**Verify the code does what it should:**

```markdown
### Functional Check

**Task Requirements:**
| Requirement | Implemented | Verified |
|-------------|-------------|----------|
| [From task definition] | ✅/❌ | ✅/❌ |
| [From task definition] | ✅/❌ | ✅/❌ |

**Done Criteria:**
| Criteria | Met? | Evidence |
|----------|------|----------|
| [From phase doc] | ✅/❌ | [How you verified] |
| [From phase doc] | ✅/❌ | [How you verified] |
```

---

## Step H.4: Test Verification

**Find and run relevant tests:**

```bash
# Find test files
find . -type f -name "*test*" -o -name "*spec*" 2>/dev/null | head -20

# Find test directory
ls -la test/ tests/ spec/ __tests__/ 2>/dev/null

# Find how to run tests (check package.json, Makefile, README)
grep -i "test" README.md | head -10

# Run tests (use project's test command)
```

```markdown
### Test Results

**Test Runner:** [what you used]
**Command:** [exact command]
**Relevant Tests:** [which tests relate to your changes]

**Results:**
| Test | Result |
|------|--------|
| [test name] | ✅/❌ |
| [test name] | ✅/❌ |

**Overall:** ✅ All Pass / ❌ Failures Exist
```

---

## Step H.5: Edge Case Review

```markdown
### Edge Cases Considered

| Edge Case | Handled? | How? |
|-----------|----------|------|
| Empty input | ✅/❌ | [description] |
| Invalid input | ✅/❌ | [description] |
| Missing data | ✅/❌ | [description] |
| Concurrent access | ✅/❌/N/A | [description] |
| Error conditions | ✅/❌ | [description] |
| [Other case specific to task] | ✅/❌ | [description] |
```

---

## Step H.6: Pattern Compliance

**Verify you followed discovered patterns:**

```markdown
### Pattern Compliance Check

**Naming:**
- [ ] File names match project convention
- [ ] Variable names match project convention
- [ ] Function names match project convention

**Structure:**
- [ ] File location matches project structure
- [ ] Code organization matches similar files
- [ ] Exports/imports match project style

**Style:**
- [ ] Formatting matches existing code
- [ ] Comments match existing style
- [ ] Error handling matches existing pattern
```

---

## Step H.7: Documentation Check

```markdown
### Documentation Verification

**Code Documentation:**
- [ ] Functions/methods documented (if project documents them)
- [ ] Complex logic explained
- [ ] Edge cases noted

**External Documentation:**
- [ ] README updated (if needed)
- [ ] API docs updated (if applicable)
- [ ] Comments added where project convention requires
```

---

## Step H.8: Verification Summary

```markdown
## Section H Complete: Verification ✅

### Summary Table

| Check | Status | Notes |
|-------|--------|-------|
| Syntax | ✅/❌ | [notes] |
| Integration | ✅/❌ | [notes] |
| Functional | ✅/❌ | [notes] |
| Tests | ✅/❌ | [notes] |
| Edge Cases | ✅/❌ | [notes] |
| Patterns | ✅/❌ | [notes] |
| Documentation | ✅/❌ | [notes] |

### Overall Status

**Verification Result:** ✅ PASSED / ❌ FAILED / ⚠️ PARTIAL

**If FAILED, list blockers:**
1. [Blocker 1] - [Required action]
2. [Blocker 2] - [Required action]

**If PARTIAL, list issues:**
1. [Issue 1] - [Severity: Low/Medium/High]
2. [Issue 2] - [Severity: Low/Medium/High]

**Ready for:** 
- ✅ Section I (Completion) - if all pass
- ❌ Section J (Error Recovery) - if failures exist
```

---

## Verification Methods by Type

### API Endpoints

```markdown
- [ ] Endpoint responds correctly
- [ ] Status codes correct
- [ ] Response format correct
- [ ] Error responses correct
- [ ] Authentication works (if required)
```

### Database Changes

```markdown
- [ ] Migrations run successfully
- [ ] Data can be created/read/updated/deleted
- [ ] Constraints enforced
- [ ] Indexes exist for queries
- [ ] Rollback works
```

### UI Components

```markdown
- [ ] Component renders
- [ ] Props handled correctly
- [ ] User interactions work
- [ ] Responsive behavior correct
- [ ] Accessibility maintained
```

### Background Jobs

```markdown
- [ ] Job runs to completion
- [ ] Errors handled gracefully
- [ ] Retries work (if applicable)
- [ ] Doesn't block main process
```

### Configuration

```markdown
- [ ] Config values loaded
- [ ] Defaults work
- [ ] Environment overrides work
- [ ] Invalid config handled
```

---

## Red Flags

**Stop and investigate if you see:**

| Red Flag | What It Means |
|----------|---------------|
| Syntax errors won't resolve | May be wrong language version or missing dependency |
| Tests fail unrelated to your code | May have broken existing functionality |
| Imports won't resolve | May be wrong file path or missing export |
| Type errors | May be wrong assumptions about data shapes |
| Unexpected errors at runtime | May be missing environment or config |

---

## Verification Checklist

Before proceeding to Section I:

- [ ] All syntax errors resolved
- [ ] Integration verified
- [ ] Functionality verified against requirements
- [ ] Tests pass
- [ ] Edge cases handled
- [ ] Patterns followed
- [ ] Documentation complete

---

**End of Section H**
