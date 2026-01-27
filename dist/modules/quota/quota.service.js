"use strict";
/**
 * Quota Service
 *
 * Manages resource quotas and usage tracking for organizations,
 * departments, and users. Enforces plan-based limits with
 * inheritance support.
 *
 * Quota Hierarchy:
 *   Organization (from plan) → Department (reduced by owner) → User (reduced by manager)
 *
 * @module modules/quota/quota.service
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.quotaService = exports.QuotaExceededError = void 0;
const logger_1 = require("@/lib/logger");
const prisma_1 = require("@/lib/prisma");
const org_plans_1 = require("@/shared/constants/org-plans");
const plans_1 = require("@/shared/constants/plans");
const errors_1 = require("@/shared/errors");
const quota_types_1 = require("./quota.types");
const log = logger_1.logger.child({ module: 'quota' });
// ===========================================
// Plan Limits Adapter
// ===========================================
/**
 * Convert PLAN_LIMITS to ResourceLimits format for quota checking
 * Single source of truth - all values come from plans.ts
 */
function getPlanQuotaLimits(plan) {
    const limits = plans_1.PLAN_LIMITS[plan];
    return {
        maxWorkflows: limits.workflows === -1 ? -1 : limits.workflows,
        maxPlugins: limits.plugins === -1 ? -1 : limits.plugins,
        maxApiCalls: limits.executionsPerMonth, // null = unlimited → -1
        maxStorage: limits.workspace?.storageMb ?? 0,
        maxSteps: limits.workflowSteps,
        maxGateways: limits.gateways === -1 ? -1 : limits.gateways,
        maxDepartments: limits.maxDepartments === -1 ? -1 : limits.maxDepartments,
        maxMembers: limits.maxMembers === -1 ? -1 : limits.maxMembers,
    };
}
/**
 * Convert ORG_PLAN_LIMITS to ResourceLimits format for quota checking
 * Single source of truth - all values come from org-plans.ts
 */
function getOrgPlanQuotaLimits(plan) {
    const limits = org_plans_1.ORG_PLAN_LIMITS[plan] || org_plans_1.ORG_PLAN_LIMITS.ORG_FREE;
    return {
        maxWorkflows: limits.sharedWorkflows === -1 ? -1 : limits.sharedWorkflows,
        maxPlugins: limits.sharedPlugins === -1 ? -1 : limits.sharedPlugins,
        maxApiCalls: limits.executionsPerMonth, // null = unlimited → -1
        maxStorage: limits.pool?.storageMb ?? 0,
        maxSteps: -1, // Org plans don't limit workflow steps
        maxGateways: limits.sharedGateways === -1 ? -1 : limits.sharedGateways,
        maxDepartments: limits.departments === null ? -1 : limits.departments,
        maxMembers: limits.seats.included === -1 ? -1 : limits.seats.included,
    };
}
// ===========================================
// Custom Errors
// ===========================================
class QuotaExceededError extends errors_1.AppError {
    resource;
    current;
    limit;
    constructor(resource, current, limit) {
        super(`Quota exceeded for ${resource}: ${current}/${limit}`, 'QUOTA_EXCEEDED', 403);
        this.resource = resource;
        this.current = current;
        this.limit = limit;
    }
}
exports.QuotaExceededError = QuotaExceededError;
// ===========================================
// Quota Service
// ===========================================
class QuotaServiceImpl {
    // ===== Quota Checking =====
    /**
     * Check if operation is allowed within quota
     * Throws QuotaExceededError if limit reached
     */
    async checkQuota(ctx, resource, amount = 1) {
        const result = await this.canUseResource(ctx, resource, amount);
        if (!result.allowed) {
            throw new QuotaExceededError(resource, result.current, result.limit ?? 0);
        }
    }
    /**
     * Check if resource can be used (non-throwing)
     */
    async canUseResource(ctx, resource, amount = 1) {
        const limits = await this.getEffectiveLimits(ctx);
        const usage = await this.getCurrentUsage(ctx);
        const limitValue = this.getLimitForResource(limits, resource);
        const usedValue = this.getUsageForResource(usage, resource);
        // Unlimited (-1 or null)
        if (limitValue === null || limitValue === -1) {
            return {
                allowed: true,
                current: usedValue,
                limit: null,
                resource,
            };
        }
        const newUsage = usedValue + amount;
        const allowed = newUsage <= limitValue;
        return {
            allowed,
            current: usedValue,
            limit: limitValue,
            resource,
            message: allowed
                ? undefined
                : `Would exceed ${resource} quota: ${newUsage}/${limitValue}`,
        };
    }
    /**
     * Get current quota status
     */
    async getQuotaStatus(ctx) {
        const limits = await this.getEffectiveLimits(ctx);
        const usage = await this.getCurrentUsage(ctx);
        const quota = await this.getOrCreateQuota(ctx);
        const createItem = (used, limit) => {
            const isUnlimited = limit === null || limit === -1;
            return {
                used,
                limit: isUnlimited ? null : limit,
                percentage: isUnlimited ? 0 : Math.min(100, Math.round((used / limit) * 100)),
                isUnlimited,
            };
        };
        return {
            workflows: createItem(usage.usedWorkflows, limits.maxWorkflows),
            plugins: createItem(usage.usedPlugins, limits.maxPlugins),
            apiCalls: {
                ...createItem(usage.usedApiCalls, limits.maxApiCalls),
                resetsAt: quota?.apiCallsResetAt ?? this.getNextResetTime(),
            },
            storage: createItem(usage.usedStorage, limits.maxStorage),
            gateways: createItem(usage.usedGateways, limits.maxGateways),
        };
    }
    /**
     * Get effective limits (considering inheritance)
     *
     * Priority: User quota → Department quota → Org quota → Plan defaults
     */
    async getEffectiveLimits(ctx) {
        const plan = ctx.effectivePlan ?? ctx.userPlan;
        const planLimits = getPlanQuotaLimits(plan);
        // Start with plan defaults
        let limits = { ...planLimits };
        // If in org context, check org quota
        if (ctx.organizationId) {
            const orgQuota = await prisma_1.prisma.resourceQuota.findUnique({
                where: { organizationId: ctx.organizationId },
            });
            if (orgQuota) {
                limits = this.mergeQuotas(limits, orgQuota);
            }
            // If user is in a department, check dept quota
            if (ctx.departmentId) {
                const deptQuota = await prisma_1.prisma.resourceQuota.findUnique({
                    where: { departmentId: ctx.departmentId },
                });
                if (deptQuota) {
                    limits = this.mergeQuotas(limits, deptQuota);
                }
            }
        }
        // Check user-specific quota
        const userQuota = await prisma_1.prisma.resourceQuota.findUnique({
            where: { userId: ctx.userId },
        });
        if (userQuota) {
            limits = this.mergeQuotas(limits, userQuota);
        }
        return limits;
    }
    // ===== Usage Tracking =====
    /**
     * Increment usage counter
     */
    async incrementUsage(ctx, resource, amount = 1) {
        const quota = await this.getOrCreateQuota(ctx);
        if (!quota)
            return;
        const field = this.getUsageFieldForResource(resource);
        if (!field)
            return;
        await prisma_1.prisma.resourceQuota.update({
            where: { id: quota.id },
            data: {
                [field]: { increment: amount },
            },
        });
        log.debug({ userId: ctx.userId, resource, amount }, 'Incremented usage');
    }
    /**
     * Decrement usage counter (on delete)
     */
    async decrementUsage(ctx, resource, amount = 1) {
        const quota = await this.getOrCreateQuota(ctx);
        if (!quota)
            return;
        const field = this.getUsageFieldForResource(resource);
        if (!field)
            return;
        // Ensure we don't go below 0
        const currentValue = quota[field] ?? 0;
        const newValue = Math.max(0, currentValue - amount);
        await prisma_1.prisma.resourceQuota.update({
            where: { id: quota.id },
            data: {
                [field]: newValue,
            },
        });
        log.debug({ userId: ctx.userId, resource, amount }, 'Decremented usage');
    }
    /**
     * Reset daily counters (called by cron)
     */
    async resetDailyCounters() {
        const result = await prisma_1.prisma.resourceQuota.updateMany({
            data: {
                usedApiCalls: 0,
                apiCallsResetAt: new Date(),
            },
        });
        log.info({ count: result.count }, 'Reset daily API call counters');
        return result.count;
    }
    // ===== Admin Operations =====
    /**
     * Set quotas for organization (Owner only)
     */
    async setOrganizationQuotas(ctx, organizationId, quotas) {
        await prisma_1.prisma.resourceQuota.upsert({
            where: { organizationId },
            create: {
                organizationId,
                ...this.sanitizeQuotaInput(quotas),
            },
            update: this.sanitizeQuotaInput(quotas),
        });
        log.info({ organizationId, quotas, userId: ctx.userId }, 'Updated organization quotas');
    }
    /**
     * Set quotas for department (Owner only)
     */
    async setDepartmentQuotas(ctx, departmentId, quotas) {
        // Validate quotas don't exceed org limits
        if (ctx.organizationId) {
            const orgLimits = await this.getOrgLimits(ctx.organizationId);
            this.validateQuotasWithinParent(quotas, orgLimits);
        }
        await prisma_1.prisma.resourceQuota.upsert({
            where: { departmentId },
            create: {
                departmentId,
                ...this.sanitizeQuotaInput(quotas),
            },
            update: this.sanitizeQuotaInput(quotas),
        });
        log.info({ departmentId, quotas, userId: ctx.userId }, 'Updated department quotas');
    }
    /**
     * Set quotas for employee (Manager only)
     */
    async setEmployeeQuotas(ctx, userId, quotas) {
        // Validate quotas don't exceed dept limits
        if (ctx.departmentId) {
            const deptLimits = await this.getDeptLimits(ctx.departmentId);
            this.validateQuotasWithinParent(quotas, deptLimits);
        }
        await prisma_1.prisma.resourceQuota.upsert({
            where: { userId },
            create: {
                userId,
                ...this.sanitizeQuotaInput(quotas),
            },
            update: this.sanitizeQuotaInput(quotas),
        });
        log.info({ targetUserId: userId, quotas, updatedBy: ctx.userId }, 'Updated employee quotas');
    }
    /**
     * Get quotas for a specific entity
     */
    async getQuotas(owner) {
        let quota;
        if (owner.organizationId) {
            quota = await prisma_1.prisma.resourceQuota.findUnique({
                where: { organizationId: owner.organizationId },
            });
        }
        else if (owner.departmentId) {
            quota = await prisma_1.prisma.resourceQuota.findUnique({
                where: { departmentId: owner.departmentId },
            });
        }
        else if (owner.userId) {
            quota = await prisma_1.prisma.resourceQuota.findUnique({
                where: { userId: owner.userId },
            });
        }
        if (!quota)
            return null;
        return {
            maxWorkflows: quota.maxWorkflows,
            maxPlugins: quota.maxPlugins,
            maxApiCalls: quota.maxApiCalls,
            maxStorage: quota.maxStorage,
            maxSteps: quota.maxSteps,
            maxGateways: null, // Not stored in ResourceQuota, use plan
            maxDepartments: null,
            maxMembers: null,
        };
    }
    // ===== Usage History =====
    /**
     * Record usage in history (for reporting)
     */
    async recordUsageHistory(owner, record) {
        const periodStart = this.getPeriodStart('DAILY');
        const data = {
            periodStart,
            periodType: 'DAILY',
            apiCalls: record.apiCalls,
            workflowRuns: record.workflowRuns,
            pluginExecutions: record.pluginExecutions,
            storageUsed: record.storageUsed,
            errors: record.errors,
            estimatedCost: record.estimatedCost,
        };
        if (owner.organizationId) {
            await prisma_1.prisma.usageHistory.upsert({
                where: {
                    organizationId_periodStart_periodType: {
                        organizationId: owner.organizationId,
                        periodStart,
                        periodType: 'DAILY',
                    },
                },
                create: { ...data, organizationId: owner.organizationId },
                update: data,
            });
        }
        else if (owner.userId) {
            await prisma_1.prisma.usageHistory.upsert({
                where: {
                    userId_periodStart_periodType: {
                        userId: owner.userId,
                        periodStart,
                        periodType: 'DAILY',
                    },
                },
                create: { ...data, userId: owner.userId },
                update: data,
            });
        }
    }
    /**
     * Get usage history for reporting
     */
    async getUsageHistory(owner, periodType, startDate, endDate) {
        const where = {
            periodType,
            periodStart: {
                gte: startDate,
                lte: endDate,
            },
        };
        if (owner.organizationId) {
            where.organizationId = owner.organizationId;
        }
        else if (owner.departmentId) {
            where.departmentId = owner.departmentId;
        }
        else if (owner.userId) {
            where.userId = owner.userId;
        }
        const records = await prisma_1.prisma.usageHistory.findMany({
            where,
            orderBy: { periodStart: 'asc' },
        });
        return records.map((r) => ({
            periodStart: r.periodStart,
            periodType: r.periodType,
            apiCalls: r.apiCalls,
            workflowRuns: r.workflowRuns,
            pluginExecutions: r.pluginExecutions,
            storageUsed: r.storageUsed,
            errors: r.errors,
            estimatedCost: r.estimatedCost?.toNumber(),
        }));
    }
    // ===== Private Helpers =====
    async getOrCreateQuota(ctx) {
        // Determine which quota to use based on context
        if (ctx.contextType === 'organization' && ctx.organizationId) {
            return prisma_1.prisma.resourceQuota.upsert({
                where: { organizationId: ctx.organizationId },
                create: { organizationId: ctx.organizationId },
                update: {},
            });
        }
        // Personal context - use user quota
        return prisma_1.prisma.resourceQuota.upsert({
            where: { userId: ctx.userId },
            create: { userId: ctx.userId },
            update: {},
        });
    }
    async getCurrentUsage(ctx) {
        const quota = await this.getOrCreateQuota(ctx);
        // Also count actual resources from database
        const [workflowCount, pluginCount, gatewayCount] = await Promise.all([
            this.countResources(ctx, 'workflow'),
            this.countResources(ctx, 'userPlugin'),
            this.countResources(ctx, 'gateway'),
        ]);
        return {
            usedWorkflows: quota?.usedWorkflows ?? workflowCount,
            usedPlugins: quota?.usedPlugins ?? pluginCount,
            usedApiCalls: quota?.usedApiCalls ?? 0,
            usedStorage: quota?.usedStorage ?? 0,
            usedGateways: gatewayCount,
        };
    }
    async countResources(ctx, resource) {
        const where = ctx.contextType === 'organization' && ctx.organizationId
            ? { organizationId: ctx.organizationId }
            : { userId: ctx.userId };
        if (resource === 'workflow') {
            return prisma_1.prisma.workflow.count({ where });
        }
        else if (resource === 'userPlugin') {
            return prisma_1.prisma.userPlugin.count({ where });
        }
        else {
            return prisma_1.prisma.gateway.count({ where });
        }
    }
    async getOrgLimits(organizationId) {
        const org = await prisma_1.prisma.organization.findUnique({
            where: { id: organizationId },
            include: { resourceQuota: true },
        });
        if (!org) {
            return getOrgPlanQuotaLimits('ORG_FREE');
        }
        const planLimits = getOrgPlanQuotaLimits(org.plan);
        if (org.resourceQuota) {
            return this.mergeQuotas(planLimits, org.resourceQuota);
        }
        return planLimits;
    }
    async getDeptLimits(departmentId) {
        const dept = await prisma_1.prisma.department.findUnique({
            where: { id: departmentId },
            include: {
                organization: true,
                resourceQuota: true,
            },
        });
        if (!dept) {
            return getOrgPlanQuotaLimits('ORG_FREE');
        }
        // Start with org limits
        const orgLimits = await this.getOrgLimits(dept.organizationId);
        // Apply dept overrides
        if (dept.resourceQuota) {
            return this.mergeQuotas(orgLimits, dept.resourceQuota);
        }
        return orgLimits;
    }
    mergeQuotas(base, override) {
        if (!override)
            return base;
        return {
            maxWorkflows: override.maxWorkflows ?? base.maxWorkflows,
            maxPlugins: override.maxPlugins ?? base.maxPlugins,
            maxApiCalls: override.maxApiCalls ?? base.maxApiCalls,
            maxStorage: override.maxStorage ?? base.maxStorage,
            maxSteps: override.maxSteps ?? base.maxSteps,
            maxGateways: base.maxGateways, // Always from plan
            maxDepartments: base.maxDepartments,
            maxMembers: base.maxMembers,
        };
    }
    validateQuotasWithinParent(quotas, parentLimits) {
        const check = (value, parentValue, name) => {
            if (value === null || value === undefined)
                return;
            if (parentValue === null || parentValue === -1)
                return; // Parent is unlimited
            if (value > parentValue) {
                throw new errors_1.AppError(`${name} cannot exceed parent limit of ${parentValue}`, 'INVALID_QUOTA', 400);
            }
        };
        check(quotas.maxWorkflows, parentLimits.maxWorkflows, 'maxWorkflows');
        check(quotas.maxPlugins, parentLimits.maxPlugins, 'maxPlugins');
        check(quotas.maxApiCalls, parentLimits.maxApiCalls, 'maxApiCalls');
        check(quotas.maxStorage, parentLimits.maxStorage, 'maxStorage');
        check(quotas.maxSteps, parentLimits.maxSteps, 'maxSteps');
    }
    sanitizeQuotaInput(input) {
        const result = {};
        if (input.maxWorkflows !== undefined)
            result.maxWorkflows = input.maxWorkflows;
        if (input.maxPlugins !== undefined)
            result.maxPlugins = input.maxPlugins;
        if (input.maxApiCalls !== undefined)
            result.maxApiCalls = input.maxApiCalls;
        if (input.maxStorage !== undefined)
            result.maxStorage = input.maxStorage;
        if (input.maxSteps !== undefined)
            result.maxSteps = input.maxSteps;
        return result;
    }
    getLimitForResource(limits, resource) {
        switch (resource) {
            case quota_types_1.ResourceType.WORKFLOW:
                return limits.maxWorkflows;
            case quota_types_1.ResourceType.PLUGIN:
                return limits.maxPlugins;
            case quota_types_1.ResourceType.API_CALL:
                return limits.maxApiCalls;
            case quota_types_1.ResourceType.STORAGE:
                return limits.maxStorage;
            case quota_types_1.ResourceType.WORKFLOW_STEP:
                return limits.maxSteps;
            case quota_types_1.ResourceType.GATEWAY:
                return limits.maxGateways;
            case quota_types_1.ResourceType.DEPARTMENT:
                return limits.maxDepartments;
            case quota_types_1.ResourceType.MEMBER:
                return limits.maxMembers;
            default:
                return null;
        }
    }
    getUsageForResource(usage, resource) {
        switch (resource) {
            case quota_types_1.ResourceType.WORKFLOW:
                return usage.usedWorkflows;
            case quota_types_1.ResourceType.PLUGIN:
                return usage.usedPlugins;
            case quota_types_1.ResourceType.API_CALL:
                return usage.usedApiCalls;
            case quota_types_1.ResourceType.STORAGE:
                return usage.usedStorage;
            case quota_types_1.ResourceType.GATEWAY:
                return usage.usedGateways;
            default:
                return 0;
        }
    }
    getUsageFieldForResource(resource) {
        switch (resource) {
            case quota_types_1.ResourceType.WORKFLOW:
                return 'usedWorkflows';
            case quota_types_1.ResourceType.PLUGIN:
                return 'usedPlugins';
            case quota_types_1.ResourceType.API_CALL:
                return 'usedApiCalls';
            case quota_types_1.ResourceType.STORAGE:
                return 'usedStorage';
            default:
                return null;
        }
    }
    getNextResetTime() {
        const now = new Date();
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);
        return tomorrow;
    }
    getPeriodStart(periodType) {
        const now = new Date();
        switch (periodType) {
            case 'HOURLY':
                return new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), 0, 0, 0);
            case 'DAILY':
                return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
            case 'WEEKLY': {
                const dayOfWeek = now.getDay();
                const diff = now.getDate() - dayOfWeek;
                return new Date(now.getFullYear(), now.getMonth(), diff, 0, 0, 0, 0);
            }
            case 'MONTHLY':
                return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
            default:
                return now;
        }
    }
}
// Export singleton instance
exports.quotaService = new QuotaServiceImpl();
//# sourceMappingURL=quota.service.js.map