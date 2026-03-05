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
import { gatewayRegistry, gatewayService } from "@/modules/gateway";
import { gatewayChatService } from "@/modules/gateway/gateway-chats.service";
import { handleCustomGatewayWebhook, handleTelegramWebhook } from "@/modules/plugin/plugin.events";
import type { ApiResponse } from "@/shared/types";

import { createRateLimiter } from "../middleware/rate-limit";

// ===========================================
// Custom Gateway Rate Limiter
// ===========================================

/**
 * Per-gateway rate limiter for custom gateway webhooks.
 * 60 requests per minute per gatewayId, block for 60s if exceeded.
 */
const customGatewayRateLimiter = createRateLimiter({
  keyPrefix: "webhook-custom",
  points: 60,
  duration: 60,
  blockDuration: 60,
});

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

        void handleTelegramWebhook(
          gatewayId,
          gateway.userId,
          gateway.organizationId ?? null,
          update,
          executeGateway
        ).then((result) => {
          if (result.pluginsExecuted > 0) {
            webhookLogger.info(
              { gatewayId, pluginsExecuted: result.pluginsExecuted, success: result.successCount, failures: result.failureCount },
              'Webhook routed to plugins',
            );
          }
        }).catch((err: Error) => {
          webhookLogger.error({ gatewayId, error: err.message }, 'Plugin routing failed');
        });
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
// Custom Gateway Webhook (unified — same gateway table)
// ===========================================

/**
 * Handle custom gateway incoming webhook
 *
 * POST /webhooks/custom/:gatewayId
 *
 * gatewayId is the gateway.id for a CUSTOM_GATEWAY-type row in the gateways table.
 * External services POST here; we look up the gateway, decrypt credentials,
 * and route the event through the plugin execution pipeline.
 */
webhookRouter.post(
  "/custom/:gatewayId",
  async (req: Request<GatewayParams>, res: Response) => {
    const { gatewayId } = req.params;

    // ── Rate limit: 60 req/min per gatewayId ──
    try {
      await customGatewayRateLimiter.consume(gatewayId);
    } catch {
      webhookLogger.warn({ gatewayId }, "Custom gateway webhook rate limit exceeded");
      res.status(429).json({ success: false, error: "Too many requests. Try again later." });
      return;
    }

    try {
      const gateway = await prisma.gateway.findUnique({
        where: { id: gatewayId },
        select: {
          id: true,
          type: true,
          status: true,
          credentialsEnc: true,
          metadata: true,
          userId: true,
          organizationId: true,
        },
      });

      if (!gateway || gateway.type !== "CUSTOM_GATEWAY") {
        res.status(404).json({ success: false, error: "Gateway not found" });
        return;
      }

      if (gateway.status !== "CONNECTED") {
        res.status(503).json({ success: false, error: "Gateway not active" });
        return;
      }

      // Decrypt stored credentials (same AES-256-GCM as Telegram bots)
      const credentials = decryptJson<Record<string, string>>(gateway.credentialsEnc);

      // ── Optional auth token verification ──
      // If the gateway has an `_authToken` credential key, verify the
      // incoming Authorization: Bearer header matches before proceeding.
      if (credentials._authToken) {
        const authHeader = req.headers.authorization;
        const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

        if (!bearerToken || bearerToken !== credentials._authToken) {
          webhookLogger.warn({ gatewayId }, "Custom gateway webhook auth token mismatch");
          res.status(401).json({ success: false, error: "Unauthorized" });
          return;
        }
      }

      // Build the inbound payload that plugins will receive
      const inboundPayload = {
        method: req.method,
        headers: req.headers as Record<string, string>,
        body: req.body as unknown,
        query: req.query as Record<string, string>,
      };

      // Route to plugins via the shared event system (non-blocking)
      void handleCustomGatewayWebhook(
        gateway.id,
        gateway.userId,
        gateway.organizationId,
        inboundPayload,
        credentials as Record<string, string>,
      ).then((result) => {
        if (result.pluginsExecuted > 0) {
          webhookLogger.info(
            { gatewayId, pluginsExecuted: result.pluginsExecuted, success: result.successCount, failures: result.failureCount },
            "Custom gateway webhook routed to plugins",
          );
        }
      }).catch((err: Error) => {
        webhookLogger.error({ gatewayId, error: err.message }, "Custom gateway plugin routing failed");
      });

      // Update last activity timestamp (fire and forget)
      // Merge into existing metadata so we don't overwrite webhookUrl / credentialKeys
      const existingMeta = (gateway.metadata ?? {}) as Record<string, unknown>;
      void prisma.gateway
        .update({
          where: { id: gatewayId },
          data: {
            lastConnectedAt: new Date(),
            metadata: { ...existingMeta, lastDeliveredAt: new Date().toISOString() },
          },
        })
        .catch((err: Error) => {
          webhookLogger.error({ gatewayId, err }, "Failed to update gateway timestamp");
        });

      // Return 200 immediately — plugins run asynchronously
      res.status(200).json({ success: true, data: { received: true } });
    } catch (err) {
      webhookLogger.error({ gatewayId, error: (err as Error).message }, "Custom gateway webhook error");
      res.status(502).json({ success: false, error: "Failed to deliver webhook" });
    }
  }
);

/**
 * Custom gateway health / verification check
 *
 * GET /webhooks/custom/:gatewayId
 *
 * Some external services (e.g. Stripe, GitHub) send a GET to verify the URL.
 */
webhookRouter.get(
  "/custom/:gatewayId",
  async (req: Request<GatewayParams>, res: Response) => {
    const { gatewayId } = req.params;

    const gateway = await prisma.gateway.findUnique({
      where: { id: gatewayId },
      select: { id: true, name: true, type: true, status: true },
    });

    if (!gateway || gateway.type !== "CUSTOM_GATEWAY") {
      res.status(404).json({ success: false, error: "Gateway not found" });
      return;
    }

    res.json({
      success: true,
      data: {
        id: gateway.id,
        name: gateway.name,
        active: gateway.status === "CONNECTED",
      },
    });
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
