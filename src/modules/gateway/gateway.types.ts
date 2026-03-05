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
 * Custom Gateway credentials — flexible key-value store for API keys, tokens, secrets.
 * Examples: { signingSecret: "whsec_...", apiKey: "sk_..." }
 * Stored encrypted (AES-256-GCM) in credentialsEnc, same as Telegram/AI gateways.
 */
export type CustomGatewayCredentials = Record<string, string>;

/** @deprecated Use CustomGatewayCredentials */
export type WebhookCredentials = CustomGatewayCredentials;

/**
 * Union of all credential types
 */
export type GatewayCredentials = TelegramBotCredentials | AICredentials | CustomGatewayCredentials;

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
  /** Secret token sent by Telegram in X-Telegram-Bot-Api-Secret-Token header */
  webhookSecretToken?: string;
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
 * Custom Gateway configuration
 */
export interface CustomGatewayConfig {
  retryCount?: number;
  retryDelay?: number;
  timeout?: number;
}

/** @deprecated Use CustomGatewayConfig */
export type WebhookConfig = CustomGatewayConfig;

/**
 * Union of all config types
 */
export type GatewayConfig = TelegramBotConfig | AIGatewayConfig | CustomGatewayConfig | Record<string, unknown>;

// ===========================================
// Gateway Metadata Types (persisted on connect)
// ===========================================

/**
 * Telegram Bot metadata — persisted from getMe on connect
 */
export interface TelegramBotMetadata {
  botId: number;
  botUsername: string;
  botFirstName: string;
  botLastName?: string;
  canJoinGroups?: boolean;
  canReadGroupMessages?: boolean;
  supportsInlineQueries?: boolean;
}

/**
 * AI Provider metadata — persisted on connect
 */
export interface AIGatewayMetadata {
  provider: AIProvider;
  providerName: string;
  defaultModel: string;
  availableModels?: string[];
  lastValidatedAt?: string;
}

/**
 * Custom Gateway metadata
 */
export interface CustomGatewayMetadata {
  /** Computed webhook URL: https://webhook.2bot.org/custom/{gatewayId} */
  webhookUrl?: string;
  /** Credential key names (for display, not values) */
  credentialKeys?: string[];
  lastDeliveredAt?: string;
}

/** @deprecated Use CustomGatewayMetadata */
export type WebhookMetadata = CustomGatewayMetadata;

/**
 * Union of all gateway metadata types
 */
export type GatewayMetadata =
  | TelegramBotMetadata
  | AIGatewayMetadata
  | CustomGatewayMetadata
  | Record<string, unknown>;

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
    credentialKeys?: string[]; // For CUSTOM_GATEWAY — key names (no secrets)
    webhookUrl?: string; // For CUSTOM_GATEWAY — computed inbound URL
  };
  // Provider-specific metadata (bot info, AI provider details, etc.)
  providerMetadata: GatewayMetadata;
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
 * Check if credentials are for Custom Gateway.
 * Custom gateways use a plain Record<string, string> — they don't have botToken or provider.
 */
export function isCustomGatewayCredentials(
  credentials: GatewayCredentials
): credentials is CustomGatewayCredentials {
  return !("provider" in credentials) && !("botToken" in credentials) && !("apiKey" in credentials);
}

/** @deprecated Use isCustomGatewayCredentials */
export const isWebhookCredentials = isCustomGatewayCredentials;
