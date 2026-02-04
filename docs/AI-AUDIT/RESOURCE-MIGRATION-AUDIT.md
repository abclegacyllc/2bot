# Resource Module Migration Audit

## Overview

This document audits the migration from the OLD quota system to the NEW resource module with hierarchical types.

**Created**: February 2026  
**Completed**: February 1, 2026  
**Status**: ✅ MIGRATION COMPLETE

---

## 1. Consumer Files Analysis

### 1.1 `src/server/routes/quota.ts`

| Line | Old Service Call | New Service Call | Notes |
|------|-----------------|------------------|-------|
| 26 | `import { setQuotasSchema, usageHistoryQuerySchema } from '@/modules/quota/quota.validation'` | Move validation to `@/modules/resource` or keep shared | Need to create validation schemas |
| 118 | `quotaService.getQuotaStatus(ctx)` | `resourceService.getResourceStatus(ctx)` | Returns new hierarchical types |
| 156 | `quotaService.getOrgMemberResourceStatus(orgId, deptId, memberId)` | `resourceService.getMemberStatus(ctx, orgId, deptId, memberId)` | ✅ Already matches new pattern |
| 159 | `quotaService.getOrgDeptResourceStatus(orgId, deptId)` | `resourceService.getDeptStatus(ctx, orgId, deptId)` | ✅ Already matches new pattern |
| 162 | `quotaService.getOrgResourceStatus(orgId)` | `resourceService.getOrgStatus(ctx, orgId)` | ✅ Already matches new pattern |
| 165 | `quotaService.getPersonalResourceStatus(ctx)` | `resourceService.getPersonalStatus(ctx)` | ✅ Already matches new pattern |
| 191 | `quotaService.getEffectiveLimits(ctx)` | Remove or extract from `resourceService` response | Limits are embedded in status |
| 228 | `QuotaOwner` type | `ResourceOwner` from new types | Type rename |
| 233 | `quotaService.getUsageHistory(owner, periodType, start, end)` | `usageTracker.getHistory(ctx, periodType, start, end)` | Need to add history method |
| 287 | `quotaService.getQuotas({ type: 'organization', organizationId })` | `resourceService.getOrgStatus(ctx, organizationId)` | Different return shape |
| 331 | `quotaService.setOrganizationQuotas(ctx, organizationId, data)` | `allocationService.setOrgQuotas(ctx, orgId, data)` | Need to add method |
| 333 | `quotaService.getQuotas({ type: 'organization', organizationId })` | `resourceService.getOrgStatus(ctx, orgId)` | Different return shape |
| 368 | `quotaService.getQuotas({ type: 'department', departmentId })` | `resourceService.getDeptStatus(ctx, orgId, deptId)` | Need orgId from dept lookup |
| 418-420 | `quotaService.setDepartmentQuotas(...)` | `allocationService.setDeptAllocation(ctx, deptId, input)` | ✅ Already exists |
| 463 | `quotaService.getQuotas({ type: 'employee', ...})` | `resourceService.getMemberStatus(ctx, orgId, deptId, userId)` | ✅ Already exists |
| 531-533 | `quotaService.setEmployeeQuotas(...)` | `allocationService.setMemberAllocation(ctx, userId, deptId, input)` | ✅ Already exists |

**Migration Steps for quota.ts**:
1. Update imports from `@/modules/resource` instead of `@/modules/quota`
2. Replace `quotaService` calls with `resourceService` calls
3. Create validation schemas in resource module
4. Add `getHistory()` method to usage tracker
5. Response types will change - update API response shapes

---

### 1.2 `src/server/routes/orgs.ts`

| Line | Old Service Call | New Service Call | Notes |
|------|-----------------|------------------|-------|
| 455 | `QuotaStatus` type | `OrgResourceStatus` | Type rename |
| 459 | `quotaService.getQuotaStatus(ctx)` | `resourceService.getOrgStatus(ctx, orgId)` | New method |
| 602 | `QuotaAllocationService.getDeptAllocation(deptId)` | `allocationService.getDeptAllocation(deptId)` | ✅ Already exists |
| 630 | `QuotaAllocationService.setDeptAllocation(ctx, deptId, req.body)` | `allocationService.setDeptAllocation(ctx, deptId, input)` | ✅ Already exists |
| 666 | `QuotaAllocationService.getMemberAllocation(deptId, userId)` | `allocationService.getMemberAllocation(userId, deptId)` | ⚠️ Param order changed |
| 696 | `QuotaAllocationService.setMemberAllocation(ctx, deptId, userId, req.body)` | `allocationService.setMemberAllocation(ctx, userId, deptId, input)` | ⚠️ Param order changed |
| 869 | `quotaService.getQuotaStatus(ctx)` | `resourceService.getOrgStatus(ctx, orgId)` | Need orgId |

**Migration Steps for orgs.ts**:
1. Update imports to use `allocationService, resourceService` from `@/modules/resource`
2. Update type imports (`QuotaStatus` → `OrgResourceStatus`)
3. Note: Member allocation param order is `(userId, deptId)` in new service
4. Response shapes may differ - verify API compatibility

---

### 1.3 `src/server/routes/usage.ts`

| Line | Old Service Call | New Service Call | Notes |
|------|-----------------|------------------|-------|
| 72 | `quotaService.getQuotaStatus(ctx)` | `resourceService.getPersonalStatus(ctx)` | For personal context |
| 74 | `ExecutionTrackerService.getExecutionCount(ctx)` | `usageTracker.getRealTimeUsage(ctx).workflowRuns` | Embedded in usage tracker |

**Migration Steps for usage.ts**:
1. Replace `quotaService` with `resourceService`
2. Replace `ExecutionTrackerService` with `usageTracker`
3. Extract needed fields from new response shape

---

## 2. Service Method Mapping

### Old → New Service Mapping

```
OLD quotaService                          →  NEW resourceService
─────────────────────────────────────────────────────────────────
getQuotaStatus(ctx)                       →  getResourceStatus(ctx)
getPersonalResourceStatus(ctx)            →  getPersonalStatus(ctx)
getOrgResourceStatus(orgId)               →  getOrgStatus(ctx, orgId)
getOrgDeptResourceStatus(orgId, deptId)   →  getDeptStatus(ctx, orgId, deptId)
getOrgMemberResourceStatus(o, d, m)       →  getMemberStatus(ctx, orgId, deptId, userId)
getEffectiveLimits(ctx)                   →  [embedded in status response]
getQuotas(owner)                          →  [use appropriate get*Status method]
setOrganizationQuotas(ctx, orgId, data)   →  [TODO: add to allocationService]
setDepartmentQuotas(ctx, deptId, data)    →  allocationService.setDeptAllocation(ctx, deptId, input)
setEmployeeQuotas(ctx, deptId, uid, data) →  allocationService.setMemberAllocation(ctx, userId, deptId, input)
getUsageHistory(owner, period, start, end)→  [TODO: add to usageTracker]

OLD QuotaAllocationService                →  NEW allocationService
─────────────────────────────────────────────────────────────────
getDeptAllocation(deptId)                 →  getDeptAllocation(deptId)
setDeptAllocation(ctx, deptId, data)      →  setDeptAllocation(ctx, deptId, input, mode?)
getMemberAllocation(deptId, userId)       →  getMemberAllocation(userId, deptId) ⚠️ order changed
setMemberAllocation(ctx, deptId, uid, d)  →  setMemberAllocation(ctx, userId, deptId, input, mode?)

OLD ExecutionTrackerService               →  NEW usageTracker
─────────────────────────────────────────────────────────────────
getExecutionCount(ctx)                    →  getRealTimeUsage(ctx).workflowRuns
trackExecution(ctx, workflowId)           →  trackWorkflowRun(ctx, ...)
```

---

## 3. Missing Features in New Resource Module

### 3.1 Methods to Add

| Method | Service | Description |
|--------|---------|-------------|
| `getHistory()` | usageTracker | Get usage history for a period |
| `setOrgQuotas()` | allocationService | Set org-level quota limits (if needed) |

### 3.2 Validation Schemas

Need to create in `@/modules/resource/resource.validation.ts`:
- `setDeptAllocationSchema` - Validate dept allocation input
- `setMemberAllocationSchema` - Validate member allocation input
- `usageHistoryQuerySchema` - Validate history query params

---

## 4. Prisma Schema Migration Plan

### 4.1 Current Schema (OLD)

```prisma
// OLD: ResourceQuota - single table for all quota types
model ResourceQuota {
  id               String    @id @default(cuid())
  organizationId   String?   @unique
  departmentId     String?   @unique
  userId           String?   @unique
  maxWorkflows     Int?
  maxPlugins       Int?
  maxWorkflowRuns  Int?
  usedWorkflows    Int       @default(0)
  usedPlugins      Int       @default(0)
  usedCredits      Int       @default(0)
  // ... usage tracking in same table
}

// Allocation tables exist but may not match new architecture
model DeptAllocation { ... }
model MemberAllocation { ... }
```

### 4.2 Proposed Schema (NEW)

```prisma
// KEEP: DeptAllocation - allocations from org pool to departments
// Already matches new architecture, minor field updates
model DeptAllocation {
  id              String              @id @default(cuid())
  departmentId    String              @unique
  
  // Automation allocations
  maxGateways     Int?
  maxPlugins      Int?
  maxWorkflows    Int?
  
  // Billing allocations
  creditBudget    Int?
  
  // Workspace allocations
  maxRamMb        Int?
  maxCpuCores     Float?
  maxStorageMb    Int?
  
  // NEW: Add execution limits
  maxWorkflowRunsPerMonth Int?        // Allocated runs from org pool
  
  allocMode       AllocationMode      @default(SOFT_CAP)
  setById         String
  createdAt       DateTime            @default(now())
  updatedAt       DateTime            @updatedAt
  
  department      Department          @relation(...)
  setBy           User                @relation(...)
}

// KEEP: MemberAllocation - allocations from dept to members
model MemberAllocation {
  id              String              @id @default(cuid())
  userId          String
  departmentId    String
  
  // Automation allocations (subset of dept allocation)
  maxGateways     Int?
  maxWorkflows    Int?
  
  // Billing allocations
  creditBudget    Int?
  
  // Workspace allocations
  maxRamMb        Int?
  maxCpuCores     Float?
  maxStorageMb    Int?
  
  // NEW: Add execution limits
  maxWorkflowRunsPerMonth Int?
  
  allocMode       AllocationMode      @default(SOFT_CAP)
  setById         String
  createdAt       DateTime            @default(now())
  updatedAt       DateTime            @updatedAt
  
  @@unique([userId, departmentId])
}

// DEPRECATE: ResourceQuota - usage tracking moves to Redis
// Keep for migration period, then remove
model ResourceQuota {
  // Mark as @deprecated in comments
  // Usage tracking should use usageTracker (Redis)
  // Limits are in DeptAllocation/MemberAllocation
}

// NEW: Consider adding PlanOverride for custom limits
model PlanOverride {
  id              String              @id @default(cuid())
  userId          String?             @unique
  organizationId  String?             @unique
  
  // Override plan limits
  maxGateways     Int?
  maxPlugins      Int?
  maxWorkflows    Int?
  maxWorkflowRunsPerMonth Int?
  creditsPerMonth Int?
  
  reason          String?             // Why override was granted
  expiresAt       DateTime?           // Optional expiration
  setById         String
  createdAt       DateTime            @default(now())
  
  @@index([userId])
  @@index([organizationId])
}
```

### 4.3 Migration Steps

1. **Phase 1: Add new fields** (non-breaking)
   ```sql
   -- Add missing fields to existing tables
   ALTER TABLE dept_allocations ADD COLUMN max_workflow_runs_per_month INT;
   ALTER TABLE member_allocations ADD COLUMN max_workflow_runs_per_month INT;
   ```

2. **Phase 2: Create bridge** (parallel systems)
   - New resource module reads from DeptAllocation/MemberAllocation
   - Keep ResourceQuota for backward compatibility
   - Usage tracking moves to Redis via usageTracker

3. **Phase 3: Migrate data**
   - Copy relevant data from ResourceQuota to allocations
   - Verify all consumers use new resource module

4. **Phase 4: Deprecate ResourceQuota**
   - Mark model as deprecated
   - Remove references in code
   - Eventually drop table

---

## 5. Implementation Checklist

### Phase A: Update Consumer Files ✅ COMPLETED

- [x] **A1**: Create `resource.validation.ts` with Zod schemas
- [x] **A2**: Add `getHistory()` to usageTracker
- [x] **A3**: Update `quota.ts` imports and calls
- [x] **A4**: Update `orgs.ts` imports and calls  
- [x] **A5**: Update `usage.ts` imports and calls
- [x] **A6**: Run tests, fix type errors (628 tests pass)
- [x] **A7**: Test API endpoints manually

### Phase B: Prisma Schema Migration ✅ COMPLETED

- [x] **B1**: Schema already has correct allocation fields (no changes needed)
- [x] **B2**: No migration needed - workflow runs tracked at org/personal level only
- [x] **B3**: N/A - schema unchanged
- [x] **B4**: resourceService already uses allocation fields correctly
- [x] **B5**: Deprecate ResourceQuota references (comments added to schema)
- [x] **B6**: Build passes
- [x] **B7**: All 628 tests pass

### Phase C: Cleanup ✅ COMPLETED

- [x] **C1**: Remove old quota module exports (already deleted, cleaned dist/)
- [x] **C2**: Update documentation (this file)
- [x] **C3**: ResourceQuota marked deprecated in schema (will remove after migration period)

---

## 6. API Response Changes

### Old Response Shape (QuotaStatus)
```json
{
  "gateways": { "used": 2, "limit": 5 },
  "plugins": { "used": 1, "limit": 10 },
  "workflows": { "used": 3, "limit": 20 },
  "workflowRuns": { "used": 150, "limit": 1000 }
}
```

### New Response Shape (PersonalResourceStatus)
```json
{
  "context": "personal",
  "userId": "user_123",
  "plan": "PRO",
  "executionMode": "SERVERLESS",
  "automation": {
    "gateways": {
      "count": { "used": 2, "limit": 5, "percentage": 40, "isUnlimited": false },
      "metrics": { "requests": { ... } }
    },
    "plugins": { "count": { ... }, "metrics": { ... } },
    "workflows": { "count": { ... }, "metrics": { "runs": { ... }, "steps": { ... } } }
  },
  "workspace": null,
  "billing": {
    "credits": { "balance": 1000, "usage": { ... } },
    "subscription": { "seats": { ... }, "plan": "PRO", "features": { ... } }
  },
  "historyDays": 30
}
```

### Migration Strategy
- Keep old endpoints returning old shape during migration
- New `/v2/` endpoints return new shape
- Eventually deprecate old endpoints

---

## 7. Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| API breaking changes | High | Version endpoints, parallel systems |
| Data loss during migration | High | Backup before migration, staged rollout |
| Performance regression | Medium | Redis caching, monitor queries |
| Missing functionality | Medium | Audit all usages before migration |

---

## 8. Timeline Estimate

| Phase | Duration | Dependencies |
|-------|----------|--------------|
| Phase A (Consumers) | 2-3 days | None |
| Phase B (Prisma) | 1-2 days | Phase A complete |
| Phase C (Cleanup) | 1 day | Phase B verified |
| **Total** | **4-6 days** | |

