/**
 * Shared Quota Types
 *
 * @deprecated This module is deprecated. Use `@/shared/types/resources` instead.
 * 
 * Migration Guide:
 * - QuotaItem → CountQuota (for counts) or UsageMetric (for usage)
 * - PersonalQuotaStatus → PersonalResourceStatus
 * - OrgQuotaStatus → OrgResourceStatus
 * - DeptQuotaStatus → OrgDeptResourceStatus
 * - MemberQuotaStatus → OrgMemberResourceStatus
 * 
 * New imports:
 * ```typescript
 * import type { PersonalResourceStatus, OrgResourceStatus } from '@/shared/types/resources';
 * ```
 *
 * @module shared/types/quota
 */

// ===========================================
// Base Types (Shared between Personal & Org)
// @deprecated Use CountQuota or UsageMetric from resources.ts
// ===========================================

/**
 * Generic quota item showing usage vs limit
 * @deprecated Use CountQuota or UsageMetric from '@/shared/types/resources'
 */
export interface QuotaItem {
  used: number;
  limit: number | null; // null = unlimited
  percentage: number; // 0-100, 0 if unlimited
  isUnlimited: boolean;
}

/**
 * Resource types that can be quota-limited
 * @deprecated Use resource types from '@/shared/types/resources'
 */
export type ResourceType =
  | 'workflows'
  | 'plugins'
  | 'gateways'
  | 'requests'
  | 'storage'
  | 'steps'
  | 'credits';

/**
 * Workspace resource types (pool-based)
 */
export type WorkspaceResourceType = 'ram' | 'cpu' | 'storage';

// ===========================================
// Personal Quota Types
// ===========================================
// For individual users without organization context

/**
 * Personal user's automation resources
 */
export interface PersonalAutomationQuota {
  workflows: QuotaItem;
  plugins: QuotaItem;
  gateways: QuotaItem;
}

/**
 * Personal user's execution/usage resources
 */
export interface PersonalUsageQuota {
  requests: QuotaItem & { resetsAt: string | null }; // HTTP request count (monitoring)
  storage: QuotaItem;
  credits: QuotaItem & { resetsAt: string | null }; // Wallet mode credits
}

/**
 * Personal user's workspace resources (for paid plans with workspace mode)
 */
export interface PersonalWorkspaceQuota {
  ram: QuotaItem; // MB
  cpu: QuotaItem; // cores (can be fractional)
  storage: QuotaItem; // MB (workspace storage, separate from general storage)
}

/**
 * Complete personal quota status
 * Used by: Dashboard, Personal Billing, Personal Settings
 * @deprecated Use PersonalResourceStatus from '@/shared/types/resources'
 */
export interface PersonalQuotaStatus {
  /** User's subscription plan */
  plan: string;

  /** Execution mode: SERVERLESS (limited) or WORKSPACE (unlimited executions) */
  executionMode: 'SERVERLESS' | 'WORKSPACE';

  /** Automation resources (workflows, plugins, gateways) */
  automation: PersonalAutomationQuota;

  /** Usage-based resources (API calls, storage, AI tokens) */
  usage: PersonalUsageQuota;

  /** Workspace pool (null for SERVERLESS mode) */
  workspace: PersonalWorkspaceQuota | null;

  /** History retention in days */
  historyDays: number;
}

// ===========================================
// Organization Quota Types
// ===========================================
// For organizations with Org → Dept → Member hierarchy

/**
 * Organization's shared automation pool
 */
export interface OrgAutomationPool {
  workflows: QuotaItem;
  plugins: QuotaItem;
  gateways: QuotaItem;
}

/**
 * Organization's shared usage pool
 */
export interface OrgUsagePool {
  requests: QuotaItem & { resetsAt: string | null }; // HTTP request count (monitoring)
  storage: QuotaItem;
  credits: QuotaItem & { resetsAt: string | null }; // Wallet mode credits
}

/**
 * Organization's shared workspace pool (RAM/CPU/Storage)
 */
export interface OrgWorkspacePool {
  ram: QuotaItem; // MB
  cpu: QuotaItem; // cores
  storage: QuotaItem; // MB
}

/**
 * Organization's seat/member limits
 */
export interface OrgSeatQuota {
  seats: QuotaItem;
  departments: QuotaItem;
}

/**
 * Complete organization quota status
 * Used by: Org Dashboard, Org Billing, Org Settings
 * @deprecated Use OrgResourceStatus from '@/shared/types/resources'
 */
export interface OrgQuotaStatus {
  /** Organization's subscription plan */
  plan: string;

  /** Organization ID */
  organizationId: string;

  /** Execution mode: SERVERLESS (ORG_FREE) or WORKSPACE (paid org plans) */
  executionMode: 'SERVERLESS' | 'WORKSPACE';

  /** Shared automation pool (workflows, plugins, gateways) */
  automation: OrgAutomationPool;

  /** Shared usage pool (API calls, storage, AI tokens) */
  usage: OrgUsagePool;

  /** Shared workspace pool (null for SERVERLESS mode) */
  workspace: OrgWorkspacePool | null;

  /** Seat and department limits */
  seats: OrgSeatQuota;

  /** Organization features */
  features: {
    sso: boolean;
    customBranding: boolean;
    prioritySupport: boolean;
    auditLogs: boolean;
    apiAccess: boolean;
    dedicatedDatabase: boolean;
  };

  /** History retention in days */
  historyDays: number;
}

// ===========================================
// Department Quota Types
// ===========================================
// Allocated from organization's pool to a department

/**
 * Department's allocated automation resources
 * @deprecated Use DeptAllocationRecord instead
 */
export interface DeptAutomationAllocation {
  maxWorkflows: number | null; // null = inherit from org
  maxPlugins: number | null;
  maxGateways: number | null;
}

/**
 * Department's allocated budget resources
 * @deprecated Use DeptAllocationRecord instead
 */
export interface DeptBudgetAllocation {
  creditBudget: number | null; // null = inherit from org
}

/**
 * Department's allocated workspace resources
 * @deprecated Use DeptAllocationRecord instead
 */
export interface DeptWorkspaceAllocation {
  ramMb: number | null; // MB
  cpuCores: number | null; // cores
  storageMb: number | null; // MB
}

/**
 * Department quota status with usage tracking
 * @deprecated Use OrgDeptResourceStatus from '@/shared/types/resources'
 */
export interface DeptQuotaStatus {
  /** Department ID */
  departmentId: string;

  /** Department name */
  departmentName: string;

  /** Is department active */
  isActive: boolean;

  /** Automation resources (allocated from org pool) */
  automation: {
    workflows: QuotaItem;
    plugins: QuotaItem;
    gateways: QuotaItem;
  };

  /** Usage resources (allocated from org pool) */
  usage: {
    requests: QuotaItem & { resetsAt: string | null };
    storage: QuotaItem;
    credits: QuotaItem;
  };

  /** Workspace resources (allocated from org pool, null if org is SERVERLESS) */
  workspace: {
    ram: QuotaItem;
    cpu: QuotaItem;
    storage: QuotaItem;
  } | null;

  /** Member count in this department */
  memberCount: number;
}

// ===========================================
// Member Quota Types
// ===========================================
// Allocated from department's pool to a member

/**
 * Member's allocated automation resources within a department
 * @deprecated Use MemberAllocationRecord instead
 */
export interface MemberAutomationAllocation {
  maxWorkflows: number | null; // null = inherit from dept
  maxPlugins: number | null;
  maxGateways: number | null;
}

/**
 * Member's allocated budget resources within a department
 * @deprecated Use MemberAllocationRecord instead
 */
export interface MemberBudgetAllocation {
  creditBudget: number | null; // null = inherit from dept
}

/**
 * Member's allocated workspace resources within a department
 * @deprecated Use MemberAllocationRecord instead
 */
export interface MemberWorkspaceAllocation {
  ramMb: number | null; // MB
  cpuCores: number | null; // cores
  storageMb: number | null; // MB
}

/**
 * Member quota status within a department
 * @deprecated Use OrgMemberResourceStatus from '@/shared/types/resources'
 */
export interface MemberQuotaStatus {
  /** User ID */
  userId: string;

  /** User name */
  userName: string;

  /** User email */
  userEmail: string;

  /** Role within department */
  role: 'DEPT_MANAGER' | 'ORG_MEMBER';

  /** Is member paused */
  isPaused: boolean;

  /** Automation resources (allocated from dept pool) */
  automation: {
    workflows: QuotaItem;
    plugins: QuotaItem;
    gateways: QuotaItem;
  };

  /** Usage resources (allocated from dept pool) */
  usage: {
    requests: QuotaItem;
    storage: QuotaItem;
    credits: QuotaItem;
  };

  /** Workspace resources (allocated from dept pool, null if org is SERVERLESS) */
  workspace: {
    ram: QuotaItem;
    cpu: QuotaItem;
    storage: QuotaItem;
  } | null;
}

// ===========================================
// Allocation Input Types
// ===========================================
// Used when setting allocations

/**
 * Input for setting department allocations
 * 
 * 3-Pool Structure:
 * - Automation Pool: maxGateways, maxPlugins, maxWorkflows
 * - Workspace Pool: ramMb, cpuCores, storageMb
 * - Budget Pool: creditBudget
 */
export interface SetDeptAllocationInput {
  // Automation Pool
  maxGateways?: number | null;
  maxPlugins?: number | null;
  maxWorkflows?: number | null;
  // Workspace Pool
  ramMb?: number | null;
  cpuCores?: number | null;
  storageMb?: number | null;
  // Budget Pool
  creditBudget?: number | null;
}

/**
 * Input for setting member allocations within a department
 * 
 * 3-Pool Structure:
 * - Automation Pool: maxGateways, maxWorkflows (plugins typically not per-member)
 * - Workspace Pool: ramMb, cpuCores, storageMb
 * - Budget Pool: creditBudget
 */
export interface SetMemberAllocationInput {
  // Automation Pool
  maxGateways?: number | null;
  maxWorkflows?: number | null;
  // Workspace Pool
  ramMb?: number | null;
  cpuCores?: number | null;
  storageMb?: number | null;
  // Budget Pool
  creditBudget?: number | null;
}

// ===========================================
// Helper Types
// ===========================================

/**
 * Context type for quota operations
 */
export type QuotaContext =
  | { type: 'personal'; userId: string }
  | { type: 'organization'; organizationId: string }
  | { type: 'department'; organizationId: string; departmentId: string }
  | { type: 'member'; organizationId: string; departmentId: string; userId: string };

/**
 * Quota check result
 */
export interface QuotaCheckResult {
  allowed: boolean;
  current: number;
  limit: number | null;
  remaining: number | null; // null = unlimited
  resource: ResourceType | WorkspaceResourceType;
  message?: string;
}

/**
 * Allocation validation result
 */
export interface AllocationValidationResult {
  valid: boolean;
  errors: Array<{
    resource: string;
    requested: number;
    available: number;
    message: string;
  }>;
}

// ===========================================
// API Response Types
// ===========================================

/**
 * Response from GET /api/user/quota (personal)
 */
export interface PersonalQuotaResponse {
  success: true;
  data: PersonalQuotaStatus;
}

/**
 * Response from GET /api/orgs/:orgId/quota
 */
export interface OrgQuotaResponse {
  success: true;
  data: OrgQuotaStatus;
}

/**
 * Response from GET /api/orgs/:orgId/departments/:deptId/quota
 */
export interface DeptQuotaResponse {
  success: true;
  data: DeptQuotaStatus;
}

/**
 * Response from GET /api/orgs/:orgId/departments/:deptId/members/:userId/quota
 */
export interface MemberQuotaResponse {
  success: true;
  data: MemberQuotaStatus;
}

// ===========================================
// Legacy Compatibility Types
// ===========================================
// For backward compatibility with existing code

/**
 * @deprecated Use PersonalQuotaStatus or OrgQuotaStatus instead
 * Legacy QuotaStatus type for gradual migration
 */
export interface LegacyQuotaStatus {
  workflows: QuotaItem;
  plugins: QuotaItem;
  gateways: QuotaItem;
  credits: QuotaItem & { resetsAt: string | null };
  storage: QuotaItem;
}

/**
 * Convert PersonalQuotaStatus to LegacyQuotaStatus
 */
export function toLegacyQuotaStatus(status: PersonalQuotaStatus): LegacyQuotaStatus {
  return {
    workflows: status.automation.workflows,
    plugins: status.automation.plugins,
    gateways: status.automation.gateways,
    credits: status.usage.credits,
    storage: status.usage.storage,
  };
}

/**
 * Convert OrgQuotaStatus to LegacyQuotaStatus
 */
export function orgToLegacyQuotaStatus(status: OrgQuotaStatus): LegacyQuotaStatus {
  return {
    workflows: status.automation.workflows,
    plugins: status.automation.plugins,
    gateways: status.automation.gateways,
    credits: status.usage.credits,
    storage: status.usage.storage,
  };
}

// ===========================================
// Quota Allocation Page Types
// ===========================================
// Types used by org/dept/member quota management pages

/**
 * Quota allocation for a department or member
 */
export interface QuotaAllocation {
  maxGateways: number | null;
  maxWorkflows: number | null;
  maxPlugins: number | null;
  creditBudget: number | null;
  maxRamMb: number | null;
  maxCpuCores: number | null;
  maxStorageMb: number | null;
}

/**
 * Unallocated resources remaining in pool
 */
export interface UnallocatedResources {
  gateways: number | null;
  workflows: number | null;
  plugins: number | null;
  creditBudget: number | null;
  ramMb: number | null;
  cpuCores: number | null;
  storageMb: number | null;
}

/**
 * Summary of organization's quota allocations
 */
export interface OrgAllocationSummary {
  orgLimits: QuotaAllocation;
  allocatedToDepts: QuotaAllocation;
  unallocated: UnallocatedResources;
  deptCount: number;
}

/**
 * Department allocation record
 */
export interface DeptAllocationRecord {
  id: string;
  departmentId: string;
  departmentName: string;
  maxGateways: number | null;
  maxWorkflows: number | null;
  maxPlugins: number | null;
  creditBudget: number | null;
  maxRamMb: number | null;
  maxCpuCores: number | null;
  maxStorageMb: number | null;
  allocMode: 'SOFT_CAP' | 'HARD_CAP' | 'UNLIMITED' | 'RESERVED' | string;
  setById?: string;
  setByName?: string;
  createdAt?: string;
  updatedAt: string;
}

/**
 * Member allocation record
 */
export interface MemberAllocationRecord {
  id: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  departmentId: string;
  maxGateways: number | null;
  maxWorkflows: number | null;
  creditBudget: number | null;
  maxRamMb: number | null;
  maxCpuCores: number | null;
  maxStorageMb: number | null;
  allocMode: 'SOFT_CAP' | 'HARD_CAP' | 'UNLIMITED' | 'RESERVED' | string;
  setById?: string;
  setByName?: string;
  createdAt?: string;
  updatedAt: string;
}

/**
 * Available department for allocation dropdown
 */
export interface AvailableDepartment {
  id: string;
  name: string;
  hasAllocation: boolean;
}

/**
 * Available member for allocation dropdown
 */
export interface AvailableMember {
  userId: string;
  name: string;
  email: string;
  hasAllocation: boolean;
}
