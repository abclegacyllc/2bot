/**
 * Telegram Bot Gateway Provider
 *
 * Implements the GatewayProvider interface for Telegram Bot API.
 * Uses native fetch for API calls (no external dependencies).
 *
 * @module modules/gateway/providers/telegram-bot.provider
 */

import type { GatewayType } from "@prisma/client";
import type { GatewayAction } from "../gateway.registry";
import type { TelegramBotConfig, TelegramBotCredentials } from "../gateway.types";
import {
    BaseGatewayProvider,
    UnsupportedActionError
} from "./base.provider";

// ===========================================
// Telegram API Types
// ===========================================

/**
 * Telegram Bot API base URL
 */
const TELEGRAM_API_BASE = "https://api.telegram.org";

/**
 * Telegram API response wrapper
 */
interface TelegramResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

/**
 * Telegram User object
 */
interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  can_join_groups?: boolean;
  can_read_all_group_messages?: boolean;
  supports_inline_queries?: boolean;
}

/**
 * Telegram Message object (simplified)
 */
interface TelegramMessage {
  message_id: number;
  date: number;
  chat: {
    id: number;
    type: string;
    title?: string;
    username?: string;
    first_name?: string;
    last_name?: string;
  };
  from?: TelegramUser;
  text?: string;
}

/**
 * Telegram WebhookInfo
 */
interface TelegramWebhookInfo {
  url: string;
  has_custom_certificate: boolean;
  pending_update_count: number;
  ip_address?: string;
  last_error_date?: number;
  last_error_message?: string;
  last_synchronization_error_date?: number;
  max_connections?: number;
  allowed_updates?: string[];
}

// ===========================================
// Provider Implementation
// ===========================================

/**
 * Telegram Bot Provider
 *
 * Supported actions:
 * - getMe: Get bot info
 * - sendMessage: Send a text message
 * - setWebhook: Configure webhook URL
 * - deleteWebhook: Remove webhook
 * - getWebhookInfo: Get current webhook status
 */
export class TelegramBotProvider extends BaseGatewayProvider<
  TelegramBotCredentials,
  TelegramBotConfig
> {
  readonly type: GatewayType = "TELEGRAM_BOT";
  readonly name = "Telegram Bot";
  readonly description = "Connect your Telegram bot to receive and send messages";

  /** Cache bot info per gateway */
  private botInfoCache: Map<string, TelegramUser> = new Map();

  /** Store credentials per gateway (for execute calls) */
  private credentialsCache: Map<string, TelegramBotCredentials> = new Map();

  // ===========================================
  // Abstract Method Implementations
  // ===========================================

  protected async doConnect(
    gatewayId: string,
    credentials: TelegramBotCredentials,
    config?: TelegramBotConfig
  ): Promise<void> {
    // Validate token by getting bot info
    const botInfo = await this.callApi<TelegramUser>(credentials.botToken, "getMe");

    // Cache bot info and credentials
    this.botInfoCache.set(gatewayId, botInfo);
    this.credentialsCache.set(gatewayId, credentials);

    this.log.info(
      { gatewayId, botUsername: botInfo.username },
      `Connected to Telegram bot @${botInfo.username}`
    );

    // Set webhook if configured
    if (config?.webhookUrl) {
      await this.callApi(credentials.botToken, "setWebhook", {
        url: config.webhookUrl,
        allowed_updates: config.allowedUpdates,
        drop_pending_updates: config.dropPendingUpdates,
      });
      this.log.info({ gatewayId, webhookUrl: config.webhookUrl }, "Webhook configured");
    }
  }

  protected async doDisconnect(gatewayId: string): Promise<void> {
    // Clear cached bot info and credentials
    this.botInfoCache.delete(gatewayId);
    this.credentialsCache.delete(gatewayId);

    this.log.info({ gatewayId }, "Telegram bot disconnected");
  }

  protected async doValidateCredentials(
    credentials: TelegramBotCredentials
  ): Promise<{ valid: boolean; error?: string }> {
    try {
      // Token format check: <bot_id>:<hash>
      const tokenRegex = /^\d+:[A-Za-z0-9_-]{35}$/;
      if (!tokenRegex.test(credentials.botToken)) {
        return { valid: false, error: "Invalid bot token format" };
      }

      // Try to get bot info
      const botInfo = await this.callApi<TelegramUser>(credentials.botToken, "getMe");

      if (!botInfo.is_bot) {
        return { valid: false, error: "Token is not for a bot" };
      }

      return { valid: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return { valid: false, error: message };
    }
  }

  protected async doExecute<TParams, TResult>(
    gatewayId: string,
    action: string,
    params: TParams
  ): Promise<TResult> {
    // Get credentials from cache
    const credentials = this.credentialsCache.get(gatewayId);
    if (!credentials) {
      throw new Error("Bot credentials not found - gateway not connected");
    }

    const botToken = credentials.botToken;

    switch (action) {
      case "getMe":
        return this.callApi<TResult>(botToken, "getMe");

      case "sendMessage":
        return this.executeSendMessage(botToken, params as SendMessageParams) as TResult;

      case "setWebhook":
        return this.executeSetWebhook(botToken, params as SetWebhookParams) as TResult;

      case "deleteWebhook":
        return this.executeDeleteWebhook(botToken, params as DeleteWebhookParams) as TResult;

      case "getWebhookInfo":
        return this.callApi<TResult>(botToken, "getWebhookInfo");

      default:
        throw new UnsupportedActionError(action, this.type);
    }
  }

  protected async doCheckHealth(
    gatewayId: string,
    credentials: TelegramBotCredentials
  ): Promise<{ healthy: boolean; latency?: number; error?: string }> {
    try {
      const start = Date.now();
      await this.callApi<TelegramUser>(credentials.botToken, "getMe");
      const latency = Date.now() - start;

      return { healthy: true, latency };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return { healthy: false, error: message };
    }
  }

  getSupportedActions(): GatewayAction[] {
    return [
      {
        name: "getMe",
        description: "Get information about the bot",
        returns: "TelegramUser",
      },
      {
        name: "sendMessage",
        description: "Send a text message to a chat",
        params: {
          chat_id: { type: "string", required: true, description: "Chat ID or @username" },
          text: { type: "string", required: true, description: "Message text" },
          parse_mode: {
            type: "string",
            required: false,
            description: "HTML or Markdown",
          },
          disable_notification: {
            type: "boolean",
            required: false,
            description: "Send silently",
          },
        },
        returns: "TelegramMessage",
      },
      {
        name: "setWebhook",
        description: "Set the webhook URL for receiving updates",
        params: {
          url: { type: "string", required: true, description: "Webhook URL (HTTPS)" },
          allowed_updates: {
            type: "array",
            required: false,
            description: "Update types to receive",
          },
          drop_pending_updates: {
            type: "boolean",
            required: false,
            description: "Drop pending updates",
          },
        },
        returns: "boolean",
      },
      {
        name: "deleteWebhook",
        description: "Remove the webhook",
        params: {
          drop_pending_updates: {
            type: "boolean",
            required: false,
            description: "Drop pending updates",
          },
        },
        returns: "boolean",
      },
      {
        name: "getWebhookInfo",
        description: "Get current webhook status",
        returns: "TelegramWebhookInfo",
      },
    ];
  }

  // ===========================================
  // Action Implementations
  // ===========================================

  private async executeSendMessage(
    botToken: string,
    params: SendMessageParams
  ): Promise<TelegramMessage> {
    if (!params.chat_id) {
      throw new Error("chat_id is required");
    }
    if (!params.text) {
      throw new Error("text is required");
    }

    return this.callApi<TelegramMessage>(botToken, "sendMessage", {
      chat_id: params.chat_id,
      text: params.text,
      parse_mode: params.parse_mode,
      disable_notification: params.disable_notification,
      disable_web_page_preview: params.disable_web_page_preview,
      reply_to_message_id: params.reply_to_message_id,
    });
  }

  private async executeSetWebhook(
    botToken: string,
    params: SetWebhookParams
  ): Promise<boolean> {
    if (!params.url) {
      throw new Error("url is required");
    }

    // URL must be HTTPS
    if (!params.url.startsWith("https://")) {
      throw new Error("Webhook URL must use HTTPS");
    }

    await this.callApi(botToken, "setWebhook", {
      url: params.url,
      allowed_updates: params.allowed_updates,
      drop_pending_updates: params.drop_pending_updates,
      max_connections: params.max_connections,
      secret_token: params.secret_token,
    });

    return true;
  }

  private async executeDeleteWebhook(
    botToken: string,
    params: DeleteWebhookParams
  ): Promise<boolean> {
    await this.callApi(botToken, "deleteWebhook", {
      drop_pending_updates: params.drop_pending_updates,
    });

    return true;
  }

  // ===========================================
  // API Helper
  // ===========================================

  /**
   * Call Telegram Bot API
   */
  private async callApi<T>(
    botToken: string,
    method: string,
    params?: Record<string, unknown>
  ): Promise<T> {
    const url = `${TELEGRAM_API_BASE}/bot${botToken}/${method}`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: params ? JSON.stringify(params) : undefined,
    });

    const data = (await response.json()) as TelegramResponse<T>;

    if (!data.ok) {
      throw new TelegramApiError(
        data.description || "Unknown Telegram API error",
        data.error_code || 0,
        method
      );
    }

    return data.result as T;
  }

  // ===========================================
  // Public Helper Methods
  // ===========================================

  /**
   * Get cached bot info for a gateway
   */
  getBotInfo(gatewayId: string): TelegramUser | undefined {
    return this.botInfoCache.get(gatewayId);
  }

  /**
   * Validate a bot token format (without API call)
   */
  static isValidTokenFormat(token: string): boolean {
    return /^\d+:[A-Za-z0-9_-]{35}$/.test(token);
  }
}

// ===========================================
// Action Parameter Types
// ===========================================

interface SendMessageParams {
  chat_id: string | number;
  text: string;
  parse_mode?: "HTML" | "Markdown" | "MarkdownV2";
  disable_notification?: boolean;
  disable_web_page_preview?: boolean;
  reply_to_message_id?: number;
}

interface SetWebhookParams {
  url: string;
  allowed_updates?: string[];
  drop_pending_updates?: boolean;
  max_connections?: number;
  secret_token?: string;
}

interface DeleteWebhookParams {
  drop_pending_updates?: boolean;
}

// ===========================================
// Errors
// ===========================================

/**
 * Telegram API Error
 */
export class TelegramApiError extends Error {
  constructor(
    message: string,
    public readonly errorCode: number,
    public readonly method: string
  ) {
    super(`Telegram API error (${errorCode}): ${message}`);
    this.name = "TelegramApiError";
  }
}

// ===========================================
// Singleton Instance
// ===========================================

/**
 * Singleton Telegram Bot provider instance
 */
export const telegramBotProvider = new TelegramBotProvider();
