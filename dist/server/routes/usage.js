"use strict";
/**
 * Usage Routes
 *
 * REST API endpoints for dashboard usage data.
 *
 * Endpoints:
 * - GET  /api/usage - Get comprehensive usage data for dashboard
 *
 * @module server/routes/usage
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.usageRouter = void 0;
const express_1 = require("express");
const quota_1 = require("@/modules/quota");
const plans_1 = require("@/shared/constants/plans");
const errors_1 = require("@/shared/errors");
const context_1 = require("@/shared/types/context");
const auth_1 = require("../middleware/auth");
const error_handler_1 = require("../middleware/error-handler");
exports.usageRouter = (0, express_1.Router)();
/**
 * Helper to create ServiceContext from Express request
 */
function getServiceContext(req) {
    if (!req.user) {
        throw new errors_1.BadRequestError('User not authenticated');
    }
    const userAgent = Array.isArray(req.headers['user-agent'])
        ? req.headers['user-agent'][0]
        : req.headers['user-agent'];
    const requestId = Array.isArray(req.headers['x-request-id'])
        ? req.headers['x-request-id'][0]
        : req.headers['x-request-id'];
    return (0, context_1.createServiceContext)({
        userId: req.tokenPayload?.userId ?? req.user.id,
        role: req.tokenPayload?.role ?? req.user.role,
        plan: req.tokenPayload?.plan ?? req.user.plan,
    }, {
        ipAddress: req.ip,
        userAgent,
        requestId,
    }, { contextType: 'personal', effectivePlan: req.user.plan });
}
/**
 * GET /api/usage
 * Get comprehensive usage data for the dashboard
 */
exports.usageRouter.get('/', auth_1.requireAuth, (0, error_handler_1.asyncHandler)(async (req, res) => {
    const ctx = getServiceContext(req);
    const userId = ctx.userId;
    const plan = req.user?.plan || 'FREE';
    // Get plan limits
    const limits = plans_1.PLAN_LIMITS[plan] || plans_1.PLAN_LIMITS.FREE;
    // Get real-time usage data
    const [quotaStatus, realtimeUsage, executionCount] = await Promise.all([
        quota_1.quotaService.getQuotaStatus(ctx),
        quota_1.usageTracker.getRealTimeUsage(ctx),
        quota_1.ExecutionTrackerService.getExecutionCount(ctx),
    ]);
    // Calculate reset date (first of next month)
    const now = new Date();
    const resetsAt = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    // Get gateway count from quota status
    const gatewayCount = quotaStatus.gateways?.used || 0;
    // Build daily history (last 14 days)
    const dailyHistory = await getDailyHistory(userId, 14);
    // Build response
    const usage = {
        executions: {
            current: executionCount.current,
            limit: limits.executionsPerMonth,
            resetsAt: resetsAt.toISOString(),
        },
        gateways: {
            current: gatewayCount,
            limit: limits.gateways === -1 ? null : limits.gateways,
        },
        plugins: {
            current: quotaStatus.plugins?.used || 0,
            limit: limits.plugins === -1 ? null : limits.plugins,
        },
        workflows: {
            current: quotaStatus.workflows?.used || 0,
            limit: limits.workflows === -1 ? null : limits.workflows,
        },
        dailyHistory,
        plan: {
            name: formatPlanName(plan),
            type: plan,
        },
    };
    const response = {
        success: true,
        data: usage,
    };
    // Mark realtimeUsage as used to avoid unused variable warning
    void realtimeUsage;
    res.json(response);
}));
/**
 * Get daily execution history for a user
 */
async function getDailyHistory(userId, days) {
    const history = [];
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0] || '';
        // Try to get daily count from usage tracker
        const dayCount = await quota_1.usageTracker.getDailyCount(userId, dateStr);
        history.push({
            date: dateStr,
            executions: dayCount,
        });
    }
    return history;
}
/**
 * Format plan name for display
 */
function formatPlanName(plan) {
    const names = {
        FREE: 'Free',
        STARTER: 'Starter',
        PRO: 'Pro',
        BUSINESS: 'Business',
        ENTERPRISE: 'Enterprise',
    };
    return names[plan] || plan;
}
//# sourceMappingURL=usage.js.map