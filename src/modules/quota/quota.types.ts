/**
 * Quota Types
 *
 * Types and enums for the resource quota system.
 *
 * @module modules/quota/quota.types
 */

import type { PlanType } from '@/shared/constants/plans';

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

/**
 * Default resource limits by plan
 * -1 means unlimited
 */
export const PLAN_QUOTA_LIMITS: Record<PlanType, ResourceLimits> = {
  FREE: {
    maxWorkflows: 5,
    maxPlugins: 3,
    maxApiCalls: 1000,
    maxStorage: 100,
    maxSteps: 5,
    maxGateways: 1,
    maxDepartments: 1,
    maxMembers: 3,
  },
  STARTER: {
    maxWorkflows: 15,
    maxPlugins: 10,
    maxApiCalls: 5000,
    maxStorage: 500,
    maxSteps: 10,
    maxGateways: 3,
    maxDepartments: 3,
    maxMembers: 5,
  },
  PRO: {
    maxWorkflows: 50,
    maxPlugins: 25,
    maxApiCalls: 50000,
    maxStorage: 1000,
    maxSteps: 15,
    maxGateways: 10,
    maxDepartments: 5,
    maxMembers: 10,
  },
  BUSINESS: {
    maxWorkflows: 200,
    maxPlugins: 100,
    maxApiCalls: 200000,
    maxStorage: 5000,
    maxSteps: 25,
    maxGateways: 25,
    maxDepartments: 20,
    maxMembers: 50,
  },
  ENTERPRISE: {
    maxWorkflows: -1, // unlimited
    maxPlugins: -1,
    maxApiCalls: 500000,
    maxStorage: 10000,
    maxSteps: 30,
    maxGateways: -1,
    maxDepartments: -1,
    maxMembers: -1,
  },
};

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
