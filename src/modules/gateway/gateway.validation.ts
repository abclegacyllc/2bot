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
const gatewayTypeSchema = z.nativeEnum(GatewayType);

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
 * Webhook credentials schema
 */
export const webhookCredentialsSchema = z.object({
  url: z.string().url("Invalid webhook URL"),
  secret: z.string().min(16, "Secret must be at least 16 characters").optional(),
  headers: z.record(z.string(), z.string()).optional(),
});

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
 * Webhook configuration schema
 */
export const webhookConfigSchema = z.object({
  retryCount: z.number().int().min(0, "Retry count must be non-negative").max(10, "Max 10 retries").optional(),
  retryDelay: z.number().int().min(100, "Min delay is 100ms").max(60000, "Max delay is 60 seconds").optional(),
  timeout: z.number().int().min(1000, "Min timeout is 1 second").max(60000, "Max timeout is 60 seconds").optional(),
});

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
 * Create Webhook gateway request
 */
export const createWebhookGatewaySchema = z.object({
  name: gatewayNameSchema,
  type: z.literal(GatewayType.WEBHOOK),
  credentials: webhookCredentialsSchema,
  config: webhookConfigSchema.optional(),
});

/**
 * Create gateway request - discriminated union based on type
 */
export const createGatewaySchema = z.discriminatedUnion("type", [
  createTelegramBotGatewaySchema,
  createAIGatewaySchema,
  createWebhookGatewaySchema,
]);

/**
 * Update gateway request
 * All fields optional, but if credentials provided must match gateway type
 */
export const updateGatewaySchema = z.object({
  name: gatewayNameSchema.optional(),
  credentials: z
    .union([telegramBotCredentialsSchema, aiCredentialsSchema, webhookCredentialsSchema])
    .optional(),
  config: z
    .union([telegramBotConfigSchema, aiGatewayConfigSchema, webhookConfigSchema, z.record(z.string(), z.unknown())])
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
export type CreateWebhookGatewayInput = z.infer<typeof createWebhookGatewaySchema>;
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
