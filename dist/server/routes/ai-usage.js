"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiUsageRouter = void 0;
const _2bot_ai_provider_1 = require("@/modules/2bot-ai-provider");
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const error_handler_1 = require("../middleware/error-handler");
exports.aiUsageRouter = (0, express_1.Router)();
// All routes require authentication
exports.aiUsageRouter.use(auth_1.requireAuth);
/**
 * GET /api/ai/usage/stats
 *
 * Get 2Bot AI usage statistics for the user
 *
 * @query {string} [period] - Billing period (YYYY-MM, default: current)
 */
exports.aiUsageRouter.get("/stats", (0, error_handler_1.asyncHandler)(async (req, res) => {
    const userId = req.user.id;
    const period = req.query.period || (0, _2bot_ai_provider_1.getCurrentBillingPeriod)();
    // 2Bot AI service only returns 2Bot usage (no source filter needed)
    const stats = await _2bot_ai_provider_1.twoBotAIUsageService.getUsageStats(userId, {
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
}));
/**
 * GET /api/ai/usage/tokens
 *
 * Get AI token usage for current billing period
 * This tracks usage against plan limits (creditsPerMonth)
 */
exports.aiUsageRouter.get("/tokens", (0, error_handler_1.asyncHandler)(async (req, res) => {
    const userId = req.user.id;
    const usage = await _2bot_ai_provider_1.twoBotAIMetricsService.getTokenUsage(userId);
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
                used: _2bot_ai_provider_1.twoBotAIMetricsService.formatTokens(usage.used),
                limit: _2bot_ai_provider_1.twoBotAIMetricsService.formatTokens(usage.limit),
                remaining: usage.remaining !== null
                    ? _2bot_ai_provider_1.twoBotAIMetricsService.formatTokens(usage.remaining)
                    : "Unlimited",
            },
        },
    });
}));
/**
 * GET /api/ai/usage/tokens/check
 *
 * Check if user can make a request with estimated tokens
 * Use this before making AI requests to check plan limits
 *
 * @query {number} [estimate] - Estimated tokens for request (default: 0)
 */
exports.aiUsageRouter.get("/tokens/check", (0, error_handler_1.asyncHandler)(async (req, res) => {
    const userId = req.user.id;
    const estimate = parseInt(req.query.estimate) || 0;
    const check = await _2bot_ai_provider_1.twoBotAIMetricsService.checkPlanLimit(userId, estimate);
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
}));
/**
 * GET /api/ai/usage/tokens/breakdown
 *
 * Get token usage breakdown by capability type
 *
 * @query {string} [period] - Billing period (YYYY-MM, default: current)
 */
exports.aiUsageRouter.get("/tokens/breakdown", (0, error_handler_1.asyncHandler)(async (req, res) => {
    const userId = req.user.id;
    const period = req.query.period || (0, _2bot_ai_provider_1.getCurrentBillingPeriod)();
    const breakdown = await _2bot_ai_provider_1.twoBotAIMetricsService.getTokenBreakdown(userId, period);
    res.json({
        success: true,
        data: {
            period,
            ...breakdown,
        },
    });
}));
//# sourceMappingURL=ai-usage.js.map