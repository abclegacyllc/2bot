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
// Credential Types (stored encrypted)
// ===========================================

/**
 * Telegram Bot credentials
 */
export interface TelegramBotCredentials {
  botToken: string;
}

/**
 * Discord Bot credentials
 */
export interface DiscordBotCredentials {
  botToken: string;
  applicationId: string;
  publicKey: string; // Ed25519 public key for interaction verification
}

/**
 * Slack Bot credentials
 */
export interface SlackBotCredentials {
  botToken: string; // xoxb-... Bot User OAuth Token
  signingSecret: string; // Slack app signing secret for request verification
  appId?: string; // Slack app ID (e.g. A0123456789)
  teamId?: string; // Workspace/team ID
}

/**
 * WhatsApp Bot credentials (Meta Cloud API)
 */
export interface WhatsAppBotCredentials {
  accessToken: string; // Meta Graph API access token
  appSecret: string; // App secret for webhook HMAC-SHA256 verification
  phoneNumberId: string; // WhatsApp Business phone number ID
  businessAccountId?: string; // WhatsApp Business Account ID
  verifyToken: string; // User-defined token for GET webhook verification handshake
}

/**
 * Union of all credential types
 */
export type GatewayCredentials = TelegramBotCredentials | DiscordBotCredentials | SlackBotCredentials | WhatsAppBotCredentials;

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
 * Discord Bot configuration
 */
export interface DiscordBotConfig {
  interactionsEndpointUrl?: string;
  intents?: number; // Gateway intents bitmask (not used for HTTP interactions)
}

/**
 * Slack Bot configuration
 */
export interface SlackBotConfig {
  eventSubscriptions?: string[]; // Event types to listen for (e.g. message, app_mention)
}

/**
 * WhatsApp Bot configuration
 */
export interface WhatsAppBotConfig {
  webhookUrl?: string;
}

/**
 * Union of all config types
 */
export type GatewayConfig = TelegramBotConfig | DiscordBotConfig | SlackBotConfig | WhatsAppBotConfig | Record<string, unknown>;

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
 * Discord Bot metadata — persisted from API on connect
 */
export interface DiscordBotMetadata {
  botId: string;
  botUsername: string;
  botDiscriminator: string;
  applicationId: string;
  interactionsEndpointUrl?: string;
}

/**
 * Slack Bot metadata — persisted from auth.test on connect
 */
export interface SlackBotMetadata {
  botId: string;
  botName: string;
  teamId: string;
  teamName: string;
  appId?: string;
}

/**
 * WhatsApp Bot metadata — persisted from phone number info on connect
 */
export interface WhatsAppBotMetadata {
  phoneNumberId: string;
  displayPhoneNumber: string;
  verifiedName: string;
  qualityRating?: string;
  businessAccountId?: string;
}

/**
 * Union of all gateway metadata types
 */
export type GatewayMetadata =
  | TelegramBotMetadata
  | DiscordBotMetadata
  | SlackBotMetadata
  | WhatsAppBotMetadata
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
  mode?: "plugin" | "workflow";
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
    hasBotToken?: boolean;
    hasApplicationId?: boolean; // For DISCORD_BOT
    hasAccessToken?: boolean; // For WHATSAPP_BOT
    phoneNumberId?: string; // For WHATSAPP_BOT (non-sensitive identifier)
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
  mode: string;
  lastConnectedAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  /** Summary of the first workflow bound to this gateway (if any) */
  workflowSummary?: {
    id: string;
    name: string;
    status: string;
    isEnabled: boolean;
    stepCount: number;
    executionCount: number;
    lastExecutedAt: Date | null;
    lastError: string | null;
  };
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
 * Check if credentials are for Discord Bot
 */
export function isDiscordBotCredentials(
  credentials: GatewayCredentials
): credentials is DiscordBotCredentials {
  return "botToken" in credentials && "applicationId" in credentials && "publicKey" in credentials;
}

/**
 * Check if credentials are for Slack Bot
 */
export function isSlackBotCredentials(
  credentials: GatewayCredentials
): credentials is SlackBotCredentials {
  return "botToken" in credentials && "signingSecret" in credentials;
}

/**
 * Check if credentials are for WhatsApp Bot
 */
export function isWhatsAppBotCredentials(
  credentials: GatewayCredentials
): credentials is WhatsAppBotCredentials {
  return "accessToken" in credentials && "phoneNumberId" in credentials && "appSecret" in credentials;
}


