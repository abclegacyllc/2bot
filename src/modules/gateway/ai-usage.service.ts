/**
 * BYOK AI Usage Service
 *
 * Records raw usage metrics for BYOK (Bring Your Own Key) AI requests.
 * This is a SIMPLE service - metrics only, NO credits, NO billing.
 *
 * Users using their own API keys get usage tracking for visibility,
 * but the actual costs go directly to their provider account.
 *
 * This service is INDEPENDENT from 2Bot AI usage tracking.
 *
 * @module modules/gateway/ai-usage.service
 */

import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import type { AICapability } from "@/modules/2bot-ai-provider";

const log = logger.child({ module: "byok-usage" });

// ===========================================
// Types
// ===========================================

// Re-export AICapability for convenience
export type { AICapability } from "@/modules/2bot-ai-provider";

/**
 * Base usage data for BYOK tracking
 */
export interface BYOKUsageData {
  userId: string;
  organizationId?: string;
  gatewayId?: string | null;
  /** AI capability (universal naming) */
  capability: AICapability;
  model: string;
  requestId?: string;
  durationMs?: number;
}

/**
 * Chat/embedding usage (token-based)
 */
export interface BYOKChatUsageData extends BYOKUsageData {
  capability: "text-generation" | "text-embedding" | "image-understanding";
  inputTokens: number;
  outputTokens: number;
}

/**
 * Image generation usage
 */
export interface BYOKImageUsageData extends BYOKUsageData {
  capability: "image-generation";
  imageCount: number;
}

/**
 * Text-to-speech usage
 */
export interface BYOKTTSUsageData extends BYOKUsageData {
  capability: "speech-synthesis";
  characterCount: number;
}

/**
 * Speech-to-text usage
 */
export interface BYOKSTTUsageData extends BYOKUsageData {
  capability: "speech-recognition";
  audioSeconds: number;
}

/**
 * Union of all BYOK usage data types
 */
export type RecordBYOKUsageData =
  | BYOKChatUsageData
  | BYOKImageUsageData
  | BYOKTTSUsageData
  | BYOKSTTUsageData;

/**
 * BYOK usage stats response
 */
export interface BYOKUsageStats {
  period: string;
  totals: {
    requests: number;
    tokens: number;
    images: number;
    characters: number;
    audioSeconds: number;
  };
  /** Usage grouped by capability (universal naming) */
  byCapability: Array<{
    capability: AICapability;
    requests: number;
  }>;
  byModel: Array<{
    model: string;
    requests: number;
  }>;
  byDay: Array<{
    date: string;
    requests: number;
  }>;
}

// ===========================================
// Helper Functions
// ===========================================

/**
 * Get current billing period string (YYYY-MM format)
 */
export function getCurrentBillingPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Get billing period for a specific date
 */
export function getBillingPeriod(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

// ===========================================
// BYOK Usage Service
// ===========================================

class BYOKUsageService {
  /**
   * Record BYOK AI usage
   * Metrics only - no credits (user pays their provider directly)
   *
   * @param data - Usage data to record
   * @returns Created usage record ID
   */
  async recordUsage(data: RecordBYOKUsageData): Promise<string> {
    const billingPeriod = getCurrentBillingPeriod();

    // Build usage record
    const usageData: Parameters<typeof prisma.aIUsage.create>[0]["data"] = {
      userId: data.userId,
      organizationId: data.organizationId,
      gatewayId: data.gatewayId ?? undefined,
      capability: data.capability,
      model: data.model,
      source: "byok", // Always BYOK for this service
      billingPeriod,
      requestId: data.requestId,
      durationMs: data.durationMs,
      creditsUsed: 0, // BYOK never uses credits
    };

    // Add capability-specific fields
    if (data.capability === "text-generation" || data.capability === "text-embedding" || data.capability === "image-understanding") {
      const chatData = data as BYOKChatUsageData;
      usageData.inputTokens = chatData.inputTokens;
      usageData.outputTokens = chatData.outputTokens;
      usageData.totalTokens = chatData.inputTokens + chatData.outputTokens;
    } else if (data.capability === "image-generation") {
      const imageData = data as BYOKImageUsageData;
      usageData.imageCount = imageData.imageCount;
    } else if (data.capability === "speech-synthesis") {
      const ttsData = data as BYOKTTSUsageData;
      usageData.characterCount = ttsData.characterCount;
    } else if (data.capability === "speech-recognition") {
      const sttData = data as BYOKSTTUsageData;
      usageData.audioSeconds = sttData.audioSeconds;
    }

    const usage = await prisma.aIUsage.create({
      data: usageData,
    });

    log.debug(
      {
        usageId: usage.id,
        capability: data.capability,
        model: data.model,
        gatewayId: data.gatewayId,
      },
      "Recorded BYOK usage"
    );

    return usage.id;
  }

  /**
   * Get BYOK usage statistics for a user
   *
   * @param userId - User ID
   * @param options - Query options
   */
  async getUsageStats(
    userId: string,
    options: {
      period?: string;
      organizationId?: string;
    } = {}
  ): Promise<BYOKUsageStats> {
    const period = options.period || getCurrentBillingPeriod();

    // Build where clause - BYOK only
    const where = {
      billingPeriod: period,
      source: "byok" as const,
      ...(options.organizationId
        ? { organizationId: options.organizationId }
        : { userId }),
    };

    // Get all BYOK usage records for the period
    const usageRecords = await prisma.aIUsage.findMany({
      where,
      orderBy: { createdAt: "asc" },
    });

    // Calculate totals
    const totals = {
      requests: usageRecords.length,
      tokens: 0,
      images: 0,
      characters: 0,
      audioSeconds: 0,
    };

    // Track by capability (universal naming)
    const byCapability: Partial<Record<AICapability, { requests: number }>> = {
      "text-generation": { requests: 0 },
      "image-generation": { requests: 0 },
      "speech-synthesis": { requests: 0 },
      "speech-recognition": { requests: 0 },
      "text-embedding": { requests: 0 },
      "image-understanding": { requests: 0 },
    };

    const byModel: Record<string, { requests: number }> = {};
    const byDay: Record<string, { requests: number }> = {};

    for (const record of usageRecords) {
      // Totals
      totals.tokens += record.totalTokens || 0;
      totals.images += record.imageCount || 0;
      totals.characters += record.characterCount || 0;
      totals.audioSeconds += record.audioSeconds || 0;

      // By capability (universal naming) - read directly from record
      const capability = record.capability as AICapability;
      if (byCapability[capability]) {
        byCapability[capability]!.requests++;
      }

      // By model
      const model = record.model;
      if (!byModel[model]) {
        byModel[model] = { requests: 0 };
      }
      byModel[model].requests++;

      // By day
      const day = record.createdAt.toISOString().split("T")[0]!;
      if (!byDay[day]) {
        byDay[day] = { requests: 0 };
      }
      byDay[day].requests++;
    }

    return {
      period,
      totals,
      byCapability: Object.entries(byCapability)
        .filter(([, stats]) => stats && stats.requests > 0)
        .map(([capability, stats]) => ({
          capability: capability as AICapability,
          requests: stats!.requests,
        })),
      byModel: Object.entries(byModel).map(([model, stats]) => ({
        model,
        ...stats,
      })),
      byDay: Object.entries(byDay)
        .map(([date, stats]) => ({ date, ...stats }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    };
  }

  /**
   * Get BYOK usage for a specific gateway
   */
  async getGatewayUsage(
    gatewayId: string,
    period?: string
  ): Promise<{
    period: string;
    requests: number;
    tokens: number;
  }> {
    const billingPeriod = period || getCurrentBillingPeriod();

    const usage = await prisma.aIUsage.aggregate({
      where: {
        gatewayId,
        billingPeriod,
        source: "byok",
      },
      _count: { id: true },
      _sum: {
        totalTokens: true,
      },
    });

    return {
      period: billingPeriod,
      requests: usage._count.id,
      tokens: usage._sum.totalTokens || 0,
    };
  }

  /**
   * Get BYOK usage for an organization
   */
  async getOrgUsageStats(
    organizationId: string,
    options: {
      period?: string;
    } = {}
  ): Promise<BYOKUsageStats & { byMember?: Array<{ userId: string; requests: number }> }> {
    const period = options.period || getCurrentBillingPeriod();

    // Get base stats
    const stats = await this.getUsageStats("", {
      ...options,
      organizationId,
    });

    // Get per-member breakdown
    const memberUsage = await prisma.aIUsage.groupBy({
      by: ["userId"],
      where: {
        organizationId,
        billingPeriod: period,
        source: "byok",
      },
      _count: { id: true },
    });

    const byMember = memberUsage.map((m) => ({
      userId: m.userId,
      requests: m._count.id,
    }));

    return {
      ...stats,
      byMember,
    };
  }
}

// ===========================================
// Singleton Export
// ===========================================

export const byokUsageService = new BYOKUsageService();
