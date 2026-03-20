/**
 * Slack Bot Gateway Provider
 *
 * Implements the GatewayProvider interface for Slack Bot API.
 * Uses the Events API (webhook-based) for inbound events and
 * the Web API for outbound actions.
 *
 * Slack sends event payloads to our webhook endpoint, which we verify
 * with HMAC-SHA256 signature verification using the app signing secret.
 *
 * @module modules/gateway/providers/slack-bot.provider
 */

import type { GatewayType } from "@prisma/client";

import type { GatewayAction } from "../gateway.registry";
import type { SlackBotConfig, SlackBotCredentials } from "../gateway.types";
import { BaseGatewayProvider } from "./base.provider";

// ===========================================
// Slack API Types
// ===========================================

const SLACK_API_BASE = "https://slack.com/api";

interface SlackApiResponse {
  ok: boolean;
  error?: string;
  response_metadata?: { scopes?: string[] };
}

interface SlackAuthTestResponse extends SlackApiResponse {
  url: string;
  team: string;
  user: string;
  team_id: string;
  user_id: string;
  bot_id?: string;
  is_enterprise_install?: boolean;
}

interface _SlackPostMessageResponse extends SlackApiResponse {
  channel: string;
  ts: string;
  message: SlackApiMessage;
}

interface SlackApiMessage {
  type: string;
  subtype?: string;
  text: string;
  ts: string;
  user?: string;
  bot_id?: string;
  blocks?: Array<Record<string, unknown>>;
}

interface _SlackUserInfo extends SlackApiResponse {
  user: {
    id: string;
    name: string;
    real_name: string;
    is_bot: boolean;
    profile: {
      display_name: string;
      image_48: string;
    };
  };
}

interface _SlackConversationInfo extends SlackApiResponse {
  channel: {
    id: string;
    name: string;
    is_channel: boolean;
    is_im: boolean;
    is_group: boolean;
    is_mpim: boolean;
  };
}

// ===========================================
// Provider Implementation
// ===========================================

/**
 * Slack Bot Provider
 *
 * Supported actions:
 * - authTest: Verify token and get bot/team info
 * - postMessage / chat.postMessage: Send a message to a channel
 * - update / chat.update: Update an existing message
 * - delete / chat.delete: Delete a message
 * - postEphemeral / chat.postEphemeral: Send an ephemeral message
 * - addReaction / reactions.add: Add a reaction to a message
 * - removeReaction / reactions.remove: Remove a reaction
 * - conversationsInfo: Get channel info
 * - usersInfo: Get user info
 * - openConversation / conversations.open: Open/create a DM
 * - filesUpload / files.uploadV2: Upload a file
 */
export class SlackBotProvider extends BaseGatewayProvider<
  SlackBotCredentials,
  SlackBotConfig
> {
  readonly type: GatewayType = "SLACK_BOT";
  readonly name = "Slack Bot";
  readonly description = "Connect your Slack bot to receive and send messages";

  /** Cache auth.test results per gateway */
  private authCache: Map<string, SlackAuthTestResponse> = new Map();

  /** Store credentials per gateway (for execute calls) */
  private credentialsCache: Map<string, SlackBotCredentials> = new Map();

  // ===========================================
  // Abstract Method Implementations
  // ===========================================

  protected async doConnect(
    gatewayId: string,
    credentials: SlackBotCredentials,
    _config?: SlackBotConfig,
  ): Promise<void> {
    // Validate token by calling auth.test
    const authResult = await this.callApi<SlackAuthTestResponse>(
      credentials.botToken,
      "auth.test",
    );

    // Cache auth info and credentials
    this.authCache.set(gatewayId, authResult);
    this.credentialsCache.set(gatewayId, credentials);

    this.log.info(
      { gatewayId, team: authResult.team, botId: authResult.bot_id },
      `Connected to Slack workspace "${authResult.team}"`,
    );
  }

  protected async doDisconnect(gatewayId: string): Promise<void> {
    this.authCache.delete(gatewayId);
    this.credentialsCache.delete(gatewayId);
    this.log.info({ gatewayId }, "Slack bot disconnected");
  }

  protected async doValidateCredentials(
    credentials: SlackBotCredentials,
  ): Promise<{ valid: boolean; error?: string }> {
    try {
      // Validate bot token format
      if (!credentials.botToken || typeof credentials.botToken !== "string") {
        return { valid: false, error: "Bot token is required" };
      }

      if (!credentials.botToken.startsWith("xoxb-")) {
        return { valid: false, error: "Bot token must start with 'xoxb-'" };
      }

      // Validate signing secret
      if (!credentials.signingSecret || typeof credentials.signingSecret !== "string") {
        return { valid: false, error: "Signing secret is required" };
      }

      if (credentials.signingSecret.length < 20) {
        return { valid: false, error: "Signing secret appears too short" };
      }

      // Try auth.test to verify the token works
      const authResult = await this.callApi<SlackAuthTestResponse>(
        credentials.botToken,
        "auth.test",
      );

      if (!authResult.bot_id) {
        return { valid: false, error: "Token is not for a bot — expected a bot token (xoxb-)" };
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
      case "authTest":
      case "auth.test":
        return this.callApi<TResult>(token, "auth.test");

      case "postMessage":
      case "chat.postMessage":
      case "sendMessage": {
        const channel = (p.channel ?? p.channel_id ?? p.channelId) as string;
        return this.callApi<TResult>(token, "chat.postMessage", {
          channel,
          text: p.text,
          blocks: p.blocks,
          thread_ts: p.thread_ts ?? p.threadTs,
          reply_broadcast: p.reply_broadcast ?? p.replyBroadcast,
          unfurl_links: p.unfurl_links ?? p.unfurlLinks,
          unfurl_media: p.unfurl_media ?? p.unfurlMedia,
          mrkdwn: p.mrkdwn ?? true,
        });
      }

      case "update":
      case "chat.update":
      case "editMessage": {
        const channel = (p.channel ?? p.channel_id ?? p.channelId) as string;
        const ts = (p.ts ?? p.message_ts ?? p.messageTs) as string;
        return this.callApi<TResult>(token, "chat.update", {
          channel,
          ts,
          text: p.text,
          blocks: p.blocks,
        });
      }

      case "delete":
      case "chat.delete":
      case "deleteMessage": {
        const channel = (p.channel ?? p.channel_id ?? p.channelId) as string;
        const ts = (p.ts ?? p.message_ts ?? p.messageTs) as string;
        return this.callApi<TResult>(token, "chat.delete", {
          channel,
          ts,
        });
      }

      case "postEphemeral":
      case "chat.postEphemeral": {
        const channel = (p.channel ?? p.channel_id ?? p.channelId) as string;
        const user = (p.user ?? p.user_id ?? p.userId) as string;
        return this.callApi<TResult>(token, "chat.postEphemeral", {
          channel,
          user,
          text: p.text,
          blocks: p.blocks,
          thread_ts: p.thread_ts ?? p.threadTs,
        });
      }

      case "addReaction":
      case "reactions.add": {
        const channel = (p.channel ?? p.channel_id ?? p.channelId) as string;
        const ts = (p.timestamp ?? p.ts ?? p.message_ts ?? p.messageTs) as string;
        return this.callApi<TResult>(token, "reactions.add", {
          channel,
          timestamp: ts,
          name: p.name ?? p.emoji ?? p.reaction,
        });
      }

      case "removeReaction":
      case "reactions.remove": {
        const channel = (p.channel ?? p.channel_id ?? p.channelId) as string;
        const ts = (p.timestamp ?? p.ts ?? p.message_ts ?? p.messageTs) as string;
        return this.callApi<TResult>(token, "reactions.remove", {
          channel,
          timestamp: ts,
          name: p.name ?? p.emoji ?? p.reaction,
        });
      }

      case "conversationsInfo":
      case "conversations.info": {
        const channel = (p.channel ?? p.channel_id ?? p.channelId) as string;
        return this.callApi<TResult>(token, "conversations.info", { channel });
      }

      case "usersInfo":
      case "users.info": {
        const user = (p.user ?? p.user_id ?? p.userId) as string;
        return this.callApi<TResult>(token, "users.info", { user });
      }

      case "openConversation":
      case "conversations.open": {
        // Open a DM with one or more users
        const users = (p.users ?? p.user_ids ?? p.userIds) as string | string[];
        return this.callApi<TResult>(token, "conversations.open", {
          users: Array.isArray(users) ? users.join(",") : users,
        });
      }

      case "filesUpload":
      case "files.uploadV2": {
        // Simplified file upload — text content only (binary requires multipart)
        const channels = (p.channel ?? p.channel_id ?? p.channelId) as string;
        return this.callApi<TResult>(token, "files.uploadV2", {
          channel_id: channels,
          content: p.content,
          filename: p.filename ?? "file.txt",
          title: p.title,
          initial_comment: p.initial_comment ?? p.initialComment,
        });
      }

      case "respondToInteraction": {
        // Use response_url for interaction responses (not part of Web API)
        const responseUrl = p.response_url ?? p.responseUrl;
        if (!responseUrl || typeof responseUrl !== "string") {
          throw new SlackApiError("response_url is required for interaction responses", "missing_response_url");
        }
        const response = await fetch(responseUrl as string, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: p.text,
            blocks: p.blocks,
            replace_original: p.replace_original ?? p.replaceOriginal ?? false,
            delete_original: p.delete_original ?? p.deleteOriginal ?? false,
            response_type: p.response_type ?? p.responseType ?? "in_channel",
          }),
        });
        if (!response.ok) {
          throw new SlackApiError(`HTTP ${response.status} responding to interaction`, "http_error");
        }
        return (await response.json()) as TResult;
      }

      default:
        throw new SlackApiError(`Unsupported action: ${action}`, "unsupported_action");
    }
  }

  protected async doCheckHealth(
    _gatewayId: string,
    credentials: SlackBotCredentials,
  ): Promise<{ healthy: boolean; latency?: number; error?: string }> {
    try {
      const start = Date.now();
      await this.callApi<SlackAuthTestResponse>(credentials.botToken, "auth.test");
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
        name: "authTest",
        description: "Verify bot token and get workspace info",
        returns: "SlackAuthTestResponse",
      },
      {
        name: "postMessage",
        description: "Send a message to a channel",
        params: {
          channel: { type: "string", required: true, description: "Channel ID (e.g. C0123456789)" },
          text: { type: "string", required: false, description: "Message text (fallback for blocks)" },
          blocks: { type: "array", required: false, description: "Block Kit blocks" },
          thread_ts: { type: "string", required: false, description: "Thread parent timestamp for replies" },
        },
        returns: "SlackPostMessageResponse",
      },
      {
        name: "update",
        description: "Update an existing message",
        params: {
          channel: { type: "string", required: true, description: "Channel ID" },
          ts: { type: "string", required: true, description: "Message timestamp" },
          text: { type: "string", required: false, description: "New text" },
          blocks: { type: "array", required: false, description: "New Block Kit blocks" },
        },
        returns: "SlackApiResponse",
      },
      {
        name: "delete",
        description: "Delete a message",
        params: {
          channel: { type: "string", required: true, description: "Channel ID" },
          ts: { type: "string", required: true, description: "Message timestamp" },
        },
      },
      {
        name: "postEphemeral",
        description: "Send an ephemeral message visible only to one user",
        params: {
          channel: { type: "string", required: true, description: "Channel ID" },
          user: { type: "string", required: true, description: "User ID to show message to" },
          text: { type: "string", required: false, description: "Message text" },
          blocks: { type: "array", required: false, description: "Block Kit blocks" },
        },
      },
      {
        name: "addReaction",
        description: "Add a reaction emoji to a message",
        params: {
          channel: { type: "string", required: true, description: "Channel ID" },
          timestamp: { type: "string", required: true, description: "Message timestamp" },
          name: { type: "string", required: true, description: "Reaction name without colons (e.g. 'thumbsup')" },
        },
      },
      {
        name: "removeReaction",
        description: "Remove a reaction from a message",
        params: {
          channel: { type: "string", required: true, description: "Channel ID" },
          timestamp: { type: "string", required: true, description: "Message timestamp" },
          name: { type: "string", required: true, description: "Reaction name" },
        },
      },
      {
        name: "usersInfo",
        description: "Get information about a user",
        params: {
          user: { type: "string", required: true, description: "User ID" },
        },
        returns: "SlackUserInfo",
      },
      {
        name: "conversationsInfo",
        description: "Get information about a channel",
        params: {
          channel: { type: "string", required: true, description: "Channel ID" },
        },
        returns: "SlackConversationInfo",
      },
      {
        name: "openConversation",
        description: "Open or resume a DM with one or more users",
        params: {
          users: { type: "string", required: true, description: "Comma-separated user IDs" },
        },
        returns: "SlackConversationInfo",
      },
      {
        name: "respondToInteraction",
        description: "Respond to a Slack interaction using response_url",
        params: {
          response_url: { type: "string", required: true, description: "The response_url from the interaction payload" },
          text: { type: "string", required: false, description: "Message text" },
          blocks: { type: "array", required: false, description: "Block Kit blocks" },
          replace_original: { type: "boolean", required: false, description: "Replace the original message" },
        },
      },
    ];
  }

  protected getProviderMetadata(
    gatewayId: string,
    credentials: SlackBotCredentials,
  ): Record<string, unknown> {
    const auth = this.authCache.get(gatewayId);
    if (!auth) return {};
    return {
      botId: auth.bot_id,
      botName: auth.user,
      teamId: auth.team_id,
      teamName: auth.team,
      appId: credentials.appId,
    };
  }

  async getProviderInfo(
    gatewayId: string,
    credentials: SlackBotCredentials,
  ): Promise<Record<string, unknown>> {
    // Get auth info (prefer cache, fallback to live API)
    let auth = this.authCache.get(gatewayId);
    if (!auth) {
      auth = await this.callApi<SlackAuthTestResponse>(credentials.botToken, "auth.test");
      this.authCache.set(gatewayId, auth);
    }

    return {
      botId: auth.bot_id,
      botName: auth.user,
      userId: auth.user_id,
      teamId: auth.team_id,
      teamName: auth.team,
      teamUrl: auth.url,
      appId: credentials.appId,
      isEnterpriseInstall: auth.is_enterprise_install,
    };
  }

  // ===========================================
  // Slack Web API Helper
  // ===========================================

  private async callApi<T>(
    botToken: string,
    method: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    const url = `${SLACK_API_BASE}/${method}`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${botToken}`,
      "Content-Type": "application/json; charset=utf-8",
    };

    const init: RequestInit = {
      method: "POST",
      headers,
    };

    if (body) {
      // Remove undefined values
      const cleanBody: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(body)) {
        if (value !== undefined) cleanBody[key] = value;
      }
      init.body = JSON.stringify(cleanBody);
    }

    const response = await fetch(url, init);

    if (!response.ok) {
      throw new SlackApiError(
        `HTTP ${response.status}: ${response.statusText}`,
        `http_${response.status}`,
      );
    }

    const data = (await response.json()) as SlackApiResponse & T;

    if (!data.ok) {
      throw new SlackApiError(
        data.error || "Unknown Slack API error",
        data.error || "unknown",
      );
    }

    return data as T;
  }
}

// ===========================================
// Errors
// ===========================================

export class SlackApiError extends Error {
  constructor(
    message: string,
    public readonly errorCode: string,
  ) {
    super(`Slack API error (${errorCode}): ${message}`);
    this.name = "SlackApiError";
  }
}

// ===========================================
// Singleton Instance
// ===========================================

export const slackBotProvider = new SlackBotProvider();
