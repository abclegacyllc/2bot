"use strict";
/**
 * Execution Tracker Service
 *
 * Tracks workflow and API executions against plan limits.
 * Provides warning levels based on usage thresholds.
 *
 * @module modules/quota/execution-tracker.service
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExecutionTrackerService = void 0;
const logger_1 = require("@/lib/logger");
const prisma_1 = require("@/lib/prisma");
const redis_1 = require("@/lib/redis");
const org_plans_1 = require("@/shared/constants/org-plans");
const plans_1 = require("@/shared/constants/plans");
const execution_tracker_types_1 = require("./execution-tracker.types");
const log = logger_1.logger.child({ module: 'execution-tracker' });
// Redis key prefix for monthly execution counts
const EXEC_KEY_PREFIX = 'exec:monthly';
// ===========================================
// Warning Level Calculator
// ===========================================
/**
 * Calculate warning level based on usage percentage
 */
function getWarningLevel(current, limit) {
    if (limit === null || limit === -1)
        return 'none'; // Unlimited
    if (limit === 0)
        return 'blocked'; // Edge case
    const percentage = (current / limit) * 100;
    if (percentage >= execution_tracker_types_1.WARNING_THRESHOLDS.BLOCKED)
        return 'blocked';
    if (percentage >= execution_tracker_types_1.WARNING_THRESHOLDS.CRITICAL)
        return 'critical';
    if (percentage >= execution_tracker_types_1.WARNING_THRESHOLDS.WARNING)
        return 'warning';
    return 'none';
}
/**
 * Calculate percentage (capped at 100)
 */
function calcPercentage(current, limit) {
    if (limit === null || limit === -1 || limit === 0)
        return 0;
    return Math.min(100, Math.round((current / limit) * 100));
}
// ===========================================
// Execution Tracker Service
// ===========================================
class ExecutionTrackerServiceImpl {
    /**
     * Track a workflow or API execution
     * Called by workflow runner and API middleware
     */
    async trackExecution(ctx, workflowId) {
        try {
            const execCount = await this.getExecutionCount(ctx);
            // If unlimited (workspace mode), just track without enforcing
            if (!execCount.isServerless) {
                // Still track for analytics, but no limit enforcement
                await this.incrementExecutionCount(ctx);
                return {
                    success: true,
                    newCount: execCount.current + 1,
                    warningLevel: 'none',
                };
            }
            // Check if already at limit
            if (execCount.limit !== null && execCount.current >= execCount.limit) {
                log.warn({
                    userId: ctx.userId,
                    organizationId: ctx.organizationId,
                    current: execCount.current,
                    limit: execCount.limit,
                }, 'Execution blocked - limit reached');
                return {
                    success: false,
                    newCount: execCount.current,
                    warningLevel: 'blocked',
                    message: `Execution limit reached (${execCount.current}/${execCount.limit})`,
                };
            }
            // Increment the count
            const newCount = await this.incrementExecutionCount(ctx);
            const warningLevel = getWarningLevel(newCount, execCount.limit);
            // Log warnings
            if (warningLevel === 'critical') {
                log.warn({ userId: ctx.userId, current: newCount, limit: execCount.limit }, 'Critical: 95% of execution limit used');
            }
            else if (warningLevel === 'warning') {
                log.info({ userId: ctx.userId, current: newCount, limit: execCount.limit }, 'Warning: 80% of execution limit used');
            }
            return {
                success: true,
                newCount,
                warningLevel,
                message: warningLevel !== 'none'
                    ? `${calcPercentage(newCount, execCount.limit)}% of monthly limit used`
                    : undefined,
            };
        }
        catch (err) {
            log.error({ err, userId: ctx.userId }, 'Failed to track execution');
            // Don't block execution on tracking failure
            return {
                success: true,
                newCount: 0,
                warningLevel: 'none',
            };
        }
    }
    /**
     * Get current execution count for the billing period
     */
    async getExecutionCount(ctx) {
        const periodStart = (0, execution_tracker_types_1.getCurrentPeriodStart)();
        const periodEnd = (0, execution_tracker_types_1.getCurrentPeriodEnd)();
        // Get limit based on context (org or user)
        const { limit, isServerless } = await this.getExecutionLimit(ctx);
        // Get current count from Redis
        const key = this.buildRedisKey(ctx);
        const currentStr = await redis_1.redis.get(key);
        const current = currentStr ? parseInt(currentStr, 10) : 0;
        return {
            current,
            limit,
            percentage: calcPercentage(current, limit),
            periodStart,
            periodEnd,
            isServerless,
        };
    }
    /**
     * Check if user can execute (without incrementing)
     */
    async canExecute(ctx) {
        const execCount = await this.getExecutionCount(ctx);
        // Unlimited = always allowed
        if (!execCount.isServerless || execCount.limit === null) {
            return {
                allowed: true,
                warningLevel: 'none',
                current: execCount.current,
                limit: null,
            };
        }
        const warningLevel = getWarningLevel(execCount.current, execCount.limit);
        const allowed = execCount.current < execCount.limit;
        return {
            allowed,
            reason: !allowed ? 'limit_reached' : undefined,
            warningLevel,
            current: execCount.current,
            limit: execCount.limit,
            message: !allowed
                ? `Limit reached (${execCount.current}/${execCount.limit})`
                : undefined,
        };
    }
    /**
     * Get time until execution limit resets
     */
    async getResetTime(ctx) {
        return (0, execution_tracker_types_1.getNextPeriodStart)();
    }
    /**
     * Get full usage summary for a user/org
     */
    async getUsageSummary(ctx) {
        const execCount = await this.getExecutionCount(ctx);
        // Get resource counts
        const [gatewayCount, workflowCount, pluginCount, quotaRecord] = await Promise.all([
            this.countGateways(ctx),
            this.countWorkflows(ctx),
            this.countPlugins(ctx),
            this.getQuotaRecord(ctx),
        ]);
        // Get limits
        const limits = await this.getResourceLimits(ctx);
        return {
            executions: execCount,
            gateways: this.buildResourceUsage(gatewayCount, limits.gateways),
            workflows: this.buildResourceUsage(workflowCount, limits.workflows),
            plugins: this.buildResourceUsage(pluginCount, limits.plugins),
            aiTokens: this.buildResourceUsage(quotaRecord?.usedApiCalls ?? 0, limits.aiTokens),
            storage: this.buildResourceUsage(quotaRecord?.usedStorage ?? 0, limits.storage),
        };
    }
    // =========================================
    // Private Helpers
    // =========================================
    async getExecutionLimit(ctx) {
        // If in org context, check org plan
        if (ctx.organizationId) {
            const org = await prisma_1.prisma.organization.findUnique({
                where: { id: ctx.organizationId },
                select: { plan: true },
            });
            if (org) {
                const orgLimits = org_plans_1.ORG_PLAN_LIMITS[org.plan];
                if (orgLimits) {
                    // All org plans are workspace mode (unlimited executions)
                    return { limit: null, isServerless: false };
                }
            }
        }
        // Get user's plan
        const user = await prisma_1.prisma.user.findUnique({
            where: { id: ctx.userId },
            select: { plan: true, executionMode: true },
        });
        if (!user) {
            return { limit: 500, isServerless: true }; // Default to FREE
        }
        const plan = user.plan;
        const planLimits = plans_1.PLAN_LIMITS[plan];
        // Check if user has workspace mode (via plan or add-on)
        const isServerless = user.executionMode === 'SERVERLESS';
        return {
            limit: isServerless ? planLimits.executionsPerMonth : null,
            isServerless,
        };
    }
    async getResourceLimits(ctx) {
        // If in org context, use org limits
        if (ctx.organizationId) {
            const org = await prisma_1.prisma.organization.findUnique({
                where: { id: ctx.organizationId },
                select: { plan: true },
            });
            if (org) {
                const limits = org_plans_1.ORG_PLAN_LIMITS[org.plan];
                if (limits) {
                    return {
                        gateways: limits.sharedGateways === -1 ? null : limits.sharedGateways,
                        workflows: limits.sharedWorkflows === -1 ? null : limits.sharedWorkflows,
                        plugins: limits.sharedPlugins === -1 ? null : limits.sharedPlugins,
                        aiTokens: limits.sharedAiTokensPerMonth === -1 ? null : limits.sharedAiTokensPerMonth,
                        storage: limits.pool?.storageMb ?? null,
                    };
                }
            }
        }
        // Use user's plan limits
        const user = await prisma_1.prisma.user.findUnique({
            where: { id: ctx.userId },
            select: { plan: true },
        });
        const plan = (user?.plan ?? 'FREE');
        const limits = plans_1.PLAN_LIMITS[plan];
        return {
            gateways: limits.gateways === -1 ? null : limits.gateways,
            workflows: limits.workflows === -1 ? null : limits.workflows,
            plugins: limits.plugins === -1 ? null : limits.plugins,
            aiTokens: limits.aiTokensPerMonth === -1 ? null : limits.aiTokensPerMonth,
            storage: limits.workspace?.storageMb ?? null,
        };
    }
    buildResourceUsage(current, limit) {
        return {
            current,
            limit,
            percentage: calcPercentage(current, limit),
            warningLevel: getWarningLevel(current, limit),
        };
    }
    async incrementExecutionCount(ctx) {
        const key = this.buildRedisKey(ctx);
        // Increment and set expiry to end of month + 1 day buffer
        const newCount = await redis_1.redis.incr(key);
        // Set expiry if this is the first increment
        if (newCount === 1) {
            const periodEnd = (0, execution_tracker_types_1.getCurrentPeriodEnd)();
            const ttlSeconds = Math.ceil((periodEnd.getTime() - Date.now()) / 1000) + 86400;
            await redis_1.redis.expire(key, ttlSeconds);
        }
        return newCount;
    }
    buildRedisKey(ctx) {
        const period = this.getCurrentPeriodKey();
        if (ctx.organizationId) {
            return `${EXEC_KEY_PREFIX}:org:${ctx.organizationId}:${period}`;
        }
        return `${EXEC_KEY_PREFIX}:user:${ctx.userId}:${period}`;
    }
    getCurrentPeriodKey() {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }
    async countGateways(ctx) {
        return prisma_1.prisma.gateway.count({
            where: ctx.organizationId
                ? { organizationId: ctx.organizationId }
                : { userId: ctx.userId, organizationId: null },
        });
    }
    async countWorkflows(ctx) {
        return prisma_1.prisma.workflow.count({
            where: ctx.organizationId
                ? { organizationId: ctx.organizationId }
                : { userId: ctx.userId, organizationId: null },
        });
    }
    async countPlugins(ctx) {
        return prisma_1.prisma.userPlugin.count({
            where: ctx.organizationId
                ? { organizationId: ctx.organizationId }
                : { userId: ctx.userId, organizationId: null },
        });
    }
    async getQuotaRecord(ctx) {
        return prisma_1.prisma.resourceQuota.findFirst({
            where: ctx.organizationId
                ? { organizationId: ctx.organizationId }
                : { userId: ctx.userId },
            select: {
                usedApiCalls: true,
                usedStorage: true,
            },
        });
    }
}
// Export singleton
exports.ExecutionTrackerService = new ExecutionTrackerServiceImpl();
//# sourceMappingURL=execution-tracker.service.js.map