# Section J: Error Recovery (Universal)

> **Purpose:** Handle failures and recover from errors
> **When:** When Section G or H encounters blockers
> **Works With:** Any language, framework, or project structure

---

## When to Use This Section

Use Section J when:
- [ ] Syntax errors won't resolve
- [ ] Tests fail and you can't fix them
- [ ] Integration breaks
- [ ] Requirements can't be met
- [ ] Dependencies missing or incompatible
- [ ] Environment issues
- [ ] Any blocker that stops progress

---

## Step J.1: Document the Error

**Capture the error state completely:**

```markdown
### Error Documentation

**Task:** [ID] - [Title]
**Failed Section:** [G or H]
**Failed Step:** [Step number and name]
**Error Time:** [timestamp]

### Error Description
[Describe what failed]

### Error Output
```
[Paste exact error message/output]
```

### What Was Attempted
1. [Action 1]
2. [Action 2]
3. [Action n]

### Files Involved
- [file1] - [state: modified/created/unchanged]
- [file2] - [state]
```

---

## Step J.2: Classify the Error

**Determine error type:**

```markdown
### Error Classification

**Type:** [Select one]
- [ ] SYNTAX - Code won't compile/parse
- [ ] INTEGRATION - Code doesn't connect properly
- [ ] LOGIC - Code runs but does wrong thing
- [ ] DEPENDENCY - Missing or incompatible dependency
- [ ] ENVIRONMENT - System/environment issue
- [ ] REQUIREMENT - Can't meet requirement as specified
- [ ] UNKNOWN - Need investigation

**Severity:**
- [ ] BLOCKER - Cannot proceed at all
- [ ] HIGH - Major functionality broken
- [ ] MEDIUM - Partial functionality affected
- [ ] LOW - Minor issue, workaround possible

**Scope:**
- [ ] LOCAL - Affects only this task
- [ ] BROAD - Affects other code/tasks
```

---

## Step J.3: Root Cause Analysis

**Investigate why the error occurred:**

```markdown
### Root Cause Analysis

**Immediate Cause:**
[What directly caused the error]

**Underlying Cause:**
[Why that happened]

**Investigation Steps:**
1. [What you checked]
2. [What you found]
3. [Conclusions]

**Evidence:**
```
[Relevant logs, outputs, code snippets]
```
```

---

## Step J.4: Recovery Options

**Identify possible solutions:**

```markdown
### Recovery Options

**Option 1: [Name]**
- Description: [What to do]
- Effort: Low/Medium/High
- Risk: Low/Medium/High
- Trade-offs: [What you lose]

**Option 2: [Name]**
- Description: [What to do]
- Effort: Low/Medium/High
- Risk: Low/Medium/High
- Trade-offs: [What you lose]

**Option 3: [Name]**
- Description: [What to do]
- Effort: Low/Medium/High
- Risk: Low/Medium/High
- Trade-offs: [What you lose]

**Recommended Option:** [Number] because [reason]
```

---

## Step J.5: Rollback if Necessary

**If changes need to be undone:**

```bash
# Check current state
git status

# See what changed
git diff

# If need to restore a file
git checkout -- [file-path]

# If need to restore all changes
git checkout -- .

# CAUTION: Only roll back if necessary
# Partial progress may be worth keeping
```

```markdown
### Rollback Status

**Rollback Performed:** Yes / No
**Reason:** [Why or why not]

**Files Restored:**
- [file1] - rolled back
- [file2] - kept changes (partial progress)

**Current State:** [Describe working state after rollback]
```

---

## Step J.6: Implement Recovery

**Execute the chosen recovery option:**

```markdown
### Recovery Implementation

**Option Selected:** [Option number and name]

**Steps Taken:**
1. [Action 1] - [Result]
2. [Action 2] - [Result]
3. [Action n] - [Result]

**New Code/Changes:**
[Describe what was changed during recovery]

**Recovery Result:** ✅ Success / ❌ Still Blocked
```

---

## Step J.7: Verify Recovery

**Confirm the error is resolved:**

```markdown
### Recovery Verification

**Original Error:** [Brief description]
**Still Occurring:** Yes / No

**Verification Steps:**
1. [Check 1] - ✅/❌
2. [Check 2] - ✅/❌
3. [Check n] - ✅/❌

**New Errors Introduced:** None / [List any]

**Overall Status:** ✅ RECOVERED / ❌ STILL BLOCKED
```

---

## Step J.8: Document Lessons

**Capture what was learned:**

```markdown
### Lessons Learned

**What Went Wrong:**
[Brief summary]

**Why It Happened:**
[Root cause]

**How to Prevent:**
[Future prevention measures]

**Related Tasks to Watch:**
[Other tasks that might have same issue]
```

---

## Step J.9: Determine Next Action

```markdown
### Next Action

**If RECOVERED:**
- [ ] Return to Section G or H where you left off
- [ ] Continue with remaining implementation/verification

**If STILL BLOCKED:**
- [ ] Escalate to user
- [ ] Document blocker for human review
- [ ] Skip task and move to next (if allowed)
```

---

## Recovery Report

```markdown
## Section J Complete: Error Recovery Report

### Error Summary
- **Task:** [ID] - [Title]
- **Error Type:** [Classification]
- **Severity:** [Level]

### Resolution
- **Status:** ✅ RECOVERED / ❌ STILL BLOCKED
- **Method:** [Brief description of what fixed it]
- **Time Spent:** [If tracked]

### Impact
- **Code Changes:** [Summary of changes due to error]
- **New Risks:** [Any new risks introduced]

### Follow-up
- **Lessons:** [Key lesson]
- **Prevention:** [How to prevent recurrence]

### Next Step
- ✅ RECOVERED → Return to [Section G/H]
- ❌ STILL BLOCKED → Escalate / Skip / Pause

---
**Recovery Complete: [timestamp]**
```

---

## Common Error Patterns

### Syntax Errors

| Symptom | Likely Cause | Recovery |
|---------|--------------|----------|
| Unexpected token | Wrong language version or typo | Check version, fix syntax |
| Import not found | Wrong path or missing export | Verify path, check exports |
| Type mismatch | Wrong assumption about data | Check actual types |

### Integration Errors

| Symptom | Likely Cause | Recovery |
|---------|--------------|----------|
| Module not found | Missing dependency | Install dependency |
| Cannot read property | Null/undefined value | Add null checks |
| API mismatch | Version incompatibility | Check versions, update |

### Environment Errors

| Symptom | Likely Cause | Recovery |
|---------|--------------|----------|
| Command not found | Missing tool | Install tool |
| Permission denied | Access rights | Check permissions |
| Connection refused | Service not running | Start service |

---

## Escalation Guidelines

**Escalate to user when:**
- Error persists after 3 recovery attempts
- Error requires decisions outside task scope
- Error involves security concerns
- Error requires external resources
- Error blocks multiple tasks

**Escalation Format:**
```markdown
## Escalation Required

**Task:** [ID] - [Title]
**Error:** [Brief description]
**Attempts:** [What was tried]
**Blocker:** [What's preventing resolution]
**Decision Needed:** [What the user needs to decide]
**Options:** [List options for user to choose]
```

---

## Critical Rules

1. **Document First:** Always document the error before trying to fix it
2. **Understand Before Fixing:** Root cause analysis before solutions
3. **Minimal Changes:** Fix the error, don't refactor
4. **Verify Recovery:** Always verify the fix worked
5. **Learn from Errors:** Document lessons for future

---

**End of Section J**
