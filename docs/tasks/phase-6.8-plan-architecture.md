# Phase 6.8: Plan Architecture Redesign

> **Goal:** Implement proper User Plan vs Organization Plan separation with dual execution modes
> **Estimated Sessions:** 6-7
> **Prerequisites:** Phase 6.7 complete
> **Priority:** Complete BEFORE Phase 6.9 (Enterprise Migration)

---

##  Current State Audit

### What Already Exists ✅

| Component | Location | Notes |
|-----------|----------|-------|
| `PlanType` enum | `prisma/schema.prisma:16` | FREE, STARTER, PRO, BUSINESS, ENTERPRISE |
| `User.plan` field | `prisma/schema.prisma:78` | Working correctly |
| `PLAN_LIMITS` | `src/shared/constants/plans.ts:11` | Partial - needs update |
| `PLAN_PRICING` | `src/shared/constants/plans.ts:150` | Working |
| `QuotaService` | `src/modules/quota/quota.service.ts` | 767 lines, full implementation |
| `ResourceQuota` model | `prisma/schema.prisma:336` | Working |
| `Department` model | `prisma/schema.prisma:279` | Has maxWorkflows, maxPlugins, maxApiCalls, maxStorage |
| `DepartmentMember` model | `prisma/schema.prisma:309` | Has maxWorkflows, maxPlugins |
| `UsageHistory` model | `prisma/schema.prisma:407` | Working |
| `AlertConfig/AlertHistory` | `prisma/schema.prisma:452+` | Working |

### What Needs Fixing ⚠️

| Issue | Current State | Required State |
|-------|---------------|----------------|
| `planHierarchy` | `{ FREE: 0, PRO: 1, ENTERPRISE: 2 }` | All 5 plans with correct order |
| Admin filter | Missing STARTER | Include all 5 plans |
| `Organization.plan` | Uses `PlanType` enum | Use separate `OrgPlan` enum |
| `PLAN_QUOTA_LIMITS` | Duplicates PLAN_LIMITS with conflicts | Unify into single source |

### What Must Be Built ❌

| Component | Priority | Notes |
|-----------|----------|-------|
| `OrgPlan` enum | 🔴 Critical | Separate enum for organizations |
| `ExecutionMode` enum | 🔴 Critical | SERVERLESS vs WORKSPACE |
| `ORG_PLAN_LIMITS` constant | 🔴 Critical | Organization-specific limits |
| `WORKSPACE_ADDONS` constant | 🟡 High | Add-on tiers for workspace resources |
| `ALL_PLAN_TYPES` export | 🟡 High | Helper arrays for plan types |
| `DeptAllocation` model | 🟡 High | Admin allocates org pool to dept |
| `MemberAllocation` model | 🟡 High | Manager allocates dept pool to member |
| `QuotaAllocationService` | 🟡 High | Admin quota management |

---

## 📋 Task Overview

| ID | Task | Status | Session |
|----|------|--------|---------|
| **Part A: Fix Current Issues** ||||
| 6.8.1 | Fix planHierarchy in protected-route | ✅ | 1 |
| 6.8.2 | Fix admin users page plan filter | ✅ | 1 |
| 6.8.3 | Create plan type constants and helpers | ✅ | 1 |
| 6.8.4 | Update PLAN_LIMITS structure | ✅ | 1 |
| 6.8.5 | Unify PLAN_QUOTA_LIMITS with PLAN_LIMITS | ✅ | 1 |
| **Part B: Workspace Add-Ons** ||||
| 6.8.6 | Create WORKSPACE_ADDONS constant | ✅ | 2 |
| 6.8.7 | Add ExecutionMode enum to schema | ✅ | 2 |
| 6.8.8 | Add workspace fields to User model | ✅ | 2 |
| **Part C: Organization Plan Separation** ||||
| 6.8.9 | Add OrgPlan enum to schema | ✅ | 2 |
| 6.8.10 | Create ORG_PLAN_LIMITS constant | ✅ | 2 |
| 6.8.11 | Migrate Organization.plan to OrgPlan | ✅ | 3 |
| 6.8.12 | Update organization service for OrgPlan | ✅ | 3 |
| **Part D: Quota Management** ||||
| 6.8.13 | Add DeptAllocation and MemberAllocation schemas | ✅ | 3 |
| 6.8.14 | Create QuotaAllocationService | ✅ | 4 |
| 6.8.15 | Create quota enforcement middleware | ✅ | 4 |
| 6.8.16 | Build admin quota management UI | ✅ | 4 |
| **Part E: Usage Tracking & Enforcement UI** ||||
| 6.8.17 | Create ExecutionTracker service | ✅ | 5 |
| 6.8.18 | Create usage warning components | ✅ | 5 |
| 6.8.19 | Create upgrade prompt component | ✅ | 5 |
| 6.8.20 | Create limit reached modal | ✅ | 5 |
| 6.8.21 | Create user usage dashboard page | ✅ | 6 |
| 6.8.22 | Create org usage dashboard page | ✅ | 6 |
| **Part F: Testing & Documentation** ||||
| 6.8.23 | Add plan architecture tests | ✅ | 7 |
| 6.8.24 | Update CURRENT-STATE.md | ✅ | 7 |

---

## 📝 Detailed Tasks

---

## Part A: Fix Current Issues

### Task 6.8.1: Fix planHierarchy in protected-route

**Session Type:** Frontend
**Estimated Time:** 5 minutes
**Prerequisites:** None

#### Context Files:
- src/components/auth/protected-route.tsx

#### Problem:
```typescript
// CURRENT (missing STARTER and BUSINESS)
const planHierarchy: Record<string, number> = { FREE: 0, PRO: 1, ENTERPRISE: 2 };
```

#### Implementation:
```typescript
// CORRECT (all 5 plans in order)
const planHierarchy: Record<string, number> = { 
  FREE: 0, 
  STARTER: 1, 
  PRO: 2, 
  BUSINESS: 3, 
  ENTERPRISE: 4 
};
```

#### Done Criteria:
- [ ] planHierarchy includes all 5 plan types
- [ ] Plan access checks work correctly for STARTER and BUSINESS users

---

### Task 6.8.2: Fix Admin Users Page Plan Filter

**Session Type:** Frontend
**Estimated Time:** 5 minutes
**Prerequisites:** None

#### Context Files:
- src/app/(admin)/admin/users/page.tsx

#### Problem:
```typescript
// CURRENT (missing STARTER)
{["FREE", "PRO", "BUSINESS", "ENTERPRISE"].map((plan) => (
```

#### Implementation:
```typescript
// CORRECT (all 5 plans)
{["FREE", "STARTER", "PRO", "BUSINESS", "ENTERPRISE"].map((plan) => (
```

#### Done Criteria:
- [ ] Admin can filter users by STARTER plan
- [ ] Filter dropdown shows all 5 plan options

---

### Task 6.8.3: Create Plan Type Constants and Helpers

**Session Type:** Backend
**Estimated Time:** 15 minutes
**Prerequisites:** None

#### Context Files:
- src/shared/constants/plans.ts

#### Deliverables:
- [ ] Add PlanType and ExecutionMode types
- [ ] Add ALL_PLAN_TYPES array
- [ ] Add SERVERLESS_PLANS array
- [ ] Add WORKSPACE_PLANS array
- [ ] Add PLAN_ORDER constant
- [ ] Add getExecutionMode() helper

#### Implementation:
```typescript
// Add at top of src/shared/constants/plans.ts

export type PlanType = 'FREE' | 'STARTER' | 'PRO' | 'BUSINESS' | 'ENTERPRISE';
export type ExecutionMode = 'SERVERLESS' | 'WORKSPACE';

export const ALL_PLAN_TYPES: PlanType[] = ['FREE', 'STARTER', 'PRO', 'BUSINESS', 'ENTERPRISE'];
export const SERVERLESS_PLANS: PlanType[] = ['FREE', 'STARTER'];
export const WORKSPACE_PLANS: PlanType[] = ['PRO', 'BUSINESS', 'ENTERPRISE'];
export const PAID_PLAN_TYPES: PlanType[] = ['STARTER', 'PRO', 'BUSINESS', 'ENTERPRISE'];

export const PLAN_ORDER: Record<PlanType, number> = {
  FREE: 0,
  STARTER: 1,
  PRO: 2,
  BUSINESS: 3,
  ENTERPRISE: 4,
};

export function getExecutionMode(plan: PlanType, hasWorkspaceAddon: boolean): ExecutionMode {
  if (WORKSPACE_PLANS.includes(plan) || hasWorkspaceAddon) {
    return 'WORKSPACE';
  }
  return 'SERVERLESS';
}

export function isHigherPlan(planA: PlanType, planB: PlanType): boolean {
  return PLAN_ORDER[planA] > PLAN_ORDER[planB];
}
```

#### Done Criteria:
- [ ] Type definitions exported
- [ ] Helper arrays exported
- [ ] getExecutionMode() returns correct mode
- [ ] No TypeScript errors

---

### Task 6.8.4: Update PLAN_LIMITS Structure

**Session Type:** Backend
**Estimated Time:** 25 minutes
**Prerequisites:** Task 6.8.3 complete

#### Context Files:
- src/shared/constants/plans.ts

#### Deliverables:
- [ ] Update PlanLimits interface with new fields
- [ ] Update PLAN_LIMITS constant with execution mode and workspace data

#### Interface:
```typescript
export interface PlanLimits {
  // Execution Mode
  executionMode: ExecutionMode;
  
  // Serverless limits (only apply if mode = SERVERLESS)
  executionsPerMonth: number | null;  // null = unlimited
  
  // Workspace limits (only apply if mode = WORKSPACE)
  workspace: {
    ramMb: number;
    cpuCores: number;
    storageMb: number;
  } | null;  // null = not included (need add-on)
  
  // Always apply regardless of mode
  gateways: number;           // -1 = unlimited
  workflows: number;          // -1 = unlimited
  workflowSteps: number;
  plugins: number;            // -1 = unlimited
  aiTokensPerMonth: number;   // -1 = unlimited
  historyDays: number;
  
  // Pricing (cents)
  priceMonthly: number | null;  // null = custom
  priceYearly: number | null;
}
```

#### Values:
```typescript
export const PLAN_LIMITS: Record<PlanType, PlanLimits> = {
  FREE: {
    executionMode: 'SERVERLESS',
    executionsPerMonth: 500,
    workspace: null,
    gateways: 1,
    workflows: 3,
    workflowSteps: 5,
    plugins: 3,
    aiTokensPerMonth: 10000,
    historyDays: 7,
    priceMonthly: 0,
    priceYearly: 0,
  },
  STARTER: {
    executionMode: 'SERVERLESS',
    executionsPerMonth: 5000,
    workspace: null,
    gateways: 3,
    workflows: 10,
    workflowSteps: 10,
    plugins: 10,
    aiTokensPerMonth: 100000,
    historyDays: 30,
    priceMonthly: 900,
    priceYearly: 9000,
  },
  PRO: {
    executionMode: 'WORKSPACE',
    executionsPerMonth: null,  // UNLIMITED
    workspace: { ramMb: 512, cpuCores: 0.5, storageMb: 2048 },
    gateways: 10,
    workflows: 50,
    workflowSteps: 15,
    plugins: 25,
    aiTokensPerMonth: 500000,
    historyDays: 90,
    priceMonthly: 2900,
    priceYearly: 29000,
  },
  BUSINESS: {
    executionMode: 'WORKSPACE',
    executionsPerMonth: null,  // UNLIMITED
    workspace: { ramMb: 2048, cpuCores: 2, storageMb: 10240 },
    gateways: 25,
    workflows: 200,
    workflowSteps: 25,
    plugins: 100,
    aiTokensPerMonth: 2000000,
    historyDays: 365,
    priceMonthly: 7900,
    priceYearly: 79000,
  },
  ENTERPRISE: {
    executionMode: 'WORKSPACE',
    executionsPerMonth: null,  // UNLIMITED
    workspace: { ramMb: -1, cpuCores: -1, storageMb: -1 },  // Custom
    gateways: -1,
    workflows: -1,
    workflowSteps: 30,
    plugins: -1,
    aiTokensPerMonth: -1,
    historyDays: 365,
    priceMonthly: null,  // Custom
    priceYearly: null,
  },
};
```

#### Done Criteria:
- [ ] PlanLimits interface includes executionMode, workspace, executionsPerMonth
- [ ] All 5 plans have correct values
- [ ] FREE/STARTER have executionsPerMonth limits
- [ ] PRO/BUSINESS/ENTERPRISE have workspace resources
- [ ] Existing code using PLAN_LIMITS still works

---

### Task 6.8.5: Unify PLAN_QUOTA_LIMITS with PLAN_LIMITS

**Session Type:** Backend
**Estimated Time:** 20 minutes
**Prerequisites:** Task 6.8.4 complete

#### Context Files:
- src/modules/quota/quota.types.ts
- src/modules/quota/quota.service.ts
- src/shared/constants/plans.ts

#### Problem:
`PLAN_QUOTA_LIMITS` in quota.types.ts duplicates `PLAN_LIMITS` with **conflicting values**:
- PRO plugins: plans.ts = -1 (unlimited) vs quota.types.ts = 25
- BUSINESS plugins: plans.ts = -1 vs quota.types.ts = 100

#### Implementation:
1. Remove `PLAN_QUOTA_LIMITS` from quota.types.ts
2. Update quota.service.ts to import from plans.ts
3. Create adapter function if interface differs

```typescript
// src/modules/quota/quota.types.ts
// REMOVE the PLAN_QUOTA_LIMITS constant entirely

// src/modules/quota/quota.service.ts
import { PLAN_LIMITS, type PlanType } from '@/shared/constants/plans';

// Adapter if QuotaService expects different shape
function getPlanQuotaLimits(plan: PlanType): ResourceLimits {
  const limits = PLAN_LIMITS[plan];
  return {
    maxGateways: limits.gateways,
    maxWorkflows: limits.workflows,
    maxSteps: limits.workflowSteps,
    maxPlugins: limits.plugins,
    maxApiCalls: limits.executionsPerMonth ?? -1,
    maxStorage: limits.workspace?.storageMb ?? 0,
    maxAiTokens: limits.aiTokensPerMonth,
  };
}
```

#### Done Criteria:
- [ ] Single source of truth for plan limits
- [ ] quota.service.ts uses PLAN_LIMITS
- [ ] No conflicting values
- [ ] Existing quota checks still work

---

## Part B: Workspace Add-Ons

### Task 6.8.6: Create WORKSPACE_ADDONS Constant

**Session Type:** Backend
**Estimated Time:** 15 minutes
**Prerequisites:** Task 6.8.4 complete

#### Deliverables:
- [ ] src/shared/constants/workspace-addons.ts (NEW FILE)

#### Implementation:
```typescript
/**
 * Workspace Add-Ons
 * 
 * For FREE/STARTER: Enables workspace mode (unlimited executions)
 * For PRO+: Expands existing workspace resources
 */

export type WorkspaceAddonTier = 'MICRO' | 'SMALL' | 'MEDIUM' | 'LARGE' | 'XLARGE';

export interface WorkspaceAddon {
  tier: WorkspaceAddonTier;
  ramMb: number;
  cpuCores: number;
  storageMb: number;
  priceMonthly: number;  // cents
  priceYearly: number;   // cents
  description: string;
}

export const WORKSPACE_ADDONS: Record<WorkspaceAddonTier, WorkspaceAddon> = {
  MICRO: {
    tier: 'MICRO',
    ramMb: 256,
    cpuCores: 0.25,
    storageMb: 1024,
    priceMonthly: 300,   // $3
    priceYearly: 3000,   // $30
    description: 'Basic workspace for light usage',
  },
  SMALL: {
    tier: 'SMALL',
    ramMb: 512,
    cpuCores: 0.5,
    storageMb: 2048,
    priceMonthly: 500,   // $5
    priceYearly: 5000,   // $50
    description: 'Good for simple automations',
  },
  MEDIUM: {
    tier: 'MEDIUM',
    ramMb: 1024,
    cpuCores: 1,
    storageMb: 5120,
    priceMonthly: 1000,  // $10
    priceYearly: 10000,  // $100
    description: 'Ideal for medium workloads',
  },
  LARGE: {
    tier: 'LARGE',
    ramMb: 2048,
    cpuCores: 2,
    storageMb: 10240,
    priceMonthly: 2000,  // $20
    priceYearly: 20000,  // $200
    description: 'For heavy automations',
  },
  XLARGE: {
    tier: 'XLARGE',
    ramMb: 4096,
    cpuCores: 4,
    storageMb: 25600,
    priceMonthly: 4000,  // $40
    priceYearly: 40000,  // $400
    description: 'Maximum power for enterprise workloads',
  },
};

export const ALL_ADDON_TIERS: WorkspaceAddonTier[] = ['MICRO', 'SMALL', 'MEDIUM', 'LARGE', 'XLARGE'];

export function calculateTotalWorkspace(
  planWorkspace: { ramMb: number; cpuCores: number; storageMb: number } | null,
  addons: WorkspaceAddonTier[]
): { ramMb: number; cpuCores: number; storageMb: number } {
  let total = {
    ramMb: planWorkspace?.ramMb ?? 0,
    cpuCores: planWorkspace?.cpuCores ?? 0,
    storageMb: planWorkspace?.storageMb ?? 0,
  };

  for (const addonTier of addons) {
    const addon = WORKSPACE_ADDONS[addonTier];
    total.ramMb += addon.ramMb;
    total.cpuCores += addon.cpuCores;
    total.storageMb += addon.storageMb;
  }

  return total;
}

export function hasWorkspaceEnabled(
  planWorkspace: { ramMb: number; cpuCores: number; storageMb: number } | null,
  addons: WorkspaceAddonTier[]
): boolean {
  return planWorkspace !== null || addons.length > 0;
}
```

#### Done Criteria:
- [ ] File created with all add-on tiers
- [ ] Helper functions work correctly
- [ ] Types exported

---

### Task 6.8.7: Add ExecutionMode Enum to Schema

**Session Type:** Database
**Estimated Time:** 10 minutes
**Prerequisites:** Task 6.8.6 complete

#### Context Files:
- prisma/schema.prisma

#### Schema Addition:
```prisma
// Add after existing enums (around line 30)
enum ExecutionMode {
  SERVERLESS
  WORKSPACE
}
```

#### Done Criteria:
- [ ] Migration created and applied
- [ ] ExecutionMode enum available in Prisma client

---

### Task 6.8.8: Add Workspace Fields to User Model

**Session Type:** Database
**Estimated Time:** 15 minutes
**Prerequisites:** Task 6.8.7 complete

#### Context Files:
- prisma/schema.prisma

#### Schema Changes:
```prisma
model User {
  // ... existing fields ...
  
  plan              PlanType      @default(FREE)
  executionMode     ExecutionMode @default(SERVERLESS)  // NEW
  
  // Workspace add-ons (array of addon tier strings)
  workspaceAddons   String[]      @default([])          // NEW
  
  // Computed workspace resources (updated when plan/addons change)
  workspaceRamMb      Int?                              // NEW
  workspaceCpuCores   Float?                            // NEW
  workspaceStorageMb  Int?                              // NEW
  
  // ... rest of model ...
}
```

#### Done Criteria:
- [ ] Migration created and applied
- [ ] User model has execution mode and workspace fields
- [ ] Default values work correctly

---

## Part C: Organization Plan Separation

### Task 6.8.9: Add OrgPlan Enum to Schema

**Session Type:** Database
**Estimated Time:** 10 minutes
**Prerequisites:** Task 6.8.8 complete

#### Context Files:
- prisma/schema.prisma

#### Schema Addition:
```prisma
// Add after ExecutionMode enum
enum OrgPlan {
  ORG_STARTER     // $49/mo - 5 seats, 5 gateways
  ORG_GROWTH      // $99/mo - 15 seats, 15 gateways
  ORG_PRO         // $199/mo - 40 seats, 50 gateways
  ORG_BUSINESS    // $399/mo - 100 seats, 150 gateways
  ORG_ENTERPRISE  // Custom - unlimited
}
```

#### Done Criteria:
- [x] Migration created and applied
- [x] OrgPlan enum available in Prisma client

---

### Task 6.8.10: Create ORG_PLAN_LIMITS Constant

**Session Type:** Backend
**Estimated Time:** 25 minutes
**Prerequisites:** Task 6.8.9 complete

#### Deliverables:
- [x] src/shared/constants/org-plans.ts (NEW FILE)
- [x] `OrgPlanType` type definition
- [x] `OrgPlanLimits` interface (with displayName, description, historyDays)
- [x] `OrgPlanSeats`, `OrgPlanPool`, `OrgPlanFeatures` sub-interfaces
- [x] `ORG_PLAN_LIMITS` constant with all 5 tiers
- [x] `ALL_ORG_PLAN_TYPES`, `PAID_ORG_PLAN_TYPES` arrays
- [x] `ORG_PLAN_ORDER` hierarchy record
- [x] Helper functions: `isHigherOrgPlan()`, `isAtLeastOrgPlan()`, `getOrgPlanLimits()`
- [x] Utility functions: `orgPlanHasFeature()`, `isOrgLimitExceeded()`, `getOrgRemainingCapacity()`
- [x] Pricing helper: `calculateExtraSeatsPrice()`, `formatOrgPoolResources()`

#### Implementation:
```typescript
export type OrgPlanType = 
  | 'ORG_STARTER' 
  | 'ORG_GROWTH' 
  | 'ORG_PRO' 
  | 'ORG_BUSINESS' 
  | 'ORG_ENTERPRISE';

export interface OrgPlanLimits {
  // All org plans use workspace mode
  executionMode: 'WORKSPACE';
  executionsPerMonth: null;  // Always unlimited
  
  // Shared automation pool
  sharedGateways: number;         // -1 = unlimited
  sharedPlugins: number;
  sharedWorkflows: number;
  sharedAiTokensPerMonth: number;
  
  // Seats
  seats: {
    included: number;             // -1 = unlimited
    extraPricePerSeat: number;    // cents/month
  };
  departments: number | null;     // null = unlimited
  
  // Shared workspace pool
  pool: {
    ramMb: number | null;         // null = custom
    cpuCores: number | null;
    storageMb: number | null;
  };
  
  // Features
  features: {
    sso: boolean;
    customBranding: boolean;
    prioritySupport: boolean;
  };
  
  // Pricing (cents)
  priceMonthly: number | null;
  priceYearly: number | null;
}

export const ORG_PLAN_LIMITS: Record<OrgPlanType, OrgPlanLimits> = {
  ORG_STARTER: {
    executionMode: 'WORKSPACE',
    executionsPerMonth: null,
    sharedGateways: 5,
    sharedPlugins: 20,
    sharedWorkflows: 25,
    sharedAiTokensPerMonth: 500000,
    seats: { included: 5, extraPricePerSeat: 1000 },
    departments: 3,
    pool: { ramMb: 4096, cpuCores: 2, storageMb: 20480 },
    features: { sso: false, customBranding: false, prioritySupport: false },
    priceMonthly: 4900,
    priceYearly: 49000,
  },
  ORG_GROWTH: {
    executionMode: 'WORKSPACE',
    executionsPerMonth: null,
    sharedGateways: 15,
    sharedPlugins: 50,
    sharedWorkflows: 75,
    sharedAiTokensPerMonth: 2000000,
    seats: { included: 15, extraPricePerSeat: 700 },
    departments: 10,
    pool: { ramMb: 8192, cpuCores: 4, storageMb: 51200 },
    features: { sso: false, customBranding: true, prioritySupport: false },
    priceMonthly: 9900,
    priceYearly: 99000,
  },
  ORG_PRO: {
    executionMode: 'WORKSPACE',
    executionsPerMonth: null,
    sharedGateways: 50,
    sharedPlugins: 150,
    sharedWorkflows: 250,
    sharedAiTokensPerMonth: 10000000,
    seats: { included: 40, extraPricePerSeat: 500 },
    departments: 25,
    pool: { ramMb: 16384, cpuCores: 8, storageMb: 102400 },
    features: { sso: true, customBranding: true, prioritySupport: true },
    priceMonthly: 19900,
    priceYearly: 199000,
  },
  ORG_BUSINESS: {
    executionMode: 'WORKSPACE',
    executionsPerMonth: null,
    sharedGateways: 150,
    sharedPlugins: 500,
    sharedWorkflows: 1000,
    sharedAiTokensPerMonth: 50000000,
    seats: { included: 100, extraPricePerSeat: 300 },
    departments: null,
    pool: { ramMb: 32768, cpuCores: 16, storageMb: 256000 },
    features: { sso: true, customBranding: true, prioritySupport: true },
    priceMonthly: 39900,
    priceYearly: 399000,
  },
  ORG_ENTERPRISE: {
    executionMode: 'WORKSPACE',
    executionsPerMonth: null,
    sharedGateways: -1,
    sharedPlugins: -1,
    sharedWorkflows: -1,
    sharedAiTokensPerMonth: -1,
    seats: { included: -1, extraPricePerSeat: 0 },
    departments: null,
    pool: { ramMb: null, cpuCores: null, storageMb: null },
    features: { sso: true, customBranding: true, prioritySupport: true },
    priceMonthly: null,
    priceYearly: null,
  },
};

export const ALL_ORG_PLAN_TYPES: OrgPlanType[] = [
  'ORG_STARTER', 'ORG_GROWTH', 'ORG_PRO', 'ORG_BUSINESS', 'ORG_ENTERPRISE'
];

export const ORG_PLAN_ORDER: Record<OrgPlanType, number> = {
  ORG_STARTER: 0,
  ORG_GROWTH: 1,
  ORG_PRO: 2,
  ORG_BUSINESS: 3,
  ORG_ENTERPRISE: 4,
};
```

#### Done Criteria:
- [x] File created with all org plan limits
- [x] Types exported correctly
- [x] Values match product requirements

---

### Task 6.8.11: Migrate Organization.plan to OrgPlan

**Session Type:** Database
**Estimated Time:** 20 minutes
**Prerequisites:** Task 6.8.10 complete

#### Context Files:
- prisma/schema.prisma

#### Schema Changes:
```prisma
model Organization {
  // ... existing fields ...
  
  // CHANGED: From PlanType to OrgPlan
  plan             OrgPlan      @default(ORG_STARTER)
  
  // Add pool tracking fields
  maxSeats         Int          @default(5)
  usedSeats        Int          @default(0)
  poolRamMb        Int          @default(4096)
  poolCpuCores     Float        @default(2)
  poolStorageMb    Int          @default(20480)
  
  // ... rest of model ...
}
```

#### Migration SQL:
```sql
-- Create new enum
CREATE TYPE "OrgPlan" AS ENUM ('ORG_STARTER', 'ORG_GROWTH', 'ORG_PRO', 'ORG_BUSINESS', 'ORG_ENTERPRISE');

-- Add new column with default
ALTER TABLE "Organization" ADD COLUMN "new_plan" "OrgPlan" DEFAULT 'ORG_STARTER';

-- Migrate existing data
UPDATE "Organization" SET "new_plan" = CASE
  WHEN "plan" = 'FREE' THEN 'ORG_STARTER'::"OrgPlan"
  WHEN "plan" = 'STARTER' THEN 'ORG_STARTER'::"OrgPlan"
  WHEN "plan" = 'PRO' THEN 'ORG_PRO'::"OrgPlan"
  WHEN "plan" = 'BUSINESS' THEN 'ORG_BUSINESS'::"OrgPlan"
  WHEN "plan" = 'ENTERPRISE' THEN 'ORG_ENTERPRISE'::"OrgPlan"
  ELSE 'ORG_STARTER'::"OrgPlan"
END;

-- Drop old column and rename
ALTER TABLE "Organization" DROP COLUMN "plan";
ALTER TABLE "Organization" RENAME COLUMN "new_plan" TO "plan";

-- Add new columns
ALTER TABLE "Organization" ADD COLUMN "maxSeats" INTEGER DEFAULT 5;
ALTER TABLE "Organization" ADD COLUMN "usedSeats" INTEGER DEFAULT 0;
ALTER TABLE "Organization" ADD COLUMN "poolRamMb" INTEGER DEFAULT 4096;
ALTER TABLE "Organization" ADD COLUMN "poolCpuCores" DOUBLE PRECISION DEFAULT 2;
ALTER TABLE "Organization" ADD COLUMN "poolStorageMb" INTEGER DEFAULT 20480;
```

#### Done Criteria:
- [x] Migration created and applied
- [x] Existing organizations migrated to appropriate OrgPlan
- [x] No data loss
- [x] Organization model uses OrgPlan type

---

### Task 6.8.12: Update Organization Service for OrgPlan

**Session Type:** Backend
**Estimated Time:** 25 minutes
**Prerequisites:** Task 6.8.11 complete

#### Context Files:
- src/modules/organization/organization.service.ts
- src/modules/organization/organization.types.ts

#### Deliverables:
- [x] Update `organization.types.ts` to use `OrgPlan` instead of `PlanType`
- [x] Update `SafeOrganization` interface with new pool fields
- [x] Update `OrgWithRole` interface for OrgPlan
- [x] Add `getOrgPlanLimits()` method to service
- [x] Add `hasAtLeastPlan()` method for plan comparison
- [x] Add `canAddGateway()`, `canAddWorkflow()`, `canAddSeat()` capacity checks
- [x] Add `hasFeature()` method for feature flag checks
- [x] Add `getRemainingAiTokens()` for usage tracking
- [x] Update `auth.types.ts` to support `PlanType | OrgPlan` union
- [x] Update `stripe-webhook.ts` with `toOrgPlan()` mapping function

#### Implementation:
1. Update types to use OrgPlan
2. Update service methods to use ORG_PLAN_LIMITS
3. Add helper methods for org plan checks

```typescript
import { ORG_PLAN_LIMITS, type OrgPlanType } from '@/shared/constants/org-plans';

// Update getOrganization to return OrgPlan type
// Update checkOrgLimit to use ORG_PLAN_LIMITS
// Add canAddSeat(), getAvailableGateways(), etc.
```

#### Done Criteria:
- [x] Organization service uses OrgPlan type
- [x] Limit checks use ORG_PLAN_LIMITS
- [x] No TypeScript errors
- [x] Existing functionality preserved

---

## Part D: Quota Management

### Task 6.8.13: Add DeptAllocation and MemberAllocation Schemas

**Session Type:** Database
**Estimated Time:** 20 minutes
**Prerequisites:** Task 6.8.12 complete

#### Context Files:
- prisma/schema.prisma

#### Schema:
```prisma
// NOTE: Named "Allocation" to distinguish from ResourceQuota (usage tracking)
enum AllocationMode {
  UNLIMITED     // Use from pool freely (no limit set)
  SOFT_CAP      // Warning at limit, can request more
  HARD_CAP      // Blocked at limit
  RESERVED      // Guaranteed allocation, others can't use
}

model DeptAllocation {
  id              String       @id @default(cuid())
  departmentId    String       @unique @map("department_id")
  department      Department   @relation(fields: [departmentId], references: [id], onDelete: Cascade)
  
  // Allocated from org pool
  maxGateways     Int?
  maxWorkflows    Int?
  maxPlugins      Int?
  aiTokenBudget   Int?         // tokens per month
  
  // Workspace allocation
  maxRamMb        Int?
  maxCpuCores     Float?
  maxStorageMb    Int?
  
  allocMode       AllocationMode @default(SOFT_CAP)
  
  createdAt       DateTime     @default(now()) @map("created_at")
  updatedAt       DateTime     @updatedAt @map("updated_at")
  setById         String       @map("set_by_id")
  setBy           User         @relation("DeptAllocSetBy", fields: [setById], references: [id])
  
  @@map("dept_allocations")
}

model MemberAllocation {
  id              String       @id @default(cuid())
  userId          String       @map("user_id")
  user            User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  departmentId    String       @map("department_id")
  department      Department   @relation(fields: [departmentId], references: [id], onDelete: Cascade)
  
  // Allocated from department pool
  maxGateways     Int?
  maxWorkflows    Int?
  aiTokenBudget   Int?
  
  maxRamMb        Int?
  maxCpuCores     Float?
  maxStorageMb    Int?
  
  allocMode       AllocationMode @default(SOFT_CAP)
  
  createdAt       DateTime     @default(now()) @map("created_at")
  updatedAt       DateTime     @updatedAt @map("updated_at")
  setById         String       @map("set_by_id")
  setBy           User         @relation("MemberAllocSetBy", fields: [setById], references: [id])
  
  @@unique([userId, departmentId])
  @@map("member_allocations")
}
```

#### Done Criteria:
- [x] Migration created and applied
- [x] DeptAllocation model exists
- [x] MemberAllocation model exists
- [x] AllocationMode enum created
- [x] Relations work correctly

---

### Task 6.8.14: Create QuotaAllocationService

**Session Type:** Backend
**Estimated Time:** 40 minutes
**Prerequisites:** Task 6.8.13 complete

#### Deliverables:
- [ ] src/modules/quota/quota-allocation.service.ts
- [ ] src/modules/quota/quota-allocation.types.ts

#### Service Methods:
```typescript
class QuotaAllocationService {
  // Dept allocations (Admin sets from org pool)
  async setDeptAllocation(ctx: ServiceContext, departmentId: string, alloc: SetDeptAllocationRequest): Promise<DeptAllocation>
  async getDeptAllocation(departmentId: string): Promise<DeptAllocation | null>
  async getDeptAllocations(organizationId: string): Promise<DeptAllocation[]>
  async removeDeptAllocation(ctx: ServiceContext, departmentId: string): Promise<void>
  
  // Member allocations (Manager sets)
  async setMemberAllocation(ctx: ServiceContext, userId: string, departmentId: string, alloc: SetMemberAllocationRequest): Promise<MemberAllocation>
  async getMemberAllocation(userId: string, departmentId: string): Promise<MemberAllocation | null>
  async getMemberAllocations(departmentId: string): Promise<MemberAllocation[]>
  async removeMemberAllocation(ctx: ServiceContext, userId: string, departmentId: string): Promise<void>
  
  // Validation
  async validateDepartmentAllocation(organizationId: string, allocation: QuotaAllocation): Promise<ValidationResult>
  async getUnallocatedOrgResources(organizationId: string): Promise<QuotaAllocation>
  async getUnallocatedDeptResources(departmentId: string): Promise<QuotaAllocation>
}
```

#### Done Criteria:
- [x] Service created with all methods
- [x] Validation prevents over-allocation
- [x] Permission checks (Admin for dept, Manager for member)
- [x] Audit logging for quota changes

---

### Task 6.8.15: Create Quota Enforcement Middleware

**Session Type:** Backend
**Estimated Time:** 30 minutes
**Prerequisites:** Task 6.8.14 complete

#### Deliverables:
- [x] src/modules/quota/quota-enforcement.service.ts
- [ ] Update existing QuotaService to use new hierarchy

#### Implementation:
```typescript
/**
 * Allocation check hierarchy:
 * 1. Check member allocation (if set)
 * 2. Check department allocation (if set)
 * 3. Check org plan limit
 */
class QuotaEnforcementService {
  async checkQuota(
    userId: string,
    organizationId: string | null,
    departmentId: string | null,
    resource: ResourceType,
    amount: number
  ): Promise<QuotaCheckResult>
  
  async enforceQuota(
    ctx: ServiceContext,
    resource: ResourceType,
    amount: number
  ): Promise<void>  // Throws QuotaExceededError if over limit
  
  async getEffectiveLimit(
    userId: string,
    organizationId: string | null,
    departmentId: string | null,
    resource: ResourceType
  ): Promise<EffectiveLimit>
}

interface QuotaCheckResult {
  allowed: boolean;
  limitType: 'member' | 'department' | 'organization' | 'plan';
  allocMode: AllocationMode;
  current: number;
  limit: number;
  message?: string;
}
```

#### Done Criteria:
- [x] Enforcement follows hierarchy (member → dept → org)
- [x] SOFT_CAP shows warning but allows
- [x] HARD_CAP blocks action
- [x] RESERVED guarantees allocation
- [x] Clear error messages

---

### Task 6.8.16: Build Admin Quota Management UI

**Session Type:** Frontend
**Estimated Time:** 60 minutes
**Prerequisites:** Task 6.8.15 complete

#### Deliverables:
- [x] src/app/(dashboard)/dashboard/organizations/[orgId]/quotas/page.tsx
- [x] src/components/organization/dept-allocation-form.tsx
- [x] src/components/organization/quota-usage-bar.tsx
- [x] src/components/organization/dept-allocation-table.tsx

#### UI Structure:
```
┌─────────────────────────────────────────────────────────┐
│  ⚙️ Quota Management                         [ORG_PRO]  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  📊 Organization Pool Usage                             │
│  ┌─────────────────────────────────────────────────┐   │
│  │  Gateways    ████████████████░░░░  42/50       │   │
│  │  Workflows   ██████████░░░░░░░░░░  125/250     │   │
│  │  AI Tokens   ████████████████░░░░  8.2M/10M   │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  📁 Department Allocations                              │
│  ┌─────────────────────────────────────────────────┐   │
│  │ Department   │ Gateways │ Workflows │ Actions   │   │
│  │ Engineering  │ 25       │ 100       │ [Edit]    │   │
│  │ Marketing    │ 15       │ 75        │ [Edit]    │   │
│  │ Unallocated  │ 10       │ 75        │           │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  [+ Allocate to Department]                             │
└─────────────────────────────────────────────────────────┘
```

#### Done Criteria:
- [x] Shows org pool usage
- [x] Lists department allocations
- [x] Admin can set/edit department allocations
- [x] Validates against org limits
- [x] Responsive design

---

## Part E: Usage Tracking & Enforcement UI

### Task 6.8.17: Create ExecutionTracker Service

**Session Type:** Backend
**Estimated Time:** 40 minutes
**Prerequisites:** Task 6.8.15 complete

#### Context Files:
- src/modules/quota/quota.service.ts
- prisma/schema.prisma (UsageHistory, ResourceQuota)

#### Deliverables:
- [ ] src/modules/quota/execution-tracker.service.ts
- [ ] src/modules/quota/execution-tracker.types.ts

#### Service Methods:
```typescript
class ExecutionTrackerService {
  // Track execution (called by workflow runner)
  async trackExecution(ctx: ServiceContext, workflowId: string): Promise<TrackResult>
  
  // Get current period usage
  async getExecutionCount(ctx: ServiceContext): Promise<ExecutionCount>
  
  // Check if can execute (without throwing)
  async canExecute(ctx: ServiceContext): Promise<CanExecuteResult>
  
  // Get time until reset
  async getResetTime(ctx: ServiceContext): Promise<Date>
}

interface ExecutionCount {
  current: number;
  limit: number | null;      // null = unlimited (workspace mode)
  percentage: number;        // 0-100
  periodStart: Date;
  periodEnd: Date;
  isServerless: boolean;     // true = has execution limits
}

interface CanExecuteResult {
  allowed: boolean;
  reason?: 'limit_reached' | 'soft_cap' | 'hard_cap';
  warningLevel: 'none' | 'warning' | 'critical' | 'blocked';
  current: number;
  limit: number | null;
}

interface TrackResult {
  success: boolean;
  newCount: number;
  warningLevel: 'none' | 'warning' | 'critical';
}
```

#### Warning Levels:
```typescript
// Based on AlertConfig thresholds (80%, 95%)
function getWarningLevel(current: number, limit: number): WarningLevel {
  if (limit === null || limit === -1) return 'none';  // Unlimited
  const percentage = (current / limit) * 100;
  if (percentage >= 100) return 'blocked';
  if (percentage >= 95) return 'critical';
  if (percentage >= 80) return 'warning';
  return 'none';
}
```

#### Done Criteria:
- [ ] Tracks executions for user and org contexts
- [ ] Returns correct warning levels (80%, 95%, 100%)
- [ ] Works for both serverless (has limit) and workspace (unlimited)
- [ ] Resets monthly for users, tracks org pool for orgs

---

### Task 6.8.18: Create Usage Warning Components

**Session Type:** Frontend
**Estimated Time:** 30 minutes
**Prerequisites:** Task 6.8.17 complete

#### Deliverables:
- [ ] src/components/quota/usage-progress-bar.tsx
- [ ] src/components/quota/usage-warning-banner.tsx
- [ ] src/components/quota/resource-usage-card.tsx

#### Components:

**UsageProgressBar:**
```tsx
interface UsageProgressBarProps {
  label: string;           // "Executions", "Gateways", etc.
  current: number;
  limit: number | null;    // null = unlimited
  showPercentage?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

// Colors based on percentage:
// 0-79%: green
// 80-94%: yellow (warning)
// 95-99%: orange (critical)
// 100%: red (blocked)
```

**UsageWarningBanner:**
```tsx
interface UsageWarningBannerProps {
  resource: string;        // "executions", "gateways"
  percentage: number;
  onUpgrade?: () => void;
  onDismiss?: () => void;
}

// Displays:
// 80%+: "You've used 80% of your monthly executions"
// 95%+: "⚠️ Critical: Only 5% of executions remaining"
// 100%: "🚫 Limit reached. Upgrade to continue."
```

**ResourceUsageCard:**
```tsx
interface ResourceUsageCardProps {
  title: string;
  icon: ReactNode;
  current: number;
  limit: number | null;
  unit?: string;           // "executions", "MB", etc.
  resetsAt?: Date;         // For monthly limits
}
```

#### Done Criteria:
- [ ] Progress bar shows correct colors for warning levels
- [ ] Warning banner appears at 80%, 95%, 100%
- [ ] Unlimited resources show "Unlimited" not "0/null"
- [ ] Responsive design

---

### Task 6.8.19: Create Upgrade Prompt Component

**Session Type:** Frontend
**Estimated Time:** 25 minutes
**Prerequisites:** Task 6.8.18 complete

#### Deliverables:
- [ ] src/components/quota/upgrade-prompt.tsx
- [ ] src/components/quota/plan-comparison-mini.tsx

#### Components:

**UpgradePrompt:**
```tsx
interface UpgradePromptProps {
  reason: 'execution_limit' | 'gateway_limit' | 'workflow_limit' | 'storage_limit';
  currentPlan: PlanType;
  suggestedPlan?: PlanType;  // Auto-suggest based on reason
  variant?: 'inline' | 'card' | 'banner';
}

// Examples:
// "You've reached your execution limit. Upgrade to PRO for unlimited executions."
// "Need more gateways? STARTER includes 3 gateways for $9/mo."
```

**PlanComparisonMini:**
```tsx
// Shows side-by-side: Current plan vs Suggested plan
// Highlights the specific limit they hit
// [Current: 1 gateway] → [PRO: 10 gateways]
```

#### Use Cases:
1. **When creating 4th gateway on STARTER:**
   ```
   "You've reached the 3 gateway limit on STARTER.
   Upgrade to PRO for 10 gateways." [Upgrade $29/mo]
   ```

2. **When executions hit 100%:**
   ```
   "You've used all 500 executions this month.
   ├── Option A: Wait until [Feb 1] for reset
   ├── Option B: Upgrade to STARTER (5,000/mo) - $9/mo
   └── Option C: Upgrade to PRO (unlimited) - $29/mo"
   ```

#### Done Criteria:
- [ ] Shows relevant upgrade path based on limit hit
- [ ] Links to billing/upgrade page
- [ ] Includes price comparison
- [ ] Works for all resource types

---

### Task 6.8.20: Create Limit Reached Modal

**Session Type:** Frontend
**Estimated Time:** 20 minutes
**Prerequisites:** Task 6.8.19 complete

#### Deliverables:
- [ ] src/components/quota/limit-reached-modal.tsx

#### Component:
```tsx
interface LimitReachedModalProps {
  isOpen: boolean;
  onClose: () => void;
  resource: ResourceType;
  current: number;
  limit: number;
  resetsAt?: Date;         // For monthly limits
  context: 'user' | 'org'; // Different messaging
}
```

#### Modal Content:
```
┌─────────────────────────────────────────────────────────┐
│  🚫 Execution Limit Reached                     [X]     │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  You've used all 500 executions for this month.         │
│                                                         │
│  ████████████████████████████████████ 500/500 (100%)   │
│                                                         │
│  Your limit resets on February 1, 2026                  │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │  💡 Upgrade Options                             │   │
│  │                                                 │   │
│  │  STARTER ($9/mo)  │  PRO ($29/mo)              │   │
│  │  5,000 exec/mo    │  ∞ Unlimited               │   │
│  │  [Upgrade]        │  [Upgrade]                 │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  [Maybe Later]                                          │
└─────────────────────────────────────────────────────────┘
```

#### For Organizations:
```
┌─────────────────────────────────────────────────────────┐
│  🚫 Organization Gateway Limit Reached          [X]     │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Your organization has used all 5 gateways.             │
│                                                         │
│  ████████████████████████████████████ 5/5 (100%)       │
│                                                         │
│  Contact your organization admin to upgrade the plan    │
│  or request additional quota allocation.                │
│                                                         │
│  [Contact Admin]  [Request More Quota]                  │
└─────────────────────────────────────────────────────────┘
```

#### Done Criteria:
- [ ] Shows appropriate message for user vs org context
- [ ] Displays upgrade options for users
- [ ] Shows "contact admin" for org members
- [ ] Includes reset date for monthly limits

---

### Task 6.8.21: Create User Usage Dashboard Page

**Session Type:** Frontend
**Estimated Time:** 45 minutes
**Prerequisites:** Task 6.8.20 complete

#### Deliverables:
- [ ] src/app/(dashboard)/dashboard/usage/page.tsx
- [ ] src/components/quota/usage-overview.tsx
- [ ] src/components/quota/usage-history-chart.tsx

#### Page Structure:
```
┌─────────────────────────────────────────────────────────┐
│  📊 Usage & Limits                              [PRO]   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Current Billing Period: Jan 1 - Jan 31, 2026           │
│  Resets in: 10 days                                     │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ Executions   │  │ Gateways     │  │ Workflows    │  │
│  │ ∞ Unlimited  │  │ 7 / 10      │  │ 23 / 50     │  │
│  │ (Workspace)  │  │ ████████░░░ │  │ █████░░░░░░ │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ AI Tokens    │  │ Storage      │  │ Plugins      │  │
│  │ 320K / 500K  │  │ 1.2GB / 2GB  │  │ 12 / 25     │  │
│  │ ████████████ │  │ ██████░░░░░ │  │ █████░░░░░░ │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│                                                         │
│  📈 Usage History (Last 30 Days)                        │
│  ┌─────────────────────────────────────────────────┐   │
│  │     ▄▄                                          │   │
│  │    ████  ▄▄      ▄▄                            │   │
│  │   ██████████    ████  ▄▄                       │   │
│  │  ████████████  ██████████                      │   │
│  │ ──────────────────────────────────────────     │   │
│  │ Jan 1        Jan 15        Jan 21              │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  [View Full History]  [Download Report]                 │
└─────────────────────────────────────────────────────────┘
```

#### Done Criteria:
- [ ] Shows all resource usage for current user
- [ ] Displays "Unlimited" for workspace mode executions
- [ ] Shows usage history chart (last 30 days)
- [ ] Indicates plan type and reset date
- [ ] Link to upgrade if on limited plan

---

### Task 6.8.22: Create Org Usage Dashboard Page

**Session Type:** Frontend
**Estimated Time:** 50 minutes
**Prerequisites:** Task 6.8.21 complete

#### Deliverables:
- [ ] src/app/(dashboard)/dashboard/organization/[orgId]/usage/page.tsx
- [ ] src/components/organization/org-usage-overview.tsx
- [ ] src/components/organization/dept-usage-breakdown.tsx
- [ ] src/components/organization/member-usage-table.tsx

#### Page Structure:
```
┌─────────────────────────────────────────────────────────┐
│  📊 Organization Usage                      [ORG_PRO]   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Acme Corp • 32 members • Jan 2026                      │
│                                                         │
│  ═══════════════════════════════════════════════════   │
│  SHARED POOL USAGE                                      │
│  ═══════════════════════════════════════════════════   │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ Gateways     │  │ Workflows    │  │ AI Tokens    │  │
│  │ 42 / 50      │  │ 180 / 250    │  │ 7.2M / 10M   │  │
│  │ ████████████ │  │ ██████████░░ │  │ ██████████░░ │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│                                                         │
│  ═══════════════════════════════════════════════════   │
│  USAGE BY DEPARTMENT                                    │
│  ═══════════════════════════════════════════════════   │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ Department   │ Gateways │ Workflows │ AI Tokens │   │
│  │ ────────────┼──────────┼───────────┼──────────│   │
│  │ Engineering │ 20/25    │ 80/100    │ 3.5M/5M  │   │
│  │ Marketing   │ 12/15    │ 60/75     │ 2.1M/3M  │   │
│  │ Sales       │ 10/10 ⚠️ │ 40/50     │ 1.6M/2M  │   │
│  │ ────────────┼──────────┼───────────┼──────────│   │
│  │ Unallocated │ 0        │ 0         │ 0        │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ═══════════════════════════════════════════════════   │
│  TOP USERS THIS MONTH                                   │
│  ═══════════════════════════════════════════════════   │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ 1. Alice (Engineering)  │ 450K tokens │ 12 wf  │   │
│  │ 2. Bob (Sales)          │ 380K tokens │ 8 wf   │   │
│  │ 3. Carol (Marketing)    │ 290K tokens │ 15 wf  │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  [Manage Allocations]  [Download Report]                │
└─────────────────────────────────────────────────────────┘
```

#### Permissions:
- **Owner/Admin**: See all usage, manage allocations
- **Dept Manager**: See own department usage only
- **Member**: See own usage only (redirect to user dashboard)

#### Done Criteria:
- [ ] Shows org pool usage overview
- [ ] Breaks down usage by department
- [ ] Shows top users (for admins)
- [ ] Warning icons for departments near limit
- [ ] Link to quota allocation management
- [ ] Respects role-based visibility

---

## Part F: Testing & Documentation

### Task 6.8.23: Add Plan Architecture Tests

**Session Type:** Testing
**Estimated Time:** 30 minutes
**Prerequisites:** All Part A-E tasks complete

#### Deliverables:
- [ ] src/shared/constants/__tests__/plans.test.ts
- [ ] src/shared/constants/__tests__/org-plans.test.ts
- [ ] src/modules/quota/__tests__/quota-allocation.test.ts

#### Test Cases:
```typescript
// plans.test.ts
describe('PLAN_LIMITS', () => {
  it('has all 5 plan types')
  it('has SERVERLESS mode for FREE and STARTER')
  it('has WORKSPACE mode for PRO, BUSINESS, ENTERPRISE')
  it('has execution limits for serverless plans')
  it('has workspace resources for workspace plans')
});

describe('getExecutionMode', () => {
  it('returns SERVERLESS for FREE without addon')
  it('returns WORKSPACE for FREE with addon')
  it('returns WORKSPACE for PRO')
});

// quota-allocation.test.ts
describe('QuotaAllocationService', () => {
  it('prevents over-allocation to departments')
  it('allows admin to set dept allocations')
  it('allows manager to set member allocations within department')
  it('enforces hierarchy: member → department → org')
});
```

#### Done Criteria:
- [ ] All tests pass
- [ ] Edge cases covered
- [ ] >80% coverage on plan constants

---

### Task 6.8.24: Update CURRENT-STATE.md

**Session Type:** Documentation
**Estimated Time:** 15 minutes
**Prerequisites:** Task 6.8.23 complete

#### Deliverables:
- [ ] Update CURRENT-STATE.md with new plan architecture

#### Content:
```markdown
## Plan Architecture

### User Plans (Individual)
- FREE, STARTER: Serverless mode (execution limits)
- PRO, BUSINESS, ENTERPRISE: Workspace mode (unlimited executions)

### Organization Plans (Teams)
- All org plans use workspace mode
- Shared resource pools (gateways, plugins, workflows, AI tokens)
- Quota allocation: Org → Department → Member

### Key Files
- src/shared/constants/plans.ts - User plan limits
- src/shared/constants/org-plans.ts - Organization plan limits
- src/shared/constants/workspace-addons.ts - Add-on tiers
- src/modules/quota/quota-allocation.service.ts - Quota management
```

#### Done Criteria:
- [ ] Plan architecture documented
- [ ] Key files listed
- [ ] Dual mode explained

---

## 📊 Architecture Summary

### Dual Execution Modes

| Mode | Plans | Limit Type | Best For |
|------|-------|------------|----------|
| **SERVERLESS** | FREE, STARTER | Execution count (500/5K per month) | Beginners, low volume |
| **WORKSPACE** | PRO, BUSINESS, ENTERPRISE | Resources (RAM/CPU) | Developers, high volume |

### User vs Organization Plans

| Aspect | User Plans | Org Plans |
|--------|------------|-----------|
| Enum | `PlanType` | `OrgPlan` |
| File | `plans.ts` | `org-plans.ts` |
| Resources | Individual limits | Shared pool |
| Modes | Serverless or Workspace | Always Workspace |

### Quota Hierarchy

```
Organization Pool (set by plan)
    ↓
Dept Allocation (set by Admin)
    ↓
Member Allocation (set by Manager)
    ↓
Individual Usage
```

---

## ⚠️ Important Notes

1. **Preserve Existing Code**: QuotaService (767 lines) already works. Extend it, don't replace.

2. **Migration Order**: Schema changes must be done in order (ExecutionMode → OrgPlan → quotas).

3. **Single Source of Truth**: After 6.8.5, only PLAN_LIMITS exists (remove PLAN_QUOTA_LIMITS).

4. **Backward Compatibility**: Existing users/orgs must be migrated correctly.
