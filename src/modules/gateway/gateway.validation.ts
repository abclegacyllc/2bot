/**
 * Gateway Validation Schemas
 *
 * Zod schemas for validating gateway requests including
 * credentials, configuration, and CRUD operations.
 *
 * @module modules/gateway/gateway.validation
 */

import { GatewayType } from "@prisma/client";
import { z } from "zod";

import { AI_PROVIDERS, type AIProvider } from "./gateway.types";

// ===========================================
// Common Schemas
// ===========================================

/**
 * Gateway name validation
 */
const gatewayNameSchema = z
  .string()
  .min(2, "Name must be at least 2 characters")
  .max(100, "Name must be less than 100 characters")
  .trim();

/**
 * Gateway type validation
 */
const _gatewayTypeSchema = z.nativeEnum(GatewayType);

// ===========================================
// Credential Schemas
// ===========================================

/**
 * Telegram Bot token format: 123456789:ABCdefGHIjklMNOpqrsTUVwxyz
 */
const telegramBotTokenSchema = z
  .string()
  .regex(
    /^\d+:[A-Za-z0-9_-]+$/,
    "Invalid Telegram bot token format. Expected format: 123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
  );

/**
 * Telegram Bot credentials schema
 */
export const telegramBotCredentialsSchema = z.object({
  botToken: telegramBotTokenSchema,
});

/**
 * AI Provider enum validation
 */
const aiProviderSchema = z.enum(
  Object.keys(AI_PROVIDERS) as [AIProvider, ...AIProvider[]]
);

/**
 * AI credentials schema
 */
export const aiCredentialsSchema = z
  .object({
    provider: aiProviderSchema,
    apiKey: z.string().min(10, "API key must be at least 10 characters"),
    baseUrl: z.string().url("Invalid base URL").optional(),
    model: z.string().max(100, "Model name too long").optional(),
  })
  .refine(
    (data) => {
      // Ollama requires baseUrl
      if (data.provider === "ollama" && !data.baseUrl) {
        return false;
      }
      return true;
    },
    {
      message: "Ollama requires a base URL",
      path: ["baseUrl"],
    }
  );

/**
 * Custom Gateway credentials schema — flexible key-value store.
 * Max 20 keys, key max 64 chars, value max 4096 chars.
 * Example: { signingSecret: "whsec_...", apiKey: "sk_..." }
 */
export const customGatewayCredentialsSchema = z.record(
  z.string().max(64, "Credential key too long (max 64 chars)"),
  z.string().max(4096, "Credential value too long (max 4096 chars)")
).refine(
  (obj) => Object.keys(obj).length <= 20,
  { message: "Maximum 20 credential keys" }
);

/** @deprecated Use customGatewayCredentialsSchema */
export const webhookCredentialsSchema = customGatewayCredentialsSchema;

// ===========================================
// Configuration Schemas
// ===========================================

/**
 * Telegram Bot configuration schema
 */
export const telegramBotConfigSchema = z.object({
  webhookUrl: z.string().url("Invalid webhook URL").optional(),
  allowedUpdates: z.array(z.string()).optional(),
  dropPendingUpdates: z.boolean().optional(),
});

/**
 * AI gateway configuration schema
 */
export const aiGatewayConfigSchema = z.object({
  maxTokens: z.number().int().positive().max(128000, "Max tokens cannot exceed 128000").optional(),
  temperature: z.number().min(0, "Temperature must be at least 0").max(2, "Temperature cannot exceed 2").optional(),
  systemPrompt: z.string().max(10000, "System prompt too long").optional(),
});

/**
 * Custom Gateway configuration schema
 */
export const customGatewayConfigSchema = z.object({
  retryCount: z.number().int().min(0, "Retry count must be non-negative").max(10, "Max 10 retries").optional(),
  retryDelay: z.number().int().min(100, "Min delay is 100ms").max(60000, "Max delay is 60 seconds").optional(),
  timeout: z.number().int().min(1000, "Min timeout is 1 second").max(60000, "Max timeout is 60 seconds").optional(),
});

/** @deprecated Use customGatewayConfigSchema */
export const webhookConfigSchema = customGatewayConfigSchema;

// ===========================================
// Request Validation Schemas
// ===========================================

/**
 * Create Telegram Bot gateway request
 */
export const createTelegramBotGatewaySchema = z.object({
  name: gatewayNameSchema,
  type: z.literal(GatewayType.TELEGRAM_BOT),
  credentials: telegramBotCredentialsSchema,
  config: telegramBotConfigSchema.optional(),
});

/**
 * Create AI gateway request
 */
export const createAIGatewaySchema = z.object({
  name: gatewayNameSchema,
  type: z.literal(GatewayType.AI),
  credentials: aiCredentialsSchema,
  config: aiGatewayConfigSchema.optional(),
});

/**
 * Create Custom Gateway request
 */
export const createCustomGatewaySchema = z.object({
  name: gatewayNameSchema,
  type: z.literal(GatewayType.CUSTOM_GATEWAY),
  credentials: customGatewayCredentialsSchema,
  config: customGatewayConfigSchema.optional(),
});

/** @deprecated Use createCustomGatewaySchema */
export const createWebhookGatewaySchema = createCustomGatewaySchema;

/**
 * Create gateway request - discriminated union based on type
 */
export const createGatewaySchema = z.discriminatedUnion("type", [
  createTelegramBotGatewaySchema,
  createAIGatewaySchema,
  createCustomGatewaySchema,
]);

/**
 * Update gateway request
 * All fields optional, but if credentials provided must match gateway type
 */
export const updateGatewaySchema = z.object({
  name: gatewayNameSchema.optional(),
  credentials: z
    .union([telegramBotCredentialsSchema, aiCredentialsSchema, customGatewayCredentialsSchema])
    .optional(),
  config: z
    .union([telegramBotConfigSchema, aiGatewayConfigSchema, customGatewayConfigSchema, z.record(z.string(), z.unknown())])
    .optional(),
});

/**
 * Gateway ID parameter validation
 */
export const gatewayIdSchema = z.object({
  id: z.string().cuid("Invalid gateway ID"),
});

// ===========================================
// Export Types from Schemas
// ===========================================

export type CreateTelegramBotGatewayInput = z.infer<typeof createTelegramBotGatewaySchema>;
export type CreateAIGatewayInput = z.infer<typeof createAIGatewaySchema>;
export type CreateWebhookGatewayInput = z.infer<typeof createCustomGatewaySchema>;
export type CreateCustomGatewayInput = z.infer<typeof createCustomGatewaySchema>;
export type CreateGatewayInput = z.infer<typeof createGatewaySchema>;
export type UpdateGatewayInput = z.infer<typeof updateGatewaySchema>;

// ===========================================
// Validation Helper
// ===========================================

/**
 * Validate create gateway request with proper typing
 */
export function validateCreateGateway(data: unknown): CreateGatewayInput {
  return createGatewaySchema.parse(data);
}

/**
 * Validate update gateway request
 */
export function validateUpdateGateway(data: unknown): UpdateGatewayInput {
  return updateGatewaySchema.parse(data);
}
