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

import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import type { ApiResponse } from "@/shared/types";

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
 * Telegram Update object - the main payload from webhooks
 */
interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  channel_post?: TelegramMessage;
  edited_channel_post?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
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

      // TODO: Phase 3 - Route to plugin system
      // For now, just acknowledge receipt
      // await pluginRouter.processUpdate(gateway, update);

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

  return { type: "unknown" };
}
