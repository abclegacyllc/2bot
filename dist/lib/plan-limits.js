"use strict";
/**
 * Plan Limits Utilities
 *
 * Functions to check resource limits based on subscription plan.
 * Used before creating gateways, plugins, etc to enforce plan limits.
 *
 * @module lib/plan-limits
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlanLimitError = void 0;
exports.checkGatewayLimit = checkGatewayLimit;
exports.checkPluginLimit = checkPluginLimit;
exports.checkExecutionLimit = checkExecutionLimit;
exports.getResourceUsage = getResourceUsage;
exports.enforceGatewayLimit = enforceGatewayLimit;
exports.enforcePluginLimit = enforcePluginLimit;
exports.enforceExecutionLimit = enforceExecutionLimit;
const prisma_1 = require("@/lib/prisma");
const plans_1 = require("@/shared/constants/plans");
/**
 * Custom error for plan limit violations
 */
class PlanLimitError extends Error {
    resource;
    current;
    max;
    upgradeUrl;
    constructor(message, resource, current, max) {
        super(message);
        this.name = "PlanLimitError";
        this.resource = resource;
        this.current = current;
        this.max = max;
        this.upgradeUrl = "/billing/upgrade";
    }
    toJSON() {
        return {
            error: this.name,
            message: this.message,
            resource: this.resource,
            current: this.current,
            max: this.max,
            upgradeUrl: this.upgradeUrl,
        };
    }
}
exports.PlanLimitError = PlanLimitError;
/**
 * Build the where clause for counting resources based on context
 */
function buildOwnerFilter(ctx) {
    if (ctx.isOrgContext() && ctx.organizationId) {
        return { organizationId: ctx.organizationId };
    }
    return { userId: ctx.userId, organizationId: null };
}
/**
 * Check if a limit value means unlimited (-1)
 */
function isUnlimited(limit) {
    return limit === -1;
}
/**
 * Check gateway creation limit for current context
 */
async function checkGatewayLimit(ctx) {
    const limits = (0, plans_1.getPlanLimits)(ctx.effectivePlan);
    const max = limits.gateways;
    // Unlimited check
    if (isUnlimited(max)) {
        return { allowed: true, current: 0, max: -1, remaining: -1 };
    }
    const filter = buildOwnerFilter(ctx);
    const current = await prisma_1.prisma.gateway.count({ where: filter });
    return {
        allowed: current < max,
        current,
        max,
        remaining: Math.max(0, max - current),
    };
}
/**
 * Check plugin installation limit for current context
 */
async function checkPluginLimit(ctx) {
    const limits = (0, plans_1.getPlanLimits)(ctx.effectivePlan);
    const max = limits.plugins;
    // Unlimited check
    if (isUnlimited(max)) {
        return { allowed: true, current: 0, max: -1, remaining: -1 };
    }
    const filter = buildOwnerFilter(ctx);
    const current = await prisma_1.prisma.userPlugin.count({ where: filter });
    return {
        allowed: current < max,
        current,
        max,
        remaining: Math.max(0, max - current),
    };
}
/**
 * Check daily execution limit for current context
 * Note: Uses executionsPerMonth from plan limits (converted to approximate daily)
 * For more precise tracking, use the quota service
 */
async function checkExecutionLimit(ctx) {
    const limits = (0, plans_1.getPlanLimits)(ctx.effectivePlan);
    // executionsPerMonth - convert to approximate daily (null = unlimited)
    const monthlyLimit = limits.executionsPerMonth;
    // Unlimited check
    if (monthlyLimit === null || monthlyLimit === -1) {
        return { allowed: true, current: 0, max: -1, remaining: -1 };
    }
    // Approximate daily limit (monthly / 30)
    const max = Math.ceil(monthlyLimit / 30);
    // TODO: Implement actual execution tracking when PluginExecution model is added
    // For now, return a stub that assumes no executions today
    const current = 0;
    return {
        allowed: current < max,
        current,
        max,
        remaining: Math.max(0, max - current),
    };
}
/**
 * Get all resource usage for current context
 * Useful for displaying in billing UI
 */
async function getResourceUsage(ctx) {
    const [gateways, plugins, executionsToday] = await Promise.all([
        checkGatewayLimit(ctx),
        checkPluginLimit(ctx),
        checkExecutionLimit(ctx),
    ]);
    return {
        gateways,
        plugins,
        executionsToday,
        plan: ctx.effectivePlan,
    };
}
/**
 * Enforce gateway limit - throws PlanLimitError if limit reached
 */
async function enforceGatewayLimit(ctx) {
    const limit = await checkGatewayLimit(ctx);
    if (!limit.allowed) {
        throw new PlanLimitError(`Gateway limit reached (${limit.current}/${limit.max}). Upgrade your plan to create more gateways.`, "gateways", limit.current, limit.max);
    }
}
/**
 * Enforce plugin limit - throws PlanLimitError if limit reached
 */
async function enforcePluginLimit(ctx) {
    const limit = await checkPluginLimit(ctx);
    if (!limit.allowed) {
        throw new PlanLimitError(`Plugin limit reached (${limit.current}/${limit.max}). Upgrade your plan to install more plugins.`, "plugins", limit.current, limit.max);
    }
}
/**
 * Enforce execution limit - throws PlanLimitError if limit reached
 */
async function enforceExecutionLimit(ctx) {
    const limit = await checkExecutionLimit(ctx);
    if (!limit.allowed) {
        throw new PlanLimitError(`Daily execution limit reached (${limit.current}/${limit.max}). Upgrade your plan for more executions.`, "executions", limit.current, limit.max);
    }
}
//# sourceMappingURL=plan-limits.js.map