"use strict";
/**
 * Plugin Validation Schemas
 *
 * Zod schemas for validating plugin-related requests including
 * installation, configuration updates, and execution parameters.
 *
 * @module modules/plugin/plugin.validation
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.userPluginsQuerySchema = exports.pluginListQuerySchema = exports.createPluginSchema = exports.userPluginIdParamSchema = exports.pluginSlugParamSchema = exports.pluginIdParamSchema = exports.togglePluginSchema = exports.updatePluginConfigSchema = exports.installPluginSchema = exports.pluginConfigSchema = exports.jsonSchemaSchema = exports.gatewayTypesSchema = exports.pluginTagsSchema = exports.pluginCategorySchema = exports.pluginNameSchema = exports.pluginSlugSchema = void 0;
exports.validateInstallPlugin = validateInstallPlugin;
exports.validateUpdateConfig = validateUpdateConfig;
exports.validateToggle = validateToggle;
exports.validateConfigAgainstSchema = validateConfigAgainstSchema;
const client_1 = require("@prisma/client");
const zod_1 = require("zod");
// ===========================================
// Common Schemas
// ===========================================
/**
 * Plugin slug validation (lowercase, alphanumeric, hyphens)
 */
exports.pluginSlugSchema = zod_1.z
    .string()
    .min(2, "Slug must be at least 2 characters")
    .max(50, "Slug must be less than 50 characters")
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase alphanumeric with hyphens");
/**
 * Plugin name validation
 */
exports.pluginNameSchema = zod_1.z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(100, "Name must be less than 100 characters")
    .trim();
/**
 * Plugin category validation
 */
exports.pluginCategorySchema = zod_1.z.enum([
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
exports.pluginTagsSchema = zod_1.z
    .array(zod_1.z.string().min(2, "Tag must be at least 2 characters").max(30, "Tag must be less than 30 characters"))
    .max(10, "Maximum 10 tags allowed")
    .default([]);
/**
 * Gateway type array validation
 */
exports.gatewayTypesSchema = zod_1.z.array(zod_1.z.nativeEnum(client_1.GatewayType));
// ===========================================
// JSON Schema Validation (Simplified)
// ===========================================
/**
 * Basic JSON Schema structure validation
 * Does not validate the full JSON Schema spec
 */
exports.jsonSchemaSchema = zod_1.z.lazy(() => zod_1.z.object({
    type: zod_1.z.enum(["string", "number", "boolean", "object", "array", "null"]).optional(),
    properties: zod_1.z.record(zod_1.z.string(), exports.jsonSchemaSchema).optional(),
    items: exports.jsonSchemaSchema.optional(),
    required: zod_1.z.array(zod_1.z.string()).optional(),
    default: zod_1.z.unknown().optional(),
    description: zod_1.z.string().optional(),
    enum: zod_1.z.array(zod_1.z.unknown()).optional(),
    minimum: zod_1.z.number().optional(),
    maximum: zod_1.z.number().optional(),
    minLength: zod_1.z.number().int().min(0).optional(),
    maxLength: zod_1.z.number().int().min(0).optional(),
    pattern: zod_1.z.string().optional(),
    format: zod_1.z.string().optional(),
    title: zod_1.z.string().optional(),
}).passthrough());
// ===========================================
// Plugin Config Validation
// ===========================================
/**
 * Generic plugin config - will be validated against plugin's configSchema
 */
exports.pluginConfigSchema = zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).default({});
// ===========================================
// Request Validation Schemas
// ===========================================
/**
 * Install plugin request validation
 * Accepts either pluginId (CUID) or slug for flexibility
 */
exports.installPluginSchema = zod_1.z.object({
    pluginId: zod_1.z.string().cuid("Invalid plugin ID").optional(),
    slug: zod_1.z.string().min(1, "Slug is required").optional(),
    config: exports.pluginConfigSchema.optional(),
    gatewayId: zod_1.z.string().cuid("Invalid gateway ID").optional(),
}).refine((data) => data.pluginId || data.slug, { message: "Either pluginId or slug must be provided" });
/**
 * Update plugin config request validation
 */
exports.updatePluginConfigSchema = zod_1.z.object({
    config: exports.pluginConfigSchema,
    gatewayId: zod_1.z.string().cuid("Invalid gateway ID").optional().nullable(),
});
/**
 * Toggle plugin request validation
 */
exports.togglePluginSchema = zod_1.z.object({
    enabled: zod_1.z.boolean(),
});
/**
 * Plugin ID parameter validation
 */
exports.pluginIdParamSchema = zod_1.z.object({
    id: zod_1.z.string().cuid("Invalid plugin ID"),
});
/**
 * Plugin slug parameter validation
 */
exports.pluginSlugParamSchema = zod_1.z.object({
    slug: exports.pluginSlugSchema,
});
/**
 * User plugin ID parameter validation
 */
exports.userPluginIdParamSchema = zod_1.z.object({
    id: zod_1.z.string().cuid("Invalid user plugin ID"),
});
// ===========================================
// Create Plugin Schema (for admin/system use)
// ===========================================
/**
 * Create plugin schema (for seeding/admin)
 */
exports.createPluginSchema = zod_1.z.object({
    slug: exports.pluginSlugSchema,
    name: exports.pluginNameSchema,
    description: zod_1.z.string().min(10, "Description must be at least 10 characters"),
    version: zod_1.z.string().regex(/^\d+\.\d+\.\d+$/, "Version must be semver format (e.g., 1.0.0)").default("1.0.0"),
    requiredGateways: exports.gatewayTypesSchema.default([]),
    configSchema: exports.jsonSchemaSchema.default({}),
    icon: zod_1.z.string().optional(),
    category: exports.pluginCategorySchema.default("general"),
    tags: exports.pluginTagsSchema,
    isBuiltin: zod_1.z.boolean().default(true),
    inputSchema: exports.jsonSchemaSchema.optional(),
    outputSchema: exports.jsonSchemaSchema.optional(),
    isActive: zod_1.z.boolean().default(true),
});
// ===========================================
// Query Parameter Schemas
// ===========================================
/**
 * Common pagination parameters
 */
const paginationSchema = zod_1.z.object({
    page: zod_1.z.coerce.number().int().min(1).default(1),
    limit: zod_1.z.coerce.number().int().min(1).max(100).default(50),
});
/**
 * Plugin list query parameters
 */
exports.pluginListQuerySchema = zod_1.z.object({
    category: exports.pluginCategorySchema.optional(),
    gateway: zod_1.z.nativeEnum(client_1.GatewayType).optional(),
    search: zod_1.z.string().max(100).optional(),
    tags: zod_1.z.string().transform(s => s.split(",").map(t => t.trim()).filter(Boolean)).optional(),
}).merge(paginationSchema);
/**
 * User plugins list query parameters
 */
exports.userPluginsQuerySchema = zod_1.z.object({
    enabled: zod_1.z.enum(["true", "false"]).transform(v => v === "true").optional(),
    pluginId: zod_1.z.string().cuid().optional(),
}).merge(paginationSchema);
// ===========================================
// Validation Helpers
// ===========================================
/**
 * Validate install plugin request
 */
function validateInstallPlugin(data) {
    return exports.installPluginSchema.parse(data);
}
/**
 * Validate update config request
 */
function validateUpdateConfig(data) {
    return exports.updatePluginConfigSchema.parse(data);
}
/**
 * Validate toggle request
 */
function validateToggle(data) {
    return exports.togglePluginSchema.parse(data);
}
/**
 * Validate plugin config against a JSON Schema
 * This is a simplified validator - for production, use ajv
 */
function validateConfigAgainstSchema(config, schema) {
    const errors = [];
    // Check required fields
    const required = schema.required ?? [];
    for (const field of required) {
        if (config[field] === undefined) {
            errors.push(`Missing required field: ${field}`);
        }
    }
    // Check field types (basic validation)
    const properties = schema.properties ?? {};
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
//# sourceMappingURL=plugin.validation.js.map