# Section C: Schema Audit Template (Universal)

> **Purpose:** Audit database schemas for correctness, performance, and best practices
> **Target Files:** Any database schema, ORM models, or migration files
> **Version:** 2.0 (Universal)

---

## Instructions for AI Auditor

When you receive a request to audit database schema:

1. **Discover the ORM/schema system first**
2. **Read this template completely**
3. **Execute each audit step (adapt to discovered system)**
4. **Output results in the format specified at the end**

---

## Step C.0: Discover Schema Technology

**Before auditing, identify the schema system:**

```bash
# Look for schema definition files
ls -la *.prisma prisma/ 2>/dev/null          # Prisma (JS/TS)
ls -la models.py models/ 2>/dev/null          # Django/SQLAlchemy (Python)
ls -la db/schema.rb app/models/ 2>/dev/null   # ActiveRecord (Ruby)
ls -la *.entity.ts entities/ 2>/dev/null      # TypeORM (TypeScript)
ls -la migrations/ alembic/ 2>/dev/null       # Migration folders
ls -la *.sql schema.sql 2>/dev/null           # Raw SQL

# Check for ORM in dependencies
grep -l "prisma\|sequelize\|typeorm\|sqlalchemy\|activerecord\|django" package.json requirements.txt Gemfile 2>/dev/null
```

**Record:**
```markdown
**Discovered Schema Technology:**
- ORM/System: [Prisma/SQLAlchemy/ActiveRecord/TypeORM/Sequelize/Raw SQL/etc.]
- Schema File(s): [path(s)]
- Migration System: [if applicable]
```

---

## Audit Steps

### Step C.1: Schema Overview

**Gather basic stats (adapt to your ORM):**

```bash
# Set schema path based on discovery
SCHEMA="[discovered-schema-path]"

echo "=== SCHEMA STATS ==="
echo "Total lines: $(wc -l < $SCHEMA 2>/dev/null || find . -name '*.model.*' -exec wc -l {} +)"

# Count models/tables (adapt pattern to ORM)
# Prisma: grep -c '^model '
# SQLAlchemy: grep -c 'class.*Base'
# ActiveRecord: ls app/models/*.rb | wc -l
# TypeORM: grep -c '@Entity'
# Raw SQL: grep -c 'CREATE TABLE'
```

**Record:**
- Total models/tables
- Total enums/custom types
- Total relationships
- Total indexes

---

### Step C.2: Model/Table Structure Validation

**For each model/table, verify:**

| Required Element | Universal Check |
|------------------|-----------------|
| Primary Key | Has id/pk field defined |
| Timestamps | Has created_at and updated_at |
| Proper naming | Follows project conventions |
| Field types | Appropriate types for data |
| Nullable | Optional/required used correctly |
| Defaults | Sensible defaults where needed |

**Find potential issues:**
```bash
# Find models/tables (adapt to ORM syntax)
grep -n "model\|class.*Model\|CREATE TABLE\|@Entity" $SCHEMA

# Look for timestamp patterns
grep -n "created\|updated\|timestamp" $SCHEMA

# Look for ID patterns
grep -n "id\|pk\|primary" $SCHEMA
```

**Checklist:**
- [ ] Every table has a primary key
- [ ] Audit fields (createdAt, updatedAt) exist
- [ ] Field names follow conventions
- [ ] Required vs optional is intentional

---

### Step C.3: Relationship Audit

**Check all relationships:**

```bash
# Find relationship definitions (adapt to ORM)
# Prisma: @relation
# SQLAlchemy: relationship(), ForeignKey
# ActiveRecord: belongs_to, has_many, has_one
# TypeORM: @ManyToOne, @OneToMany
# SQL: REFERENCES, FOREIGN KEY

grep -n "relation\|foreign\|belongs\|has_many\|has_one\|REFERENCES\|ManyToOne\|OneToMany" $SCHEMA
```

**Verify for each relationship:**
- [ ] Both sides of relation defined (if bidirectional)
- [ ] Foreign key references correct table/column
- [ ] Appropriate delete behavior (CASCADE/SET NULL/RESTRICT)
- [ ] Appropriate update behavior

**Common cascade patterns:**

| Relationship | Typical Delete Behavior |
|--------------|------------------------|
| User → owned data | CASCADE |
| User → sessions | CASCADE |
| Parent → children | CASCADE |
| Soft-delete entities | RESTRICT or SET NULL |
| Reference data | RESTRICT |

---

### Step C.4: Index Audit

**Check indexing strategy:**

```bash
# Find index definitions (adapt to ORM)
# Prisma: @@index, @unique
# SQLAlchemy: Index(), unique=True
# ActiveRecord: add_index
# TypeORM: @Index
# SQL: CREATE INDEX, UNIQUE

grep -n "index\|unique\|INDEX\|UNIQUE" $SCHEMA
```

**Verify:**
- [ ] All foreign keys are indexed
- [ ] Frequently queried fields are indexed
- [ ] Unique constraints where needed
- [ ] Composite indexes for multi-field queries
- [ ] No redundant indexes

**Fields that typically SHOULD be indexed:**

| Field Pattern | Index Type |
|---------------|------------|
| Foreign keys (*_id, *Id) | Index |
| Email (if for login) | Unique |
| Timestamps (if sorted) | Index |
| Status (if filtered) | Index |
| Lookup codes | Unique |

---

### Step C.5: Naming Convention Audit

**Check naming patterns:**

```bash
# List all model/table names
grep -o "model [A-Za-z]*\|class [A-Za-z]*\|CREATE TABLE [a-z_]*" $SCHEMA | head -20

# List field/column names
grep -E "^\s+[a-zA-Z_]+" $SCHEMA | head -30
```

**Common conventions by ecosystem:**

| Ecosystem | Models | Fields | Tables (DB) | Columns (DB) |
|-----------|--------|--------|-------------|--------------|
| JS/TS | PascalCase | camelCase | snake_case | snake_case |
| Python | PascalCase | snake_case | snake_case | snake_case |
| Ruby | PascalCase | snake_case | snake_case | snake_case |
| SQL | - | - | snake_case | snake_case |

**Verify:**
- [ ] Consistent casing throughout
- [ ] No mixed conventions
- [ ] Abbreviated terms consistent (Id vs ID)

---

### Step C.6: Data Type Audit

**Check appropriate types for common fields:**

| Data Type | Recommended |
|-----------|-------------|
| IDs | UUID/CUID/Auto-increment (project choice) |
| Emails | String/VARCHAR with unique constraint |
| Passwords | String/VARCHAR (store hash, never plaintext) |
| Money | Decimal/Integer (cents) - NEVER Float |
| Timestamps | DateTime/Timestamp |
| Booleans | Boolean with default |
| JSON data | JSON/JSONB type |
| Large text | Text type (not VARCHAR) |

```bash
# Find potential type issues
grep -ni "password\|secret\|token" $SCHEMA
grep -ni "price\|amount\|cost\|money" $SCHEMA
grep -ni "float.*price\|float.*money\|float.*amount" $SCHEMA  # BAD
```

**Verify:**
- [ ] No Float for money (precision issues)
- [ ] Passwords stored as string (hashing in app)
- [ ] Emails have unique constraint if login field
- [ ] Status fields use enum/constrained values

---

### Step C.7: Enum/Type Audit

**Find and check enums/custom types:**

```bash
# Find enum definitions (adapt to ORM)
# Prisma: enum
# SQLAlchemy: Enum()
# TypeORM: enum
# SQL: CREATE TYPE, ENUM

grep -n "enum\|ENUM\|TYPE.*AS" $SCHEMA
```

**Verify:**
- [ ] Enums used for fixed value sets (not strings)
- [ ] Enum values follow conventions (UPPER_CASE typical)
- [ ] Default values specified where needed
- [ ] Values match application constants

---

### Step C.8: Migration Audit

**Check migration files exist and are valid:**

```bash
# Find migration folder (adapt to system)
ls -la migrations/ db/migrate/ alembic/versions/ prisma/migrations/ 2>/dev/null

# List recent migrations
find . -path "*/migration*" -name "*.sql" -o -name "*.py" -o -name "*.rb" 2>/dev/null | head -10

# Check migration status (use project's tool)
# Prisma: npx prisma migrate status
# Django: python manage.py showmigrations
# Rails: rails db:migrate:status
# Alembic: alembic current
```

**Verify:**
- [ ] Migrations exist for all schema changes
- [ ] Migrations are sequential/versioned
- [ ] No pending migrations in production schema
- [ ] Rollback scripts exist (if required)

---

### Step C.9: Security Audit

**Check for security issues:**

```bash
# Look for sensitive fields
grep -ni "password\|secret\|token\|key\|credential" $SCHEMA

# Look for fields that might need encryption
grep -ni "ssn\|social\|credit\|card\|bank" $SCHEMA

# Check for cascade delete risks
grep -ni "cascade\|delete" $SCHEMA
```

**Security checklist:**
- [ ] Sensitive fields identified
- [ ] No plaintext password storage indicated
- [ ] PII fields identified for compliance
- [ ] Cascade deletes won't orphan critical data
- [ ] Audit trail fields present (if required)

---

## Output Format

```markdown
# Section C: Schema Audit Report

**Schema System:** [discovered ORM/system]
**Target File(s):** [schema paths]
**Audited:** [date]
**Auditor:** AI Auditor

---

## Summary Scores

| Category | Score | Status |
|----------|-------|--------|
| Structure | X% | PASS/WARN/FAIL |
| Relationships | X% | PASS/WARN/FAIL |
| Indexes | X% | PASS/WARN/FAIL |
| Naming | X% | PASS/WARN/FAIL |
| Data Types | X% | PASS/WARN/FAIL |
| Security | X% | PASS/WARN/FAIL |
| **Overall** | **X%** | **STATUS** |

**Legend:** PASS (≥80%) | WARN (60-79%) | FAIL (<60%)

---

## Schema Statistics

| Metric | Value |
|--------|-------|
| Schema System | [name] |
| Models/Tables | X |
| Enums/Types | X |
| Relationships | X |
| Indexes | X |
| Migrations | X |

---

## Detailed Findings

### 🔴 Critical (Must Fix)
1. **[Issue]**
   - Location: [model/table]
   - Risk: [data-loss/security/performance]
   - Fix: [specific recommendation]

### 🟡 Warnings (Should Fix)
1. **[Issue]**
   - Location: [model/table]
   - Impact: [description]
   - Suggestion: [recommendation]

### 🟢 Suggestions (Nice to Have)
1. [Suggestion]

---

## Model-by-Model Summary

| Model/Table | Fields | Indexes | Relations | Status |
|-------------|--------|---------|-----------|--------|
| [Name] | X | X | X | ✅/⚠️/❌ |

---

## Index Coverage

| Table | Foreign Keys | Indexed? | Query Fields | Indexed? |
|-------|--------------|----------|--------------|----------|
| [Name] | [fields] | ✅/❌ | [fields] | ✅/❌ |

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

- [ ] All tables have primary keys
- [ ] Foreign keys are indexed
- [ ] No Float for money fields
- [ ] Timestamps on auditable tables
- [ ] Unique constraints on lookup fields

### Automatic FAIL Conditions

- Missing primary key on any table
- Money stored as Float
- Plaintext password field (field named 'password' without hashing note)
- Missing critical indexes (unindexed foreign keys on large tables)
- Orphan cascade that would delete critical data

---

**End of Section C Template**
