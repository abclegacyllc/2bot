/**
 * Quota Types
 *
 * Types and enums for the resource quota system.
 *
 * @module modules/quota/quota.types
 */


// ===========================================
// Resource Types
// ===========================================

export enum ResourceType {
  WORKFLOW = 'workflow',
  PLUGIN = 'plugin',
  API_CALL = 'api_call',
  STORAGE = 'storage',
  WORKFLOW_STEP = 'workflow_step',
  GATEWAY = 'gateway',
  DEPARTMENT = 'department',
  MEMBER = 'member',
}

// ===========================================
// Quota Limits
// ===========================================

export interface ResourceLimits {
  maxWorkflows: number | null;
  maxPlugins: number | null;
  maxApiCalls: number | null; // Per day
  maxStorage: number | null; // MB
  maxSteps: number | null; // Per workflow
  maxGateways: number | null;
  maxDepartments: number | null;
  maxMembers: number | null; // Per department or per org
}

export interface ResourceUsage {
  usedWorkflows: number;
  usedPlugins: number;
  usedApiCalls: number;
  usedStorage: number;
  usedGateways: number;
}

// ===========================================
// Quota Status
// ===========================================

export interface QuotaItem {
  used: number;
  limit: number | null; // null = unlimited
  percentage: number; // 0-100, 0 if unlimited
  isUnlimited: boolean;
}

export interface QuotaStatus {
  workflows: QuotaItem;
  plugins: QuotaItem;
  apiCalls: QuotaItem & { resetsAt: Date | null };
  storage: QuotaItem;
  gateways: QuotaItem;
}

// ===========================================
// Plan Defaults
// ===========================================

// NOTE: Plan limits are now defined in @/shared/constants/plans.ts
// Use getPlanQuotaLimits() from quota.service.ts for ResourceLimits format

// ===========================================
// Quota Owner Types
// ===========================================

export type QuotaOwnerType = 'organization' | 'department' | 'user';

export interface QuotaOwner {
  type: QuotaOwnerType;
  organizationId?: string;
  departmentId?: string;
  userId?: string;
}

// ===========================================
// Service Input/Output Types
// ===========================================

export interface SetQuotasInput {
  maxWorkflows?: number | null;
  maxPlugins?: number | null;
  maxApiCalls?: number | null;
  maxStorage?: number | null;
  maxSteps?: number | null;
}

export interface QuotaCheckResult {
  allowed: boolean;
  current: number;
  limit: number | null;
  resource: ResourceType;
  message?: string;
}

// ===========================================
// Usage History Types
// ===========================================

export type PeriodType = 'HOURLY' | 'DAILY' | 'WEEKLY' | 'MONTHLY';

export interface UsageRecord {
  periodStart: Date;
  periodType: PeriodType;
  apiCalls: number;
  workflowRuns: number;
  pluginExecutions: number;
  storageUsed: number;
  errors: number;
  estimatedCost?: number;
}
