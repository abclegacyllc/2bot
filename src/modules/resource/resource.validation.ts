/**
 * Resource Module Validation Schemas
 * 
 * Zod schemas for validating resource-related API requests.
 * 
 * @module modules/resource/resource.validation
 */

import { z } from 'zod';

// ===========================================
// Allocation Schemas
// ===========================================

/**
 * Schema for setting department allocation
 */
export const setDeptAllocationSchema = z.object({
  maxGateways: z.number().int().min(0).nullable().optional(),
  maxPlugins: z.number().int().min(0).nullable().optional(),
  maxWorkflows: z.number().int().min(0).nullable().optional(),
  creditBudget: z.number().int().min(0).nullable().optional(),
  ramMb: z.number().int().min(0).nullable().optional(),
  cpuCores: z.number().min(0).nullable().optional(),
  storageMb: z.number().int().min(0).nullable().optional(),
  mode: z.enum(['SOFT_CAP', 'HARD_CAP', 'RESERVED']).optional(),
});

export type SetDeptAllocationInput = z.infer<typeof setDeptAllocationSchema>;

/**
 * Schema for setting member allocation
 */
export const setMemberAllocationSchema = z.object({
  maxGateways: z.number().int().min(0).nullable().optional(),
  maxWorkflows: z.number().int().min(0).nullable().optional(),
  creditBudget: z.number().int().min(0).nullable().optional(),
  ramMb: z.number().int().min(0).nullable().optional(),
  cpuCores: z.number().min(0).nullable().optional(),
  storageMb: z.number().int().min(0).nullable().optional(),
  mode: z.enum(['SOFT_CAP', 'HARD_CAP', 'RESERVED']).optional(),
});

export type SetMemberAllocationInput = z.infer<typeof setMemberAllocationSchema>;

// ===========================================
// Query Schemas
// ===========================================

/**
 * Schema for usage history query parameters
 */
export const usageHistoryQuerySchema = z.object({
  periodType: z.enum(['HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY']).default('DAILY'),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  periods: z.coerce.number().int().min(1).max(365).default(30),
});

export type UsageHistoryQuery = z.infer<typeof usageHistoryQuerySchema>;

/**
 * Schema for resource status query parameters
 */
export const resourceStatusQuerySchema = z.object({
  orgId: z.string().cuid().optional(),
  deptId: z.string().cuid().optional(),
  memberId: z.string().cuid().optional(),
});

export type ResourceStatusQuery = z.infer<typeof resourceStatusQuerySchema>;

// ===========================================
// Legacy Quota Schemas (for backward compatibility)
// ===========================================

/**
 * Schema for setting quotas via legacy API endpoints
 * 
 * This schema now maps to the new 3-pool resource system:
 * - Automation Pool: maxGateways, maxPlugins, maxWorkflows
 * - Workspace Pool: ramMb, cpuCores, storageMb
 * - Budget Pool: creditBudget
 * 
 * @deprecated Use setDeptAllocationSchema or setMemberAllocationSchema directly
 */
export const setQuotasSchema = z.object({
  // Automation Pool
  maxGateways: z.number().int().min(0).nullable().optional(),
  maxPlugins: z.number().int().min(0).nullable().optional(),
  maxWorkflows: z.number().int().min(0).nullable().optional(),
  // Workspace Pool
  ramMb: z.number().int().min(0).nullable().optional(),
  cpuCores: z.number().min(0).nullable().optional(),
  storageMb: z.number().int().min(0).nullable().optional(),
  // Budget Pool
  creditBudget: z.number().int().min(0).nullable().optional(),
});

export type SetQuotasInput = z.infer<typeof setQuotasSchema>;
