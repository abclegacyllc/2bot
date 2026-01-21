# Section A: Phase Document Audit Template

> **Purpose:** Audit task/phase planning documents for completeness and AI-readiness
> **Target Files:** `docs/tasks/phase-*.md`, any task planning documents
> **Version:** 2.0

---

## Instructions for AI Auditor

When you receive a request to audit a phase document:

1. **Read this template completely first**
2. **Read the target phase document**
3. **Execute each audit step below**
4. **Output results in the format specified at the end**

---

## Audit Steps

### Step A.1: Document Structure Analysis

**Run these checks:**

```bash
# Replace $FILE with the target file path
FILE="docs/tasks/phase-X.md"

echo "=== DOCUMENT STATS ==="
echo "Lines: $(wc -l < $FILE)"
echo "Tasks: $(grep -c '^### Task\|^## Task\|^### [0-9]' $FILE)"
echo "Done Criteria: $(grep -c 'Done Criteria\|Acceptance Criteria' $FILE)"
echo "Checkboxes: $(grep -c '\- \[' $FILE)"
echo "Code Blocks: $(($(grep -c '^\`\`\`' $FILE) / 2))"
```

**Verify:**
- [ ] Document has a clear title and goal
- [ ] Task overview table exists
- [ ] All tasks in overview have detailed sections
- [ ] Prerequisites are stated
- [ ] Time estimates provided

**Score:** `structure_score` = (checks passed / 5) × 100

---

### Step A.2: Task Completeness Check

**For EACH task, verify these elements exist:**

| Required Element | How to Check |
|------------------|--------------|
| Task ID | Has unique identifier (e.g., 5.1.1, 6.2.3) |
| Title | Clear, action-oriented (verb + noun) |
| Session Type | Backend/Frontend/DevOps/Testing specified |
| Time Estimate | Minutes or hours stated |
| Prerequisites | Lists dependencies on other tasks |
| Deliverables | Lists specific files/features to create |
| Implementation | Code examples or clear step instructions |
| Done Criteria | Testable checkbox items |

**Calculate:**
```
task_completeness = (complete_tasks / total_tasks) × 100
```

**Flag any task missing 3+ elements as INCOMPLETE**

---

### Step A.3: Incomplete Marker Check

**Run these commands:**

```bash
# Should return 0 results for a complete document
echo "=== INCOMPLETE MARKERS ==="
grep -in "TODO\|FIXME\|TBD\|XXX\|HACK" $FILE || echo "None found"
grep -in "placeholder\|insert here\|fill in\|your.*here" $FILE || echo "None found"

echo "=== TRUNCATION MARKERS ==="
grep -in "// \.\.\.\|# \.\.\.\|/\* \.\.\." $FILE || echo "None found"
grep -in "// more\|// rest\|// etc\|// continued" $FILE || echo "None found"
grep -in "Lines.*omitted\|code omitted\|implementation.*here" $FILE || echo "None found"
```

**Score:**
- 0 markers = 100%
- 1-3 markers = 80%
- 4-6 markers = 60%
- 7+ markers = FAIL

---

### Step A.4: Code Block Quality

**For each code block, verify:**

| Check | Pass Criteria |
|-------|--------------|
| Language specified | Has language tag (```python, ```bash, etc.) |
| Syntax valid | Code would parse without errors |
| Imports shown | Used modules/packages are imported |
| Types defined | Types annotated (if typed language) |
| No placeholder content | No `// TODO`, `...`, `xxx` |
| Self-contained | Can be copy-pasted and work |

**Commands to help:**

```bash
# Find code blocks without language tags
grep -n '^\`\`\`$' $FILE

# Find potential issues in code blocks
grep -A5 '^\`\`\`' $FILE | grep -i "todo\|xxx\|placeholder"
```

---

### Step A.5: Consistency Checks

**A. Naming Consistency**
```bash
# Check for inconsistent patterns (example)
grep -oh "/api/[a-z/-]*" $FILE | sort | uniq -c | sort -rn
grep -Eoh "[a-zA-Z_]+/[a-zA-Z0-9_./-]+" $FILE | sort | uniq
```

**Verify:**
- [ ] File paths use consistent format (project-appropriate prefix)
- [ ] API paths use consistent patterns
- [ ] No mixed naming conventions (camelCase vs snake_case)
- [ ] Environment variables consistently named

**B. Reference Consistency**
- [ ] Task IDs follow sequential pattern
- [ ] Prerequisites reference valid task IDs
- [ ] File paths match project structure

---

### Step A.6: AI Developer Readiness

**The "Can an AI Execute This?" Test**

For each task, verify:

| Criterion | Question |
|-----------|----------|
| Unambiguous | Only one way to interpret? |
| Complete | All information provided? |
| Actionable | Clear next step? |
| Testable | Can verify completion? |
| Self-contained | No hidden dependencies? |

**Red flags to find:**
```bash
# Search for vague language
grep -in "appropriate\|necessary\|as needed\|similar to\|etc\." $FILE
grep -in "should\|might\|could\|maybe\|probably" $FILE
grep -in "update.*files\|modify.*code\|change.*as" $FILE
```

**Ambiguous phrases to flag:**
- "Use appropriate..." (which one?)
- "Update the files..." (which files?)
- "Add necessary..." (what's necessary?)
- "Similar to..." (without showing what)

---

### Step A.7: Done Criteria Quality

**Each Done Criteria item should be:**

| Quality | Bad Example | Good Example |
|---------|-------------|--------------|
| Specific | "Routes work" | "GET /api/users returns 200 with user list" |
| Testable | "Code is clean" | "No ESLint errors" |
| Binary | "Good performance" | "Response time < 200ms" |
| Observable | "System is secure" | "Passwords are bcrypt hashed with cost 12" |

**Check:**
```bash
# Count testable criteria (has specific action/result)
grep -c '\- \[.\].*\(returns\|creates\|shows\|displays\|calls\|saves\)' $FILE
```

---

## Output Format

```markdown
# Section A: Phase Document Audit Report

**Document:** [filename]
**Audited:** [date]
**Auditor:** AI Auditor

---

## Summary Scores

| Category | Score | Status |
|----------|-------|--------|
| Structure | X% | PASS/WARN/FAIL |
| Task Completeness | X% | PASS/WARN/FAIL |
| No Incomplete Markers | X% | PASS/WARN/FAIL |
| Code Quality | X% | PASS/WARN/FAIL |
| Consistency | X% | PASS/WARN/FAIL |
| AI Readiness | X% | PASS/WARN/FAIL |
| Done Criteria Quality | X% | PASS/WARN/FAIL |
| **Overall** | **X%** | **STATUS** |

**Legend:** PASS (≥80%) | WARN (60-79%) | FAIL (<60%)

---

## Document Statistics

| Metric | Value |
|--------|-------|
| Total Lines | X |
| Total Tasks | X |
| Done Criteria Sections | X |
| Code Blocks | X |
| Checkboxes | X |

---

## Detailed Findings

### Critical Issues (Must Fix)
1. [Issue] - Location: [section] - Fix: [recommendation]

### Warnings (Should Fix)
1. [Issue] - Location: [section] - Suggestion: [recommendation]

### Suggestions (Nice to Have)
1. [Suggestion]

---

## Task-by-Task Audit

| Task ID | Title | Elements | Done Criteria | Status |
|---------|-------|----------|---------------|--------|
| X.Y.Z | ... | 8/8 | 4 items | ✅ PASS |
| X.Y.Z | ... | 5/8 | 2 items | ⚠️ WARN |

---

## Verdict

**Status:** APPROVED / APPROVED WITH NOTES / NEEDS REVISION

**Summary:** [1-2 sentence summary]

**Required Actions Before Implementation:**
1. [Action if any]

---

## Notes for AI Developer

[Any specific guidance for the AI implementing this phase]
```

---

## Quick Reference

### Minimum Requirements for APPROVED

- [ ] All tasks have unique IDs
- [ ] All tasks have done criteria
- [ ] No TODO/FIXME markers
- [ ] No truncated code blocks
- [ ] File paths specified for deliverables
- [ ] Time estimates provided

### Automatic FAIL Conditions

- Missing more than 3 tasks from overview
- More than 50% of tasks without done criteria
- More than 10 incomplete markers
- Critical security information missing
- Circular dependencies in prerequisites

---

**End of Section A Template**
