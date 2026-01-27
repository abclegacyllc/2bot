"use strict";
/**
 * Workflow Validation Schemas
 *
 * Zod schemas for validating workflow API requests.
 *
 * @module modules/workflow/workflow.validation
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.workflowRunListQuerySchema = exports.workflowListQuerySchema = exports.triggerWorkflowSchema = exports.updateWorkflowSchema = exports.createWorkflowSchema = exports.updateWorkflowStepSchema = exports.createWorkflowStepSchema = exports.stepConditionSchema = exports.inputMappingSchema = exports.triggerConfigSchema = exports.manualTriggerConfigSchema = exports.webhookTriggerConfigSchema = exports.scheduleTriggerConfigSchema = exports.telegramCallbackTriggerConfigSchema = exports.telegramMessageTriggerConfigSchema = exports.errorHandlerSchema = exports.workflowScopeSchema = exports.workflowStatusSchema = exports.triggerTypeSchema = exports.workflowSlugSchema = exports.workflowNameSchema = void 0;
const zod_1 = require("zod");
// ===========================================
// Common Schemas
// ===========================================
/**
 * Workflow name validation
 * 3-100 characters, alphanumeric with spaces and basic punctuation
 */
exports.workflowNameSchema = zod_1.z
    .string()
    .min(3, "Workflow name must be at least 3 characters")
    .max(100, "Workflow name must be at most 100 characters")
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9\s\-_.]*$/, "Workflow name must start with alphanumeric and contain only letters, numbers, spaces, hyphens, underscores, and dots");
/**
 * Workflow slug validation
 * URL-safe identifier: 2-50 lowercase alphanumeric with hyphens
 */
exports.workflowSlugSchema = zod_1.z
    .string()
    .min(2, "Slug must be at least 2 characters")
    .max(50, "Slug must be at most 50 characters")
    .regex(/^[a-z][a-z0-9-]*[a-z0-9]$|^[a-z][a-z0-9]?$/, "Slug must be lowercase, start with a letter, and contain only letters, numbers, and hyphens");
/**
 * Trigger type enum
 */
exports.triggerTypeSchema = zod_1.z.enum([
    "TELEGRAM_MESSAGE",
    "TELEGRAM_CALLBACK",
    "SCHEDULE",
    "WEBHOOK",
    "MANUAL",
]);
/**
 * Workflow status enum
 */
exports.workflowStatusSchema = zod_1.z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]);
/**
 * Workflow scope enum
 */
exports.workflowScopeSchema = zod_1.z.enum(["USER", "ORGANIZATION", "GLOBAL"]);
/**
 * Error handler enum
 */
exports.errorHandlerSchema = zod_1.z.enum(["stop", "continue", "retry"]);
// ===========================================
// Trigger Config Schemas
// ===========================================
/**
 * Telegram message trigger config
 */
exports.telegramMessageTriggerConfigSchema = zod_1.z.object({
    filterType: zod_1.z
        .enum(["all", "text", "photo", "document", "command"])
        .optional(),
    commandPrefix: zod_1.z.string().max(50).optional(),
    textPattern: zod_1.z.string().max(500).optional(),
    chatTypes: zod_1.z
        .array(zod_1.z.enum(["private", "group", "supergroup", "channel"]))
        .optional(),
});
/**
 * Telegram callback trigger config
 */
exports.telegramCallbackTriggerConfigSchema = zod_1.z.object({
    dataPattern: zod_1.z.string().max(500).optional(),
    dataValues: zod_1.z.array(zod_1.z.string().max(100)).max(50).optional(),
});
/**
 * Schedule trigger config
 */
exports.scheduleTriggerConfigSchema = zod_1.z.object({
    cron: zod_1.z
        .string()
        .min(9, "Invalid cron expression")
        .max(100, "Cron expression too long")
        .regex(/^(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)$/, "Invalid cron expression format"),
    timezone: zod_1.z.string().max(50).optional(),
    startDate: zod_1.z.string().datetime().optional(),
    endDate: zod_1.z.string().datetime().optional(),
});
/**
 * Webhook trigger config
 */
exports.webhookTriggerConfigSchema = zod_1.z.object({
    secret: zod_1.z.string().max(256).optional(),
    methods: zod_1.z.array(zod_1.z.enum(["GET", "POST", "PUT", "DELETE"])).optional(),
    contentType: zod_1.z.string().max(100).optional(),
});
/**
 * Manual trigger config
 */
exports.manualTriggerConfigSchema = zod_1.z.object({
    requiredParams: zod_1.z.array(zod_1.z.string().max(100)).max(20).optional(),
    paramsSchema: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
});
/**
 * Generic trigger config (loose validation, specific validation per type)
 */
exports.triggerConfigSchema = zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional();
// ===========================================
// Step Schemas
// ===========================================
/**
 * Input mapping schema
 * Keys are output names, values are template strings
 */
exports.inputMappingSchema = zod_1.z
    .record(zod_1.z.string(), zod_1.z.string().max(2000))
    .refine((mapping) => Object.keys(mapping).length <= 50, "Maximum 50 input mappings allowed")
    .optional();
/**
 * Step condition schema
 */
exports.stepConditionSchema = zod_1.z
    .object({
    if: zod_1.z
        .string()
        .min(1, "Condition expression required")
        .max(1000, "Condition expression too long"),
})
    .optional();
/**
 * Create workflow step schema
 */
exports.createWorkflowStepSchema = zod_1.z.object({
    order: zod_1.z
        .number()
        .int()
        .min(0, "Order must be non-negative")
        .max(99, "Maximum 100 steps allowed"),
    name: zod_1.z.string().min(1).max(100).optional(),
    pluginId: zod_1.z.string().uuid("Invalid plugin ID"),
    inputMapping: exports.inputMappingSchema,
    config: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
    gatewayId: zod_1.z.string().uuid("Invalid gateway ID").optional(),
    condition: exports.stepConditionSchema,
    onError: exports.errorHandlerSchema.default("stop"),
    maxRetries: zod_1.z.number().int().min(0).max(10).default(0),
});
/**
 * Update workflow step schema
 */
exports.updateWorkflowStepSchema = zod_1.z.object({
    order: zod_1.z.number().int().min(0).max(99).optional(),
    name: zod_1.z.string().min(1).max(100).nullish(),
    pluginId: zod_1.z.string().uuid("Invalid plugin ID").optional(),
    inputMapping: exports.inputMappingSchema,
    config: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
    gatewayId: zod_1.z.string().uuid("Invalid gateway ID").nullish(),
    condition: exports.stepConditionSchema.nullish(),
    onError: exports.errorHandlerSchema.optional(),
    maxRetries: zod_1.z.number().int().min(0).max(10).optional(),
});
// ===========================================
// Workflow Schemas
// ===========================================
/**
 * Create workflow schema
 */
exports.createWorkflowSchema = zod_1.z
    .object({
    name: exports.workflowNameSchema,
    description: zod_1.z.string().max(500).optional(),
    slug: exports.workflowSlugSchema,
    scope: exports.workflowScopeSchema.default("USER"),
    triggerType: exports.triggerTypeSchema,
    triggerConfig: exports.triggerConfigSchema,
    gatewayId: zod_1.z.string().uuid("Invalid gateway ID").optional(),
})
    .refine((data) => {
    // Validate trigger config based on trigger type
    if (data.triggerType === "SCHEDULE" && data.triggerConfig) {
        const result = exports.scheduleTriggerConfigSchema.safeParse(data.triggerConfig);
        return result.success;
    }
    return true;
}, {
    message: "Invalid schedule trigger configuration",
    path: ["triggerConfig"],
});
/**
 * Update workflow schema
 */
exports.updateWorkflowSchema = zod_1.z.object({
    name: exports.workflowNameSchema.optional(),
    description: zod_1.z.string().max(500).nullish(),
    slug: exports.workflowSlugSchema.optional(),
    triggerType: exports.triggerTypeSchema.optional(),
    triggerConfig: exports.triggerConfigSchema.nullish(),
    gatewayId: zod_1.z.string().uuid("Invalid gateway ID").nullish(),
    status: exports.workflowStatusSchema.optional(),
    isEnabled: zod_1.z.boolean().optional(),
});
/**
 * Manual trigger request schema
 */
exports.triggerWorkflowSchema = zod_1.z.object({
    params: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
});
// ===========================================
// Query Schemas
// ===========================================
/**
 * Workflow list query schema
 */
exports.workflowListQuerySchema = zod_1.z.object({
    scope: exports.workflowScopeSchema.optional(),
    status: exports.workflowStatusSchema.optional(),
    triggerType: exports.triggerTypeSchema.optional(),
    gatewayId: zod_1.z.string().uuid().optional(),
    search: zod_1.z.string().max(100).optional(),
    page: zod_1.z.coerce.number().int().min(1).default(1),
    limit: zod_1.z.coerce.number().int().min(1).max(100).default(20),
    sortBy: zod_1.z.enum(["name", "createdAt", "updatedAt", "executionCount"]).default("createdAt"),
    sortOrder: zod_1.z.enum(["asc", "desc"]).default("desc"),
});
/**
 * Workflow run list query schema
 */
exports.workflowRunListQuerySchema = zod_1.z.object({
    workflowId: zod_1.z.string().uuid().optional(),
    status: zod_1.z.enum(["PENDING", "RUNNING", "COMPLETED", "FAILED", "CANCELLED"]).optional(),
    triggeredBy: zod_1.z.string().max(100).optional(),
    startDate: zod_1.z.string().datetime().optional(),
    endDate: zod_1.z.string().datetime().optional(),
    page: zod_1.z.coerce.number().int().min(1).default(1),
    limit: zod_1.z.coerce.number().int().min(1).max(100).default(20),
    sortOrder: zod_1.z.enum(["asc", "desc"]).default("desc"),
});
//# sourceMappingURL=workflow.validation.js.map