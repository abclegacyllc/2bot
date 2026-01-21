# Section E: Cross-Reference Audit Template (Universal)

> **Purpose:** Verify phase document deliverables match actual implementation
> **Target:** Phase document + actual source code/files
> **Version:** 2.0 (Universal)

---

## Instructions for AI Auditor

When you receive a request to cross-reference audit:

1. **Read the phase document first**
2. **Extract all promised deliverables**
3. **Verify each deliverable exists and works**
4. **Output results in the format specified at the end**

---

## Step E.0: Understand the Phase Document

**First, identify what the phase promises:**

```bash
PHASE_DOC="[path-to-phase-document]"

echo "=== PHASE OVERVIEW ==="
head -50 $PHASE_DOC

echo "=== DELIVERABLES MENTIONED ==="
# Find file paths mentioned
grep -Eo "[a-zA-Z_]+/[a-zA-Z0-9_./-]+" $PHASE_DOC | sort | uniq

echo "=== TASKS LISTED ==="
grep -E "^### Task|^## Task|^### [0-9]" $PHASE_DOC
```

---

## Audit Steps

### Step E.1: Extract Deliverables from Phase Document

**Identify promised deliverables by category:**

```markdown
### Phase Deliverables Checklist

**From Phase Document:** [filename]

| Category | Description | Expected Output |
|----------|-------------|-----------------|
| Files | Source files to create | List of file paths |
| Endpoints | APIs to implement | List of routes/endpoints |
| Database | Schema changes | Models/tables/migrations |
| UI | Components/pages | List of UI elements |
| Config | Configuration changes | Config files/env vars |
| Tests | Test coverage | Test files |
```

**Extract file paths:**
```bash
# Find all file path references in phase doc
grep -Eo "[a-zA-Z_]+/[a-zA-Z0-9_./-]+\.[a-z]+" $PHASE_DOC | sort | uniq
```

---

### Step E.2: Verify Files Exist

**Check each promised file:**

```bash
# Create a list of files from phase doc
FILES=(
  "[file1-from-phase-doc]"
  "[file2-from-phase-doc]"
  # Add all files mentioned
)

# Check existence
for file in "${FILES[@]}"; do
  [ -f "$file" ] && echo "✓ EXISTS: $file" || echo "✗ MISSING: $file"
done
```

**Record:**
```markdown
### File Existence Check

| Promised File | Exists? | Notes |
|---------------|---------|-------|
| [path/to/file] | ✅/❌ | [notes] |
```

---

### Step E.3: Verify API Endpoints

**If phase promises API endpoints:**

```bash
# Find endpoint definitions in code (adapt to framework)
# Express: router.get/post/put/delete
# Flask: @app.route
# Django: path(), url()
# FastAPI: @app.get/post
# Rails: routes.rb
# Go: mux.HandleFunc

grep -rn "get\|post\|put\|delete\|patch\|route\|path\|Handle" [source-dir]/ | head -30

# Find specific endpoints mentioned in phase doc
grep -rn "[endpoint-from-phase]" [source-dir]/
```

**Compare with phase document:**
```markdown
### Endpoint Verification

| Promised Endpoint | Method | Implemented? | Location |
|-------------------|--------|--------------|----------|
| /api/[path] | GET | ✅/❌ | [file:line] |
| /api/[path] | POST | ✅/❌ | [file:line] |
```

---

### Step E.4: Verify Functions/Features

**Check promised functions exist:**

```bash
# Find function from phase doc
grep -rn "[function-name]" [source-dir]/

# Check if it's exported/public
grep -n "export.*[function-name]\|public.*[function-name]\|def [function-name]" [source-dir]/
```

**Record:**
```markdown
### Function Verification

| Promised Function | Implemented? | Location | Exported? |
|-------------------|--------------|----------|-----------|
| [function-name] | ✅/❌ | [file:line] | ✅/❌ |
```

---

### Step E.5: Verify Database Changes

**Check schema matches phase promises:**

```bash
# Find schema file(s)
ls -la prisma/schema.prisma models.py db/schema.rb *.entity.ts migrations/ 2>/dev/null

# Search for model/table names from phase doc
grep -n "[model-name]" [schema-file]
```

**Record:**
```markdown
### Database Verification

| Promised Model/Table | Exists? | Location | Fields Match? |
|----------------------|---------|----------|---------------|
| [model-name] | ✅/❌ | [file:line] | ✅/⚠️/❌ |
```

---

### Step E.6: Verify UI Components (if applicable)

**Check UI deliverables:**

```bash
# Find component files
find . -name "*[component-name]*" -type f 2>/dev/null

# Check for exports
grep -rn "export.*[component-name]" [source-dir]/
```

**Record:**
```markdown
### UI Component Verification

| Promised Component | Exists? | Location | Used? |
|--------------------|---------|----------|-------|
| [component-name] | ✅/❌ | [file] | ✅/❌ |
```

---

### Step E.7: Verify Configuration Changes

**Check config matches phase promises:**

```bash
# Check env vars promised
grep "[ENV_VAR_NAME]" .env.example .env* 2>/dev/null

# Check config files mentioned
cat [config-file] | grep "[setting]"
```

**Record:**
```markdown
### Configuration Verification

| Promised Config | Exists? | Location | Value/Default |
|-----------------|---------|----------|---------------|
| [ENV_VAR] | ✅/❌ | [file] | [value] |
```

---

### Step E.8: Verify Integration Points

**Check that components connect correctly:**

```bash
# Find where feature is imported/used
grep -rn "import.*[feature]\|require.*[feature]\|from.*[feature]" [source-dir]/

# Check usage sites
grep -rn "[feature-name]" [source-dir]/ | head -20
```

**Record:**
```markdown
### Integration Verification

| Component | Used By | Import Location | Working? |
|-----------|---------|-----------------|----------|
| [feature] | [consumer] | [file:line] | ✅/❌ |
```

---

### Step E.9: Verify Done Criteria

**Check each done criteria from the phase document:**

```bash
# Extract done criteria from phase doc
grep -A1 "\- \[.\]" $PHASE_DOC | head -30
```

**Verify each criterion:**
```markdown
### Done Criteria Verification

| Criterion | Verified? | Evidence |
|-----------|-----------|----------|
| [criteria text] | ✅/❌ | [how verified] |
```

---

### Step E.10: Gap Analysis

**Identify gaps between promised and implemented:**

```markdown
### Gap Analysis

**Fully Implemented:**
- [Feature 1] ✅
- [Feature 2] ✅

**Partially Implemented:**
- [Feature 3] ⚠️ - Missing: [details]

**Not Implemented:**
- [Feature 4] ❌ - Reason: [if known]

**Extra (Not in Phase Doc):**
- [Feature 5] - Added beyond scope
```

---

## Output Format

```markdown
# Section E: Cross-Reference Audit Report

**Phase Document:** [filename]
**Audited:** [date]
**Auditor:** AI Auditor

---

## Summary

| Category | Promised | Implemented | Match |
|----------|----------|-------------|-------|
| Files | X | X | X% |
| Endpoints | X | X | X% |
| Functions | X | X | X% |
| Database | X | X | X% |
| UI Components | X | X | X% |
| Config | X | X | X% |
| **Total** | **X** | **X** | **X%** |

---

## Detailed Results

### Files
| Promised | Status | Location | Notes |
|----------|--------|----------|-------|
| [file] | ✅/❌ | [path] | [notes] |

### Endpoints
| Endpoint | Method | Status | Location |
|----------|--------|--------|----------|
| [path] | [GET/POST] | ✅/❌ | [file:line] |

### Database
| Model/Table | Status | Fields | Location |
|-------------|--------|--------|----------|
| [name] | ✅/❌ | [count] | [file:line] |

### Done Criteria
| Criterion | Verified |
|-----------|----------|
| [text] | ✅/❌ |

---

## Gap Analysis

### Missing (Promised but Not Found)
1. [Item] - Promised in: [task ID]

### Incomplete (Partial Implementation)
1. [Item] - Missing: [specifics]

### Extra (Not Promised but Implemented)
1. [Item] - Location: [path]

---

## Verdict

**Cross-Reference Score:** X%
**Status:** MATCH / PARTIAL MATCH / MISMATCH

**Summary:** [1-2 sentence summary]

**Action Items:**
1. [Action if needed]
```

---

## Quick Reference

### Scoring

| Match Rate | Status |
|------------|--------|
| ≥90% | MATCH |
| 70-89% | PARTIAL MATCH |
| <70% | MISMATCH |

### Automatic MISMATCH Conditions

- Critical feature missing (>20% of deliverables)
- Security feature not implemented
- All done criteria must be verifiable

---

**End of Section E Template**
