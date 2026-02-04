/**
 * BYOK AI Metrics Service
 *
 * Display-only usage metrics for BYOK (Bring Your Own Key) AI requests.
 * This is a SIMPLE service - NO plan limits, NO enforcement, just display.
 *
 * BYOK users pay their provider directly, so we don't enforce limits.
 * This service just helps users see their usage for informational purposes.
 *
 * This service is INDEPENDENT from 2Bot AI metrics.
 *
 * @module modules/gateway/ai-metrics.service
 */

import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { getCurrentBillingPeriod } from "./ai-usage.service";

const log = logger.child({ module: "byok-metrics" });

// ===========================================
// Types
// ===========================================

/**
 * Token usage result (display only, no limits)
 */
export interface BYOKTokenUsage {
  /** Current billing period (YYYY-MM) */
  period: string;
  /** Tokens used this period */
  used: number;
  /** No limit for BYOK - user pays provider directly */
  limit: null;
  /** Display formatted */
  formatted: {
    used: string;
    limit: string;
  };
}

/**
 * Token breakdown by capability type
 */
export interface BYOKTokenBreakdown {
  "text-generation": number;
  "text-embedding": number;
  "image-understanding": number;
  total: number;
}

// ===========================================
// BYOK Metrics Service
// ===========================================

class BYOKMetricsService {
  /**
   * Get BYOK token usage for a user (display only)
   * No limits enforced - user pays their provider directly
   */
  async getTokenUsage(userId: string, organizationId?: string): Promise<BYOKTokenUsage> {
    const period = getCurrentBillingPeriod();

    const usage = await this.getMonthlyTokens(userId, period, organizationId);

    return {
      period,
      used: usage,
      limit: null, // BYOK has no platform limits
      formatted: {
        used: this.formatTokens(usage),
        limit: "No limit (BYOK)",
      },
    };
  }

  /**
   * Get monthly BYOK token usage from AIUsage table
   */
  async getMonthlyTokens(
    userId: string,
    period?: string,
    organizationId?: string
  ): Promise<number> {
    const billingPeriod = period || getCurrentBillingPeriod();

    const where = {
      billingPeriod,
      source: "byok" as const, // BYOK only
      ...(organizationId ? { organizationId } : { userId }),
    };

    const result = await prisma.aIUsage.aggregate({
      where,
      _sum: {
        totalTokens: true,
      },
    });

    return result._sum.totalTokens || 0;
  }

  /**
   * Get BYOK token breakdown by capability type
   */
  async getTokenBreakdown(
    userId: string,
    period?: string,
    organizationId?: string
  ): Promise<BYOKTokenBreakdown> {
    const billingPeriod = period || getCurrentBillingPeriod();

    const stats = await prisma.aIUsage.groupBy({
      by: ["capability"],
      where: {
        ...(organizationId ? { organizationId } : { userId }),
        billingPeriod,
        source: "byok",
        capability: { in: ["text-generation", "text-embedding", "image-understanding"] },
      },
      _sum: {
        totalTokens: true,
      },
    });

    const breakdown: BYOKTokenBreakdown = {
      "text-generation": 0,
      "text-embedding": 0,
      "image-understanding": 0,
      total: 0,
    };

    for (const stat of stats) {
      const tokens = stat._sum.totalTokens || 0;
      const capability = stat.capability as keyof Omit<BYOKTokenBreakdown, "total">;
      if (capability in breakdown) {
        breakdown[capability] = tokens;
      }
      breakdown.total += tokens;
    }

    return breakdown;
  }

  /**
   * Get BYOK usage summary for a gateway
   */
  async getGatewayMetrics(
    gatewayId: string,
    period?: string
  ): Promise<{
    period: string;
    requests: number;
    tokens: number;
    avgTokensPerRequest: number;
  }> {
    const billingPeriod = period || getCurrentBillingPeriod();

    const usage = await prisma.aIUsage.aggregate({
      where: {
        gatewayId,
        billingPeriod,
        source: "byok",
      },
      _count: { id: true },
      _sum: { totalTokens: true },
      _avg: { totalTokens: true },
    });

    return {
      period: billingPeriod,
      requests: usage._count.id,
      tokens: usage._sum.totalTokens || 0,
      avgTokensPerRequest: Math.round(usage._avg.totalTokens || 0),
    };
  }

  // ===========================================
  // Formatting Helpers
  // ===========================================

  /**
   * Format tokens for display (e.g., 1500000 -> "1.5M")
   */
  formatTokens(tokens: number): string {
    if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(1)}M`;
    if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}K`;
    return tokens.toString();
  }

  /**
   * Format tokens with full number (e.g., "1.5M (1,500,000)")
   */
  formatTokensFull(tokens: number): string {
    const formatted = this.formatTokens(tokens);
    const full = tokens.toLocaleString();
    return `${formatted} (${full})`;
  }

  /**
   * Calculate token estimate for a message
   * Rough estimate: 1 token ≈ 4 characters
   */
  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}

// ===========================================
// Singleton Export
// ===========================================

export const byokMetricsService = new BYOKMetricsService();
