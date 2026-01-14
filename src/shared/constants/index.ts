// Application Constants - Re-export all constants

export * from "./limits";
export * from "./permissions";
export * from "./plans";

/**
 * Supported gateway types
 */
export const GATEWAY_TYPES = {
  TELEGRAM_BOT: "telegram_bot",
  AI_OPENAI: "ai_openai",
} as const;

/**
 * Application-wide settings
 */
export const APP_CONFIG = {
  name: "2Bot",
  version: "0.1.0",
  apiVersion: "v1",
  defaultPageSize: 20,
  maxPageSize: 100,
  supportEmail: "support@2bot.dev",
  docsUrl: "https://docs.2bot.dev",
} as const;

/**
 * HTTP Status Codes (commonly used)
 */
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  VALIDATION_ERROR: 422,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
} as const;

export type GatewayType = (typeof GATEWAY_TYPES)[keyof typeof GATEWAY_TYPES];
export type HttpStatus = (typeof HTTP_STATUS)[keyof typeof HTTP_STATUS];
