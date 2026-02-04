"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.twoBotAIUsageService = void 0;
exports.getCurrentBillingPeriod = getCurrentBillingPeriod;
exports.getBillingPeriod = getBillingPeriod;
const logger_1 = require("@/lib/logger");
const prisma_1 = require("@/lib/prisma");
const log = logger_1.logger.child({ module: "2bot-ai-usage" });
// ===========================================
// Helper Functions
// ===========================================
/**
 * Get current billing period string (YYYY-MM format)
 */
function getCurrentBillingPeriod() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
/**
 * Get billing period for a specific date
 */
function getBillingPeriod(date) {
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
    async recordUsage(data, creditsUsed) {
        const billingPeriod = getCurrentBillingPeriod();
        // Build usage record
        const usageData = {
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
            const chatData = data;
            usageData.inputTokens = chatData.inputTokens;
            usageData.outputTokens = chatData.outputTokens;
            usageData.totalTokens = chatData.inputTokens + chatData.outputTokens;
        }
        else if (data.capability === "image-generation") {
            const imageData = data;
            usageData.imageCount = imageData.imageCount;
        }
        else if (data.capability === "speech-synthesis") {
            const ttsData = data;
            usageData.characterCount = ttsData.characterCount;
        }
        else if (data.capability === "speech-recognition") {
            const sttData = data;
            usageData.audioSeconds = sttData.audioSeconds;
        }
        const usage = await prisma_1.prisma.aIUsage.create({
            data: usageData,
        });
        log.debug({
            usageId: usage.id,
            capability: data.capability,
            model: data.model,
            creditsUsed,
            departmentId: data.departmentId,
        }, "Recorded 2Bot AI usage");
        return usage.id;
    }
    /**
     * Get 2Bot AI usage statistics for a user
     *
     * @param userId - User ID
     * @param options - Query options
     */
    async getUsageStats(userId, options = {}) {
        const period = options.period || getCurrentBillingPeriod();
        // Build where clause - 2Bot AI only
        const where = {
            billingPeriod: period,
            source: "2bot",
            ...(options.organizationId
                ? { organizationId: options.organizationId }
                : { userId }),
        };
        // Get all 2Bot AI usage records for the period
        const usageRecords = await prisma_1.prisma.aIUsage.findMany({
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
        const byCapability = {
            "text-generation": { requests: 0, credits: 0 },
            "image-generation": { requests: 0, credits: 0 },
            "speech-synthesis": { requests: 0, credits: 0 },
            "speech-recognition": { requests: 0, credits: 0 },
            "text-embedding": { requests: 0, credits: 0 },
            "image-understanding": { requests: 0, credits: 0 },
        };
        const byModel = {};
        const byDay = {};
        for (const record of usageRecords) {
            // Totals
            totals.tokens += record.totalTokens || 0;
            totals.images += record.imageCount || 0;
            totals.characters += record.characterCount || 0;
            totals.audioSeconds += record.audioSeconds || 0;
            totals.credits += record.creditsUsed;
            // By capability (universal naming) - now read directly from record
            const capability = record.capability;
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
            const day = record.createdAt.toISOString().split("T")[0];
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
                capability: capability,
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
    async getOrgUsageStats(organizationId, options = {}) {
        const period = options.period || getCurrentBillingPeriod();
        // Get base stats
        const stats = await this.getUsageStats("", {
            ...options,
            organizationId,
        });
        // Get per-member breakdown
        const memberUsage = await prisma_1.prisma.aIUsage.groupBy({
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
    async getDeptUsageStats(departmentId, options = {}) {
        const period = options.period || getCurrentBillingPeriod();
        const [totalUsage, memberUsage] = await Promise.all([
            prisma_1.prisma.aIUsage.aggregate({
                where: {
                    departmentId,
                    billingPeriod: period,
                    source: "2bot",
                },
                _sum: { creditsUsed: true },
            }),
            prisma_1.prisma.aIUsage.groupBy({
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
    async getAggregatedUsage(period) {
        const billingPeriod = period || getCurrentBillingPeriod();
        const [totals, capabilityStats, modelStats] = await Promise.all([
            prisma_1.prisma.aIUsage.aggregate({
                where: { billingPeriod, source: "2bot" },
                _count: { id: true },
                _sum: { creditsUsed: true },
            }),
            prisma_1.prisma.aIUsage.groupBy({
                by: ["capability"],
                where: { billingPeriod, source: "2bot" },
                _count: { id: true },
                _sum: { creditsUsed: true },
            }),
            prisma_1.prisma.aIUsage.groupBy({
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
    async getUserCreditUsage(userId, period) {
        const billingPeriod = period || getCurrentBillingPeriod();
        const result = await prisma_1.prisma.aIUsage.aggregate({
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
    async getOrgCreditUsage(organizationId, period) {
        const billingPeriod = period || getCurrentBillingPeriod();
        const result = await prisma_1.prisma.aIUsage.aggregate({
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
exports.twoBotAIUsageService = new TwoBotAIUsageService();
//# sourceMappingURL=2bot-ai-usage.service.js.map