/**
 * Gateway Types
 *
 * Type definitions for the gateway system including credentials,
 * configuration, and request/response DTOs.
 *
 * @module modules/gateway/gateway.types
 */

import type { Gateway, GatewayStatus, GatewayType } from "@prisma/client";

// Re-export Prisma types
export type { Gateway, GatewayStatus, GatewayType } from "@prisma/client";

// ===========================================
// AI Provider Types
// ===========================================

/**
 * Supported AI providers
 * Expandable list - add new providers here
 */
export type AIProvider =
  | "openai"
  | "anthropic"
  | "deepseek"
  | "grok"
  | "gemini"
  | "mistral"
  | "groq"
  | "ollama";

/**
 * AI Provider metadata for UI/validation
 */
export const AI_PROVIDERS: Record<AIProvider, { name: string; requiresBaseUrl: boolean }> = {
  openai: { name: "OpenAI", requiresBaseUrl: false },
  anthropic: { name: "Anthropic", requiresBaseUrl: false },
  deepseek: { name: "DeepSeek", requiresBaseUrl: false },
  grok: { name: "Grok (xAI)", requiresBaseUrl: false },
  gemini: { name: "Google Gemini", requiresBaseUrl: false },
  mistral: { name: "Mistral AI", requiresBaseUrl: false },
  groq: { name: "Groq", requiresBaseUrl: false },
  ollama: { name: "Ollama (Local)", requiresBaseUrl: true },
};

// ===========================================
// Credential Types (stored encrypted)
// ===========================================

/**
 * Telegram Bot credentials
 */
export interface TelegramBotCredentials {
  botToken: string;
}

/**
 * AI provider credentials
 */
export interface AICredentials {
  provider: AIProvider;
  apiKey: string;
  baseUrl?: string; // For custom endpoints (Ollama, self-hosted)
  model?: string; // Default model for this gateway
}

/**
 * Webhook credentials (for future use)
 */
export interface WebhookCredentials {
  url: string;
  secret?: string; // For signature verification
  headers?: Record<string, string>;
}

/**
 * Union of all credential types
 */
export type GatewayCredentials = TelegramBotCredentials | AICredentials | WebhookCredentials;

// ===========================================
// Gateway Configuration Types (non-sensitive)
// ===========================================

/**
 * Telegram Bot configuration
 */
export interface TelegramBotConfig {
  webhookUrl?: string;
  allowedUpdates?: string[];
  dropPendingUpdates?: boolean;
}

/**
 * AI gateway configuration
 */
export interface AIGatewayConfig {
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
}

/**
 * Webhook configuration
 */
export interface WebhookConfig {
  retryCount?: number;
  retryDelay?: number;
  timeout?: number;
}

/**
 * Union of all config types
 */
export type GatewayConfig = TelegramBotConfig | AIGatewayConfig | WebhookConfig | Record<string, unknown>;

// ===========================================
// Request DTOs
// ===========================================

/**
 * Create gateway request
 */
export interface CreateGatewayRequest {
  name: string;
  type: GatewayType;
  credentials: GatewayCredentials;
  config?: GatewayConfig;
}

/**
 * Update gateway request
 */
export interface UpdateGatewayRequest {
  name?: string;
  credentials?: GatewayCredentials;
  config?: GatewayConfig;
}

// ===========================================
// Response DTOs
// ===========================================

/**
 * Gateway without sensitive credentials (for API responses)
 */
export type SafeGateway = Omit<Gateway, "credentialsEnc"> & {
  // Expose credential type info without actual secrets
  credentialInfo: {
    type: GatewayType;
    provider?: AIProvider; // For AI type
    hasApiKey?: boolean;
    hasBotToken?: boolean;
    baseUrl?: string; // Non-sensitive, useful for display
  };
};

/**
 * Gateway list item (minimal info for lists)
 */
export interface GatewayListItem {
  id: string;
  name: string;
  type: GatewayType;
  status: GatewayStatus;
  lastConnectedAt: Date | null;
  lastError: string | null;
  createdAt: Date;
}

// ===========================================
// Type Guards
// ===========================================

/**
 * Check if credentials are for Telegram Bot
 */
export function isTelegramBotCredentials(
  credentials: GatewayCredentials
): credentials is TelegramBotCredentials {
  return "botToken" in credentials;
}

/**
 * Check if credentials are for AI provider
 */
export function isAICredentials(credentials: GatewayCredentials): credentials is AICredentials {
  return "provider" in credentials && "apiKey" in credentials;
}

/**
 * Check if credentials are for Webhook
 */
export function isWebhookCredentials(
  credentials: GatewayCredentials
): credentials is WebhookCredentials {
  return "url" in credentials && !("provider" in credentials) && !("botToken" in credentials);
}
