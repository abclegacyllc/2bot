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
    BaseGatewayProvider
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
interface _TelegramWebhookInfo {
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

    // Derive webhook URL: use explicit config, or auto-generate from the
    // PRODUCTION API URL (must be consistent regardless of which server
    // instance reconnects the gateway, so we never use NEXT_PUBLIC_API_URL
    // which differs between .env.development and .env.production).
    const webhookBaseUrl =
      process.env.TELEGRAM_WEBHOOK_BASE_URL || "https://webhook.2bot.org";
    const desiredWebhookUrl =
      config?.webhookUrl || `${webhookBaseUrl}/telegram/${gatewayId}`;

    // Only call setWebhook if the current URL differs (avoids unnecessary
    // Telegram API calls and prevents dev/prod servers from fighting).
    const currentWebhook = await this.callApi<{ url: string }>(
      credentials.botToken,
      "getWebhookInfo"
    );

    if (currentWebhook.url !== desiredWebhookUrl) {
      // Default allowed updates covering all event types plugins might need
      const allowedUpdates = config?.allowedUpdates ?? [
        "message",
        "edited_message",
        "channel_post",
        "edited_channel_post",
        "callback_query",
        "inline_query",
        "chosen_inline_result",
        "my_chat_member",
        "chat_member",
        "chat_join_request",
      ];

      // Generate a webhook secret token for authentication
      // This is sent by Telegram in the X-Telegram-Bot-Api-Secret-Token header
      const webhookSecretToken = config?.webhookSecretToken
        || require('crypto').randomBytes(32).toString('hex');

      await this.callApi(credentials.botToken, "setWebhook", {
        url: desiredWebhookUrl,
        allowed_updates: allowedUpdates,
        drop_pending_updates: config?.dropPendingUpdates,
        secret_token: webhookSecretToken,
      });

      // Persist the secret token in gateway config for webhook validation
      try {
        const { prisma } = await import('@/lib/prisma');
        const existing = await prisma.gateway.findUnique({ where: { id: gatewayId }, select: { config: true } });
        const currentConfig = (existing?.config as Record<string, unknown>) || {};
        await prisma.gateway.update({
          where: { id: gatewayId },
          data: { config: { ...currentConfig, webhookSecretToken } },
        });
      } catch (err) {
        this.log.warn({ gatewayId, error: (err as Error).message }, 'Failed to persist webhook secret token');
      }

      this.log.info(
        { gatewayId, webhookUrl: desiredWebhookUrl },
        "Webhook configured"
      );
    } else {
      this.log.debug(
        { gatewayId, webhookUrl: desiredWebhookUrl },
        "Webhook already set correctly, skipping"
      );
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
        return this.executeSendMessage(botToken, params as Record<string, unknown>) as TResult;

      case "setWebhook":
        return this.executeSetWebhook(botToken, params as SetWebhookParams) as TResult;

      case "deleteWebhook":
        return this.executeDeleteWebhook(botToken, params as DeleteWebhookParams) as TResult;

      case "getWebhookInfo":
        return this.callApi<TResult>(botToken, "getWebhookInfo");

      // ── Bot Profile Management ──────────────────────────
      case "getMyName":
        return this.callApi<TResult>(botToken, "getMyName");

      case "setMyName": {
        const p = params as Record<string, unknown>;
        return this.callApi<TResult>(botToken, "setMyName", {
          name: p.name,
          language_code: p.language_code ?? p.languageCode,
        });
      }

      case "getMyDescription":
        return this.callApi<TResult>(botToken, "getMyDescription");

      case "setMyDescription": {
        const p = params as Record<string, unknown>;
        return this.callApi<TResult>(botToken, "setMyDescription", {
          description: p.description,
          language_code: p.language_code ?? p.languageCode,
        });
      }

      case "getMyShortDescription":
        return this.callApi<TResult>(botToken, "getMyShortDescription");

      case "setMyShortDescription": {
        const p = params as Record<string, unknown>;
        return this.callApi<TResult>(botToken, "setMyShortDescription", {
          short_description: p.short_description ?? p.shortDescription,
          language_code: p.language_code ?? p.languageCode,
        });
      }

      // ── Bot Commands ────────────────────────────────────
      case "getMyCommands": {
        const p = params as Record<string, unknown>;
        return this.callApi<TResult>(botToken, "getMyCommands", {
          language_code: p?.language_code ?? p?.languageCode,
          scope: p?.scope,
        });
      }

      case "setMyCommands": {
        const p = params as Record<string, unknown>;
        return this.callApi<TResult>(botToken, "setMyCommands", {
          commands: p.commands,
          language_code: p.language_code ?? p.languageCode,
          scope: p.scope,
        });
      }

      case "deleteMyCommands": {
        const p = params as Record<string, unknown>;
        return this.callApi<TResult>(botToken, "deleteMyCommands", {
          language_code: p?.language_code ?? p?.languageCode,
          scope: p?.scope,
        });
      }

      // ── Chat Info ───────────────────────────────────────
      case "getChat": {
        const p = params as Record<string, unknown>;
        return this.callApi<TResult>(botToken, "getChat", {
          chat_id: p.chat_id ?? p.chatId,
        });
      }

      case "getChatMemberCount": {
        const p = params as Record<string, unknown>;
        return this.callApi<TResult>(botToken, "getChatMemberCount", {
          chat_id: p.chat_id ?? p.chatId,
        });
      }

      case "getChatMember": {
        const p = params as Record<string, unknown>;
        return this.callApi<TResult>(botToken, "getChatMember", {
          chat_id: p.chat_id ?? p.chatId,
          user_id: p.user_id ?? p.userId,
        });
      }

      case "getChatAdministrators": {
        const p = params as Record<string, unknown>;
        return this.callApi<TResult>(botToken, "getChatAdministrators", {
          chat_id: p.chat_id ?? p.chatId,
        });
      }

      // ── Callback Queries ────────────────────────────────
      case "answerCallbackQuery": {
        const p = params as Record<string, unknown>;
        return this.callApi<TResult>(botToken, "answerCallbackQuery", {
          callback_query_id: p.callback_query_id ?? p.callbackQueryId,
          text: p.text,
          show_alert: p.show_alert ?? p.showAlert,
          url: p.url,
          cache_time: p.cache_time ?? p.cacheTime,
        });
      }

      // ── Media Messages ──────────────────────────────────
      case "sendPhoto": {
        const p = params as Record<string, unknown>;
        return this.callApi<TResult>(botToken, "sendPhoto", {
          chat_id: p.chat_id ?? p.chatId,
          photo: p.photo,
          caption: p.caption,
          parse_mode: p.parse_mode ?? p.parseMode,
          disable_notification: p.disable_notification ?? p.disableNotification,
        });
      }

      case "sendDocument": {
        const p = params as Record<string, unknown>;
        return this.callApi<TResult>(botToken, "sendDocument", {
          chat_id: p.chat_id ?? p.chatId,
          document: p.document,
          caption: p.caption,
          parse_mode: p.parse_mode ?? p.parseMode,
          disable_notification: p.disable_notification ?? p.disableNotification,
        });
      }

      case "sendVideo": {
        const p = params as Record<string, unknown>;
        return this.callApi<TResult>(botToken, "sendVideo", {
          chat_id: p.chat_id ?? p.chatId,
          video: p.video,
          caption: p.caption,
          parse_mode: p.parse_mode ?? p.parseMode,
          duration: p.duration,
          width: p.width,
          height: p.height,
          disable_notification: p.disable_notification ?? p.disableNotification,
        });
      }

      case "sendAudio": {
        const p = params as Record<string, unknown>;
        return this.callApi<TResult>(botToken, "sendAudio", {
          chat_id: p.chat_id ?? p.chatId,
          audio: p.audio,
          caption: p.caption,
          parse_mode: p.parse_mode ?? p.parseMode,
          duration: p.duration,
          performer: p.performer,
          title: p.title,
          disable_notification: p.disable_notification ?? p.disableNotification,
        });
      }

      case "sendVoice": {
        const p = params as Record<string, unknown>;
        return this.callApi<TResult>(botToken, "sendVoice", {
          chat_id: p.chat_id ?? p.chatId,
          voice: p.voice,
          caption: p.caption,
          parse_mode: p.parse_mode ?? p.parseMode,
          duration: p.duration,
          disable_notification: p.disable_notification ?? p.disableNotification,
        });
      }

      case "sendLocation": {
        const p = params as Record<string, unknown>;
        return this.callApi<TResult>(botToken, "sendLocation", {
          chat_id: p.chat_id ?? p.chatId,
          latitude: p.latitude,
          longitude: p.longitude,
          disable_notification: p.disable_notification ?? p.disableNotification,
        });
      }

      case "sendContact": {
        const p = params as Record<string, unknown>;
        return this.callApi<TResult>(botToken, "sendContact", {
          chat_id: p.chat_id ?? p.chatId,
          phone_number: p.phone_number ?? p.phoneNumber,
          first_name: p.first_name ?? p.firstName,
          last_name: p.last_name ?? p.lastName,
          disable_notification: p.disable_notification ?? p.disableNotification,
        });
      }

      case "sendPoll": {
        const p = params as Record<string, unknown>;
        return this.callApi<TResult>(botToken, "sendPoll", {
          chat_id: p.chat_id ?? p.chatId,
          question: p.question,
          options: p.options,
          is_anonymous: p.is_anonymous ?? p.isAnonymous,
          type: p.type,
          allows_multiple_answers: p.allows_multiple_answers ?? p.allowsMultipleAnswers,
          disable_notification: p.disable_notification ?? p.disableNotification,
        });
      }

      case "sendChatAction": {
        const p = params as Record<string, unknown>;
        return this.callApi<TResult>(botToken, "sendChatAction", {
          chat_id: p.chat_id ?? p.chatId,
          action: p.action,
        });
      }

      // ── Message Editing ─────────────────────────────────
      case "editMessageText": {
        const p = params as Record<string, unknown>;
        return this.callApi<TResult>(botToken, "editMessageText", {
          chat_id: p.chat_id ?? p.chatId,
          message_id: p.message_id ?? p.messageId,
          inline_message_id: p.inline_message_id ?? p.inlineMessageId,
          text: p.text,
          parse_mode: p.parse_mode ?? p.parseMode,
          reply_markup: p.reply_markup ?? p.replyMarkup,
        });
      }

      case "editMessageCaption": {
        const p = params as Record<string, unknown>;
        return this.callApi<TResult>(botToken, "editMessageCaption", {
          chat_id: p.chat_id ?? p.chatId,
          message_id: p.message_id ?? p.messageId,
          caption: p.caption,
          parse_mode: p.parse_mode ?? p.parseMode,
          reply_markup: p.reply_markup ?? p.replyMarkup,
        });
      }

      case "editMessageReplyMarkup": {
        const p = params as Record<string, unknown>;
        return this.callApi<TResult>(botToken, "editMessageReplyMarkup", {
          chat_id: p.chat_id ?? p.chatId,
          message_id: p.message_id ?? p.messageId,
          reply_markup: p.reply_markup ?? p.replyMarkup,
        });
      }

      case "deleteMessage": {
        const p = params as Record<string, unknown>;
        return this.callApi<TResult>(botToken, "deleteMessage", {
          chat_id: p.chat_id ?? p.chatId,
          message_id: p.message_id ?? p.messageId,
        });
      }

      // ── Inline Keyboard Shortcuts ───────────────────────
      case "sendMessageWithInlineKeyboard": {
        const p = params as Record<string, unknown>;
        return this.callApi<TResult>(botToken, "sendMessage", {
          chat_id: p.chat_id ?? p.chatId,
          text: p.text,
          parse_mode: p.parse_mode ?? p.parseMode,
          reply_markup: p.reply_markup ?? p.replyMarkup ?? {
            inline_keyboard: p.inline_keyboard ?? p.inlineKeyboard,
          },
        });
      }

      default:
        // Full Telegram Bot API passthrough — any valid method name
        // (e.g. getUpdates, editMessageText, deleteMessage, sendPhoto, etc.)
        // is forwarded directly to https://api.telegram.org/bot<token>/<action>
        return this.callApi<TResult>(botToken, action, params as Record<string, unknown>);
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
      {
        name: "getUpdates",
        description: "Get incoming updates via long polling",
        params: {
          offset: { type: "number", required: false, description: "First update ID to return" },
          limit: { type: "number", required: false, description: "Max updates (1-100)" },
          timeout: { type: "number", required: false, description: "Long-polling timeout in seconds" },
          allowed_updates: { type: "array", required: false, description: "Update types to receive" },
        },
        returns: "Update[]",
      },

      // ── Bot Profile Management ─────────────────────
      {
        name: "getMyName",
        description: "Get the bot's display name",
        returns: "{ name: string }",
      },
      {
        name: "setMyName",
        description: "Set the bot's display name",
        params: {
          name: { type: "string", required: true, description: "New bot name (0-64 chars, empty to remove)" },
          language_code: { type: "string", required: false, description: "ISO 639-1 language code" },
        },
        returns: "boolean",
      },
      {
        name: "getMyDescription",
        description: "Get the bot's description (shown in empty chat)",
        returns: "{ description: string }",
      },
      {
        name: "setMyDescription",
        description: "Set the bot's description (shown in empty chat)",
        params: {
          description: { type: "string", required: true, description: "Bot description (0-512 chars)" },
          language_code: { type: "string", required: false, description: "ISO 639-1 language code" },
        },
        returns: "boolean",
      },
      {
        name: "getMyShortDescription",
        description: "Get the bot's short description (shown on profile)",
        returns: "{ short_description: string }",
      },
      {
        name: "setMyShortDescription",
        description: "Set the bot's short description (shown on profile)",
        params: {
          short_description: { type: "string", required: true, description: "Short description (0-120 chars)" },
          language_code: { type: "string", required: false, description: "ISO 639-1 language code" },
        },
        returns: "boolean",
      },

      // ── Bot Commands ───────────────────────────────
      {
        name: "getMyCommands",
        description: "Get the bot's command menu",
        params: {
          scope: { type: "object", required: false, description: "BotCommandScope object" },
          language_code: { type: "string", required: false, description: "ISO 639-1 language code" },
        },
        returns: "BotCommand[]",
      },
      {
        name: "setMyCommands",
        description: "Set the bot's command menu",
        params: {
          commands: { type: "array", required: true, description: "Array of {command, description}" },
          scope: { type: "object", required: false, description: "BotCommandScope object" },
          language_code: { type: "string", required: false, description: "ISO 639-1 language code" },
        },
        returns: "boolean",
      },
      {
        name: "deleteMyCommands",
        description: "Delete the bot's command menu",
        params: {
          scope: { type: "object", required: false, description: "BotCommandScope object" },
          language_code: { type: "string", required: false, description: "ISO 639-1 language code" },
        },
        returns: "boolean",
      },

      // ── Chat Info ──────────────────────────────────
      {
        name: "getChat",
        description: "Get full info about a chat",
        params: {
          chat_id: { type: "string", required: true, description: "Chat ID or @username" },
        },
        returns: "Chat",
      },
      {
        name: "getChatMemberCount",
        description: "Get the number of members in a chat",
        params: {
          chat_id: { type: "string", required: true, description: "Chat ID or @username" },
        },
        returns: "number",
      },
      {
        name: "getChatMember",
        description: "Get info about a member of a chat",
        params: {
          chat_id: { type: "string", required: true, description: "Chat ID or @username" },
          user_id: { type: "number", required: true, description: "User ID" },
        },
        returns: "ChatMember",
      },
      {
        name: "getChatAdministrators",
        description: "Get list of chat administrators",
        params: {
          chat_id: { type: "string", required: true, description: "Chat ID or @username" },
        },
        returns: "ChatMember[]",
      },

      // ── Callback Queries ───────────────────────────
      {
        name: "answerCallbackQuery",
        description: "Answer a callback query from an inline keyboard",
        params: {
          callback_query_id: { type: "string", required: true, description: "Callback query ID" },
          text: { type: "string", required: false, description: "Notification text" },
          show_alert: { type: "boolean", required: false, description: "Show alert instead of notification" },
          url: { type: "string", required: false, description: "URL to open" },
          cache_time: { type: "number", required: false, description: "Cache time in seconds" },
        },
        returns: "boolean",
      },

      // ── Media Messages ─────────────────────────────
      {
        name: "sendPhoto",
        description: "Send a photo",
        params: {
          chat_id: { type: "string", required: true, description: "Chat ID or @username" },
          photo: { type: "string", required: true, description: "Photo URL or file_id" },
          caption: { type: "string", required: false, description: "Photo caption" },
          parse_mode: { type: "string", required: false, description: "HTML or Markdown" },
        },
        returns: "TelegramMessage",
      },
      {
        name: "sendDocument",
        description: "Send a document/file",
        params: {
          chat_id: { type: "string", required: true, description: "Chat ID or @username" },
          document: { type: "string", required: true, description: "Document URL or file_id" },
          caption: { type: "string", required: false, description: "Document caption" },
          parse_mode: { type: "string", required: false, description: "HTML or Markdown" },
        },
        returns: "TelegramMessage",
      },
      {
        name: "sendVideo",
        description: "Send a video",
        params: {
          chat_id: { type: "string", required: true, description: "Chat ID or @username" },
          video: { type: "string", required: true, description: "Video URL or file_id" },
          caption: { type: "string", required: false, description: "Video caption" },
          parse_mode: { type: "string", required: false, description: "HTML or Markdown" },
        },
        returns: "TelegramMessage",
      },
      {
        name: "sendAudio",
        description: "Send an audio file",
        params: {
          chat_id: { type: "string", required: true, description: "Chat ID or @username" },
          audio: { type: "string", required: true, description: "Audio URL or file_id" },
          caption: { type: "string", required: false, description: "Audio caption" },
          parse_mode: { type: "string", required: false, description: "HTML or Markdown" },
        },
        returns: "TelegramMessage",
      },
      {
        name: "sendVoice",
        description: "Send a voice message",
        params: {
          chat_id: { type: "string", required: true, description: "Chat ID or @username" },
          voice: { type: "string", required: true, description: "Voice URL or file_id" },
          caption: { type: "string", required: false, description: "Voice caption" },
        },
        returns: "TelegramMessage",
      },
      {
        name: "sendLocation",
        description: "Send a location",
        params: {
          chat_id: { type: "string", required: true, description: "Chat ID or @username" },
          latitude: { type: "number", required: true, description: "Latitude" },
          longitude: { type: "number", required: true, description: "Longitude" },
        },
        returns: "TelegramMessage",
      },
      {
        name: "sendContact",
        description: "Send a phone contact",
        params: {
          chat_id: { type: "string", required: true, description: "Chat ID or @username" },
          phone_number: { type: "string", required: true, description: "Phone number" },
          first_name: { type: "string", required: true, description: "Contact first name" },
          last_name: { type: "string", required: false, description: "Contact last name" },
        },
        returns: "TelegramMessage",
      },
      {
        name: "sendPoll",
        description: "Send a poll",
        params: {
          chat_id: { type: "string", required: true, description: "Chat ID or @username" },
          question: { type: "string", required: true, description: "Poll question" },
          options: { type: "array", required: true, description: "Array of answer options" },
          is_anonymous: { type: "boolean", required: false, description: "Anonymous poll" },
          type: { type: "string", required: false, description: "quiz or regular" },
        },
        returns: "TelegramMessage",
      },
      {
        name: "sendChatAction",
        description: "Send chat action (typing, upload_photo, etc.)",
        params: {
          chat_id: { type: "string", required: true, description: "Chat ID or @username" },
          action: { type: "string", required: true, description: "typing, upload_photo, record_video, etc." },
        },
        returns: "boolean",
      },

      // ── Message Editing ────────────────────────────
      {
        name: "editMessageText",
        description: "Edit text of a sent message",
        params: {
          chat_id: { type: "string", required: false, description: "Chat ID (required if inline_message_id not given)" },
          message_id: { type: "number", required: false, description: "Message ID" },
          text: { type: "string", required: true, description: "New text" },
          parse_mode: { type: "string", required: false, description: "HTML or Markdown" },
          reply_markup: { type: "object", required: false, description: "InlineKeyboardMarkup" },
        },
        returns: "TelegramMessage | boolean",
      },
      {
        name: "editMessageCaption",
        description: "Edit caption of a sent message",
        params: {
          chat_id: { type: "string", required: false, description: "Chat ID" },
          message_id: { type: "number", required: false, description: "Message ID" },
          caption: { type: "string", required: true, description: "New caption" },
          parse_mode: { type: "string", required: false, description: "HTML or Markdown" },
        },
        returns: "TelegramMessage | boolean",
      },
      {
        name: "deleteMessage",
        description: "Delete a message",
        params: {
          chat_id: { type: "string", required: true, description: "Chat ID" },
          message_id: { type: "number", required: true, description: "Message ID" },
        },
        returns: "boolean",
      },
      {
        name: "*",
        description: "Full Telegram Bot API passthrough — any valid method name is forwarded directly",
        params: {},
        returns: "any",
      },
    ];
  }

  // ===========================================
  // Action Implementations
  // ===========================================

  private async executeSendMessage(
    botToken: string,
    params: Record<string, unknown>
  ): Promise<TelegramMessage> {
    // Normalize camelCase params from plugins to snake_case for Telegram API
    const chatId = params.chat_id ?? params.chatId;
    const text = params.text;
    const parseMode = params.parse_mode ?? params.parseMode;
    const disableNotification = params.disable_notification ?? params.disableNotification;
    const disablePreview = params.disable_web_page_preview ?? params.disableWebPagePreview;
    const replyTo = params.reply_to_message_id ?? params.replyToMessageId;

    if (!chatId) {
      throw new Error("chat_id is required");
    }
    if (!text) {
      throw new Error("text is required");
    }

    return this.callApi<TelegramMessage>(botToken, "sendMessage", {
      chat_id: chatId as string | number,
      text: text as string,
      parse_mode: parseMode as string | undefined,
      disable_notification: disableNotification as boolean | undefined,
      disable_web_page_preview: disablePreview as boolean | undefined,
      reply_to_message_id: replyTo as number | undefined,
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
   * Return metadata to persist in Gateway.metadata on connect
   */
  protected getProviderMetadata(
    gatewayId: string,
    _credentials: TelegramBotCredentials
  ): Record<string, unknown> {
    const bot = this.botInfoCache.get(gatewayId);
    if (!bot) return {};
    return {
      botId: bot.id,
      botUsername: bot.username ?? "",
      botFirstName: bot.first_name,
      botLastName: bot.last_name,
      canJoinGroups: bot.can_join_groups,
      canReadGroupMessages: bot.can_read_all_group_messages,
      supportsInlineQueries: bot.supports_inline_queries,
    };
  }

  /**
   * Return live provider-specific info for the /info endpoint.
   * Calls getMe live if not in cache, then enriches with profile data.
   */
  async getProviderInfo(
    gatewayId: string,
    credentials: TelegramBotCredentials
  ): Promise<Record<string, unknown>> {
    // Get bot info (prefer cache, fallback to live API)
    let bot = this.botInfoCache.get(gatewayId);
    if (!bot) {
      bot = await this.callApi<TelegramUser>(credentials.botToken, "getMe");
      this.botInfoCache.set(gatewayId, bot);
    }

    // Fetch bot profile details in parallel (non-critical, catch individually)
    const [nameResult, descResult, shortDescResult, commandsResult] =
      await Promise.allSettled([
        this.callApi<{ name: string }>(credentials.botToken, "getMyName"),
        this.callApi<{ description: string }>(credentials.botToken, "getMyDescription"),
        this.callApi<{ short_description: string }>(credentials.botToken, "getMyShortDescription"),
        this.callApi<Array<{ command: string; description: string }>>(
          credentials.botToken,
          "getMyCommands"
        ),
      ]);

    return {
      botId: bot.id,
      username: bot.username ?? "",
      firstName: bot.first_name,
      lastName: bot.last_name,
      canJoinGroups: bot.can_join_groups,
      canReadGroupMessages: bot.can_read_all_group_messages,
      supportsInlineQueries: bot.supports_inline_queries,
      name:
        nameResult.status === "fulfilled"
          ? nameResult.value.name
          : undefined,
      description:
        descResult.status === "fulfilled"
          ? descResult.value.description
          : undefined,
      shortDescription:
        shortDescResult.status === "fulfilled"
          ? shortDescResult.value.short_description
          : undefined,
      commands:
        commandsResult.status === "fulfilled"
          ? commandsResult.value
          : undefined,
    };
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
