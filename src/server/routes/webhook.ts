/**
 * Telegram Webhook Handler
 *
 * Handles incoming webhook requests from Telegram.
 * Routes updates to the appropriate gateway for processing.
 *
 * @module server/routes/webhook
 */

import type { GatewayStatus } from "@prisma/client";
import type { Request, Response } from "express";
import { Router } from "express";

import { decryptJson } from "@/lib/encryption";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { gatewayRegistry, gatewayService } from "@/modules/gateway";
import { gatewayChatService } from "@/modules/gateway/gateway-chats.service";
import type { DiscordBotCredentials, SlackBotCredentials, WhatsAppBotCredentials } from "@/modules/gateway/gateway.types";
import type { DiscordInteraction } from "@/modules/plugin/plugin.events";
import { handleDiscordWebhook, handleSlackWebhook, handleTelegramWebhook, handleWhatsAppWebhook } from "@/modules/plugin/plugin.events";
import { checkDiscordMessageTrigger, checkSlackMessageTrigger, checkTelegramCallbackTrigger, checkTelegramMessageTrigger, checkWhatsAppMessageTrigger, handleWebhookTrigger } from "@/modules/workflow/workflow.triggers";
import type { ApiResponse } from "@/shared/types";

import { RateLimiterRes } from 'rate-limiter-flexible';
import { createRateLimiter } from "../middleware/rate-limit";

const webhookLogger = logger.child({ module: "webhook" });

// ===========================================
// Telegram Update Types
// ===========================================

/**
 * Telegram Chat object
 */
interface TelegramChat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
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
}

/**
 * Telegram Message object
 */
interface TelegramMessage {
  message_id: number;
  date: number;
  chat: TelegramChat;
  from?: TelegramUser;
  text?: string;
  caption?: string;
  reply_to_message?: TelegramMessage;
  entities?: Array<{
    type: string;
    offset: number;
    length: number;
  }>;
}

/**
 * Telegram CallbackQuery object
 */
interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  chat_instance: string;
  data?: string;
}

/**
 * Telegram ChatMemberUpdated object
 * Fires when a chat member's status changes (bot added/removed, user promoted, etc.)
 */
interface TelegramChatMemberUpdated {
  chat: TelegramChat;
  from: TelegramUser;
  date: number;
  old_chat_member: TelegramChatMember;
  new_chat_member: TelegramChatMember;
  invite_link?: {
    invite_link: string;
    creator: TelegramUser;
    creates_join_request: boolean;
    is_primary: boolean;
    is_revoked: boolean;
  };
}

/**
 * Telegram ChatMember object (simplified union)
 */
interface TelegramChatMember {
  status: "creator" | "administrator" | "member" | "restricted" | "left" | "kicked";
  user: TelegramUser;
  is_anonymous?: boolean;
  custom_title?: string;
  until_date?: number;
}

/**
 * Telegram InlineQuery object
 */
interface TelegramInlineQuery {
  id: string;
  from: TelegramUser;
  query: string;
  offset: string;
  chat_type?: "sender" | "private" | "group" | "supergroup" | "channel";
  location?: { latitude: number; longitude: number };
}

/**
 * Telegram ChosenInlineResult object
 */
interface TelegramChosenInlineResult {
  result_id: string;
  from: TelegramUser;
  query: string;
  location?: { latitude: number; longitude: number };
  inline_message_id?: string;
}

/**
 * Telegram Poll object
 */
interface TelegramPoll {
  id: string;
  question: string;
  options: Array<{ text: string; voter_count: number }>;
  total_voter_count: number;
  is_closed: boolean;
  is_anonymous: boolean;
  type: "regular" | "quiz";
  allows_multiple_answers: boolean;
  correct_option_id?: number;
  explanation?: string;
}

/**
 * Telegram PollAnswer object
 */
interface TelegramPollAnswer {
  poll_id: string;
  user: TelegramUser;
  option_ids: number[];
}

/**
 * Telegram Update object - the main payload from webhooks
 *
 * Covers all update types that Telegram can send:
 * - Messages (new, edited, channel posts)
 * - Callback queries (inline keyboard button presses)
 * - Chat member updates (bot added/removed from chats) — critical for Phase 7
 * - Inline queries and chosen inline results
 * - Polls and poll answers
 */
interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  channel_post?: TelegramMessage;
  edited_channel_post?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
  my_chat_member?: TelegramChatMemberUpdated;
  chat_member?: TelegramChatMemberUpdated;
  inline_query?: TelegramInlineQuery;
  chosen_inline_result?: TelegramChosenInlineResult;
  poll?: TelegramPoll;
  poll_answer?: TelegramPollAnswer;
}

// ===========================================
// Route Parameter Types
// ===========================================

interface GatewayParams {
  gatewayId: string;
}

// ===========================================
// Webhook Router
// ===========================================

export const webhookRouter = Router();

/**
 * Handle Telegram webhook
 *
 * POST /webhooks/telegram/:gatewayId
 *
 * Telegram sends updates to this endpoint when events occur (messages, etc.)
 * We validate the gateway exists and is active, then process the update.
 */
webhookRouter.post(
  "/telegram/:gatewayId",
  async (req: Request<GatewayParams>, res: Response<ApiResponse<{ received: boolean }>>) => {
    const { gatewayId } = req.params;
    const update = req.body as TelegramUpdate;

    // Log incoming webhook (debug level)
    webhookLogger.debug(
      { gatewayId, updateId: update?.update_id },
      "Telegram webhook received"
    );

    // Validate update has required fields
    if (!update || typeof update.update_id !== "number") {
      webhookLogger.warn({ gatewayId, body: req.body }, "Invalid webhook payload");
      // Return 200 to Telegram so it doesn't retry
      // But log the error for debugging
      return res.status(200).json({
        success: false,
        error: {
          code: "INVALID_PAYLOAD",
          message: "Invalid update payload",
        },
      });
    }

    try {
      // Deduplicate Telegram updates — skip if we've already processed this update_id
      const dedupKey = `tg:dedup:${gatewayId}:${update.update_id}`;
      const alreadySeen = await redis.set(dedupKey, "1", "EX", 120, "NX");
      if (!alreadySeen) {
        webhookLogger.debug(
          { gatewayId, updateId: update.update_id },
          "Duplicate Telegram update — skipping"
        );
        return res.status(200).json({ success: true, data: { received: true } });
      }

      // Find the gateway (no auth required - webhook auth is via gatewayId)
      const gateway = await prisma.gateway.findUnique({
        where: { id: gatewayId },
        select: {
          id: true,
          type: true,
          status: true,
          credentialsEnc: true,
          config: true,
          userId: true,
          organizationId: true,
          mode: true,
        },
      });

      // Gateway not found
      if (!gateway) {
        webhookLogger.warn({ gatewayId }, "Webhook for unknown gateway");
        // Return 200 so Telegram doesn't retry
        return res.status(200).json({
          success: false,
          error: {
            code: "GATEWAY_NOT_FOUND",
            message: "Gateway not found",
          },
        });
      }

      // Wrong gateway type
      if (gateway.type !== "TELEGRAM_BOT") {
        webhookLogger.warn(
          { gatewayId, type: gateway.type },
          "Webhook to non-Telegram gateway"
        );
        return res.status(200).json({
          success: false,
          error: {
            code: "WRONG_GATEWAY_TYPE",
            message: "Gateway is not a Telegram bot",
          },
        });
      }

      // Gateway not connected/active
      if (gateway.status !== "CONNECTED") {
        webhookLogger.info(
          { gatewayId, status: gateway.status },
          "Webhook to inactive gateway"
        );
        // Still accept the update but log it
        // Could queue for later processing
      }

      // Optional: Verify webhook authenticity using secret_token
      // If you set a secret_token when calling setWebhook, Telegram sends it
      // in the X-Telegram-Bot-Api-Secret-Token header
      const secretTokenHeader = req.headers["x-telegram-bot-api-secret-token"];
      const secretToken = Array.isArray(secretTokenHeader) ? secretTokenHeader[0] : secretTokenHeader;
      const config = gateway.config as { webhookSecretToken?: string } | null;
      
      if (config?.webhookSecretToken && secretToken !== config.webhookSecretToken) {
        webhookLogger.warn(
          { gatewayId },
          "Webhook secret token mismatch"
        );
        return res.status(200).json({
          success: false,
          error: {
            code: "UNAUTHORIZED",
            message: "Invalid secret token",
          },
        });
      }

      // Log the update for processing
      const updateInfo = extractUpdateInfo(update);
      webhookLogger.info(
        {
          gatewayId,
          updateId: update.update_id,
          type: updateInfo.type,
          chatId: updateInfo.chatId,
          userId: updateInfo.userId,
        },
        "Processing Telegram update"
      );

      // Route to plugin system (non-blocking)
      // Plugins receive the update event if they require TELEGRAM_BOT gateway type
      if (gateway.userId) {
        const executeGateway = async (gId: string, action: string, params: unknown) => {
          const provider = gatewayRegistry.get("TELEGRAM_BOT");
          const gw = await prisma.gateway.findUnique({ where: { id: gId } });
          if (!gw) throw new Error(`Gateway not found: ${gId}`);
          const credentials = gatewayService.getDecryptedCredentials(gw);
          try {
            return await provider.execute(gId, action, params);
          } catch (execErr) {
            const msg = execErr instanceof Error ? execErr.message : '';
            if (msg.includes('not connected') || msg.includes('Not connected')) {
              await provider.connect(gId, credentials, (gw.config as Record<string, unknown>) ?? {});
              return provider.execute(gId, action, params);
            }
            throw execErr;
          }
        };

        void (async () => {
          try {
            // Mode-based dispatch
            if (gateway.mode === "workflow") {
              // Workflow mode: check workflow triggers for messages, callbacks, and edited messages
              if (update.message) {
                await checkTelegramMessageTrigger(
                  gatewayId,
                  gateway.userId,
                  gateway.organizationId ?? null,
                  {
                    text: update.message.text,
                    chatType: update.message.chat.type,
                    chatId: update.message.chat.id,
                    messageId: update.message.message_id,
                    from: update.message.from ? {
                      id: update.message.from.id,
                      firstName: update.message.from.first_name,
                      lastName: update.message.from.last_name,
                      username: update.message.from.username,
                    } : undefined,
                  },
                  update
                );
              } else if (update.callback_query) {
                await checkTelegramCallbackTrigger(
                  gatewayId,
                  gateway.userId,
                  gateway.organizationId ?? null,
                  {
                    data: update.callback_query.data,
                    chatId: update.callback_query.message?.chat.id,
                    messageId: update.callback_query.message?.message_id,
                    from: update.callback_query.from ? {
                      id: update.callback_query.from.id,
                      firstName: update.callback_query.from.first_name,
                      lastName: update.callback_query.from.last_name,
                      username: update.callback_query.from.username,
                    } : undefined,
                  },
                  update
                );
              } else if (update.edited_message) {
                await checkTelegramMessageTrigger(
                  gatewayId,
                  gateway.userId,
                  gateway.organizationId ?? null,
                  {
                    text: update.edited_message.text,
                    chatType: update.edited_message.chat.type,
                    chatId: update.edited_message.chat.id,
                    messageId: update.edited_message.message_id,
                    from: update.edited_message.from ? {
                      id: update.edited_message.from.id,
                      firstName: update.edited_message.from.first_name,
                      lastName: update.edited_message.from.last_name,
                      username: update.edited_message.from.username,
                    } : undefined,
                  },
                  update
                );
              }
            } else {
              // Plugin mode: route directly to plugins (no workflow check)
              const result = await handleTelegramWebhook(
                gatewayId,
                gateway.userId,
                gateway.organizationId ?? null,
                update,
                executeGateway
              );
              if (result.pluginsExecuted > 0) {
                webhookLogger.info(
                  { gatewayId, pluginsExecuted: result.pluginsExecuted, success: result.successCount, failures: result.failureCount },
                  'Webhook routed to plugin',
                );
              }
            }
          } catch (err) {
            webhookLogger.error({ gatewayId, error: err instanceof Error ? err.message : String(err) }, 'Webhook dispatch failed');
          }
        })();
      }

      // ── Phase 7: Track chat membership changes (fire-and-forget) ──
      if (update.my_chat_member) {
        const mcm = update.my_chat_member;
        const newStatus = mcm.new_chat_member.status;
        const chatPayload = {
          gatewayId,
          chatId: mcm.chat.id,
          chatType: mcm.chat.type,
          chatTitle: mcm.chat.title,
          chatUsername: mcm.chat.username,
          newStatus,
        };

        // "member" | "administrator" | "creator" → bot is in the chat
        // "left" | "kicked" | "restricted" → bot left / was removed
        const isActive = ["member", "administrator", "creator"].includes(newStatus);

        void (isActive
          ? gatewayChatService.recordChatJoin(chatPayload)
          : gatewayChatService.recordChatLeave(chatPayload)
        ).catch((err: Error) => {
          webhookLogger.error({ gatewayId, error: err.message }, "Chat tracking failed");
        });
      }

      // Update last activity timestamp (fire and forget)
      void prisma.gateway
        .update({
          where: { id: gatewayId },
          data: {
            lastConnectedAt: new Date(),
            status: "CONNECTED" as GatewayStatus,
          },
        })
        .catch((err: Error) => {
          webhookLogger.error({ gatewayId, err }, "Failed to update gateway timestamp");
        });

      // Always return 200 to Telegram
      return res.status(200).json({
        success: true,
        data: { received: true },
      });
    } catch (error) {
      webhookLogger.error(
        { gatewayId, error, updateId: update.update_id },
        "Error processing webhook"
      );

      // Return 200 anyway to prevent Telegram retries
      // Log the error for investigation
      return res.status(200).json({
        success: false,
        error: {
          code: "PROCESSING_ERROR",
          message: "Failed to process update",
        },
      });
    }
  }
);

/**
 * Webhook health check
 *
 * GET /webhooks/telegram/:gatewayId
 *
 * Allows verifying the webhook endpoint is reachable.
 * Returns gateway status without processing anything.
 */
webhookRouter.get(
  "/telegram/:gatewayId",
  async (req: Request<GatewayParams>, res: Response<ApiResponse<{ status: string }>>) => {
    const { gatewayId } = req.params;

    try {
      const gateway = await prisma.gateway.findUnique({
        where: { id: gatewayId },
        select: { id: true, type: true, status: true },
      });

      if (!gateway) {
        return res.status(404).json({
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "Gateway not found",
          },
        });
      }

      if (gateway.type !== "TELEGRAM_BOT") {
        return res.status(400).json({
          success: false,
          error: {
            code: "WRONG_TYPE",
            message: "Not a Telegram gateway",
          },
        });
      }

      return res.json({
        success: true,
        data: { status: gateway.status },
      });
    } catch (error) {
      webhookLogger.error({ gatewayId, error }, "Error checking webhook status");
      return res.status(500).json({
        success: false,
        error: {
          code: "SERVER_ERROR",
          message: "Failed to check webhook status",
        },
      });
    }
  }
);

// ===========================================
// Discord Webhook (Interactions Endpoint)
// ===========================================

/**
 * Discord interaction rate limiter.
 * 120 requests per minute per gatewayId.
 */
const discordWebhookRateLimiter = createRateLimiter({
  keyPrefix: "webhook-discord",
  points: 120,
  duration: 60,
  blockDuration: 60,
});

/**
 * Verify Discord interaction signature using Ed25519.
 * Discord sends X-Signature-Ed25519 and X-Signature-Timestamp headers.
 */
async function verifyDiscordSignature(
  publicKey: string,
  signature: string,
  timestamp: string,
  body: string,
): Promise<boolean> {
  try {
    const { subtle } = await import("node:crypto").then(m => m.webcrypto);
    const encoder = new TextEncoder();
    const keyBytes = Uint8Array.from(
      (publicKey.match(/.{1,2}/g) ?? []).map((byte) => parseInt(byte, 16)),
    );
    const key = await subtle.importKey(
      "raw",
      keyBytes,
      { name: "Ed25519" },
      false,
      ["verify"],
    );
    const sigBytes = Uint8Array.from(
      (signature.match(/.{1,2}/g) ?? []).map((byte) => parseInt(byte, 16)),
    );
    const message = encoder.encode(timestamp + body);
    return subtle.verify("Ed25519", key, sigBytes, message);
  } catch {
    return false;
  }
}

/**
 * Handle Discord interactions webhook
 *
 * POST /webhooks/discord/:gatewayId
 *
 * Discord sends interactions (slash commands, button clicks, etc.) to this endpoint.
 * We verify the Ed25519 signature, handle PING for URL verification, then route
 * to the plugin system for all other interaction types.
 */
webhookRouter.post(
  "/discord/:gatewayId",
  async (req: Request<GatewayParams>, res: Response) => {
    const { gatewayId } = req.params;

    // Rate limit
    try {
      await discordWebhookRateLimiter.consume(gatewayId);
    } catch (err) {
      if (err instanceof RateLimiterRes) {
        webhookLogger.warn({ gatewayId }, "Discord webhook rate limit exceeded");
        res.status(429).json({ error: "Too many requests" });
        return;
      }
      // Redis error — fail open
    }

    try {
      // Find the gateway
      const gateway = await prisma.gateway.findUnique({
        where: { id: gatewayId },
        select: {
          id: true,
          type: true,
          status: true,
          credentialsEnc: true,
          config: true,
          userId: true,
          organizationId: true,
          mode: true,
        },
      });

      if (!gateway) {
        webhookLogger.warn({ gatewayId }, "Discord webhook for unknown gateway");
        res.status(404).json({ error: "Unknown gateway" });
        return;
      }

      if (gateway.type !== "DISCORD_BOT") {
        webhookLogger.warn({ gatewayId, type: gateway.type }, "Webhook to non-Discord gateway");
        res.status(400).json({ error: "Not a Discord gateway" });
        return;
      }

      // Decrypt credentials to get the public key for signature verification
      const credentials = decryptJson<DiscordBotCredentials>(gateway.credentialsEnc);

      // Verify Discord signature
      const signature = req.headers["x-signature-ed25519"] as string;
      const timestamp = req.headers["x-signature-timestamp"] as string;

      if (!signature || !timestamp) {
        webhookLogger.warn({ gatewayId }, "Discord webhook missing signature headers");
        res.status(401).json({ error: "Missing signature" });
        return;
      }

      // We need the raw body as a string for verification
      const rawBody = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
      const isValid = await verifyDiscordSignature(
        credentials.publicKey,
        signature,
        timestamp,
        rawBody,
      );

      if (!isValid) {
        webhookLogger.warn({ gatewayId }, "Discord webhook signature verification failed");
        res.status(401).json({ error: "Invalid signature" });
        return;
      }

      const interaction = req.body as DiscordInteraction;

      // Handle PING (type 1) — Discord uses this to verify the endpoint
      if (interaction.type === 1) {
        webhookLogger.info({ gatewayId }, "Discord PING verification");
        res.status(200).json({ type: 1 }); // PONG
        return;
      }

      webhookLogger.info(
        {
          gatewayId,
          interactionId: interaction.id,
          interactionType: interaction.type,
          guildId: interaction.guild_id,
        },
        "Processing Discord interaction",
      );

      // Route to plugin system (non-blocking)
      if (gateway.userId) {
        const executeGateway = async (gId: string, action: string, params: unknown) => {
          const provider = gatewayRegistry.get("DISCORD_BOT");
          const gw = await prisma.gateway.findUnique({ where: { id: gId } });
          if (!gw) throw new Error(`Gateway not found: ${gId}`);
          const creds = gatewayService.getDecryptedCredentials(gw);
          try {
            return await provider.execute(gId, action, params);
          } catch (execErr) {
            const msg = execErr instanceof Error ? execErr.message : "";
            if (msg.includes("not connected") || msg.includes("Not connected")) {
              await provider.connect(gId, creds, (gw.config as Record<string, unknown>) ?? {});
              return provider.execute(gId, action, params);
            }
            throw execErr;
          }
        };

        void (async () => {
          try {
            // Mode-based dispatch
            if (gateway.mode === "workflow") {
              await checkDiscordMessageTrigger(
                gatewayId,
                gateway.userId,
                gateway.organizationId ?? null,
                interaction,
                interaction
              );
            } else {
              const result = await handleDiscordWebhook(
                gatewayId,
                gateway.userId,
                gateway.organizationId ?? null,
                interaction,
                executeGateway,
              );
              if (result.pluginsExecuted > 0) {
                webhookLogger.info(
                  { gatewayId, pluginsExecuted: result.pluginsExecuted, success: result.successCount, failures: result.failureCount },
                  "Discord interaction routed to plugin",
                );
              }
            }
          } catch (err) {
            webhookLogger.error({ gatewayId, error: err instanceof Error ? err.message : String(err) }, "Discord dispatch failed");
          }
        })();
      }

      // For interactions that need an immediate response, send ACK (type 5 = DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE)
      // Plugins can follow up using the interaction token
      if (interaction.type === 2 || interaction.type === 3) {
        // Application command or message component
        res.status(200).json({ type: 5 }); // DEFERRED response — plugins will follow up
      } else {
        res.status(200).json({ type: 1 }); // Default ACK
      }

      // Update last activity timestamp (fire and forget)
      void prisma.gateway
        .update({
          where: { id: gatewayId },
          data: {
            lastConnectedAt: new Date(),
            status: "CONNECTED" as GatewayStatus,
          },
        })
        .catch((err: Error) => {
          webhookLogger.error({ gatewayId, err }, "Failed to update gateway timestamp");
        });
    } catch (error) {
      webhookLogger.error(
        { gatewayId, error },
        "Error processing Discord webhook",
      );
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

/**
 * Discord webhook health check
 *
 * GET /webhooks/discord/:gatewayId
 */
webhookRouter.get(
  "/discord/:gatewayId",
  async (req: Request<GatewayParams>, res: Response<ApiResponse<{ status: string }>>) => {
    const { gatewayId } = req.params;

    try {
      const gateway = await prisma.gateway.findUnique({
        where: { id: gatewayId },
        select: { id: true, type: true, status: true },
      });

      if (!gateway || gateway.type !== "DISCORD_BOT") {
        return res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: "Gateway not found" },
        });
      }

      return res.json({
        success: true,
        data: { status: gateway.status },
      });
    } catch (error) {
      webhookLogger.error({ gatewayId, error }, "Error checking Discord webhook status");
      return res.status(500).json({
        success: false,
        error: { code: "SERVER_ERROR", message: "Failed to check webhook status" },
      });
    }
  },
);

// ===========================================
// Custom Gateway Webhook (unified — same gateway table)
// ===========================================

// ===========================================
// Slack Webhook (Events API + Interactions)
// ===========================================

/**
 * Slack webhook rate limiter.
 * 120 requests per minute per gatewayId.
 */
const slackWebhookRateLimiter = createRateLimiter({
  keyPrefix: "webhook-slack",
  points: 120,
  duration: 60,
  blockDuration: 60,
});

/**
 * Verify Slack request signature using HMAC-SHA256.
 * Slack sends X-Slack-Signature and X-Slack-Request-Timestamp headers.
 * See: https://api.slack.com/authentication/verifying-requests-from-slack
 */
async function verifySlackSignature(
  signingSecret: string,
  signature: string,
  timestamp: string,
  body: string,
): Promise<boolean> {
  try {
    // Check timestamp is within 5 minutes to prevent replay attacks
    const requestTime = parseInt(timestamp, 10);
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - requestTime) > 300) {
      return false;
    }

    const { createHmac } = await import("node:crypto");
    const sigBasestring = `v0:${timestamp}:${body}`;
    const mySignature = `v0=${createHmac("sha256", signingSecret)
      .update(sigBasestring)
      .digest("hex")}`;

    // Timing-safe comparison
    const { timingSafeEqual } = await import("node:crypto");
    const a = Buffer.from(mySignature);
    const b = Buffer.from(signature);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Handle Slack Events API + Interactions webhook
 *
 * POST /webhooks/slack/:gatewayId
 *
 * Slack sends:
 * 1. url_verification challenge (on setup)
 * 2. Event callbacks (messages, reactions, app_mention, etc.)
 * 3. Interaction payloads (block_actions, view_submission, shortcuts)
 *
 * We verify the HMAC-SHA256 signature, handle url_verification,
 * then route events to the plugin system.
 */
webhookRouter.post(
  "/slack/:gatewayId",
  async (req: Request<GatewayParams>, res: Response) => {
    const { gatewayId } = req.params;

    // Rate limit
    try {
      await slackWebhookRateLimiter.consume(gatewayId);
    } catch (err) {
      if (err instanceof RateLimiterRes) {
        webhookLogger.warn({ gatewayId }, "Slack webhook rate limit exceeded");
        res.status(429).json({ error: "Too many requests" });
        return;
      }
      // Redis error — fail open
    }

    try {
      // Find the gateway
      const gateway = await prisma.gateway.findUnique({
        where: { id: gatewayId },
        select: {
          id: true,
          type: true,
          status: true,
          credentialsEnc: true,
          config: true,
          userId: true,
          organizationId: true,
          mode: true,
        },
      });

      if (!gateway) {
        webhookLogger.warn({ gatewayId }, "Slack webhook for unknown gateway");
        res.status(404).json({ error: "Unknown gateway" });
        return;
      }

      if (gateway.type !== "SLACK_BOT") {
        webhookLogger.warn({ gatewayId, type: gateway.type }, "Webhook to non-Slack gateway");
        res.status(400).json({ error: "Not a Slack gateway" });
        return;
      }

      // Decrypt credentials to get the signing secret
      const credentials = decryptJson<SlackBotCredentials>(gateway.credentialsEnc);

      // Get raw body for signature verification
      const rawBody = typeof req.body === "string" ? req.body : JSON.stringify(req.body);

      // Verify Slack signature
      const signature = req.headers["x-slack-signature"] as string;
      const timestamp = req.headers["x-slack-request-timestamp"] as string;

      if (!signature || !timestamp) {
        webhookLogger.warn({ gatewayId }, "Slack webhook missing signature headers");
        res.status(401).json({ error: "Missing signature" });
        return;
      }

      const isValid = await verifySlackSignature(
        credentials.signingSecret,
        signature,
        timestamp,
        rawBody,
      );

      if (!isValid) {
        webhookLogger.warn({ gatewayId }, "Slack webhook signature verification failed");
        res.status(401).json({ error: "Invalid signature" });
        return;
      }

      // Parse the payload — Slack interactions come as form-encoded `payload` field
      let payload = req.body as Record<string, unknown>;
      if (typeof payload.payload === "string") {
        try {
          payload = JSON.parse(payload.payload as string) as Record<string, unknown>;
        } catch {
          res.status(400).json({ error: "Invalid interaction payload" });
          return;
        }
      }

      // Handle url_verification challenge (Slack sends this when setting up Events API URL)
      if (payload.type === "url_verification") {
        webhookLogger.info({ gatewayId }, "Slack URL verification challenge");
        res.status(200).json({ challenge: payload.challenge });
        return;
      }

      // Determine payload kind
      const isEventCallback = payload.type === "event_callback";
      const isInteraction = !!(payload.type && typeof payload.type === "string" &&
        ["block_actions", "shortcut", "message_action", "view_submission", "view_closed"].includes(payload.type as string));

      if (!isEventCallback && !isInteraction) {
        webhookLogger.debug({ gatewayId, type: payload.type }, "Ignoring unhandled Slack payload type");
        res.status(200).json({ ok: true });
        return;
      }

      webhookLogger.info(
        {
          gatewayId,
          payloadType: payload.type,
          eventType: isEventCallback ? (payload.event as Record<string, unknown>)?.type : undefined,
        },
        "Processing Slack webhook",
      );

      // Route to plugin system (non-blocking)
      if (gateway.userId) {
        const executeGateway = async (gId: string, action: string, params: unknown) => {
          const provider = gatewayRegistry.get("SLACK_BOT");
          const gw = await prisma.gateway.findUnique({ where: { id: gId } });
          if (!gw) throw new Error(`Gateway not found: ${gId}`);
          const creds = gatewayService.getDecryptedCredentials(gw);
          try {
            return await provider.execute(gId, action, params);
          } catch (execErr) {
            const msg = execErr instanceof Error ? execErr.message : "";
            if (msg.includes("not connected") || msg.includes("Not connected")) {
              await provider.connect(gId, creds, (gw.config as Record<string, unknown>) ?? {});
              return provider.execute(gId, action, params);
            }
            throw execErr;
          }
        };

        void (async () => {
          try {
            // Mode-based dispatch
            if (gateway.mode === "workflow") {
              await checkSlackMessageTrigger(
                gatewayId,
                gateway.userId,
                gateway.organizationId ?? null,
                payload,
                payload
              );
            } else {
              const result = await handleSlackWebhook(
                gatewayId,
                gateway.userId,
                gateway.organizationId ?? null,
                payload,
                executeGateway,
              );
              if (result.pluginsExecuted > 0) {
                webhookLogger.info(
                  { gatewayId, pluginsExecuted: result.pluginsExecuted, success: result.successCount, failures: result.failureCount },
                  "Slack event routed to plugin",
                );
              }
            }
          } catch (err) {
            webhookLogger.error({ gatewayId, error: err instanceof Error ? err.message : String(err) }, "Slack dispatch failed");
          }
        })();
      }

      // Respond 200 immediately — Slack requires fast responses
      res.status(200).json({ ok: true });

      // Update last activity timestamp (fire and forget)
      void prisma.gateway
        .update({
          where: { id: gatewayId },
          data: {
            lastConnectedAt: new Date(),
            status: "CONNECTED" as GatewayStatus,
          },
        })
        .catch((err: Error) => {
          webhookLogger.error({ gatewayId, err }, "Failed to update gateway timestamp");
        });
    } catch (error) {
      webhookLogger.error(
        { gatewayId, error },
        "Error processing Slack webhook",
      );
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

/**
 * Slack webhook health check
 *
 * GET /webhooks/slack/:gatewayId
 */
webhookRouter.get(
  "/slack/:gatewayId",
  async (req: Request<GatewayParams>, res: Response<ApiResponse<{ status: string }>>) => {
    const { gatewayId } = req.params;

    try {
      const gateway = await prisma.gateway.findUnique({
        where: { id: gatewayId },
        select: { id: true, type: true, status: true },
      });

      if (!gateway || gateway.type !== "SLACK_BOT") {
        return res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: "Gateway not found" },
        });
      }

      return res.json({
        success: true,
        data: { status: gateway.status },
      });
    } catch (error) {
      webhookLogger.error({ gatewayId, error }, "Error checking Slack webhook status");
      return res.status(500).json({
        success: false,
        error: { code: "SERVER_ERROR", message: "Failed to check webhook status" },
      });
    }
  },
);

// ===========================================
// WhatsApp Cloud API Webhook
// ===========================================

/**
 * WhatsApp webhook rate limiter.
 * 120 requests per minute per gatewayId.
 */
const whatsAppWebhookRateLimiter = createRateLimiter({
  keyPrefix: "webhook-whatsapp",
  points: 120,
  duration: 60,
  blockDuration: 60,
});

/**
 * Verify WhatsApp webhook signature using HMAC-SHA256.
 * Meta sends X-Hub-Signature-256 header with format: sha256=<hex>
 */
async function verifyWhatsAppSignature(
  appSecret: string,
  signature: string,
  body: string,
): Promise<boolean> {
  try {
    const { createHmac, timingSafeEqual } = await import("node:crypto");
    const expectedSignature = `sha256=${createHmac("sha256", appSecret)
      .update(body)
      .digest("hex")}`;

    const a = Buffer.from(expectedSignature);
    const b = Buffer.from(signature);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * WhatsApp webhook verification (GET)
 *
 * GET /webhooks/whatsapp/:gatewayId
 *
 * Meta sends GET request with hub.mode, hub.verify_token, hub.challenge
 * to verify webhook URL ownership. We validate the verify_token matches
 * the stored credential and respond with the challenge value.
 */
webhookRouter.get(
  "/whatsapp/:gatewayId",
  async (req: Request<GatewayParams>, res: Response) => {
    const { gatewayId } = req.params;
    const mode = req.query["hub.mode"] as string | undefined;
    const verifyToken = req.query["hub.verify_token"] as string | undefined;
    const challenge = req.query["hub.challenge"] as string | undefined;

    if (mode !== "subscribe" || !verifyToken || !challenge) {
      webhookLogger.warn({ gatewayId, mode }, "Invalid WhatsApp verification request");
      res.status(400).send("Invalid verification request");
      return;
    }

    try {
      const gateway = await prisma.gateway.findUnique({
        where: { id: gatewayId },
        select: { id: true, type: true, credentialsEnc: true },
      });

      if (!gateway || gateway.type !== "WHATSAPP_BOT") {
        res.status(404).send("Gateway not found");
        return;
      }

      const credentials = decryptJson<WhatsAppBotCredentials>(gateway.credentialsEnc);

      if (verifyToken !== credentials.verifyToken) {
        webhookLogger.warn({ gatewayId }, "WhatsApp webhook verify token mismatch");
        res.status(403).send("Verify token mismatch");
        return;
      }

      webhookLogger.info({ gatewayId }, "WhatsApp webhook verified successfully");
      res.status(200).send(challenge);
    } catch (error) {
      webhookLogger.error({ gatewayId, error }, "Error verifying WhatsApp webhook");
      res.status(500).send("Internal server error");
    }
  },
);

/**
 * Handle WhatsApp Cloud API webhook events
 *
 * POST /webhooks/whatsapp/:gatewayId
 *
 * Meta sends:
 * 1. Message events (text, image, document, audio, video, location, contacts, reaction, interactive)
 * 2. Status updates (sent, delivered, read, failed)
 *
 * Payload structure: { object: "whatsapp_business_account", entry: [{ changes: [{ value: { messages, statuses } }] }] }
 *
 * We verify HMAC-SHA256 signature via X-Hub-Signature-256 header,
 * then route events to the plugin system.
 */
webhookRouter.post(
  "/whatsapp/:gatewayId",
  async (req: Request<GatewayParams>, res: Response) => {
    const { gatewayId } = req.params;

    // Rate limit
    try {
      await whatsAppWebhookRateLimiter.consume(gatewayId);
    } catch (err) {
      if (err instanceof RateLimiterRes) {
        webhookLogger.warn({ gatewayId }, "WhatsApp webhook rate limit exceeded");
        res.status(429).json({ error: "Too many requests" });
        return;
      }
      // Redis error — fail open
    }

    try {
      // Find the gateway
      const gateway = await prisma.gateway.findUnique({
        where: { id: gatewayId },
        select: {
          id: true,
          type: true,
          status: true,
          credentialsEnc: true,
          config: true,
          userId: true,
          organizationId: true,
          mode: true,
        },
      });

      if (!gateway) {
        webhookLogger.warn({ gatewayId }, "WhatsApp webhook for unknown gateway");
        res.status(404).json({ error: "Unknown gateway" });
        return;
      }

      if (gateway.type !== "WHATSAPP_BOT") {
        webhookLogger.warn({ gatewayId, type: gateway.type }, "Webhook to non-WhatsApp gateway");
        res.status(400).json({ error: "Not a WhatsApp gateway" });
        return;
      }

      // Decrypt credentials for signature verification
      const credentials = decryptJson<WhatsAppBotCredentials>(gateway.credentialsEnc);

      // Get raw body for signature verification
      const rawBody = typeof req.body === "string" ? req.body : JSON.stringify(req.body);

      // Verify HMAC-SHA256 signature
      const signature = req.headers["x-hub-signature-256"] as string;

      if (!signature) {
        webhookLogger.warn({ gatewayId }, "WhatsApp webhook missing signature header");
        res.status(401).json({ error: "Missing signature" });
        return;
      }

      const isValid = await verifyWhatsAppSignature(
        credentials.appSecret,
        signature,
        rawBody,
      );

      if (!isValid) {
        webhookLogger.warn({ gatewayId }, "WhatsApp webhook signature verification failed");
        res.status(401).json({ error: "Invalid signature" });
        return;
      }

      const payload = req.body as Record<string, unknown>;

      // Validate this is a WhatsApp business account notification
      if (payload.object !== "whatsapp_business_account") {
        webhookLogger.debug({ gatewayId, object: payload.object }, "Ignoring non-WhatsApp payload");
        res.status(200).json({ ok: true });
        return;
      }

      webhookLogger.info(
        { gatewayId },
        "Processing WhatsApp webhook",
      );

      // Route to plugin system (non-blocking)
      if (gateway.userId) {
        const executeGateway = async (gId: string, action: string, params: unknown) => {
          const provider = gatewayRegistry.get("WHATSAPP_BOT");
          const gw = await prisma.gateway.findUnique({ where: { id: gId } });
          if (!gw) throw new Error(`Gateway not found: ${gId}`);
          const creds = gatewayService.getDecryptedCredentials(gw);
          try {
            return await provider.execute(gId, action, params);
          } catch (execErr) {
            const msg = execErr instanceof Error ? execErr.message : "";
            if (msg.includes("not connected") || msg.includes("Not connected")) {
              await provider.connect(gId, creds, (gw.config as Record<string, unknown>) ?? {});
              return provider.execute(gId, action, params);
            }
            throw execErr;
          }
        };

        void (async () => {
          try {
            // Mode-based dispatch
            if (gateway.mode === "workflow") {
              // Workflow mode: only check workflow triggers
              interface WhatsAppPayload {
                entry?: Array<{
                  changes?: Array<{
                    value?: { messages?: Array<Record<string, unknown>> };
                  }>;
                }>;
              }
              const waPayload = payload as WhatsAppPayload;
              if (waPayload.entry) {
                for (const entry of waPayload.entry) {
                  for (const change of entry.changes ?? []) {
                    for (const msg of change.value?.messages ?? []) {
                      await checkWhatsAppMessageTrigger(
                        gatewayId,
                        gateway.userId,
                        gateway.organizationId ?? null,
                        msg as {
                          type?: string;
                          text?: { body?: string };
                          from?: string;
                          id?: string;
                          timestamp?: string;
                        },
                        msg
                      );
                    }
                  }
                }
              }
            } else {
              // Plugin mode: route directly to plugins
              const result = await handleWhatsAppWebhook(
                gatewayId,
                gateway.userId,
                gateway.organizationId ?? null,
                payload,
                executeGateway,
              );
              if (result.pluginsExecuted > 0) {
                webhookLogger.info(
                  { gatewayId, pluginsExecuted: result.pluginsExecuted, success: result.successCount, failures: result.failureCount },
                  "WhatsApp event routed to plugin",
                );
              }
            }
          } catch (err) {
            webhookLogger.error({ gatewayId, error: err instanceof Error ? err.message : String(err) }, "WhatsApp dispatch failed");
          }
        })();
      }

      // Respond 200 immediately — Meta requires fast responses
      res.status(200).json({ ok: true });

      // Update last activity timestamp (fire and forget)
      void prisma.gateway
        .update({
          where: { id: gatewayId },
          data: {
            lastConnectedAt: new Date(),
            status: "CONNECTED" as GatewayStatus,
          },
        })
        .catch((err: Error) => {
          webhookLogger.error({ gatewayId, err }, "Failed to update gateway timestamp");
        });
    } catch (error) {
      webhookLogger.error(
        { gatewayId, error },
        "Error processing WhatsApp webhook",
      );
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// ===========================================
// Workflow Webhook Trigger (Phase C)
// ===========================================

/**
 * POST /webhooks/workflow/:workflowId
 *
 * External services (Stripe, GitHub, etc.) can trigger a workflow directly
 * via this endpoint. The workflow must be WEBHOOK-triggered and active.
 */
webhookRouter.post(
  "/workflow/:workflowId",
  async (req: Request<{ workflowId: string }>, res: Response) => {
    const { workflowId } = req.params;

    try {
      const runId = await handleWebhookTrigger(workflowId, {
        method: req.method,
        headers: req.headers as Record<string, string>,
        body: req.body,
        query: req.query as Record<string, string>,
      });

      res.status(202).json({
        success: true,
        data: { runId },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to trigger workflow";
      webhookLogger.error({ workflowId, error: message }, "Workflow webhook trigger failed");
      res.status(400).json({
        success: false,
        error: { code: "TRIGGER_FAILED", message },
      });
    }
  }
);

// ===========================================
// Helper Functions
// ===========================================

/**
 * Extract useful info from a Telegram update
 */
function extractUpdateInfo(update: TelegramUpdate): {
  type: string;
  chatId?: number;
  userId?: number;
  text?: string;
} {
  if (update.message) {
    return {
      type: "message",
      chatId: update.message.chat.id,
      userId: update.message.from?.id,
      text: update.message.text,
    };
  }

  if (update.edited_message) {
    return {
      type: "edited_message",
      chatId: update.edited_message.chat.id,
      userId: update.edited_message.from?.id,
      text: update.edited_message.text,
    };
  }

  if (update.channel_post) {
    return {
      type: "channel_post",
      chatId: update.channel_post.chat.id,
      text: update.channel_post.text,
    };
  }

  if (update.edited_channel_post) {
    return {
      type: "edited_channel_post",
      chatId: update.edited_channel_post.chat.id,
      text: update.edited_channel_post.text,
    };
  }

  if (update.callback_query) {
    return {
      type: "callback_query",
      chatId: update.callback_query.message?.chat.id,
      userId: update.callback_query.from.id,
    };
  }

  if (update.my_chat_member) {
    return {
      type: "my_chat_member",
      chatId: update.my_chat_member.chat.id,
      userId: update.my_chat_member.from.id,
    };
  }

  if (update.chat_member) {
    return {
      type: "chat_member",
      chatId: update.chat_member.chat.id,
      userId: update.chat_member.from.id,
    };
  }

  if (update.inline_query) {
    return {
      type: "inline_query",
      userId: update.inline_query.from.id,
    };
  }

  if (update.chosen_inline_result) {
    return {
      type: "chosen_inline_result",
      userId: update.chosen_inline_result.from.id,
    };
  }

  if (update.poll) {
    return {
      type: "poll",
    };
  }

  if (update.poll_answer) {
    return {
      type: "poll_answer",
      userId: update.poll_answer.user.id,
    };
  }

  return { type: "unknown" };
}
