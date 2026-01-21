# Section D: Configuration Audit Template (Universal)

> **Purpose:** Audit configuration files for correctness, security, and best practices
> **Target Files:** Environment files, build configs, linting configs, deployment configs
> **Version:** 2.0 (Universal)

---

## Instructions for AI Auditor

When you receive a request to audit configuration:

1. **Discover the project's configuration files first**
2. **Read this template completely**
3. **Execute each audit step (adapt to discovered ecosystem)**
4. **Output results in the format specified at the end**

---

## Step D.0: Discover Configuration Files

**Before auditing, identify configuration in the project:**

```bash
echo "=== ENVIRONMENT FILES ==="
ls -la .env* env.* 2>/dev/null

echo "=== BUILD/PACKAGE CONFIG ==="
ls -la package.json pyproject.toml Cargo.toml go.mod pom.xml build.gradle Gemfile composer.json 2>/dev/null

echo "=== LANGUAGE/COMPILER CONFIG ==="
ls -la tsconfig*.json jsconfig*.json .python-version .ruby-version .nvmrc 2>/dev/null

echo "=== LINTING CONFIG ==="
ls -la .eslintrc* eslint.config* .prettierrc* .flake8 .pylintrc .rubocop* setup.cfg pyproject.toml 2>/dev/null

echo "=== DEPLOYMENT/CONTAINER ==="
ls -la Dockerfile* docker-compose*.yml .dockerignore kubernetes/*.yaml 2>/dev/null

echo "=== OTHER CONFIG ==="
ls -la *.config.* *.json *.yaml *.toml 2>/dev/null | head -20
```

**Record:**
```markdown
**Discovered Configuration:**
- Package Manager: [npm/pip/cargo/maven/bundler/composer/etc.]
- Environment Files: [list]
- Build Config: [list]
- Linting Config: [list]
- Deployment Config: [list]
```

---

## Audit Steps

### Step D.1: Environment Configuration Audit

**Check environment files:**

```bash
# Find all env files
find . -name ".env*" -o -name "env.*" 2>/dev/null | head -10

# Check for secrets in env files (should use placeholders in examples)
grep -n "PASSWORD\|SECRET\|KEY\|TOKEN" .env* 2>/dev/null | head -20

# Check env example exists
ls -la .env.example .env.sample env.example 2>/dev/null
```

**Verify:**
- [ ] `.env.example` or `.env.sample` exists (not actual secrets)
- [ ] Real `.env` is in `.gitignore`
- [ ] All required variables documented
- [ ] Sensitive values are placeholder in examples
- [ ] Environment-specific files exist (dev, test, prod) if needed

**Environment Security Checklist:**
- [ ] No actual secrets committed
- [ ] Database URLs use environment variables
- [ ] API keys use environment variables
- [ ] Secrets don't appear in build logs

---

### Step D.2: Find All Environment Variables Used

**Discover what env vars the code expects:**

```bash
# Find env variable usage (adapt to language)
# JavaScript/TypeScript
grep -roh "process\.env\.[A-Z_]*\|import\.meta\.env\.[A-Z_]*" . 2>/dev/null | sort | uniq

# Python
grep -roh "os\.environ\[.[A-Z_]*.\]\|os\.getenv(.[A-Z_]*." . 2>/dev/null | sort | uniq

# Go
grep -roh "os\.Getenv(.[A-Z_]*." . 2>/dev/null | sort | uniq

# Ruby
grep -roh "ENV\[.[A-Z_]*.\]" . 2>/dev/null | sort | uniq
```

**Compare with documentation:**
- [ ] All used env vars are documented
- [ ] No undefined env vars used
- [ ] Default values provided where appropriate

---

### Step D.3: Package/Dependency Config Audit

**Check dependency configuration (adapt to ecosystem):**

```bash
# Find dependency file
ls -la package.json requirements.txt Cargo.toml go.mod pom.xml Gemfile composer.json 2>/dev/null

# Count dependencies (example for package.json)
# Adapt to your package manager
cat package.json 2>/dev/null | grep -c "\":" || echo "N/A"
```

**Verify:**
- [ ] All dependencies have version specified
- [ ] No wildcard versions (*, latest) in production
- [ ] Dev dependencies separated from production
- [ ] Lock file exists (package-lock.json, Cargo.lock, etc.)
- [ ] No deprecated packages (check warnings)

**Security check:**
```bash
# Check for vulnerabilities (use project's tool)
# npm: npm audit
# pip: pip-audit, safety
# cargo: cargo audit
# bundler: bundle audit
# composer: composer audit

# Example: check if audit tool exists and run
which npm && npm audit --json 2>/dev/null | head -20
```

---

### Step D.4: Build/Compiler Config Audit

**Check build configuration:**

```bash
# Find build config files
ls -la webpack.config.* vite.config.* rollup.config.* next.config.* tsconfig.json babel.config.* 2>/dev/null
ls -la setup.py setup.cfg pyproject.toml Makefile CMakeLists.txt build.gradle 2>/dev/null
```

**For typed languages, check strictness:**
```bash
# TypeScript example
cat tsconfig.json 2>/dev/null | grep -E "strict|noImplicit|null"

# Python mypy example  
cat mypy.ini setup.cfg pyproject.toml 2>/dev/null | grep -E "strict|disallow"
```

**Verify:**
- [ ] Strict mode enabled (if typed language)
- [ ] Appropriate target/version
- [ ] Source and output directories configured
- [ ] Path aliases consistent (if used)

---

### Step D.5: Docker/Container Config Audit

**Check container configuration:**

```bash
# Find Docker files
ls -la Dockerfile* docker-compose*.yml .dockerignore 2>/dev/null

# Check Dockerfile best practices
cat Dockerfile 2>/dev/null | head -30
```

**Dockerfile checklist:**
- [ ] Uses specific base image version (not `latest`)
- [ ] Multi-stage build (if applicable)
- [ ] Non-root user configured
- [ ] .dockerignore exists
- [ ] Only needed files copied
- [ ] Secrets not in build context

**Docker Compose checklist:**
- [ ] Environment variables used (not hardcoded)
- [ ] Volumes for persistent data
- [ ] Networks configured appropriately
- [ ] Resource limits set (for production)
- [ ] Health checks configured

---

### Step D.6: Linting/Formatting Config Audit

**Check code quality configuration:**

```bash
# Find linting configs
ls -la .eslintrc* eslint.config.* .prettierrc* .flake8 .pylintrc .rubocop.yml .golangci.yml 2>/dev/null

# Check what rules are enabled
cat .eslintrc* eslint.config.* 2>/dev/null | head -30
cat setup.cfg pyproject.toml 2>/dev/null | grep -A20 "flake8\|pylint\|black"
```

**Verify:**
- [ ] Linting configured
- [ ] Formatting configured
- [ ] Rules consistent with project style
- [ ] Pre-commit hooks set up (if applicable)

---

### Step D.7: Security Headers/CORS Config

**Check security configuration:**

```bash
# Find security-related config
grep -rn "cors\|CORS" . --include="*.config.*" --include="*.json" --include="*.yaml" 2>/dev/null | head -10
grep -rn "helmet\|security.headers\|CSP\|X-Frame" . 2>/dev/null | head -10
grep -rn "rate.limit\|rateLimit\|throttle" . 2>/dev/null | head -10
```

**Security config checklist:**
- [ ] CORS configured (not wildcard in production)
- [ ] Security headers configured (if web app)
- [ ] Rate limiting configured (if API)
- [ ] SSL/TLS configured (for production)

---

### Step D.8: CI/CD Config Audit

**Check CI/CD configuration:**

```bash
# Find CI config files
ls -la .github/workflows/*.yml .gitlab-ci.yml Jenkinsfile .circleci/config.yml .travis.yml 2>/dev/null

# Read CI config
cat .github/workflows/*.yml 2>/dev/null | head -50
```

**CI/CD checklist:**
- [ ] Tests run in CI
- [ ] Linting runs in CI
- [ ] Security scanning configured
- [ ] Build artifacts configured
- [ ] Deployment configured (if applicable)
- [ ] Secrets use CI secret management (not hardcoded)

---

## Output Format

```markdown
# Section D: Configuration Audit Report

**Project:** [name]
**Ecosystem:** [discovered ecosystem]
**Audited:** [date]
**Auditor:** AI Auditor

---

## Summary Scores

| Category | Score | Status |
|----------|-------|--------|
| Environment Config | X% | PASS/WARN/FAIL |
| Dependencies | X% | PASS/WARN/FAIL |
| Build Config | X% | PASS/WARN/FAIL |
| Container Config | X% | PASS/WARN/FAIL/N/A |
| Linting Config | X% | PASS/WARN/FAIL |
| Security Config | X% | PASS/WARN/FAIL |
| CI/CD Config | X% | PASS/WARN/FAIL/N/A |
| **Overall** | **X%** | **STATUS** |

**Legend:** PASS (≥80%) | WARN (60-79%) | FAIL (<60%)

---

## Configuration Inventory

| Config Type | File(s) | Status |
|-------------|---------|--------|
| Environment | [files] | ✅/⚠️/❌ |
| Dependencies | [file] | ✅/⚠️/❌ |
| Build | [files] | ✅/⚠️/❌ |
| Docker | [files] | ✅/⚠️/❌/N/A |
| Linting | [files] | ✅/⚠️/❌ |
| CI/CD | [files] | ✅/⚠️/❌/N/A |

---

## Environment Variables

| Variable | Documented | Has Default | Sensitive |
|----------|------------|-------------|-----------|
| [VAR_NAME] | ✅/❌ | ✅/❌ | Yes/No |

---

## Detailed Findings

### 🔴 Critical (Must Fix)
1. **[Issue]**
   - File: [path]
   - Risk: [security/build-failure/deployment]
   - Fix: [specific recommendation]

### 🟡 Warnings (Should Fix)
1. **[Issue]**
   - File: [path]
   - Impact: [description]
   - Suggestion: [recommendation]

### 🟢 Suggestions (Nice to Have)
1. [Suggestion]

---

## Security Summary

| Check | Status |
|-------|--------|
| No hardcoded secrets | ✅/❌ |
| .env in .gitignore | ✅/❌ |
| Dependency vulnerabilities | X found |
| CORS configured | ✅/❌/N/A |
| Rate limiting | ✅/❌/N/A |

---

## Verdict

**Status:** APPROVED / APPROVED WITH NOTES / NEEDS REVISION

**Summary:** [1-2 sentence summary]

**Required Changes:**
1. [Change if any]
```

---

## Quick Reference

### Minimum Requirements for APPROVED

- [ ] .env.example exists (if env vars used)
- [ ] .env in .gitignore
- [ ] Dependency lock file exists
- [ ] No critical vulnerabilities
- [ ] Linting configured

### Automatic FAIL Conditions

- Secrets committed in config files
- .env with real secrets committed
- Critical security vulnerabilities in dependencies
- Wildcard CORS (*) in production config
- Missing required environment variables

---

**End of Section D Template**
