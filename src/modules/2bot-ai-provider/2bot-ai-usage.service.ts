/**
 * 2Bot AI Usage Service
 *
 * Records usage metrics AND credits for 2Bot AI platform requests.
 * This is a COMPLEX service - handles metrics, credits, billing integration.
 *
 * 2Bot AI is the platform's managed AI service where users pay with credits.
 * This service tracks usage for billing, analytics, and budget enforcement.
 *
 * This service is INDEPENDENT from BYOK usage tracking.
 *
 * @module modules/2bot-ai-provider/2bot-ai-usage.service
 */

import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import type { AICapability } from "./types";

const log = logger.child({ module: "2bot-ai-usage" });

// ===========================================
// Types
// ===========================================

// Re-export AICapability for convenience
export type { AICapability } from "./types";

/**
 * Base usage data for 2Bot AI tracking
 */
export interface TwoBotAIUsageData {
  userId: string;
  organizationId?: string;
  departmentId?: string; // For budget enforcement
  gatewayId?: string | null;
  /** AI capability (universal naming) */
  capability: AICapability;
  model: string;
  requestId?: string;
  durationMs?: number;
  source?: "2bot"; // Always "2bot" for this service, optional for backwards compat
}

/**
 * Text generation/embedding usage (token-based)
 */
export interface TwoBotTextGenerationUsageData extends TwoBotAIUsageData {
  capability: "text-generation" | "text-embedding" | "image-understanding";
  inputTokens: number;
  outputTokens: number;
}

/**
 * Image generation usage
 */
export interface TwoBotImageGenerationUsageData extends TwoBotAIUsageData {
  capability: "image-generation";
  imageCount: number;
}

/**
 * Speech synthesis usage
 */
export interface TwoBotSpeechSynthesisUsageData extends TwoBotAIUsageData {
  capability: "speech-synthesis";
  characterCount: number;
}

/**
 * Speech recognition usage
 */
export interface TwoBotSpeechRecognitionUsageData extends TwoBotAIUsageData {
  capability: "speech-recognition";
  audioSeconds: number;
}

/**
 * Union of all 2Bot AI usage data types
 */
export type RecordTwoBotUsageData =
  | TwoBotTextGenerationUsageData
  | TwoBotImageGenerationUsageData
  | TwoBotSpeechSynthesisUsageData
  | TwoBotSpeechRecognitionUsageData;

/**
 * 2Bot AI usage stats response (includes credits)
 */
export interface TwoBotAIUsageStats {
  period: string;
  totals: {
    requests: number;
    tokens: number;
    images: number;
    characters: number;
    audioSeconds: number;
    credits: number; // 2Bot AI tracks credits
  };
  /** Usage grouped by capability (universal naming) */
  byCapability: Array<{
    capability: AICapability;
    requests: number;
    credits: number;
  }>;
  byModel: Array<{
    model: string;
    requests: number;
    credits: number;
  }>;
  byDay: Array<{
    date: string;
    requests: number;
    credits: number;
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
// 2Bot AI Usage Service
// ===========================================

class TwoBotAIUsageService {
  /**
   * Record 2Bot AI usage with credits
   *
   * @param data - Usage data to record
   * @param creditsUsed - Credits charged for this request
   * @returns Created usage record ID
   */
  async recordUsage(data: RecordTwoBotUsageData, creditsUsed: number): Promise<string> {
    const billingPeriod = getCurrentBillingPeriod();

    // Build usage record
    const usageData: Parameters<typeof prisma.aIUsage.create>[0]["data"] = {
      userId: data.userId,
      organizationId: data.organizationId,
      departmentId: data.departmentId,
      gatewayId: data.gatewayId ?? undefined,
      capability: data.capability, // Universal capability naming
      model: data.model,
      source: "2bot", // Always 2Bot for this service
      billingPeriod,
      requestId: data.requestId,
      durationMs: data.durationMs,
      creditsUsed, // 2Bot AI tracks credits
    };

    // Add capability-specific fields
    if (data.capability === "text-generation" || data.capability === "text-embedding" || data.capability === "image-understanding") {
      const textGenData = data as TwoBotTextGenerationUsageData;
      usageData.inputTokens = textGenData.inputTokens;
      usageData.outputTokens = textGenData.outputTokens;
      usageData.totalTokens = textGenData.inputTokens + textGenData.outputTokens;
    } else if (data.capability === "image-generation") {
      const imageGenData = data as TwoBotImageGenerationUsageData;
      usageData.imageCount = imageGenData.imageCount;
    } else if (data.capability === "speech-synthesis") {
      const speechSynthData = data as TwoBotSpeechSynthesisUsageData;
      usageData.characterCount = speechSynthData.characterCount;
    } else if (data.capability === "speech-recognition") {
      const speechRecData = data as TwoBotSpeechRecognitionUsageData;
      usageData.audioSeconds = speechRecData.audioSeconds;
    }

    const usage = await prisma.aIUsage.create({
      data: usageData,
    });

    log.debug(
      {
        usageId: usage.id,
        capability: data.capability,
        model: data.model,
        creditsUsed,
        departmentId: data.departmentId,
      },
      "Recorded 2Bot AI usage"
    );

    return usage.id;
  }

  /**
   * Get 2Bot AI usage statistics for a user
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
  ): Promise<TwoBotAIUsageStats> {
    const period = options.period || getCurrentBillingPeriod();

    // Build where clause - 2Bot AI only
    const where = {
      billingPeriod: period,
      source: "2bot" as const,
      ...(options.organizationId
        ? { organizationId: options.organizationId }
        : { userId }),
    };

    // Get all 2Bot AI usage records for the period
    const usageRecords = await prisma.aIUsage.findMany({
      where,
      orderBy: { createdAt: "asc" },
    });

    // Calculate totals (including credits)
    const totals = {
      requests: usageRecords.length,
      tokens: 0,
      images: 0,
      characters: 0,
      audioSeconds: 0,
      credits: 0,
    };

    // Track by capability (universal naming)
    const byCapability: Partial<Record<AICapability, { requests: number; credits: number }>> = {
      "text-generation": { requests: 0, credits: 0 },
      "image-generation": { requests: 0, credits: 0 },
      "speech-synthesis": { requests: 0, credits: 0 },
      "speech-recognition": { requests: 0, credits: 0 },
      "text-embedding": { requests: 0, credits: 0 },
      "image-understanding": { requests: 0, credits: 0 },
    };

    const byModel: Record<string, { requests: number; credits: number }> = {};
    const byDay: Record<string, { requests: number; credits: number }> = {};

    for (const record of usageRecords) {
      // Totals
      totals.tokens += record.totalTokens || 0;
      totals.images += record.imageCount || 0;
      totals.characters += record.characterCount || 0;
      totals.audioSeconds += record.audioSeconds || 0;
      totals.credits += record.creditsUsed;

      // By capability (universal naming) - now read directly from record
      const capability = record.capability as AICapability;
      if (byCapability[capability]) {
        byCapability[capability].requests++;
        byCapability[capability].credits += record.creditsUsed;
      }

      // By model (with credits)
      const model = record.model;
      if (!byModel[model]) {
        byModel[model] = { requests: 0, credits: 0 };
      }
      byModel[model].requests++;
      byModel[model].credits += record.creditsUsed;

      // By day (with credits)
      const day = record.createdAt.toISOString().split("T")[0]!;
      if (!byDay[day]) {
        byDay[day] = { requests: 0, credits: 0 };
      }
      byDay[day].requests++;
      byDay[day].credits += record.creditsUsed;
    }

    return {
      period,
      totals,
      byCapability: Object.entries(byCapability)
        .filter(([, stats]) => stats.requests > 0) // Only include capabilities with usage
        .map(([capability, stats]) => ({
          capability: capability as AICapability,
          ...stats,
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
   * Get 2Bot AI usage for an organization (includes member breakdown)
   */
  async getOrgUsageStats(
    organizationId: string,
    options: {
      period?: string;
    } = {}
  ): Promise<TwoBotAIUsageStats & { byMember?: Array<{ userId: string; credits: number }> }> {
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
        source: "2bot",
      },
      _sum: { creditsUsed: true },
    });

    const byMember = memberUsage.map((m) => ({
      userId: m.userId,
      credits: m._sum.creditsUsed || 0,
    }));

    return {
      ...stats,
      byMember,
    };
  }

  /**
   * Get 2Bot AI usage by department (for budget tracking)
   */
  async getDeptUsageStats(
    departmentId: string,
    options: {
      period?: string;
    } = {}
  ): Promise<{
    period: string;
    totalCredits: number;
    byMember: Array<{ userId: string; credits: number }>;
  }> {
    const period = options.period || getCurrentBillingPeriod();

    const [totalUsage, memberUsage] = await Promise.all([
      prisma.aIUsage.aggregate({
        where: {
          departmentId,
          billingPeriod: period,
          source: "2bot",
        },
        _sum: { creditsUsed: true },
      }),
      prisma.aIUsage.groupBy({
        by: ["userId"],
        where: {
          departmentId,
          billingPeriod: period,
          source: "2bot",
        },
        _sum: { creditsUsed: true },
      }),
    ]);

    return {
      period,
      totalCredits: totalUsage._sum.creditsUsed || 0,
      byMember: memberUsage.map((m) => ({
        userId: m.userId,
        credits: m._sum.creditsUsed || 0,
      })),
    };
  }

  /**
   * Get aggregated 2Bot AI usage across all users (admin only)
   */
  async getAggregatedUsage(period?: string): Promise<{
    period: string;
    totalRequests: number;
    totalCredits: number;
    byCapability: Array<{ capability: string; requests: number; credits: number }>;
    byModel: Array<{ model: string; requests: number; credits: number }>;
  }> {
    const billingPeriod = period || getCurrentBillingPeriod();

    const [totals, capabilityStats, modelStats] = await Promise.all([
      prisma.aIUsage.aggregate({
        where: { billingPeriod, source: "2bot" },
        _count: { id: true },
        _sum: { creditsUsed: true },
      }),
      prisma.aIUsage.groupBy({
        by: ["capability"],
        where: { billingPeriod, source: "2bot" },
        _count: { id: true },
        _sum: { creditsUsed: true },
      }),
      prisma.aIUsage.groupBy({
        by: ["model"],
        where: { billingPeriod, source: "2bot" },
        _count: { id: true },
        _sum: { creditsUsed: true },
        orderBy: { _sum: { creditsUsed: "desc" } },
        take: 20, // Top 20 models
      }),
    ]);

    return {
      period: billingPeriod,
      totalRequests: totals._count.id,
      totalCredits: totals._sum.creditsUsed || 0,
      byCapability: capabilityStats.map((stat) => ({
        capability: stat.capability,
        requests: stat._count.id,
        credits: stat._sum.creditsUsed || 0,
      })),
      byModel: modelStats.map((stat) => ({
        model: stat.model,
        requests: stat._count.id,
        credits: stat._sum.creditsUsed || 0,
      })),
    };
  }

  /**
   * Get credit usage for a user in current period
   */
  async getUserCreditUsage(userId: string, period?: string): Promise<number> {
    const billingPeriod = period || getCurrentBillingPeriod();

    const result = await prisma.aIUsage.aggregate({
      where: {
        userId,
        billingPeriod,
        source: "2bot",
      },
      _sum: { creditsUsed: true },
    });

    return result._sum.creditsUsed || 0;
  }

  /**
   * Get credit usage for an organization in current period
   */
  async getOrgCreditUsage(organizationId: string, period?: string): Promise<number> {
    const billingPeriod = period || getCurrentBillingPeriod();

    const result = await prisma.aIUsage.aggregate({
      where: {
        organizationId,
        billingPeriod,
        source: "2bot",
      },
      _sum: { creditsUsed: true },
    });

    return result._sum.creditsUsed || 0;
  }
}

// ===========================================
// Singleton Export
// ===========================================

export const twoBotAIUsageService = new TwoBotAIUsageService();
