/**
 * 2Bot AI Metrics Service
 *
 * Plan limits, budget enforcement, and usage analytics for 2Bot AI.
 * This is a COMPLEX service - handles plan limits, credit budgets, enforcement.
 *
 * 2Bot AI is the platform's managed AI service where users pay with credits.
 * This service enforces plan limits and provides detailed analytics.
 *
 * This service is INDEPENDENT from BYOK metrics.
 *
 * @module modules/2bot-ai-provider/2bot-ai-metrics.service
 */

import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { ORG_PLAN_LIMITS, type OrgPlanType } from "@/shared/constants/org-plans";
import { PLAN_LIMITS, type PlanType } from "@/shared/constants/plans";
import { getCurrentBillingPeriod } from "./2bot-ai-usage.service";

const log = logger.child({ module: "2bot-ai-metrics" });

// ===========================================
// Types
// ===========================================

/**
 * Token usage result with plan limits
 */
export interface TwoBotTokenUsageResult {
  /** Current billing period (YYYY-MM) */
  period: string;
  /** Tokens used this period */
  used: number;
  /** Token limit from plan (-1 = unlimited) */
  limit: number;
  /** Tokens remaining (null if unlimited) */
  remaining: number | null;
  /** Percentage used (0-100, null if unlimited) */
  percentUsed: number | null;
  /** Whether user has exceeded limit */
  exceeded: boolean;
  /** Plan providing this limit */
  plan: string;
  /** Source of limit (user plan or org plan) */
  source: "user" | "organization";
}

/**
 * Plan limit check result
 */
export interface TwoBotPlanLimitCheckResult {
  /** Whether user can make request */
  allowed: boolean;
  /** Has enough tokens in plan */
  hasCapacity: boolean;
  /** Current usage */
  used: number;
  /** Limit from plan */
  limit: number;
  /** Remaining tokens */
  remaining: number | null;
  /** Required tokens for this request */
  required: number;
  /** Error message if not allowed */
  message?: string;
}

/**
 * Token breakdown by capability type
 */
export interface TwoBotTokenBreakdown {
  "text-generation": number;
  "text-embedding": number;
  "image-understanding": number;
  total: number;
}

/**
 * Credit usage breakdown by capability
 */
export interface TwoBotCreditBreakdown {
  "text-generation": number;
  "image-generation": number;
  "speech-synthesis": number;
  "speech-recognition": number;
  "text-embedding": number;
  "image-understanding": number;
  total: number;
}

// ===========================================
// 2Bot AI Metrics Service
// ===========================================

class TwoBotAIMetricsService {
  // ===========================================
  // Token Usage & Limits
  // ===========================================

  /**
   * Get 2Bot AI token usage for a user
   * Checks both individual plan and organization limits
   */
  async getTokenUsage(userId: string): Promise<TwoBotTokenUsageResult> {
    const period = getCurrentBillingPeriod();

    // Get user with their plan and organization
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        plan: true,
        memberships: {
          where: { status: "ACTIVE" },
          include: {
            organization: {
              select: {
                id: true,
                plan: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new Error("User not found");
    }

    // Get 2Bot AI token usage for this period
    const usage = await this.getMonthlyTokens(userId, period);

    // Determine which limit applies
    const userPlan = (user.plan || "FREE") as PlanType;
    const userLimit = PLAN_LIMITS[userPlan]?.creditsPerMonth ?? 100;

    // Check if user is in an organization with a higher limit
    let effectiveLimit = userLimit;
    let effectivePlan: string = userPlan;
    let source: "user" | "organization" = "user";

    for (const membership of user.memberships) {
      const orgPlan = membership.organization.plan as OrgPlanType;
      const orgLimits = ORG_PLAN_LIMITS[orgPlan];

      if (orgLimits?.sharedCreditsPerMonth) {
        // Organization has shared token pool
        // For now, use org limit if higher than user limit
        if (
          orgLimits.sharedCreditsPerMonth === -1 ||
          (userLimit !== -1 && orgLimits.sharedCreditsPerMonth > userLimit)
        ) {
          effectiveLimit = orgLimits.sharedCreditsPerMonth;
          effectivePlan = orgPlan;
          source = "organization";
        }
      }
    }

    // Calculate remaining and percentage
    const remaining = effectiveLimit === -1 ? null : Math.max(0, effectiveLimit - usage);
    const percentUsed = effectiveLimit === -1 ? null : Math.min(100, (usage / effectiveLimit) * 100);
    const exceeded = effectiveLimit !== -1 && usage >= effectiveLimit;

    return {
      period,
      used: usage,
      limit: effectiveLimit,
      remaining,
      percentUsed,
      exceeded,
      plan: effectivePlan,
      source,
    };
  }

  /**
   * Check if user can make a request with estimated tokens
   * This checks against PLAN limits (not credits)
   */
  async checkPlanLimit(
    userId: string,
    estimatedTokens: number = 0
  ): Promise<TwoBotPlanLimitCheckResult> {
    const usage = await this.getTokenUsage(userId);

    // Unlimited plan
    if (usage.limit === -1) {
      return {
        allowed: true,
        hasCapacity: true,
        used: usage.used,
        limit: usage.limit,
        remaining: null,
        required: estimatedTokens,
      };
    }

    // Check if adding estimated tokens would exceed limit
    const wouldExceed = usage.used + estimatedTokens > usage.limit;

    if (wouldExceed) {
      return {
        allowed: false,
        hasCapacity: false,
        used: usage.used,
        limit: usage.limit,
        remaining: usage.remaining,
        required: estimatedTokens,
        message: `Monthly token limit exceeded. Used: ${this.formatTokens(usage.used)}, Limit: ${this.formatTokens(usage.limit)}. Upgrade your plan for more tokens.`,
      };
    }

    return {
      allowed: true,
      hasCapacity: true,
      used: usage.used,
      limit: usage.limit,
      remaining: usage.remaining,
      required: estimatedTokens,
    };
  }

  /**
   * Get monthly 2Bot AI token usage from AIUsage table
   */
  async getMonthlyTokens(
    userId: string,
    period?: string,
    organizationId?: string
  ): Promise<number> {
    const billingPeriod = period || getCurrentBillingPeriod();

    const where = {
      billingPeriod,
      source: "2bot" as const, // 2Bot AI only
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
   * Get 2Bot AI token breakdown by capability type
   */
  async getTokenBreakdown(userId: string, period?: string): Promise<TwoBotTokenBreakdown> {
    const billingPeriod = period || getCurrentBillingPeriod();

    const stats = await prisma.aIUsage.groupBy({
      by: ["capability"],
      where: {
        userId,
        billingPeriod,
        source: "2bot",
        capability: { in: ["text-generation", "text-embedding", "image-understanding"] },
      },
      _sum: {
        totalTokens: true,
      },
    });

    const breakdown: TwoBotTokenBreakdown = {
      "text-generation": 0,
      "text-embedding": 0,
      "image-understanding": 0,
      total: 0,
    };

    for (const stat of stats) {
      const tokens = stat._sum.totalTokens || 0;
      const capability = stat.capability as keyof Omit<TwoBotTokenBreakdown, "total">;
      if (capability in breakdown) {
        breakdown[capability] = tokens;
      }
      breakdown.total += tokens;
    }

    return breakdown;
  }

  /**
   * Get 2Bot AI credit breakdown by capability type
   */
  async getCreditBreakdown(
    userId: string,
    period?: string,
    organizationId?: string
  ): Promise<TwoBotCreditBreakdown> {
    const billingPeriod = period || getCurrentBillingPeriod();

    const stats = await prisma.aIUsage.groupBy({
      by: ["capability"],
      where: {
        ...(organizationId ? { organizationId } : { userId }),
        billingPeriod,
        source: "2bot",
      },
      _sum: {
        creditsUsed: true,
      },
    });

    const breakdown: TwoBotCreditBreakdown = {
      "text-generation": 0,
      "image-generation": 0,
      "speech-synthesis": 0,
      "speech-recognition": 0,
      "text-embedding": 0,
      "image-understanding": 0,
      total: 0,
    };

    for (const stat of stats) {
      const credits = stat._sum.creditsUsed || 0;
      const capability = stat.capability as keyof TwoBotCreditBreakdown;
      if (capability in breakdown) {
        breakdown[capability] = credits;
      }
      breakdown.total += credits;
    }

    return breakdown;
  }

  /**
   * Get organization 2Bot AI token usage (shared pool)
   */
  async getOrgTokenUsage(organizationId: string): Promise<TwoBotTokenUsageResult> {
    const period = getCurrentBillingPeriod();

    // Get organization plan
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        id: true,
        plan: true,
      },
    });

    if (!org) {
      throw new Error("Organization not found");
    }

    const orgPlan = (org.plan || "ORG_FREE") as OrgPlanType;
    const orgLimits = ORG_PLAN_LIMITS[orgPlan];
    const limit = orgLimits?.sharedCreditsPerMonth ?? 5000;

    // Get total 2Bot AI usage for all org members
    const usage = await this.getMonthlyTokens("", period, organizationId);

    const remaining = limit === -1 ? null : Math.max(0, limit - usage);
    const percentUsed = limit === -1 ? null : Math.min(100, (usage / limit) * 100);
    const exceeded = limit !== -1 && usage >= limit;

    return {
      period,
      used: usage,
      limit,
      remaining,
      percentUsed,
      exceeded,
      plan: orgPlan,
      source: "organization",
    };
  }

  /**
   * Get monthly credits used from 2Bot AI
   */
  async getMonthlyCredits(
    userId: string,
    period?: string,
    organizationId?: string
  ): Promise<number> {
    const billingPeriod = period || getCurrentBillingPeriod();

    const where = {
      billingPeriod,
      source: "2bot" as const,
      ...(organizationId ? { organizationId } : { userId }),
    };

    const result = await prisma.aIUsage.aggregate({
      where,
      _sum: {
        creditsUsed: true,
      },
    });

    return result._sum.creditsUsed || 0;
  }

  // ===========================================
  // Formatting Helpers
  // ===========================================

  /**
   * Format tokens for display (e.g., 1500000 -> "1.5M")
   */
  formatTokens(tokens: number): string {
    if (tokens === -1) return "Unlimited";
    if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(1)}M`;
    if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}K`;
    return tokens.toString();
  }

  /**
   * Format tokens with full number (e.g., "1.5M (1,500,000)")
   */
  formatTokensFull(tokens: number): string {
    if (tokens === -1) return "Unlimited";
    const formatted = this.formatTokens(tokens);
    const full = tokens.toLocaleString();
    return `${formatted} (${full})`;
  }

  /**
   * Format credits for display
   */
  formatCredits(credits: number): string {
    if (credits >= 1000000) return `${(credits / 1000000).toFixed(1)}M`;
    if (credits >= 1000) return `${(credits / 1000).toFixed(1)}K`;
    return credits.toString();
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

export const twoBotAIMetricsService = new TwoBotAIMetricsService();
