/**
 * Workflow Validation Schemas
 *
 * Zod schemas for validating workflow API requests.
 *
 * @module modules/workflow/workflow.validation
 */

import { z } from "zod";

// ===========================================
// Common Schemas
// ===========================================

/**
 * Workflow name validation
 * 3-100 characters, alphanumeric with spaces and basic punctuation
 */
export const workflowNameSchema = z
  .string()
  .min(3, "Workflow name must be at least 3 characters")
  .max(100, "Workflow name must be at most 100 characters")
  .regex(
    /^[a-zA-Z0-9][a-zA-Z0-9\s\-_.]*$/,
    "Workflow name must start with alphanumeric and contain only letters, numbers, spaces, hyphens, underscores, and dots"
  );

/**
 * Workflow slug validation
 * URL-safe identifier: 2-50 lowercase alphanumeric with hyphens
 */
export const workflowSlugSchema = z
  .string()
  .min(2, "Slug must be at least 2 characters")
  .max(50, "Slug must be at most 50 characters")
  .regex(
    /^[a-z][a-z0-9-]*[a-z0-9]$|^[a-z][a-z0-9]?$/,
    "Slug must be lowercase, start with a letter, and contain only letters, numbers, and hyphens"
  );

/**
 * Trigger type enum
 */
export const triggerTypeSchema = z.enum([
  "TELEGRAM_MESSAGE",
  "TELEGRAM_CALLBACK",
  "SCHEDULE",
  "WEBHOOK",
  "MANUAL",
]);

/**
 * Workflow status enum
 */
export const workflowStatusSchema = z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]);

/**
 * Workflow scope enum
 */
export const workflowScopeSchema = z.enum(["USER", "ORGANIZATION", "GLOBAL"]);

/**
 * Error handler enum
 */
export const errorHandlerSchema = z.enum(["stop", "continue", "retry"]);

// ===========================================
// Trigger Config Schemas
// ===========================================

/**
 * Telegram message trigger config
 */
export const telegramMessageTriggerConfigSchema = z.object({
  filterType: z
    .enum(["all", "text", "photo", "document", "command"])
    .optional(),
  commandPrefix: z.string().max(50).optional(),
  textPattern: z.string().max(500).optional(),
  chatTypes: z
    .array(z.enum(["private", "group", "supergroup", "channel"]))
    .optional(),
});

/**
 * Telegram callback trigger config
 */
export const telegramCallbackTriggerConfigSchema = z.object({
  dataPattern: z.string().max(500).optional(),
  dataValues: z.array(z.string().max(100)).max(50).optional(),
});

/**
 * Schedule trigger config
 */
export const scheduleTriggerConfigSchema = z.object({
  cron: z
    .string()
    .min(9, "Invalid cron expression")
    .max(100, "Cron expression too long")
    .regex(
      /^(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)$/,
      "Invalid cron expression format"
    ),
  timezone: z.string().max(50).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

/**
 * Webhook trigger config
 */
export const webhookTriggerConfigSchema = z.object({
  secret: z.string().max(256).optional(),
  methods: z.array(z.enum(["GET", "POST", "PUT", "DELETE"])).optional(),
  contentType: z.string().max(100).optional(),
});

/**
 * Manual trigger config
 */
export const manualTriggerConfigSchema = z.object({
  requiredParams: z.array(z.string().max(100)).max(20).optional(),
  paramsSchema: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Generic trigger config (loose validation, specific validation per type)
 */
export const triggerConfigSchema = z.record(z.string(), z.unknown()).optional();

// ===========================================
// Step Schemas
// ===========================================

/**
 * Input mapping schema
 * Keys are output names, values are template strings
 */
export const inputMappingSchema = z
  .record(z.string(), z.string().max(2000))
  .refine(
    (mapping) => Object.keys(mapping).length <= 50,
    "Maximum 50 input mappings allowed"
  )
  .optional();

/**
 * Step condition schema
 */
export const stepConditionSchema = z
  .object({
    if: z
      .string()
      .min(1, "Condition expression required")
      .max(1000, "Condition expression too long"),
  })
  .optional();

/**
 * Create workflow step schema
 */
export const createWorkflowStepSchema = z.object({
  order: z
    .number()
    .int()
    .min(0, "Order must be non-negative")
    .max(99, "Maximum 100 steps allowed"),
  name: z.string().min(1).max(100).optional(),
  pluginId: z.string().uuid("Invalid plugin ID"),
  inputMapping: inputMappingSchema,
  config: z.record(z.string(), z.unknown()).optional(),
  gatewayId: z.string().uuid("Invalid gateway ID").optional(),
  condition: stepConditionSchema,
  onError: errorHandlerSchema.default("stop"),
  maxRetries: z.number().int().min(0).max(10).default(0),
});

/**
 * Update workflow step schema
 */
export const updateWorkflowStepSchema = z.object({
  order: z.number().int().min(0).max(99).optional(),
  name: z.string().min(1).max(100).nullish(),
  pluginId: z.string().uuid("Invalid plugin ID").optional(),
  inputMapping: inputMappingSchema,
  config: z.record(z.string(), z.unknown()).optional(),
  gatewayId: z.string().uuid("Invalid gateway ID").nullish(),
  condition: stepConditionSchema.nullish(),
  onError: errorHandlerSchema.optional(),
  maxRetries: z.number().int().min(0).max(10).optional(),
});

// ===========================================
// Workflow Schemas
// ===========================================

/**
 * Create workflow schema
 */
export const createWorkflowSchema = z
  .object({
    name: workflowNameSchema,
    description: z.string().max(500).optional(),
    slug: workflowSlugSchema,
    scope: workflowScopeSchema.default("USER"),
    triggerType: triggerTypeSchema,
    triggerConfig: triggerConfigSchema,
    gatewayId: z.string().uuid("Invalid gateway ID").optional(),
  })
  .refine(
    (data) => {
      // Validate trigger config based on trigger type
      if (data.triggerType === "SCHEDULE" && data.triggerConfig) {
        const result = scheduleTriggerConfigSchema.safeParse(data.triggerConfig);
        return result.success;
      }
      return true;
    },
    {
      message: "Invalid schedule trigger configuration",
      path: ["triggerConfig"],
    }
  );

/**
 * Update workflow schema
 */
export const updateWorkflowSchema = z.object({
  name: workflowNameSchema.optional(),
  description: z.string().max(500).nullish(),
  slug: workflowSlugSchema.optional(),
  triggerType: triggerTypeSchema.optional(),
  triggerConfig: triggerConfigSchema.nullish(),
  gatewayId: z.string().uuid("Invalid gateway ID").nullish(),
  status: workflowStatusSchema.optional(),
  isEnabled: z.boolean().optional(),
});

/**
 * Manual trigger request schema
 */
export const triggerWorkflowSchema = z.object({
  params: z.record(z.string(), z.unknown()).optional(),
});

// ===========================================
// Query Schemas
// ===========================================

/**
 * Workflow list query schema
 */
export const workflowListQuerySchema = z.object({
  scope: workflowScopeSchema.optional(),
  status: workflowStatusSchema.optional(),
  triggerType: triggerTypeSchema.optional(),
  gatewayId: z.string().uuid().optional(),
  search: z.string().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(["name", "createdAt", "updatedAt", "executionCount"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

/**
 * Workflow run list query schema
 */
export const workflowRunListQuerySchema = z.object({
  workflowId: z.string().uuid().optional(),
  status: z.enum(["PENDING", "RUNNING", "COMPLETED", "FAILED", "CANCELLED"]).optional(),
  triggeredBy: z.string().max(100).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

// ===========================================
// Type Exports
// ===========================================

export type CreateWorkflowInput = z.infer<typeof createWorkflowSchema>;
export type UpdateWorkflowInput = z.infer<typeof updateWorkflowSchema>;
export type CreateWorkflowStepInput = z.infer<typeof createWorkflowStepSchema>;
export type UpdateWorkflowStepInput = z.infer<typeof updateWorkflowStepSchema>;
export type TriggerWorkflowInput = z.infer<typeof triggerWorkflowSchema>;
export type WorkflowListQuery = z.infer<typeof workflowListQuerySchema>;
export type WorkflowRunListQuery = z.infer<typeof workflowRunListQuerySchema>;
export type TriggerType = z.infer<typeof triggerTypeSchema>;
export type WorkflowStatus = z.infer<typeof workflowStatusSchema>;
export type WorkflowScope = z.infer<typeof workflowScopeSchema>;
