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
 * Create gateway request - discriminated union based on type
 */
export const createGatewaySchema = z.discriminatedUnion("type", [
  createTelegramBotGatewaySchema,
]);

/**
 * Update gateway request
 * All fields optional, but if credentials provided must match gateway type
 */
export const updateGatewaySchema = z.object({
  name: gatewayNameSchema.optional(),
  credentials: z
    .union([telegramBotCredentialsSchema])
    .optional(),
  config: z
    .union([telegramBotConfigSchema, z.record(z.string(), z.unknown())])
    .optional(),
  mode: z.enum(["plugin", "workflow"]).optional(),
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
