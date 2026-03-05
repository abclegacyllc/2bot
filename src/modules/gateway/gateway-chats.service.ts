/**
 * Gateway Chat Tracking Service (Phase 7)
 *
 * Tracks which Telegram chats a bot has been added to / removed from.
 * Powered by the `my_chat_member` webhook event.
 *
 * @module modules/gateway/gateway-chats.service
 */

import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const chatLogger = logger.child({ module: "gateway-chats" });

/**
 * Payload from Telegram's `my_chat_member` update
 */
export interface ChatMemberUpdate {
  gatewayId: string;
  chatId: number;
  chatType: string;
  chatTitle?: string;
  chatUsername?: string;
  newStatus: string; // "member" | "administrator" | "kicked" | "left" | "creator" | "restricted"
}

/**
 * Active chat summary returned by getActiveChats
 */
export interface ActiveChat {
  id: string;
  chatId: bigint;
  chatType: string;
  chatTitle: string | null;
  chatUsername: string | null;
  memberCount: number | null;
  botStatus: string;
  joinedAt: Date;
}

/**
 * Chat statistics for a gateway
 */
export interface ChatStats {
  totalJoined: number;
  activeChats: number;
  byType: Record<string, number>;
}

class GatewayChatService {
  /**
   * Record a bot being added to (or status changed in) a chat.
   *
   * Uses upsert so duplicate `my_chat_member` events are idempotent.
   */
  async recordChatJoin(update: ChatMemberUpdate): Promise<void> {
    try {
      await prisma.gatewayChat.upsert({
        where: {
          gatewayId_chatId: {
            gatewayId: update.gatewayId,
            chatId: BigInt(update.chatId),
          },
        },
        create: {
          gatewayId: update.gatewayId,
          chatId: BigInt(update.chatId),
          chatType: update.chatType,
          chatTitle: update.chatTitle ?? null,
          chatUsername: update.chatUsername ?? null,
          isActive: true,
          botStatus: update.newStatus,
        },
        update: {
          chatType: update.chatType,
          chatTitle: update.chatTitle ?? null,
          chatUsername: update.chatUsername ?? null,
          isActive: true,
          leftAt: null,
          botStatus: update.newStatus,
        },
      });

      chatLogger.info(
        { gatewayId: update.gatewayId, chatId: update.chatId, chatType: update.chatType },
        "Bot joined chat"
      );
    } catch (error) {
      chatLogger.error(
        { gatewayId: update.gatewayId, chatId: update.chatId, error: (error as Error).message },
        "Failed to record chat join"
      );
    }
  }

  /**
   * Record a bot leaving or being removed from a chat.
   */
  async recordChatLeave(update: ChatMemberUpdate): Promise<void> {
    try {
      await prisma.gatewayChat.upsert({
        where: {
          gatewayId_chatId: {
            gatewayId: update.gatewayId,
            chatId: BigInt(update.chatId),
          },
        },
        create: {
          gatewayId: update.gatewayId,
          chatId: BigInt(update.chatId),
          chatType: update.chatType,
          chatTitle: update.chatTitle ?? null,
          chatUsername: update.chatUsername ?? null,
          isActive: false,
          leftAt: new Date(),
          botStatus: update.newStatus,
        },
        update: {
          isActive: false,
          leftAt: new Date(),
          botStatus: update.newStatus,
        },
      });

      chatLogger.info(
        { gatewayId: update.gatewayId, chatId: update.chatId },
        "Bot left chat"
      );
    } catch (error) {
      chatLogger.error(
        { gatewayId: update.gatewayId, chatId: update.chatId, error: (error as Error).message },
        "Failed to record chat leave"
      );
    }
  }

  /**
   * Get all active chats for a gateway.
   */
  async getActiveChats(gatewayId: string): Promise<ActiveChat[]> {
    const chats = await prisma.gatewayChat.findMany({
      where: { gatewayId, isActive: true },
      orderBy: { joinedAt: "desc" },
      select: {
        id: true,
        chatId: true,
        chatType: true,
        chatTitle: true,
        chatUsername: true,
        memberCount: true,
        botStatus: true,
        joinedAt: true,
      },
    });

    return chats;
  }

  /**
   * Get chat statistics for a gateway.
   */
  async getChatStats(gatewayId: string): Promise<ChatStats> {
    const [totalJoined, activeChats, byTypeRaw] = await Promise.all([
      prisma.gatewayChat.count({ where: { gatewayId } }),
      prisma.gatewayChat.count({ where: { gatewayId, isActive: true } }),
      prisma.gatewayChat.groupBy({
        by: ["chatType"],
        where: { gatewayId, isActive: true },
        _count: true,
      }),
    ]);

    const byType: Record<string, number> = {};
    for (const row of byTypeRaw) {
      byType[row.chatType] = row._count;
    }

    return { totalJoined, activeChats, byType };
  }

  /**
   * Get all chats (active + inactive) for a gateway, with pagination.
   */
  async getAllChats(
    gatewayId: string,
    opts: { page?: number; limit?: number; activeOnly?: boolean } = {}
  ) {
    const page = opts.page ?? 1;
    const limit = Math.min(opts.limit ?? 50, 100);
    const skip = (page - 1) * limit;

    const where = {
      gatewayId,
      ...(opts.activeOnly ? { isActive: true } : {}),
    };

    const [chats, total] = await Promise.all([
      prisma.gatewayChat.findMany({
        where,
        orderBy: { joinedAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.gatewayChat.count({ where }),
    ]);

    return {
      chats: chats.map((c) => ({
        ...c,
        chatId: c.chatId.toString(), // BigInt → string for JSON serialization
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}

export const gatewayChatService = new GatewayChatService();
