/**
 * AI Usage Routes (2Bot AI)
 *
 * API endpoints for 2Bot AI usage tracking and plan limit checking.
 * These routes handle 2Bot AI which involves credits and plan limits.
 * 
 * For BYOK (user's own API keys), metrics are tracked separately
 * in the gateway module without credit implications.
 *
 * Credits = Universal platform currency (can buy anything)
 * AI Usage = Raw usage metrics and plan limits
 *
 * @module server/routes/ai-usage
 */

import {
    getCurrentBillingPeriod,
    twoBotAIMetricsService,
    twoBotAIUsageService
} from "@/modules/2bot-ai-provider";
import type { ApiResponse } from "@/shared/types";
import { Router, type Request, type Response } from "express";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../middleware/error-handler";

export const aiUsageRouter = Router();

// All routes require authentication
aiUsageRouter.use(requireAuth);

// ===========================================
// GET /api/ai/usage/stats
// ===========================================

interface UsageStatsResponse {
  period: string;
  totals: {
    requests: number;
    tokens: number;
    images: number;
    characters: number;
    audioSeconds: number;
    credits: number;
  };
  /** Usage grouped by capability (universal naming) */
  byCapability: Array<{
    capability: string;
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

/**
 * GET /api/ai/usage/stats
 *
 * Get 2Bot AI usage statistics for the user
 *
 * @query {string} [period] - Billing period (YYYY-MM, default: current)
 */
aiUsageRouter.get(
  "/stats",
  asyncHandler(async (req: Request, res: Response<ApiResponse<UsageStatsResponse>>) => {
    const userId = req.user!.id;
    const period = (req.query.period as string) || getCurrentBillingPeriod();

    // 2Bot AI service only returns 2Bot usage (no source filter needed)
    const stats = await twoBotAIUsageService.getUsageStats(userId, {
      period,
    });

    res.json({
      success: true,
      data: {
        period,
        totals: stats.totals,
        byCapability: stats.byCapability,
        byModel: stats.byModel,
        byDay: stats.byDay,
      },
    });
  })
);

// ===========================================
// GET /api/ai/usage/tokens
// ===========================================

interface TokenUsageResponse {
  period: string;
  used: number;
  limit: number;
  remaining: number | null;
  percentUsed: number | null;
  exceeded: boolean;
  plan: string;
  source: "user" | "organization";
  formatted: {
    used: string;
    limit: string;
    remaining: string;
  };
}

/**
 * GET /api/ai/usage/tokens
 *
 * Get AI token usage for current billing period
 * This tracks usage against plan limits (creditsPerMonth)
 */
aiUsageRouter.get(
  "/tokens",
  asyncHandler(async (req: Request, res: Response<ApiResponse<TokenUsageResponse>>) => {
    const userId = req.user!.id;
    
    const usage = await twoBotAIMetricsService.getTokenUsage(userId);

    res.json({
      success: true,
      data: {
        period: usage.period,
        used: usage.used,
        limit: usage.limit,
        remaining: usage.remaining,
        percentUsed: usage.percentUsed,
        exceeded: usage.exceeded,
        plan: usage.plan,
        source: usage.source,
        formatted: {
          used: twoBotAIMetricsService.formatTokens(usage.used),
          limit: twoBotAIMetricsService.formatTokens(usage.limit),
          remaining: usage.remaining !== null 
            ? twoBotAIMetricsService.formatTokens(usage.remaining) 
            : "Unlimited",
        },
      },
    });
  })
);

// ===========================================
// GET /api/ai/usage/tokens/check
// ===========================================

interface TokenCheckResponse {
  allowed: boolean;
  used: number;
  limit: number;
  remaining: number | null;
  message?: string;
}

/**
 * GET /api/ai/usage/tokens/check
 *
 * Check if user can make a request with estimated tokens
 * Use this before making AI requests to check plan limits
 *
 * @query {number} [estimate] - Estimated tokens for request (default: 0)
 */
aiUsageRouter.get(
  "/tokens/check",
  asyncHandler(async (req: Request, res: Response<ApiResponse<TokenCheckResponse>>) => {
    const userId = req.user!.id;
    const estimate = parseInt(req.query.estimate as string) || 0;
    
    const check = await twoBotAIMetricsService.checkPlanLimit(userId, estimate);

    res.json({
      success: true,
      data: {
        allowed: check.allowed,
        used: check.used,
        limit: check.limit,
        remaining: check.remaining,
        message: check.message,
      },
    });
  })
);

// ===========================================
// GET /api/ai/usage/tokens/breakdown
// ===========================================

interface TokenBreakdownResponse {
  period: string;
  "text-generation": number;
  "text-embedding": number;
  "image-understanding": number;
  total: number;
}

/**
 * GET /api/ai/usage/tokens/breakdown
 *
 * Get token usage breakdown by capability type
 *
 * @query {string} [period] - Billing period (YYYY-MM, default: current)
 */
aiUsageRouter.get(
  "/tokens/breakdown",
  asyncHandler(async (req: Request, res: Response<ApiResponse<TokenBreakdownResponse>>) => {
    const userId = req.user!.id;
    const period = (req.query.period as string) || getCurrentBillingPeriod();
    
    const breakdown = await twoBotAIMetricsService.getTokenBreakdown(userId, period);

    res.json({
      success: true,
      data: {
        period,
        ...breakdown,
      },
    });
  })
);
