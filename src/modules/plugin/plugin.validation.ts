/**
 * Plugin Validation Schemas
 *
 * Zod schemas for validating plugin-related requests including
 * installation, configuration updates, and execution parameters.
 *
 * @module modules/plugin/plugin.validation
 */

import { GatewayType } from "@prisma/client";
import { z } from "zod";

// ===========================================
// Common Schemas
// ===========================================

/**
 * Plugin slug validation (lowercase, alphanumeric, hyphens)
 */
export const pluginSlugSchema = z
  .string()
  .min(2, "Slug must be at least 2 characters")
  .max(50, "Slug must be less than 50 characters")
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Slug must be lowercase alphanumeric with hyphens"
  );

/**
 * Plugin name validation
 */
export const pluginNameSchema = z
  .string()
  .min(2, "Name must be at least 2 characters")
  .max(100, "Name must be less than 100 characters")
  .trim();

/**
 * Plugin category validation
 */
export const pluginCategorySchema = z.enum([
  "general",
  "analytics",
  "messaging",
  "automation",
  "moderation",
  "utilities",
]);

/**
 * Plugin tags validation
 */
export const pluginTagsSchema = z
  .array(z.string().min(2, "Tag must be at least 2 characters").max(30, "Tag must be less than 30 characters"))
  .max(10, "Maximum 10 tags allowed")
  .default([]);

/**
 * Gateway type array validation
 */
export const gatewayTypesSchema = z.array(z.nativeEnum(GatewayType));

// ===========================================
// JSON Schema Validation (Simplified)
// ===========================================

/**
 * Basic JSON Schema structure validation
 * Does not validate the full JSON Schema spec
 */
export const jsonSchemaSchema: z.ZodType<unknown> = z.lazy(() =>
  z.object({
    type: z.enum(["string", "number", "boolean", "object", "array", "null"]).optional(),
    properties: z.record(z.string(), jsonSchemaSchema).optional(),
    items: jsonSchemaSchema.optional(),
    required: z.array(z.string()).optional(),
    default: z.unknown().optional(),
    description: z.string().optional(),
    enum: z.array(z.unknown()).optional(),
    minimum: z.number().optional(),
    maximum: z.number().optional(),
    minLength: z.number().int().min(0).optional(),
    maxLength: z.number().int().min(0).optional(),
    pattern: z.string().optional(),
    format: z.string().optional(),
    title: z.string().optional(),
  }).passthrough()
);

// ===========================================
// Plugin Config Validation
// ===========================================

/**
 * Generic plugin config - will be validated against plugin's configSchema
 */
export const pluginConfigSchema = z.record(z.string(), z.unknown()).default({});

// ===========================================
// Request Validation Schemas
// ===========================================

/**
 * Install plugin request validation
 * Accepts either pluginId (CUID) or slug for flexibility
 */
export const installPluginSchema = z.object({
  pluginId: z.string().cuid("Invalid plugin ID").optional(),
  slug: z.string().min(1, "Slug is required").optional(),
  config: pluginConfigSchema.optional(),
  gatewayId: z.string().cuid("Invalid gateway ID").optional(),
}).refine(
  (data) => data.pluginId || data.slug,
  { message: "Either pluginId or slug must be provided" }
);

/**
 * Update plugin config request validation
 */
export const updatePluginConfigSchema = z.object({
  config: pluginConfigSchema,
  gatewayId: z.string().cuid("Invalid gateway ID").optional().nullable(),
});

/**
 * Toggle plugin request validation
 */
export const togglePluginSchema = z.object({
  enabled: z.boolean(),
});

/**
 * Plugin ID parameter validation
 */
export const pluginIdParamSchema = z.object({
  id: z.string().cuid("Invalid plugin ID"),
});

/**
 * Plugin slug parameter validation
 */
export const pluginSlugParamSchema = z.object({
  slug: pluginSlugSchema,
});

/**
 * User plugin ID parameter validation
 */
export const userPluginIdParamSchema = z.object({
  id: z.string().cuid("Invalid user plugin ID"),
});

// ===========================================
// Create Plugin Schema (for admin/system use)
// ===========================================

/**
 * Create plugin schema (for seeding/admin)
 */
export const createPluginSchema = z.object({
  slug: pluginSlugSchema,
  name: pluginNameSchema,
  description: z.string().min(10, "Description must be at least 10 characters"),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, "Version must be semver format (e.g., 1.0.0)").default("1.0.0"),
  requiredGateways: gatewayTypesSchema.default([]),
  configSchema: jsonSchemaSchema.default({}),
  icon: z.string().optional(),
  category: pluginCategorySchema.default("general"),
  tags: pluginTagsSchema,
  isBuiltin: z.boolean().default(true),
  inputSchema: jsonSchemaSchema.optional(),
  outputSchema: jsonSchemaSchema.optional(),
  isActive: z.boolean().default(true),
});

// ===========================================
// Query Parameter Schemas
// ===========================================

/**
 * Common pagination parameters
 */
const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

/**
 * Plugin list query parameters
 */
export const pluginListQuerySchema = z.object({
  category: pluginCategorySchema.optional(),
  gateway: z.nativeEnum(GatewayType).optional(),
  search: z.string().max(100).optional(),
  tags: z.string().transform(s => s.split(",").map(t => t.trim()).filter(Boolean)).optional(),
}).merge(paginationSchema);

/**
 * User plugins list query parameters
 */
export const userPluginsQuerySchema = z.object({
  enabled: z.enum(["true", "false"]).transform(v => v === "true").optional(),
  pluginId: z.string().cuid().optional(),
}).merge(paginationSchema);

// ===========================================
// Export Types from Schemas
// ===========================================

export type InstallPluginInput = z.infer<typeof installPluginSchema>;
export type UpdatePluginConfigInput = z.infer<typeof updatePluginConfigSchema>;
export type TogglePluginInput = z.infer<typeof togglePluginSchema>;
export type CreatePluginInput = z.infer<typeof createPluginSchema>;
export type PluginListQueryInput = z.infer<typeof pluginListQuerySchema>;
export type UserPluginsQueryInput = z.infer<typeof userPluginsQuerySchema>;

// ===========================================
// Validation Helpers
// ===========================================

/**
 * Validate install plugin request
 */
export function validateInstallPlugin(data: unknown): InstallPluginInput {
  return installPluginSchema.parse(data);
}

/**
 * Validate update config request
 */
export function validateUpdateConfig(data: unknown): UpdatePluginConfigInput {
  return updatePluginConfigSchema.parse(data);
}

/**
 * Validate toggle request
 */
export function validateToggle(data: unknown): TogglePluginInput {
  return togglePluginSchema.parse(data);
}

/**
 * Validate plugin config against a JSON Schema
 * This is a simplified validator - for production, use ajv
 */
export function validateConfigAgainstSchema(
  config: Record<string, unknown>,
  schema: Record<string, unknown>
): { valid: boolean; errors?: string[] } {
  const errors: string[] = [];
  
  // Check required fields
  const required = (schema.required as string[] | undefined) ?? [];
  for (const field of required) {
    if (config[field] === undefined) {
      errors.push(`Missing required field: ${field}`);
    }
  }
  
  // Check field types (basic validation)
  const properties = (schema.properties as Record<string, { type?: string }> | undefined) ?? {};
  for (const [field, value] of Object.entries(config)) {
    const fieldSchema = properties[field];
    if (fieldSchema?.type) {
      const actualType = Array.isArray(value) ? "array" : typeof value;
      if (fieldSchema.type !== actualType && value !== null) {
        errors.push(`Field ${field} should be ${fieldSchema.type}, got ${actualType}`);
      }
    }
  }
  
  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined,
  };
}
