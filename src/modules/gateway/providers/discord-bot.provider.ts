/**
 * Discord Bot Gateway Provider
 *
 * Implements the GatewayProvider interface for Discord Bot API.
 * Uses HTTP interactions (webhook-based) — no WebSocket gateway needed.
 * Discord sends interaction/event payloads to our webhook endpoint,
 * which we verify with Ed25519 signature verification.
 *
 * @module modules/gateway/providers/discord-bot.provider
 */

import type { GatewayType } from "@prisma/client";

import type { GatewayAction } from "../gateway.registry";
import type { DiscordBotConfig, DiscordBotCredentials } from "../gateway.types";
import { BaseGatewayProvider } from "./base.provider";

// ===========================================
// Discord API Types
// ===========================================

const DISCORD_API_BASE = "https://discord.com/api/v10";

interface DiscordApiErrorResponse {
  code: number;
  message: string;
}

interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  avatar: string | null;
  bot?: boolean;
  public_flags?: number;
}

interface DiscordApplication {
  id: string;
  name: string;
  icon: string | null;
  description: string;
  bot_public: boolean;
  bot_require_code_grant: boolean;
  interactions_endpoint_url?: string | null;
}

interface _DiscordMessage {
  id: string;
  channel_id: string;
  content: string;
  author: DiscordUser;
  timestamp: string;
  tts: boolean;
  mention_everyone: boolean;
  embeds: DiscordEmbed[];
}

interface DiscordEmbed {
  title?: string;
  description?: string;
  url?: string;
  color?: number;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  footer?: { text: string; icon_url?: string };
  image?: { url: string };
  thumbnail?: { url: string };
  author?: { name: string; url?: string; icon_url?: string };
}

interface _DiscordChannel {
  id: string;
  type: number;
  guild_id?: string;
  name?: string;
}

// ===========================================
// Provider Implementation
// ===========================================

/**
 * Discord Bot Provider
 *
 * Supported actions:
 * - getMe: Get bot user info
 * - getApplication: Get application info
 * - sendMessage: Send a message to a channel
 * - createMessage: Alias for sendMessage
 * - editMessage: Edit an existing message
 * - deleteMessage: Delete a message
 * - createReaction: Add a reaction to a message
 * - getChannel: Get channel info
 * - createDM: Open a DM channel with a user
 * - interactionResponse: Respond to an interaction
 * - interactionFollowup: Send a followup message to an interaction
 */
export class DiscordBotProvider extends BaseGatewayProvider<
  DiscordBotCredentials,
  DiscordBotConfig
> {
  readonly type: GatewayType = "DISCORD_BOT";
  readonly name = "Discord Bot";
  readonly description = "Connect your Discord bot to receive and send messages";

  /** Cache bot user info per gateway */
  private botInfoCache: Map<string, DiscordUser> = new Map();

  /** Store credentials per gateway (for execute calls) */
  private credentialsCache: Map<string, DiscordBotCredentials> = new Map();

  // ===========================================
  // Abstract Method Implementations
  // ===========================================

  protected async doConnect(
    gatewayId: string,
    credentials: DiscordBotCredentials,
    config?: DiscordBotConfig,
  ): Promise<void> {
    // Validate token by getting bot user info
    const botUser = await this.callApi<DiscordUser>(credentials.botToken, "GET", "/users/@me");

    // Cache bot info and credentials
    this.botInfoCache.set(gatewayId, botUser);
    this.credentialsCache.set(gatewayId, credentials);

    this.log.info(
      { gatewayId, botUsername: botUser.username },
      `Connected to Discord bot @${botUser.username}`,
    );

    // Set the interactions endpoint URL on the Discord application
    // so Discord sends interaction events to our webhook
    const webhookBaseUrl = process.env.DISCORD_WEBHOOK_BASE_URL || "https://webhook.2bot.org";
    const interactionsUrl = config?.interactionsEndpointUrl || `${webhookBaseUrl}/discord/${gatewayId}`;

    try {
      await this.callApi(
        credentials.botToken,
        "PATCH",
        `/applications/${credentials.applicationId}`,
        { interactions_endpoint_url: interactionsUrl },
      );

      this.log.info(
        { gatewayId, interactionsUrl },
        "Discord interactions endpoint configured",
      );
    } catch (error) {
      // Non-fatal: the bot can still work for outbound actions even if
      // we can't set the interactions endpoint (might need OAuth2 scope)
      this.log.warn(
        { gatewayId, error: (error as Error).message },
        "Failed to set Discord interactions endpoint — inbound events may not work",
      );
    }
  }

  protected async doDisconnect(gatewayId: string): Promise<void> {
    this.botInfoCache.delete(gatewayId);
    this.credentialsCache.delete(gatewayId);
    this.log.info({ gatewayId }, "Discord bot disconnected");
  }

  protected async doValidateCredentials(
    credentials: DiscordBotCredentials,
  ): Promise<{ valid: boolean; error?: string }> {
    try {
      // Validate bot token
      if (!credentials.botToken || typeof credentials.botToken !== "string") {
        return { valid: false, error: "Bot token is required" };
      }

      // Validate application ID format (snowflake — numeric string)
      if (!credentials.applicationId || !/^\d{17,20}$/.test(credentials.applicationId)) {
        return { valid: false, error: "Invalid application ID format" };
      }

      // Validate public key format (64-char hex string)
      if (!credentials.publicKey || !/^[0-9a-f]{64}$/i.test(credentials.publicKey)) {
        return { valid: false, error: "Invalid public key format (expected 64-char hex)" };
      }

      // Try to get bot info
      const botInfo = await this.callApi<DiscordUser>(credentials.botToken, "GET", "/users/@me");

      if (!botInfo.bot) {
        return { valid: false, error: "Token is not for a bot account" };
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
    params: TParams,
  ): Promise<TResult> {
    const credentials = this.credentialsCache.get(gatewayId);
    if (!credentials) {
      throw new Error("Bot credentials not found - gateway not connected");
    }

    const token = credentials.botToken;
    const p = params as Record<string, unknown>;

    switch (action) {
      case "getMe":
        return this.callApi<TResult>(token, "GET", "/users/@me");

      case "getApplication":
        return this.callApi<TResult>(
          token,
          "GET",
          `/applications/${credentials.applicationId}`,
        );

      case "sendMessage":
      case "createMessage": {
        const channelId = p.channel_id ?? p.channelId;
        return this.callApi<TResult>(token, "POST", `/channels/${channelId}/messages`, {
          content: p.content,
          embeds: p.embeds,
          components: p.components,
          tts: p.tts,
          allowed_mentions: p.allowed_mentions ?? p.allowedMentions,
        });
      }

      case "editMessage": {
        const channelId = p.channel_id ?? p.channelId;
        const messageId = p.message_id ?? p.messageId;
        return this.callApi<TResult>(
          token,
          "PATCH",
          `/channels/${channelId}/messages/${messageId}`,
          {
            content: p.content,
            embeds: p.embeds,
            components: p.components,
            allowed_mentions: p.allowed_mentions ?? p.allowedMentions,
          },
        );
      }

      case "deleteMessage": {
        const channelId = p.channel_id ?? p.channelId;
        const messageId = p.message_id ?? p.messageId;
        return this.callApi<TResult>(
          token,
          "DELETE",
          `/channels/${channelId}/messages/${messageId}`,
        );
      }

      case "createReaction": {
        const channelId = p.channel_id ?? p.channelId;
        const messageId = p.message_id ?? p.messageId;
        const emoji = encodeURIComponent(p.emoji as string);
        return this.callApi<TResult>(
          token,
          "PUT",
          `/channels/${channelId}/messages/${messageId}/reactions/${emoji}/@me`,
        );
      }

      case "getChannel": {
        const channelId = p.channel_id ?? p.channelId;
        return this.callApi<TResult>(token, "GET", `/channels/${channelId}`);
      }

      case "createDM": {
        const recipientId = p.recipient_id ?? p.recipientId;
        return this.callApi<TResult>(token, "POST", "/users/@me/channels", {
          recipient_id: recipientId,
        });
      }

      case "interactionResponse": {
        const interactionId = p.interaction_id ?? p.interactionId;
        const interactionToken = p.interaction_token ?? p.interactionToken;
        return this.callApi<TResult>(
          token,
          "POST",
          `/interactions/${interactionId}/${interactionToken}/callback`,
          { type: p.type ?? 4, data: p.data },
        );
      }

      case "interactionFollowup": {
        const interactionToken = p.interaction_token ?? p.interactionToken;
        return this.callApi<TResult>(
          token,
          "POST",
          `/webhooks/${credentials.applicationId}/${interactionToken}`,
          {
            content: p.content,
            embeds: p.embeds,
            components: p.components,
          },
        );
      }

      case "getGuild": {
        const guildId = p.guild_id ?? p.guildId;
        return this.callApi<TResult>(token, "GET", `/guilds/${guildId}`);
      }

      case "getGuildChannels": {
        const guildId = p.guild_id ?? p.guildId;
        return this.callApi<TResult>(token, "GET", `/guilds/${guildId}/channels`);
      }

      case "getGuildMember": {
        const guildId = p.guild_id ?? p.guildId;
        const userId = p.user_id ?? p.userId;
        return this.callApi<TResult>(token, "GET", `/guilds/${guildId}/members/${userId}`);
      }

      default:
        // Generic API passthrough — action is the HTTP method + path
        // e.g. "GET /guilds/123" or use callApi directly
        throw new DiscordApiError(`Unsupported action: ${action}`, 0, action);
    }
  }

  protected async doCheckHealth(
    _gatewayId: string,
    credentials: DiscordBotCredentials,
  ): Promise<{ healthy: boolean; latency?: number; error?: string }> {
    try {
      const start = Date.now();
      await this.callApi<DiscordUser>(credentials.botToken, "GET", "/users/@me");
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
        description: "Get information about the bot user",
        returns: "DiscordUser",
      },
      {
        name: "sendMessage",
        description: "Send a message to a channel",
        params: {
          channel_id: { type: "string", required: true, description: "Channel ID (snowflake)" },
          content: { type: "string", required: false, description: "Message text content" },
          embeds: { type: "array", required: false, description: "Array of embed objects" },
          components: { type: "array", required: false, description: "Array of component rows" },
          tts: { type: "boolean", required: false, description: "Text-to-speech" },
        },
        returns: "DiscordMessage",
      },
      {
        name: "editMessage",
        description: "Edit an existing message",
        params: {
          channel_id: { type: "string", required: true, description: "Channel ID" },
          message_id: { type: "string", required: true, description: "Message ID" },
          content: { type: "string", required: false, description: "New message text" },
          embeds: { type: "array", required: false, description: "New embeds" },
        },
        returns: "DiscordMessage",
      },
      {
        name: "deleteMessage",
        description: "Delete a message",
        params: {
          channel_id: { type: "string", required: true, description: "Channel ID" },
          message_id: { type: "string", required: true, description: "Message ID" },
        },
      },
      {
        name: "createReaction",
        description: "Add a reaction to a message",
        params: {
          channel_id: { type: "string", required: true, description: "Channel ID" },
          message_id: { type: "string", required: true, description: "Message ID" },
          emoji: { type: "string", required: true, description: "Emoji (unicode or name:id)" },
        },
      },
      {
        name: "getChannel",
        description: "Get channel information",
        params: {
          channel_id: { type: "string", required: true, description: "Channel ID" },
        },
        returns: "DiscordChannel",
      },
      {
        name: "createDM",
        description: "Open a DM channel with a user",
        params: {
          recipient_id: { type: "string", required: true, description: "User ID" },
        },
        returns: "DiscordChannel",
      },
      {
        name: "interactionResponse",
        description: "Respond to a Discord interaction",
        params: {
          interaction_id: { type: "string", required: true, description: "Interaction ID" },
          interaction_token: { type: "string", required: true, description: "Interaction token" },
          type: { type: "number", required: false, description: "Response type (default: 4 = CHANNEL_MESSAGE_WITH_SOURCE)" },
          data: { type: "object", required: true, description: "Response data (content, embeds, etc.)" },
        },
      },
      {
        name: "interactionFollowup",
        description: "Send a followup message to an interaction",
        params: {
          interaction_token: { type: "string", required: true, description: "Interaction token" },
          content: { type: "string", required: false, description: "Message content" },
          embeds: { type: "array", required: false, description: "Embeds" },
        },
        returns: "DiscordMessage",
      },
    ];
  }

  protected getProviderMetadata(
    gatewayId: string,
    credentials: DiscordBotCredentials,
  ): Record<string, unknown> {
    const bot = this.botInfoCache.get(gatewayId);
    if (!bot) return {};
    return {
      botId: bot.id,
      botUsername: bot.username,
      botDiscriminator: bot.discriminator,
      applicationId: credentials.applicationId,
    };
  }

  async getProviderInfo(
    gatewayId: string,
    credentials: DiscordBotCredentials,
  ): Promise<Record<string, unknown>> {
    // Get bot info (prefer cache, fallback to live API)
    let bot = this.botInfoCache.get(gatewayId);
    if (!bot) {
      bot = await this.callApi<DiscordUser>(credentials.botToken, "GET", "/users/@me");
      this.botInfoCache.set(gatewayId, bot);
    }

    // Fetch application info
    let application: DiscordApplication | undefined;
    try {
      application = await this.callApi<DiscordApplication>(
        credentials.botToken,
        "GET",
        `/applications/${credentials.applicationId}`,
      );
    } catch {
      // Non-critical
    }

    return {
      botId: bot.id,
      username: bot.username,
      discriminator: bot.discriminator,
      avatar: bot.avatar,
      applicationId: credentials.applicationId,
      applicationName: application?.name,
      applicationDescription: application?.description,
      interactionsEndpointUrl: application?.interactions_endpoint_url,
    };
  }

  // ===========================================
  // Discord API Helper
  // ===========================================

  private async callApi<T>(
    botToken: string,
    method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
    path: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    const url = `${DISCORD_API_BASE}${path}`;

    const headers: Record<string, string> = {
      Authorization: `Bot ${botToken}`,
      "User-Agent": "2bot (https://2bot.org, 1.0)",
    };

    const init: RequestInit = { method, headers };

    if (body && (method === "POST" || method === "PATCH" || method === "PUT")) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }

    const response = await fetch(url, init);

    // Handle 204 No Content (e.g. deleteMessage, createReaction)
    if (response.status === 204) {
      return undefined as T;
    }

    const data = await response.json();

    if (!response.ok) {
      const errData = data as DiscordApiErrorResponse;
      throw new DiscordApiError(
        errData.message || `HTTP ${response.status}`,
        errData.code || response.status,
        `${method} ${path}`,
      );
    }

    return data as T;
  }
}

// ===========================================
// Errors
// ===========================================

export class DiscordApiError extends Error {
  constructor(
    message: string,
    public readonly errorCode: number,
    public readonly method: string,
  ) {
    super(`Discord API error (${errorCode}): ${message}`);
    this.name = "DiscordApiError";
  }
}

// ===========================================
// Singleton Instance
// ===========================================

export const discordBotProvider = new DiscordBotProvider();
