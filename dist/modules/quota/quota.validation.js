"use strict";
/**
 * Quota Validation Schemas
 *
 * Zod schemas for quota API request validation.
 *
 * @module modules/quota/quota.validation
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.usageHistoryQuerySchema = exports.setQuotasSchema = void 0;
const zod_1 = require("zod");
/**
 * Schema for setting quotas
 */
exports.setQuotasSchema = zod_1.z.object({
    maxWorkflows: zod_1.z.number().int().min(-1).nullable().optional(),
    maxPlugins: zod_1.z.number().int().min(-1).nullable().optional(),
    maxApiCalls: zod_1.z.number().int().min(-1).nullable().optional(),
    maxStorage: zod_1.z.number().int().min(-1).nullable().optional(),
    maxSteps: zod_1.z.number().int().min(-1).nullable().optional(),
});
/**
 * Schema for usage history query
 */
exports.usageHistoryQuerySchema = zod_1.z.object({
    periodType: zod_1.z.enum(['HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY']).default('DAILY'),
    startDate: zod_1.z.string().datetime().optional(),
    endDate: zod_1.z.string().datetime().optional(),
});
//# sourceMappingURL=quota.validation.js.map