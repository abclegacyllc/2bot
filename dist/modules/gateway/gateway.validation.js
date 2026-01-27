"use strict";
/**
 * Gateway Validation Schemas
 *
 * Zod schemas for validating gateway requests including
 * credentials, configuration, and CRUD operations.
 *
 * @module modules/gateway/gateway.validation
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.gatewayIdSchema = exports.updateGatewaySchema = exports.createGatewaySchema = exports.createWebhookGatewaySchema = exports.createAIGatewaySchema = exports.createTelegramBotGatewaySchema = exports.webhookConfigSchema = exports.aiGatewayConfigSchema = exports.telegramBotConfigSchema = exports.webhookCredentialsSchema = exports.aiCredentialsSchema = exports.telegramBotCredentialsSchema = void 0;
exports.validateCreateGateway = validateCreateGateway;
exports.validateUpdateGateway = validateUpdateGateway;
const client_1 = require("@prisma/client");
const zod_1 = require("zod");
const gateway_types_1 = require("./gateway.types");
// ===========================================
// Common Schemas
// ===========================================
/**
 * Gateway name validation
 */
const gatewayNameSchema = zod_1.z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(100, "Name must be less than 100 characters")
    .trim();
/**
 * Gateway type validation
 */
const gatewayTypeSchema = zod_1.z.nativeEnum(client_1.GatewayType);
// ===========================================
// Credential Schemas
// ===========================================
/**
 * Telegram Bot token format: 123456789:ABCdefGHIjklMNOpqrsTUVwxyz
 */
const telegramBotTokenSchema = zod_1.z
    .string()
    .regex(/^\d+:[A-Za-z0-9_-]+$/, "Invalid Telegram bot token format. Expected format: 123456789:ABCdefGHIjklMNOpqrsTUVwxyz");
/**
 * Telegram Bot credentials schema
 */
exports.telegramBotCredentialsSchema = zod_1.z.object({
    botToken: telegramBotTokenSchema,
});
/**
 * AI Provider enum validation
 */
const aiProviderSchema = zod_1.z.enum(Object.keys(gateway_types_1.AI_PROVIDERS));
/**
 * AI credentials schema
 */
exports.aiCredentialsSchema = zod_1.z
    .object({
    provider: aiProviderSchema,
    apiKey: zod_1.z.string().min(10, "API key must be at least 10 characters"),
    baseUrl: zod_1.z.string().url("Invalid base URL").optional(),
    model: zod_1.z.string().max(100, "Model name too long").optional(),
})
    .refine((data) => {
    // Ollama requires baseUrl
    if (data.provider === "ollama" && !data.baseUrl) {
        return false;
    }
    return true;
}, {
    message: "Ollama requires a base URL",
    path: ["baseUrl"],
});
/**
 * Webhook credentials schema
 */
exports.webhookCredentialsSchema = zod_1.z.object({
    url: zod_1.z.string().url("Invalid webhook URL"),
    secret: zod_1.z.string().min(16, "Secret must be at least 16 characters").optional(),
    headers: zod_1.z.record(zod_1.z.string(), zod_1.z.string()).optional(),
});
// ===========================================
// Configuration Schemas
// ===========================================
/**
 * Telegram Bot configuration schema
 */
exports.telegramBotConfigSchema = zod_1.z.object({
    webhookUrl: zod_1.z.string().url("Invalid webhook URL").optional(),
    allowedUpdates: zod_1.z.array(zod_1.z.string()).optional(),
    dropPendingUpdates: zod_1.z.boolean().optional(),
});
/**
 * AI gateway configuration schema
 */
exports.aiGatewayConfigSchema = zod_1.z.object({
    maxTokens: zod_1.z.number().int().positive().max(128000, "Max tokens cannot exceed 128000").optional(),
    temperature: zod_1.z.number().min(0, "Temperature must be at least 0").max(2, "Temperature cannot exceed 2").optional(),
    systemPrompt: zod_1.z.string().max(10000, "System prompt too long").optional(),
});
/**
 * Webhook configuration schema
 */
exports.webhookConfigSchema = zod_1.z.object({
    retryCount: zod_1.z.number().int().min(0, "Retry count must be non-negative").max(10, "Max 10 retries").optional(),
    retryDelay: zod_1.z.number().int().min(100, "Min delay is 100ms").max(60000, "Max delay is 60 seconds").optional(),
    timeout: zod_1.z.number().int().min(1000, "Min timeout is 1 second").max(60000, "Max timeout is 60 seconds").optional(),
});
// ===========================================
// Request Validation Schemas
// ===========================================
/**
 * Create Telegram Bot gateway request
 */
exports.createTelegramBotGatewaySchema = zod_1.z.object({
    name: gatewayNameSchema,
    type: zod_1.z.literal(client_1.GatewayType.TELEGRAM_BOT),
    credentials: exports.telegramBotCredentialsSchema,
    config: exports.telegramBotConfigSchema.optional(),
});
/**
 * Create AI gateway request
 */
exports.createAIGatewaySchema = zod_1.z.object({
    name: gatewayNameSchema,
    type: zod_1.z.literal(client_1.GatewayType.AI),
    credentials: exports.aiCredentialsSchema,
    config: exports.aiGatewayConfigSchema.optional(),
});
/**
 * Create Webhook gateway request
 */
exports.createWebhookGatewaySchema = zod_1.z.object({
    name: gatewayNameSchema,
    type: zod_1.z.literal(client_1.GatewayType.WEBHOOK),
    credentials: exports.webhookCredentialsSchema,
    config: exports.webhookConfigSchema.optional(),
});
/**
 * Create gateway request - discriminated union based on type
 */
exports.createGatewaySchema = zod_1.z.discriminatedUnion("type", [
    exports.createTelegramBotGatewaySchema,
    exports.createAIGatewaySchema,
    exports.createWebhookGatewaySchema,
]);
/**
 * Update gateway request
 * All fields optional, but if credentials provided must match gateway type
 */
exports.updateGatewaySchema = zod_1.z.object({
    name: gatewayNameSchema.optional(),
    credentials: zod_1.z
        .union([exports.telegramBotCredentialsSchema, exports.aiCredentialsSchema, exports.webhookCredentialsSchema])
        .optional(),
    config: zod_1.z
        .union([exports.telegramBotConfigSchema, exports.aiGatewayConfigSchema, exports.webhookConfigSchema, zod_1.z.record(zod_1.z.string(), zod_1.z.unknown())])
        .optional(),
});
/**
 * Gateway ID parameter validation
 */
exports.gatewayIdSchema = zod_1.z.object({
    id: zod_1.z.string().cuid("Invalid gateway ID"),
});
// ===========================================
// Validation Helper
// ===========================================
/**
 * Validate create gateway request with proper typing
 */
function validateCreateGateway(data) {
    return exports.createGatewaySchema.parse(data);
}
/**
 * Validate update gateway request
 */
function validateUpdateGateway(data) {
    return exports.updateGatewaySchema.parse(data);
}
//# sourceMappingURL=gateway.validation.js.map