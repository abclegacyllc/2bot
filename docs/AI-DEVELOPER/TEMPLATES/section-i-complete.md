# Section I: Task Completion (Universal)

> **Purpose:** Finalize the task and update documentation
> **When:** After Section H (Verification) passes
> **Works With:** Any language, framework, or project structure

---

## Prerequisites

Before using this section:
- [ ] Section F completed (Understanding)
- [ ] Section G completed (Implementation)
- [ ] Section H completed with ✅ PASSED status
- [ ] No blockers remaining

---

## Step I.1: Verify Ready State

**Confirm Section H passed:**

```markdown
### Pre-Completion Check

**Section H Status:** [PASSED/FAILED/PARTIAL]
**If not PASSED:** Stop and complete Section H or Section J first

**Blockers:** None / [List any]
```

---

## Step I.2: Update CURRENT-STATE.md

**Locate and update the project state document:**

```bash
# Find state document
find . -name "*CURRENT*STATE*" -o -name "*current*state*" 2>/dev/null

# Or look for similar:
find . -name "*STATE*" -o -name "*STATUS*" -o -name "*PROGRESS*" 2>/dev/null | head -10
```

**Add completion record:**

```markdown
### [Date] - Task [ID] Complete

**Task:** [Title]
**Status:** ✅ Complete

**Changes:**
- [File 1]: [Summary of changes]
- [File 2]: [Summary of changes]

**Verified:**
- [x] Syntax check passed
- [x] Tests passed
- [x] Integration verified

**Notes:** [Any important notes]
```

---

## Step I.3: Review Changes Summary

**Document all changes made:**

```markdown
### Final Changes Summary

**Files Created:**
| File | Purpose | Lines |
|------|---------|-------|
| [path/to/file] | [purpose] | [count] |

**Files Modified:**
| File | Changes | Lines Changed |
|------|---------|---------------|
| [path/to/file] | [description] | [count] |

**Files Deleted:**
| File | Reason |
|------|--------|
| [path/to/file] | [reason] |

**Configuration Changes:**
| Config | Change |
|--------|--------|
| [config file] | [what changed] |

**Dependencies Added:**
| Dependency | Version | Purpose |
|------------|---------|---------|
| [name] | [version] | [why needed] |
```

---

## Step I.4: Check for Cleanup

**Ensure no temporary artifacts remain:**

```bash
# Look for common temporary files
find . -name "*.bak" -o -name "*.tmp" -o -name "*.orig" 2>/dev/null

# Look for debug code (adjust pattern to project)
grep -rn "TODO\|FIXME\|DEBUG\|console.log\|print(" [source-dir]/ 2>/dev/null | head -10
```

```markdown
### Cleanup Check

- [ ] No temporary files left
- [ ] No debug statements left (unless intentional)
- [ ] No commented-out code blocks
- [ ] No TODO items from this task remaining
```

---

## Step I.5: Documentation Updates

**Ensure documentation reflects changes:**

```markdown
### Documentation Status

**README.md:**
- [ ] Updated / [ ] No update needed
- Changes: [if updated]

**API Documentation:**
- [ ] Updated / [ ] No update needed / [ ] N/A
- Changes: [if updated]

**Architecture/Design Docs:**
- [ ] Updated / [ ] No update needed / [ ] N/A
- Changes: [if updated]

**Inline Code Comments:**
- [ ] Added where needed
```

---

## Step I.6: Create Completion Report

```markdown
## Task Completion Report

### Task Information
- **Task ID:** [ID]
- **Task Title:** [Title]
- **Phase:** [Phase name/number]
- **Estimated Time:** [from task]
- **Actual Time:** [if tracked]

### Completion Status
| Criteria | Status |
|----------|--------|
| Code Complete | ✅ |
| Tests Pass | ✅ |
| Documentation Updated | ✅ |
| CURRENT-STATE Updated | ✅ |
| Cleanup Done | ✅ |

### Summary of Work
[2-3 sentence description of what was implemented]

### Files Changed
- Created: [count]
- Modified: [count]
- Deleted: [count]

### Next Steps
- Next Task: [ID and title of next task in phase]
- Blocked By: Nothing / [List blockers]
```

---

## Step I.7: Prepare for Next Task

**Check what comes next:**

```bash
# Re-read the phase document for next task
cat [phase-doc-path] | grep -A20 "Task [next-id]"
```

```markdown
### Next Task Preview

**Next Task:** [ID] - [Title]
**Type:** [Backend/Frontend/Database/etc.]
**Prerequisites:** [list - including this task]
**Ready to Start:** ✅ Yes / ❌ No (reason)
```

---

## Step I.8: Completion Checklist

Before marking complete:

- [ ] CURRENT-STATE.md updated with completion
- [ ] All changes documented
- [ ] Cleanup complete (no temp files)
- [ ] Documentation updated (if needed)
- [ ] Ready for next task

---

## Output Format

```markdown
## Section I Complete: Task [ID] Finalized ✅

### Task Summary
- **Task:** [ID] - [Title]
- **Status:** ✅ COMPLETE
- **Completion Time:** [timestamp]

### Changes Made
- [count] files created
- [count] files modified
- [count] files deleted

### Documentation Updated
- CURRENT-STATE.md ✅
- [Other docs if applicable]

### Ready for Next Task
- **Next:** Task [ID] - [Title]
- **Ready:** ✅ / ❌

---
**Task [ID] Complete**
```

---

## Important Notes

### Git (User Responsibility)

This template does NOT handle git commits. The user handles version control:
- Changes are ready to commit
- User reviews and commits when ready
- User decides commit message

### No Automatic Cleanup

Be conservative with cleanup:
- Don't delete files unless sure they're temporary
- Don't remove code unless sure it's debug code
- When in doubt, leave it and note it

### CURRENT-STATE Format

If CURRENT-STATE.md doesn't exist or has different format:
- Create it following project conventions
- Or follow format of similar status documents
- Or use the simple format shown in Step I.2

---

## Task State Transitions

```
[Task Started]
    ↓
Section F: Understand
    ↓
Section G: Implement
    ↓
Section H: Verify
    ↓
Section I: Complete  ←── YOU ARE HERE
    ↓
[Task Done] → Next Task
```

---

**End of Section I**
