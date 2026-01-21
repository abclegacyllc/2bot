# AI Audit System

> **Universal audit templates for AI agents to audit any project**
> **Version:** 2.0

---

## Overview

This directory contains modular audit templates that AI agents can use to audit different aspects of a software project. Each template is self-contained and can be used independently or combined.

---

## Template Index

| Section | File | Purpose | Target |
|---------|------|---------|--------|
| A | [section-a-phase-document.md](TEMPLATES/section-a-phase-document.md) | Audit task/phase documents | Any task/phase markdown files |
| B | [section-b-source-code.md](TEMPLATES/section-b-source-code.md) | Audit source code files | Any source code (any language) |
| C | [section-c-schema.md](TEMPLATES/section-c-schema.md) | Audit database schemas | Any ORM/SQL schema files |
| D | [section-d-config.md](TEMPLATES/section-d-config.md) | Audit configuration files | `.env`, build configs, etc. |
| E | [section-e-cross-reference.md](TEMPLATES/section-e-cross-reference.md) | Verify docs match implementation | Phase docs vs actual code |

---

## Usage Examples

### Single Section Audit

```
User: Read AI-AUDIT/TEMPLATES/section-a-phase-document.md and audit [phase-doc].md, give me the results

User: Read AI-AUDIT/TEMPLATES/section-b-source-code.md and audit [source-directory]/, give me the results

User: Read AI-AUDIT/TEMPLATES/section-c-schema.md and audit [schema-file], give me the results
```

### Combined Section Audit

```
User: Read AI-AUDIT/TEMPLATES/section-b-source-code.md and section-c-schema.md, then audit [module-name]/, give me the results

User: Read AI-AUDIT/TEMPLATES/section-a-phase-document.md and section-e-cross-reference.md, audit [phase-doc].md and verify implementation matches, give me results
```

### Full Audit (One by One)

```
User: Read AI-AUDIT/TEMPLATES/ sections A through E (one by one) and audit [phase-name], give me the results for each section separately
```

**Recommended approach for full audits:**
1. Run Section A first (phase document)
2. Run Section B (source code) 
3. Run Section C (schema) if database changes
4. Run Section D (config) if config changes
5. Run Section E last (cross-reference) to verify alignment

---

## Output Format

Each template produces a standardized report with:

```markdown
# Section X Audit Report

**Target:** [what was audited]
**Audited:** [date]
**Auditor:** AI Auditor

## Summary Scores
| Category | Score | Status |
|----------|-------|--------|
| ... | X% | PASS/WARN/FAIL |

## Detailed Findings
### Issues Found
### Passed Checks

## Verdict
**Status:** APPROVED / APPROVED WITH NOTES / NEEDS REVISION
```

---

## When to Use Each Section

### Section A: Phase Document Audit
Use when:
- New phase document created
- Phase document updated
- Before starting implementation
- Before marking phase complete

### Section B: Source Code Audit
Use when:
- After implementing a feature
- Code review needed
- Security review required
- Refactoring planned

### Section C: Schema Audit
Use when:
- Database models added/changed
- Migrations created
- Performance review needed
- Before production deployment

### Section D: Config Audit
Use when:
- Environment setup
- Docker/deployment changes
- Adding new services
- Security review

### Section E: Cross-Reference Audit
Use when:
- Phase marked complete
- Verifying implementation matches docs
- Before release
- Documentation review

---

## Best Practices

1. **Audit phase docs BEFORE implementation** (Section A)
2. **Audit code AFTER implementation** (Section B)
3. **Cross-reference AFTER both** (Section E)
4. **Split large audits** - Run sections separately for clearer results
5. **Fix issues before proceeding** - Address FAIL items before next phase

---

## Template Customization

Each template is designed to be universal. If you need project-specific checks:

1. Create `AI-AUDIT/CUSTOM/` directory
2. Add project-specific templates there
3. Reference base templates: "Use Section A with additions from CUSTOM/[feature]-checks.md"

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 2.0 | 2026-01-20 | Modular template system |
| 1.0 | 2026-01-20 | Original single-file template |

---

**Old template location:** `docs/AI-AUDIT-TEMPLATE.md` (deprecated, kept for reference)
