# Section B: Source Code Audit Template (Universal)

> **Purpose:** Audit source code files for quality, security, and best practices
> **Target Files:** Any source code files in any language
> **Version:** 2.0 (Universal)

---

## Instructions for AI Auditor

When you receive a request to audit source code:

1. **Discover the project's language/framework first**
2. **Read this template completely**
3. **Execute each audit step (adapt commands to the language)**
4. **Output results in the format specified at the end**

---

## Step B.0: Discover Project Technology

**Before auditing, understand the project:**

```bash
# What language is this project?
ls -la *.json *.toml *.yaml *.yml *.xml 2>/dev/null | head -10

# Common indicators:
# package.json → JavaScript/TypeScript
# requirements.txt, pyproject.toml → Python
# Cargo.toml → Rust
# go.mod → Go
# pom.xml, build.gradle → Java
# Gemfile → Ruby
# composer.json → PHP

# What's the source file extension?
find . -type f -name "*.py" -o -name "*.ts" -o -name "*.js" -o -name "*.go" -o -name "*.rs" -o -name "*.java" -o -name "*.rb" -o -name "*.php" 2>/dev/null | head -5
```

**Record:**
```markdown
**Discovered Technology:**
- Language: [discovered]
- File Extension: [discovered]
- Framework: [if identifiable]
- Linter/Checker: [what tool the project uses]
```

---

## Audit Steps

### Step B.1: File Discovery

**Identify what to audit (adapt to discovered language):**

```bash
# Set your target directory
DIR="[target-directory]"
EXT="[discovered-extension]"

# Find source files
find $DIR -type f -name "*.$EXT" | head -20

# Count files and lines
echo "Source files: $(find $DIR -name "*.$EXT" | wc -l)"
echo "Total lines: $(find $DIR -name "*.$EXT" -exec wc -l {} + | tail -1)"
```

**Record:**
- Total files to audit
- Total lines of code
- File types present

---

### Step B.2: Syntax and Compilation Check

**Run the project's own syntax/type checker:**

```bash
# First, find how this project checks code
# Look in package.json scripts, Makefile, README, etc.

# Common patterns (use what exists in the project):
# JavaScript/TypeScript: npx tsc --noEmit / npx eslint
# Python: python -m py_compile / flake8 / mypy
# Rust: cargo check
# Go: go build ./...
# Java: mvn compile
# Ruby: ruby -c / rubocop
```

**Score:**
- 0 errors = 100%
- 1-5 errors = 80%
- 6-15 errors = 60%
- 16+ errors = FAIL

---

### Step B.3: Import/Dependency Validation

**Check for import issues (adapt patterns to language):**

```bash
# Find import statements
grep -rn "^import\|^from.*import\|require(\|use " $DIR | head -20

# Find export statements
grep -rn "^export\|module.exports\|pub " $DIR | head -20

# Check for potential circular dependencies
# Look for files importing each other
```

**Verify:**
- [ ] All imports resolve to existing files/modules
- [ ] No unused imports (if linter reports them)
- [ ] No circular dependencies
- [ ] Consistent import style

---

### Step B.4: Type Safety (for typed languages)

**For languages with types (adapt to language):**

```bash
# Find "any" or equivalent escape hatches
# TypeScript: any
# Python: Any, # type: ignore
# Go: interface{}, any
# Java: Object casts

grep -rn "any\|Any\|interface{}\|Object)" $DIR | head -20

# Find type assertions/casts
grep -rn "as [A-Z]\|(\([A-Z]" $DIR | head -20
```

**Type Safety Scoring:**

| Issue | Deduction |
|-------|-----------|
| Each type escape (any/Any/etc.) | -2% |
| Each unchecked type cast | -1% |
| Missing type annotation on public API | -1% |

---

### Step B.5: Error Handling Audit

**Check error handling (universal patterns):**

```bash
# Find error handling constructs
grep -rn "try\|catch\|except\|rescue\|recover" $DIR | wc -l

# Find error suppression
grep -rn "catch.*{.*}\|except.*pass\|rescue.*nil" $DIR | head -10

# Find unhandled async/promise patterns
grep -rn "async\|await\|Promise\|Future\|goroutine" $DIR | head -20
```

**Verify:**
- [ ] All potentially failing operations have error handling
- [ ] Errors are logged or propagated
- [ ] No empty catch/except blocks
- [ ] Consistent error handling pattern

---

### Step B.6: Security Audit (Universal)

**Critical security checks (language-agnostic):**

```bash
# Find hardcoded secrets
grep -rni "password\s*=\s*['\"]" $DIR
grep -rni "secret\s*=\s*['\"]" $DIR
grep -rni "api.key\s*=\s*['\"]" $DIR
grep -rni "token\s*=\s*['\"]" $DIR

# Find dangerous string interpolation (SQL injection risk)
grep -rn "SELECT.*\$\|INSERT.*\$\|UPDATE.*\$\|DELETE.*\$" $DIR
grep -rn "SELECT.*%s\|INSERT.*%s\|UPDATE.*%s" $DIR
grep -rn "query.*+" $DIR

# Find eval or dangerous functions
grep -rn "eval(\|exec(\|system(\|shell\|popen" $DIR

# Find sensitive data in logs
grep -rn "print.*password\|log.*token\|debug.*secret" $DIR
```

**Security checklist:**
- [ ] No hardcoded credentials
- [ ] No SQL injection vulnerabilities
- [ ] No command injection risks
- [ ] Sensitive data not logged
- [ ] Input validation present

**Security Score:**
- Critical issue found = FAIL
- High risk issue = -20%
- Medium risk issue = -10%

---

### Step B.7: Code Quality Patterns (Universal)

**Check for code smells:**

```bash
# Find very long files
wc -l $DIR/*.$EXT | sort -rn | head -10

# Find deeply nested code (multiple indent levels)
grep -rn "        if\|        for\|        while" $DIR | head -10

# Find debug statements
grep -rn "print(\|console\.\|debug(\|puts\|p " $DIR | head -20

# Find TODO/FIXME markers
grep -rn "TODO\|FIXME\|HACK\|XXX" $DIR | head -10
```

**Quality checklist:**
- [ ] Files under 500 lines (prefer < 300)
- [ ] Functions/methods under 50 lines
- [ ] Max 3 levels of nesting
- [ ] No debug statements in production code
- [ ] Consistent naming conventions
- [ ] Comments for complex logic

---

### Step B.8: Frontend-Specific (if applicable)

**For UI code (web, mobile, desktop):**

```bash
# Find component-like files
find $DIR -name "*component*" -o -name "*Component*" -o -name "*view*" -o -name "*View*" 2>/dev/null | head -10

# Check for event handlers
grep -rn "onClick\|onChange\|on[A-Z]" $DIR | head -10

# Find state management
grep -rn "useState\|state\|setState\|store\|reducer" $DIR | head -10
```

**Frontend checklist:**
- [ ] Components have proper props/inputs defined
- [ ] Event handlers bound correctly
- [ ] Loading/error states handled
- [ ] Accessibility considered (if web)

---

### Step B.9: Backend/API-Specific (if applicable)

**For API/server code:**

```bash
# Find route definitions (common patterns)
grep -rn "get\|post\|put\|delete\|patch\|route\|endpoint" $DIR | head -20

# Find authentication/authorization
grep -rn "auth\|require.*login\|middleware\|guard" $DIR | head -10

# Find input validation
grep -rn "validate\|schema\|parse\|sanitize" $DIR | head -10

# Find database operations
grep -rn "query\|find\|select\|insert\|update\|delete" $DIR | head -20
```

**Backend checklist:**
- [ ] Routes have authentication where needed
- [ ] Input validation on endpoints
- [ ] Business logic in services (not routes)
- [ ] Consistent response format
- [ ] Database queries parameterized

---

### Step B.10: Test Coverage Check

```bash
# Find test files (common patterns)
find $DIR -name "*test*" -o -name "*spec*" -o -name "*_test*" 2>/dev/null | head -20

# Count test files vs source files
echo "Test files: $(find $DIR -name '*test*' -o -name '*spec*' | wc -l)"
echo "Source files: $(find $DIR -name '*.$EXT' | grep -v test | grep -v spec | wc -l)"
```

---

## Output Format

```markdown
# Section B: Source Code Audit Report

**Target:** [directory/files]
**Language:** [discovered language]
**Audited:** [date]
**Auditor:** AI Auditor

---

## Summary Scores

| Category | Score | Status |
|----------|-------|--------|
| Syntax/Compilation | X% | PASS/WARN/FAIL |
| Type Safety | X% | PASS/WARN/FAIL/N/A |
| Error Handling | X% | PASS/WARN/FAIL |
| Security | X% | PASS/WARN/FAIL |
| Code Quality | X% | PASS/WARN/FAIL |
| **Overall** | **X%** | **STATUS** |

**Legend:** PASS (≥80%) | WARN (60-79%) | FAIL (<60%)

---

## Code Statistics

| Metric | Value |
|--------|-------|
| Language | [discovered] |
| Files Audited | X |
| Total Lines | X |
| Test Files | X |

---

## Detailed Findings

### 🔴 Critical (Must Fix)
1. **[Issue]**
   - File: [path:line]
   - Risk: [security/crash/data-loss]
   - Fix: [specific recommendation]

### 🟡 Warnings (Should Fix)
1. **[Issue]**
   - File: [path:line]
   - Impact: [description]
   - Suggestion: [recommendation]

### 🟢 Suggestions (Nice to Have)
1. [Suggestion]

---

## File-by-File Summary

| File | Lines | Issues | Score |
|------|-------|--------|-------|
| [filename] | X | 0 | ✅ |
| [filename] | X | 2 warnings | ⚠️ |
| [filename] | X | 1 critical | ❌ |

---

## Security Summary

| Check | Status |
|-------|--------|
| No hardcoded secrets | ✅/❌ |
| No injection vulnerabilities | ✅/❌ |
| Input validation | ✅/❌ |
| Sensitive data not logged | ✅/❌ |

---

## Verdict

**Status:** APPROVED / APPROVED WITH NOTES / NEEDS REVISION

**Summary:** [1-2 sentence summary]

**Required Fixes:**
1. [Fix if any]
```

---

## Quick Reference

### Minimum Requirements for APPROVED

- [ ] No syntax/compilation errors
- [ ] No critical security issues
- [ ] Error handling on failing operations
- [ ] No hardcoded credentials

### Automatic FAIL Conditions

- Syntax/compilation errors
- Hardcoded secrets/passwords
- SQL/command injection vulnerability
- Exposed sensitive data in logs
- eval() or similar dangerous functions

---

**End of Section B Template**
