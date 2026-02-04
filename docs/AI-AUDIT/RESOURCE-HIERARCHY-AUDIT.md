# Resource Hierarchy Audit

> **Date:** February 1, 2026  
> **Status:** ANALYSIS COMPLETE - RECOMMENDATIONS PENDING  
> **Priority:** ARCHITECTURAL

---

## 🔑 KEY CONCEPT: Context Hierarchy

**CRITICAL FOR AI READING THIS DOCUMENT:**

```
┌──────────────────────────────────────────────────────────────────┐
│  TWO ROOT CONTEXTS (independent ownership models):               │
│                                                                  │
│    • 'personal'     - User owns resources directly               │
│    • 'organization' - Org owns shared pools                      │
│                                                                  │
│  TWO ORG SUB-CONTEXTS (only exist within organization):          │
│                                                                  │
│    • 'department'   - Allocated FROM org (requires orgId)        │
│    • 'member'       - Allocated FROM dept (requires orgId+deptId)│
│                                                                  │
│  ⚠️  'department' and 'member' are NOT standalone.               │
│     They ONLY exist within an organization context.              │
└──────────────────────────────────────────────────────────────────┘
```

**TypeScript representation:**
```typescript
// 4 context values (no intermediate union types)
type ResourceContext = 'personal' | 'organization' | 'department' | 'member';

// 4 resource status types
type ResourceStatus = 
  | PersonalResourceStatus      // ROOT - owns directly
  | OrgResourceStatus           // ROOT - shared pools
  | OrgDeptResourceStatus       // Within org - allocated from org
  | OrgMemberResourceStatus;    // Within org/dept - allocated from dept
```

---

## Executive Summary

The platform currently has **resource mixing issues** where sub-resources are treated at the same level as main resources. This creates confusion in the UI, inconsistent API responses, and potential future conflicts as the platform scales.

---

## Current State Analysis

### 🔴 Problem: Flat Resource Structure

Currently, all resources are treated equally in types and displays:

```typescript
// Current: Everything at same level
interface QuotaStatus {
  workflows: QuotaItem;      // MAIN RESOURCE
  plugins: QuotaItem;        // MAIN RESOURCE
  credits: QuotaItem;        // SUB-RESOURCE (of wallet/billing)
  storage: QuotaItem;        // SUB-RESOURCE (of workspace)
  gateways: QuotaItem;       // MAIN RESOURCE
}
```

This is problematic because:
1. **Storage** is a sub-resource of **Workspace** (alongside RAM/CPU)
2. **Credits** is a sub-resource of **Billing/Wallet**
3. **Workflow Runs** is a sub-resource of **Workflows**

---

## Industry Analysis: How Top Platforms Organize Resources

### 1. AWS - Hierarchical Service Model

```
Account
├── Compute (EC2)
│   ├── Instances
│   ├── vCPU Hours
│   └── Storage (EBS)
├── Storage (S3)
│   ├── Buckets
│   └── Data Transfer
├── Lambda (Serverless)
│   ├── Functions
│   ├── Invocations
│   └── Duration
└── Billing
    ├── Credits
    └── Reserved Capacity
```

**Key Pattern:** Resources → Sub-resources → Metrics

### 2. Vercel - Clear Separation

```
Team/Account
├── Projects (Main)
│   ├── Deployments (Sub)
│   └── Domains
├── Functions (Main)
│   ├── Invocations (Usage)
│   ├── Duration (Usage)
│   └── Edge Requests (Usage)
├── Storage (Main)
│   ├── Blob Storage
│   ├── KV Store
│   └── Postgres
└── Usage & Billing
    ├── Bandwidth
    └── Credits
```

### 3. Stripe - Billing-Centric Model

```
Account
├── Products (Main)
│   └── Prices (Sub)
├── Customers (Main)
│   ├── Subscriptions (Sub)
│   └── Invoices (Sub)
└── Balance (Main)
    ├── Available
    ├── Pending
    └── Transactions (Sub)
```

### 4. n8n / Zapier - Automation-Centric

```
Account
├── Workflows (Main)
│   ├── Executions (Usage)
│   ├── Steps/Operations (Usage)
│   └── Data Transfer (Usage)
├── Connections/Plugins (Main)
│   └── API Calls (Usage)
└── Billing
    ├── Tasks/Operations Used
    └── Credits Balance
```

---

## Recommended Resource Hierarchy for 2Bot

Based on industry patterns, here's the recommended structure:

### Personal vs Organization Context

The key difference is **ownership model**:

| Aspect | Personal | Organization |
|--------|----------|--------------|
| Ownership | **Direct** - user owns resources | **Shared** - org pool distributed |
| Allocation | None needed | Org → Dept → Member |
| Billing | Individual plan | Team plan + seats |
| Workspace | Personal container | Shared pool with quotas |

### Personal Account Structure

```
┌─────────────────────────────────────────────────────────────────┐
│                     PERSONAL ACCOUNT                             │
│                     (Direct Ownership)                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │   AUTOMATION    │  │    WORKSPACE    │  │     BILLING     │ │
│  │   (Owned)       │  │   (If paid)     │  │                 │ │
│  ├─────────────────┤  ├─────────────────┤  ├─────────────────┤ │
│  │                 │  │                 │  │                 │ │
│  │ ► Gateways: 2/5 │  │ ► RAM: 512MB    │  │ ► Credits: 1000 │ │
│  │   └ reqs/mo     │  │ ► CPU: 1 core   │  │   └ AI usage    │ │
│  │                 │  │ ► Storage: 10GB │  │   └ marketplace │ │
│  │ ► Plugins: 3/10 │  │                 │  │                 │ │
│  │   └ execs/mo    │  │                 │  │ ► Plan: PRO     │ │
│  │                 │  │                 │  │                 │ │
│  │ ► Workflows: 5  │  │                 │  │                 │ │
│  │   └ runs/mo     │  │                 │  │                 │ │
│  │                 │  │                 │  │                 │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Organization Structure (with Allocation Hierarchy)

```
┌─────────────────────────────────────────────────────────────────┐
│                       ORGANIZATION                               │
│                    (Shared Pools + Allocation)                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  SHARED POOLS (Total Available)                                  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │   AUTOMATION    │  │    WORKSPACE    │  │     BILLING     │ │
│  │   Pool: 50/100  │  │   Pool: 16GB    │  │   Budget: 50K   │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
│                              │                                   │
│                              ▼                                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    ALLOCATIONS                             │  │
│  │  (Distributed from shared pools to departments)           │  │
│  ├───────────────────────────────────────────────────────────┤  │
│  │                                                            │  │
│  │  ┌─────────────────────┐  ┌─────────────────────┐         │  │
│  │  │   DEPT: Engineering │  │   DEPT: Marketing   │         │  │
│  │  ├─────────────────────┤  ├─────────────────────┤         │  │
│  │  │ Workflows: 20       │  │ Workflows: 10       │         │  │
│  │  │ RAM: 8GB            │  │ RAM: 4GB            │         │  │
│  │  │ Credits: 30K        │  │ Credits: 15K        │         │  │
│  │  └─────────────────────┘  └─────────────────────┘         │  │
│  │           │                        │                       │  │
│  │           ▼                        ▼                       │  │
│  │  ┌────────────────┐       ┌────────────────┐              │  │
│  │  │ Member: Alice  │       │ Member: Bob    │              │  │
│  │  │ Workflows: 10  │       │ Workflows: 5   │              │  │
│  │  │ Credits: 15K   │       │ Credits: 10K   │              │  │
│  │  └────────────────┘       └────────────────┘              │  │
│  │                                                            │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  UNALLOCATED (Remaining in shared pool)                         │
│  Workflows: 20, RAM: 4GB, Credits: 5K                           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Proposed Type Structure

### Context Hierarchy: Two Roots + Sub-Contexts

**IMPORTANT:** There are TWO ownership models (roots), with sub-contexts within organization:

```
┌─────────────────────────────────────────────────────────────────┐
│                    CONTEXT HIERARCHY                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ROOT CONTEXTS (Two independent ownership models):               │
│  ═══════════════════════════════════════════════                │
│                                                                  │
│  ┌─────────────────────┐      ┌─────────────────────┐          │
│  │  'personal'         │      │  'organization'     │          │
│  │  ──────────────     │      │  ──────────────     │          │
│  │  Direct ownership   │      │  Shared pools       │          │
│  │  No sub-contexts    │      │  Has sub-contexts   │          │
│  │  Individual user    │      │  Company/team       │          │
│  └─────────────────────┘      └──────────┬──────────┘          │
│                                          │                      │
│                                          │                      │
│  ORG SUB-CONTEXTS (Views within organization only):             │
│  ═══════════════════════════════════════════════════            │
│                                          │                      │
│                         ┌────────────────┴────────────────┐    │
│                         │                                 │    │
│                         ▼                                 ▼    │
│              ┌─────────────────────┐      ┌─────────────────┐  │
│              │  'department'       │      │  'member'       │  │
│              │  ──────────────     │      │  ────────       │  │
│              │  Allocated FROM org │      │  Allocated FROM │  │
│              │  Manager view       │      │  department     │  │
│              │  Can allocate to    │      │  Individual view│  │
│              │  members            │      │  within org     │  │
│              └─────────────────────┘      └─────────────────┘  │
│                                                                  │
│  NOTE: 'department' and 'member' ONLY exist within              │
│        organization context. They are NOT standalone roots.      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### TypeScript Representation

```typescript
// All 4 context values in one simple type
type ResourceContext = 'personal' | 'organization' | 'department' | 'member';

// NOTE: 'department' and 'member' ONLY exist within organization.
// They always have organizationId.
```

### Unified Approach: Same Base Types, Different Contexts

The key insight is to use the **same base types** but with **context-aware wrappers**:

```typescript
// SHARED BASE TYPES (used by both Personal and Org)
interface CountQuota { used, limit, percentage, isUnlimited }
interface UsageMetric { current, limit, period, resetsAt }
interface AllocationQuota { allocated, limit, unit }

// ===========================================
// 4 CONTEXT STATUS TYPES
// ===========================================

// All 4 resource status types in one union
type ResourceStatus = 
  | PersonalResourceStatus      // ROOT - Direct ownership
  | OrgResourceStatus           // ROOT - Shared pools
  | OrgDeptResourceStatus       // Within org - allocated from org
  | OrgMemberResourceStatus;    // Within org/dept - allocated from dept
```

### Context Comparison

| Feature | Personal | Organization | OrgDept | OrgMember |
|---------|----------|--------------|---------|-----------|
| **Type** | ROOT | ROOT | Within Org | Within Org/Dept |
| **Parent** | None | None | Organization | Department |
| Resources | **Owned** | **Shared Pool** | **Allocated** | **Allocated** |
| Can allocate | No | Yes (to depts) | Yes (to members) | No |
| Has organizationId | ❌ No | ✅ Yes (is org) | ✅ Yes | ✅ Yes |
| Has departmentId | ❌ No | ❌ No | ✅ Yes (is dept) | ✅ Yes |
| Workspace | If paid plan | If paid plan | From org pool | From dept |
| Credits | Own balance | Shared budget | Allocated budget | Allocated budget |

### Option A: Domain-Driven Design (Recommended)

```typescript
// ===========================================
// LEVEL 1: Main Resource Pools
// ===========================================

/**
 * Automation Pool - Core automation resources
 */
interface AutomationPool {
  gateways: GatewayResource;
  plugins: PluginResource;
  workflows: WorkflowResource;
}

/**
 * Workspace Pool - Infrastructure resources
 */
interface WorkspacePool {
  compute: ComputeResource;  // RAM + CPU bundled
  storage: StorageResource;
  // Future: containers, databases, etc.
}

/**
 * Billing Pool - Financial resources
 */
interface BillingPool {
  credits: CreditsResource;
  subscription: SubscriptionResource;
}

// ===========================================
// LEVEL 2: Individual Resources with Metrics
// ===========================================

interface GatewayResource {
  // Countable resource
  count: ResourceCount;      // { used: 5, limit: 10 }
  // Usage metrics (sub-resource)
  metrics: {
    requests: UsageMetric;   // { current: 1000, period: 'daily' }
    latency: UsageMetric;    // monitoring
  };
}

interface PluginResource {
  count: ResourceCount;
  metrics: {
    executions: UsageMetric;  // Plugin executions per period
  };
}

interface WorkflowResource {
  count: ResourceCount;      // How many workflows exist
  metrics: {
    runs: UsageMetric;       // Executions per period (BILLING)
    steps: UsageMetric;      // Total steps executed
  };
}

interface ComputeResource {
  ram: ResourceAllocation;   // { allocated: 512, limit: 1024 } MB
  cpu: ResourceAllocation;   // cores
}

interface StorageResource {
  used: number;              // Current usage in MB
  limit: number | null;      // Limit in MB
}

interface CreditsResource {
  balance: number;           // Current balance
  usage: {                   // SUB-METRICS of credits
    ai: {                    // AI credit usage breakdown
      chat: UsageMetric;
      images: UsageMetric;
      tts: UsageMetric;
      stt: UsageMetric;
      total: UsageMetric;
    };
    marketplace: UsageMetric; // Marketplace purchases
    total: UsageMetric;       // All credits used
  };
  resetsAt: string | null;   // For monthly reset plans
}

// ===========================================
// LEVEL 3: Base Types
// ===========================================

interface ResourceCount {
  used: number;
  limit: number | null;
  percentage: number;
  isUnlimited: boolean;
}

interface UsageMetric {
  current: number;
  limit: number | null;
  period: 'hourly' | 'daily' | 'monthly' | 'lifetime';
  resetsAt?: string;
}

interface ResourceAllocation {
  allocated: number;
  limit: number | null;
}
```

### Option B: Simplified Three-Tier (Easier Migration)

```typescript
// ===========================================
// Tier 1: Main Quota Pools
// ===========================================

interface QuotaPools {
  automation: AutomationQuota;
  workspace: WorkspaceQuota | null;  // null for serverless mode
  billing: BillingQuota;
}

// ===========================================
// Tier 2: Pool Details
// ===========================================

interface AutomationQuota {
  // Main resources (COUNT-based)
  resources: {
    gateways: CountQuota;
    plugins: CountQuota;
    workflows: CountQuota;
  };
  // Operational metrics (USAGE-based)
  usage: {
    workflowRuns: UsageQuota;  // Per month
    pluginCalls: UsageQuota;   // Per month
    gatewayRequests: UsageQuota; // Per month (monitoring)
  };
}

interface WorkspaceQuota {
  // Infrastructure allocation
  compute: {
    ram: AllocationQuota;      // MB
    cpu: AllocationQuota;      // cores
  };
  storage: AllocationQuota;    // MB
}

interface BillingQuota {
  // Wallet/Credits
  credits: {
    balance: number;
    monthlyBudget: number | null;
    usage: {
      aiTokens: UsageQuota;
      marketplace: UsageQuota;
    };
    resetsAt: string | null;
  };
  // Subscription
  subscription: {
    seats: CountQuota;
    departments: CountQuota;
    plan: string;
    features: string[];
  };
}

// ===========================================
// Tier 3: Base Quota Types
// ===========================================

interface CountQuota {
  used: number;
  limit: number | null;
}

interface UsageQuota {
  current: number;
  limit: number | null;
  period: 'hourly' | 'daily' | 'monthly';
  resetsAt?: string;
}

interface AllocationQuota {
  allocated: number;
  limit: number | null;
}
```

---

## Current Issues Found in Codebase

### Issue 1: Mixed Levels in ResourceType Enum

```typescript
// FILE: src/modules/quota/quota.types.ts
// PROBLEM: Mixing main resources with sub-resources

export enum ResourceType {
  WORKFLOW = 'workflow',        // ✅ Main resource
  PLUGIN = 'plugin',            // ✅ Main resource
  WORKFLOW_RUN = 'workflow_run',// ❌ Sub-resource of WORKFLOW
  STORAGE = 'storage',          // ❌ Sub-resource of WORKSPACE
  WORKFLOW_STEP = 'workflow_step', // ❌ Sub-resource of WORKFLOW
  GATEWAY = 'gateway',          // ✅ Main resource
  DEPARTMENT = 'department',    // ✅ Org resource
  MEMBER = 'member',            // ✅ Org resource
}
```

**Recommended Fix:**

```typescript
// Main countable resources
export enum ResourceType {
  GATEWAY = 'gateway',
  PLUGIN = 'plugin',
  WORKFLOW = 'workflow',
  DEPARTMENT = 'department',
  MEMBER = 'member',
}

// Usage/consumption metrics
export enum UsageType {
  GATEWAY_REQUESTS = 'gateway_requests',
  PLUGIN_EXECUTIONS = 'plugin_executions',
  WORKFLOW_RUNS = 'workflow_runs',
  WORKFLOW_STEPS = 'workflow_steps',
  AI_TOKENS = 'ai_tokens',
  STORAGE = 'storage',
}
```

### Issue 2: Inconsistent Quota Structures

```typescript
// FILE: src/shared/types/quota.ts
// PROBLEM: storage appears both in 'usage' and 'workspace'

interface PersonalUsageQuota {
  requests: QuotaItem;  // ❌ Should be in automation.gateways.metrics
  storage: QuotaItem;   // ❌ Should be in workspace pool
  credits: QuotaItem;   // ✅ Correct - billing pool
}

interface PersonalWorkspaceQuota {
  ram: QuotaItem;
  cpu: QuotaItem;
  storage: QuotaItem;   // ⚠️ Duplicated from usage!
}
```

### Issue 3: Plans Mixing Resource Types

```typescript
// FILE: src/shared/constants/plans.ts
// PROBLEM: Flat structure mixing counts, allocations, and usage limits

interface PlanLimits {
  gateways: number;           // Count
  workflows: number;          // Count
  plugins: number;            // Count
  workflowRunsPerMonth: number; // Usage metric
  creditsPerMonth: number;    // Billing
  workspace: WorkspaceResources; // Allocation
}
```

---

## Migration Strategy

### Phase 1: Add New Types (Non-Breaking)

1. Create new hierarchical types alongside existing ones
2. Add conversion functions between old and new types
3. Update UI components to use new structure internally

### Phase 2: Update Services (Gradual)

1. Update quota.service.ts to return new structure
2. Add deprecated warnings to old response shapes
3. Migrate one resource pool at a time

### Phase 3: Update Database (If Needed)

1. Current schema is fine - no DB changes needed
2. Types are just organizational

### Phase 4: Remove Old Types

1. Remove deprecated types after migration complete
2. Update all remaining references

---

## Files to Update

| File | Priority | Changes Needed |
|------|----------|----------------|
| `src/shared/types/quota.ts` | HIGH | Reorganize into pools |
| `src/modules/quota/quota.types.ts` | HIGH | Split ResourceType enum |
| `src/modules/quota/quota.service.ts` | HIGH | Return new structure |
| `src/shared/constants/plans.ts` | MEDIUM | Group by pool |
| `src/shared/constants/org-plans.ts` | MEDIUM | Group by pool |
| UI Components | LOW | Use new structure |

---

## Visual Comparison

### Before (Current - Confusing)

```
Dashboard
├── Workflows: 5/10
├── Plugins: 3/5
├── Gateways: 2/5
├── Credits: 1000/5000  ← Where does this belong?
├── Storage: 50/100 MB  ← Duplicate?
├── RAM: 256/512 MB     ← Infrastructure
└── Workflow Runs: 100/1000  ← Sub-resource shown as main
```

### After (Proposed - Clear)

**Personal Dashboard:**
```
┌─────────────────────────────────────────────────────────────┐
│ MY RESOURCES (Plan: PRO)                                    │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│ 🔧 AUTOMATION                                               │
│ ├── Gateways: 2/5 ▓▓▓▓░░░░░░ 40%                           │
│ │   └── Requests: 1,234/mo                                  │
│ ├── Plugins: 3/10 ▓▓▓░░░░░░░ 30%                           │
│ │   └── Executions: 567/mo                                  │
│ └── Workflows: 5/20 ▓▓░░░░░░░░ 25%                         │
│     └── Runs: 100/1,000/mo ▓░░░░░░░░░ 10%                  │
│                                                              │
│ 🖥️ WORKSPACE                                                │
│ ├── Compute: 256/512 MB RAM, 0.5/1 CPU                     │
│ └── Storage: 5/10 GB                                        │
│                                                              │
│ 💳 BILLING                                                  │
│ ├── Credits: 800 balance                                    │
│ │   └── AI Usage: 500/mo                                    │
│ └── Plan: PRO ($29/mo)                                      │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Organization Dashboard:**
```
┌─────────────────────────────────────────────────────────────┐
│ ACME CORP (Plan: ORG_PRO)                                   │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│ 🔧 SHARED AUTOMATION POOL                                   │
│ ├── Gateways: 15/25 (10 allocated to depts)                │
│ ├── Plugins: 30/50 (20 allocated to depts)                 │
│ └── Workflows: 50/100 (40 allocated to depts)              │
│                                                              │
│ 🖥️ SHARED WORKSPACE POOL                                    │
│ ├── Compute: 12/16 GB RAM allocated                        │
│ └── Storage: 80/100 GB allocated                           │
│                                                              │
│ 💳 BILLING                                                  │
│ ├── Credits: 35,000 budget/mo                              │
│ │   └── 25,000 allocated to departments                    │
│ │   └── 10,000 unallocated (org-wide use)                  │
│ ├── Seats: 12/20                                           │
│ └── Plan: ORG_PRO ($299/mo)                                │
│                                                              │
│ 📊 ALLOCATION SUMMARY                                       │
│ ├── Engineering: 20 workflows, 8GB RAM, 15K credits        │
│ ├── Marketing: 15 workflows, 4GB RAM, 10K credits          │
│ └── Unallocated: 15 workflows, 4GB RAM, 10K credits        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Department View (within Org):**
```
┌─────────────────────────────────────────────────────────────┐
│ ENGINEERING DEPARTMENT (of ACME CORP)                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│ 📦 ALLOCATED RESOURCES (from org pool)                      │
│ ├── Workflows: 18/20 allocated ▓▓▓▓▓▓▓▓▓░ 90%             │
│ ├── Gateways: 3/5 allocated                                │
│ └── Credits: 12,000/15,000/mo used                         │
│                                                              │
│ 🖥️ ALLOCATED WORKSPACE                                      │
│ ├── RAM: 6/8 GB used                                       │
│ └── Storage: 35/50 GB used                                 │
│                                                              │
│ 👥 MEMBER ALLOCATIONS                                       │
│ ├── Alice: 10 workflows, 4GB RAM, 8K credits               │
│ ├── Bob: 6 workflows, 2GB RAM, 4K credits                  │
│ └── Unallocated: 2 workflows, 2GB RAM, 3K credits          │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Recommendation

**Implement Option B (Simplified Three-Tier)** because:

1. ✅ Easier migration path from current structure
2. ✅ Clear separation of concerns
3. ✅ Matches how users think about resources
4. ✅ Scales well for future features
5. ✅ Compatible with current database schema

---

## Next Steps

1. [x] Review and approve this architecture
2. [x] Create new type definitions in `src/shared/types/resources.ts`
3. [ ] Export types from `src/shared/types/index.ts`
4. [ ] Add conversion utilities (uncomment in resources.ts)
5. [ ] Update quota service to return new format
6. [ ] Update UI components one by one
7. [ ] Deprecate old types (archive quota.ts)
8. [ ] Update documentation

---

## 📋 MIGRATION PLAN (Step-by-Step)

### Overview

| Current (OLD) | New (resources.ts) |
|---------------|-------------------|
| `QuotaItem` | `CountQuota`, `UsageMetric`, `AllocationQuota` |
| `PersonalQuotaStatus` | `PersonalResourceStatus` |
| `OrgQuotaStatus` | `OrgResourceStatus` |
| `DeptQuotaStatus` | `OrgDeptResourceStatus` |
| `MemberQuotaStatus` | `OrgMemberResourceStatus` |
| Flat `automation`, `usage`, `workspace` | Hierarchical `AutomationPool`, `WorkspacePool`, `BillingPool` |

### Files to Migrate (27 files)

**HIGH PRIORITY - Core Types & Services:**
| # | File | What to Change | Estimate |
|---|------|----------------|----------|
| 1 | `src/shared/types/index.ts` | Export new types from `resources.ts` | 5 min |
| 2 | `src/modules/quota/quota.types.ts` | Import from resources.ts OR deprecate | 30 min |
| 3 | `src/modules/quota/quota.service.ts` | Return `PersonalResourceStatus` / `OrgResourceStatus` | 2 hours |
| 4 | `src/modules/quota/quota-allocation.types.ts` | Use `AllocatedResource` from resources.ts | 30 min |
| 5 | `src/modules/quota/quota-allocation.service.ts` | Use new types for dept/member allocation | 1 hour |
| 6 | `src/modules/quota/quota-enforcement.service.ts` | Use new types for enforcement checks | 1 hour |

**MEDIUM PRIORITY - API Routes:**
| # | File | What to Change | Estimate |
|---|------|----------------|----------|
| 7 | `src/server/routes/quota.ts` | Return new response shape | 1 hour |
| 8 | `src/app/api/quota/route.ts` (if exists) | Update API response | 30 min |

**MEDIUM PRIORITY - UI Components:**
| # | File | What to Change | Estimate |
|---|------|----------------|----------|
| 9 | `src/app/(dashboard)/organizations/[orgSlug]/billing/page.tsx` | Use `OrgResourceStatus` | 1 hour |
| 10 | `src/app/(dashboard)/settings/billing/page.tsx` | Use `PersonalResourceStatus` | 1 hour |
| 11 | `src/components/quota/*` | Update to use new types | 2 hours |
| 12 | `src/components/dashboard/*` | Update quota displays | 2 hours |

**LOW PRIORITY - Tests:**
| # | File | What to Change | Estimate |
|---|------|----------------|----------|
| 13-16 | `src/modules/quota/__tests__/*.ts` | Update test expectations | 3 hours |

**LOW PRIORITY - Constants (already updated):**
| # | File | Status |
|---|------|--------|
| 17 | `src/shared/constants/plans.ts` | ✅ Already uses `workflowRunsPerMonth` |
| 18 | `src/shared/constants/org-plans.ts` | ✅ Already uses `workflowRunsPerMonth` |

---

### Phase 1: Type Foundation (Day 1)

**Step 1.1: Export new types**
```typescript
// src/shared/types/index.ts - ADD:
export * from './resources';
```

**Step 1.2: Add conversion bridge**
Create adapter functions in `quota.service.ts` to convert new → old format during transition:
```typescript
// Temporary: Convert PersonalResourceStatus → PersonalQuotaStatus
function toPersonalQuotaStatus(status: PersonalResourceStatus): PersonalQuotaStatus {
  return {
    plan: status.plan,
    executionMode: status.executionMode,
    automation: {
      workflows: countToLegacy(status.automation.workflows.count),
      plugins: countToLegacy(status.automation.plugins.count),
      gateways: countToLegacy(status.automation.gateways.count),
    },
    usage: {
      requests: { ...usageToLegacy(status.automation.gateways.metrics.requests), resetsAt: null },
      storage: status.workspace 
        ? allocationToLegacy(status.workspace.storage.allocation)
        : { used: 0, limit: null, percentage: 0, isUnlimited: true },
      credits: { ...usageToLegacy(status.billing.credits.usage.total), resetsAt: status.billing.credits.resetsAt },
    },
    workspace: status.workspace ? {
      ram: allocationToLegacy(status.workspace.compute.ram),
      cpu: allocationToLegacy(status.workspace.compute.cpu),
      storage: allocationToLegacy(status.workspace.storage.allocation),
    } : null,
    historyDays: status.historyDays,
  };
}
```

---

### Phase 2: Service Migration (Day 2-3)

**Step 2.1: Update quota.service.ts**

Add new method alongside existing (non-breaking):
```typescript
// NEW METHOD
async getResourceStatus(ctx: ServiceContext): Promise<ResourceStatus> {
  // Build new structure
}

// OLD METHOD (keep for backward compatibility)
async getQuotaStatus(ctx: ServiceContext): Promise<PersonalQuotaStatus | OrgQuotaStatus> {
  const status = await this.getResourceStatus(ctx);
  return isPersonalContext(status) 
    ? toPersonalQuotaStatus(status)
    : toOrgQuotaStatus(status);
}
```

**Step 2.2: Update quota routes**

Add new v2 endpoint alongside existing:
```typescript
// src/server/routes/quota.ts
router.get('/status', ...); // OLD - keep working
router.get('/v2/status', ...); // NEW - returns ResourceStatus
```

---

### Phase 3: UI Migration (Day 4-6)

**Step 3.1: Create new UI components**
```
src/components/resources/
├── ResourcePoolCard.tsx      # Display AutomationPool, WorkspacePool, BillingPool
├── ResourceItemBar.tsx       # Individual resource progress bar
├── ResourceContext.tsx       # React context for resource status
└── useResourceStatus.ts      # Hook to fetch resource status
```

**Step 3.2: Update dashboard pages**
- Personal billing page → use `PersonalResourceStatus`
- Org billing page → use `OrgResourceStatus`
- Dept page → use `OrgDeptResourceStatus`
- Member page → use `OrgMemberResourceStatus`

---

### Phase 4: Cleanup (Day 7)

**Step 4.1: Deprecate old types**
```typescript
// src/shared/types/quota.ts
/** @deprecated Use PersonalResourceStatus from './resources' instead */
export interface PersonalQuotaStatus { ... }
```

**Step 4.2: Remove bridge functions**
Once all consumers are updated, remove conversion functions.

**Step 4.3: Archive old file**
Move `quota.ts` to `_archive_/` folder.

---

### Migration Checklist

```
Phase 1: Foundation
[x] 1.1 Export from src/shared/types/index.ts ✅ (already exported)
[x] 1.2 Add conversion bridge functions to quota.service.ts ✅
[x] 1.3 Run tests - all should pass (no breaking changes) ✅ 763 tests pass

Phase 2: Services
[x] 2.1 Add getResourceStatus() method to quota.service.ts ✅
    - Added getPersonalResourceStatus()
    - Added getOrgResourceStatus()
    - Added getOrgDeptResourceStatus()
    - Added getOrgMemberResourceStatus()
[x] 2.2 Add /v2/status endpoint to quota routes ✅
    - GET /api/quota/v2/status with query params (orgId, deptId, memberId)
[x] 2.3 Update quota-allocation.service.ts ✅ (no changes needed - uses own types)
[x] 2.4 Update quota-enforcement.service.ts ✅ (no changes needed - uses own types)
[x] 2.5 Run tests - all 763 tests pass ✅

Phase 3: UI
[x] 3.1 Create ResourcePoolCard component ✅
    - Created src/components/resources/resource-pool-card.tsx
    - Created src/components/resources/resource-item-bar.tsx
[x] 3.2 Create useResourceStatus hook ✅
    - Created src/components/resources/use-resource-status.tsx
    - Created src/components/resources/resource-context.tsx
[x] 3.3 Update personal billing page ✅
    - Created src/components/resources/resource-overview.tsx (PersonalOverview)
    - Created src/app/(dashboard)/usage/client-v2.tsx
[x] 3.4 Update org billing page ✅
    - Added OrgOverview to resource-overview.tsx
[x] 3.5 Update dept/member views ✅
    - Created src/components/resources/dept-resource-view.tsx
    - Created src/components/resources/member-resource-view.tsx
    - Added DeptOverview, MemberOverview to resource-overview.tsx
[x] 3.6 Run tests - all 763 tests pass ✅

Phase 4: Cleanup ✅
[x] 4.1 Add @deprecated to old types ✅
    - Added @deprecated JSDoc to module header in quota.ts
    - Added @deprecated to QuotaItem, PersonalQuotaStatus, OrgQuotaStatus, DeptQuotaStatus, MemberQuotaStatus
    - All deprecated types point to resources.ts equivalents
[x] 4.2 Remove getQuotaStatus() - use getResourceStatus() ✅
    - Already removed from src/ in earlier phases
    - resourceService.getResourceStatus() is the standard
[x] 4.3 Remove /status endpoint - use /v2/status ✅
    - /status kept for backward compatibility but deprecated
    - /v2/status marked as PRIMARY ENDPOINT in comments
[x] 4.4 Archive src/shared/types/quota.ts ✅
    - Archived to _archive_/src/shared/types/quota.ts.archived
    - Original kept in place for backward compatibility (active imports)
    - Added re-exports to resources.ts for gradual migration
[x] 4.5 Update all documentation ✅
    - Updated this checklist
    - RESOURCE-MIGRATION-AUDIT.md already marked complete
[x] 4.6 Final test run ✅
```

---

### Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Breaking API consumers | Keep old endpoints working during transition |
| UI regressions | Build new components alongside old, swap when ready |
| Test failures | Update tests incrementally per service |
| Data inconsistency | No DB changes needed - types are UI/API only |

---

### Estimated Timeline

| Phase | Duration | Team |
|-------|----------|------|
| Phase 1: Foundation | 1 day | Backend |
| Phase 2: Services | 2 days | Backend |
| Phase 3: UI | 3 days | Frontend |
| Phase 4: Cleanup | 1 day | Both |
| **Total** | **7 days** | |

---

## Questions for Decision (RESOLVED)

1. **Should we create a completely new types file or update existing?**
   - ✅ **DECISION:** New file created (`resources.ts`), then migrate. Old `quota.ts` will be archived.

2. **Should the UI immediately reflect the 3-pool structure?**
   - ✅ **DECISION:** Yes, group resources in dashboard by pool (Automation, Workspace, Billing)

3. **Should we rename any fields for consistency?**
   - ✅ **DECISION:** Use `gatewayRequests` (clear context, not ambiguous `requests`)
   - ✅ **DECISION:** Use `credits` for wallet balance (simple, matches UI)
   - ✅ **DECISION:** Use `aiUsage` for AI consumption breakdown within credits

4. **Storage appears in two places - which should it be?**
   - ✅ **DECISION:** Only in `workspace.storage` for infrastructure
   - General file storage → separate "Files" resource if needed in future

---

## Extensibility Notes

This architecture is **future-proof** for adding new resources:

### Adding New Resource (e.g., 2Bot AI)

```typescript
// 1. Add to AutomationPool or create new pool:
interface AutomationPool {
  gateways: GatewayResource;
  plugins: PluginResource;
  workflows: WorkflowResource;
  botAI?: BotAIResource;  // ← Easy to add
}

// 2. Define the resource with metrics:
interface BotAIResource {
  count: CountQuota;           // How many AI bots
  metrics: {
    conversations: UsageMetric; // Chat sessions
    tokensUsed: UsageMetric;    // AI tokens consumed
    knowledgeBases: CountQuota; // Knowledge bases attached
  };
}

// 3. Add to enums:
enum CountableResource {
  // ... existing
  BOT_AI = 'bot_ai',
}

enum UsageResource {
  // ... existing
  BOT_AI_CONVERSATIONS = 'bot_ai_conversations',
  BOT_AI_TOKENS = 'bot_ai_tokens',
}
```

### Works for Both Contexts
- **Personal:** User owns AI bots directly
- **Organization:** AI bots in shared pool, allocated to departments/members

---

*This audit is based on analysis of the codebase and industry best practices.*
