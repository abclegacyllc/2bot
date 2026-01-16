/**
 * Quota Validation Schemas
 *
 * Zod schemas for quota API request validation.
 *
 * @module modules/quota/quota.validation
 */

import { z } from 'zod';

/**
 * Schema for setting quotas
 */
export const setQuotasSchema = z.object({
  maxWorkflows: z.number().int().min(-1).nullable().optional(),
  maxPlugins: z.number().int().min(-1).nullable().optional(),
  maxApiCalls: z.number().int().min(-1).nullable().optional(),
  maxStorage: z.number().int().min(-1).nullable().optional(),
  maxSteps: z.number().int().min(-1).nullable().optional(),
});

export type SetQuotasInput = z.infer<typeof setQuotasSchema>;

/**
 * Schema for usage history query
 */
export const usageHistoryQuerySchema = z.object({
  periodType: z.enum(['HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY']).default('DAILY'),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

export type UsageHistoryQuery = z.infer<typeof usageHistoryQuerySchema>;
