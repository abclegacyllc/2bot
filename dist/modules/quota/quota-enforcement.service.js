"use strict";
/**
 * Quota Enforcement Service
 *
 * Enforces quota limits following allocation hierarchy:
 *   1. Check member allocation (if set)
 *   2. Check department allocation (if set)
 *   3. Check organization plan limit
 *
 * Allocation Modes:
 *   - UNLIMITED: No limit set, use from pool freely
 *   - SOFT_CAP: Warning at limit, action still allowed
 *   - HARD_CAP: Blocked at limit
 *   - RESERVED: Guaranteed allocation, others can't use
 *
 * @module modules/quota/quota-enforcement.service
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.QuotaEnforcementService = void 0;
const logger_1 = require("@/lib/logger");
const prisma_1 = require("@/lib/prisma");
const org_plans_1 = require("@/shared/constants/org-plans");
const plans_1 = require("@/shared/constants/plans");
const client_1 = require("@prisma/client");
const quota_service_1 = require("./quota.service");
const quota_types_1 = require("./quota.types");
const log = logger_1.logger.child({ module: 'quota-enforcement' });
// ===========================================
// Quota Enforcement Service
// ===========================================
class QuotaEnforcementServiceImpl {
    /**
     * Check if resource usage is allowed (non-throwing)
     * Follows hierarchy: member → dept → org → plan
     */
    async checkQuota(userId, organizationId, departmentId, resource, amount = 1) {
        // Get current usage
        const usage = await this.getCurrentUsage(userId, organizationId);
        const currentUsage = this.getUsageForResource(usage, resource);
        // Get effective limit following hierarchy
        const effectiveLimit = await this.getEffectiveLimit(userId, organizationId, departmentId, resource);
        // Unlimited
        if (effectiveLimit.limit === null) {
            return {
                allowed: true,
                limitType: effectiveLimit.source,
                allocMode: effectiveLimit.allocMode,
                current: currentUsage,
                limit: null,
            };
        }
        const newUsage = currentUsage + amount;
        const wouldExceed = newUsage > effectiveLimit.limit;
        // Handle based on allocation mode
        switch (effectiveLimit.allocMode) {
            case client_1.AllocationMode.UNLIMITED:
                return {
                    allowed: true,
                    limitType: effectiveLimit.source,
                    allocMode: effectiveLimit.allocMode,
                    current: currentUsage,
                    limit: null,
                };
            case client_1.AllocationMode.SOFT_CAP:
                // Allow but warn if at/over limit
                return {
                    allowed: true,
                    limitType: effectiveLimit.source,
                    allocMode: effectiveLimit.allocMode,
                    current: currentUsage,
                    limit: effectiveLimit.limit,
                    isWarning: wouldExceed,
                    message: wouldExceed
                        ? `Soft quota limit reached for ${resource}: ${newUsage}/${effectiveLimit.limit}`
                        : undefined,
                };
            case client_1.AllocationMode.HARD_CAP:
                return {
                    allowed: !wouldExceed,
                    limitType: effectiveLimit.source,
                    allocMode: effectiveLimit.allocMode,
                    current: currentUsage,
                    limit: effectiveLimit.limit,
                    message: wouldExceed
                        ? `Quota exceeded for ${resource}: ${newUsage}/${effectiveLimit.limit}`
                        : undefined,
                };
            case client_1.AllocationMode.RESERVED:
                // Reserved means guaranteed allocation - treat as hard cap
                return {
                    allowed: !wouldExceed,
                    limitType: effectiveLimit.source,
                    allocMode: effectiveLimit.allocMode,
                    current: currentUsage,
                    limit: effectiveLimit.limit,
                    message: wouldExceed
                        ? `Reserved quota exceeded for ${resource}: ${newUsage}/${effectiveLimit.limit}`
                        : undefined,
                };
            default:
                // Default to soft cap behavior
                return {
                    allowed: true,
                    limitType: effectiveLimit.source,
                    allocMode: effectiveLimit.allocMode,
                    current: currentUsage,
                    limit: effectiveLimit.limit,
                };
        }
    }
    /**
     * Enforce quota (throwing version)
     * Throws QuotaExceededError if HARD_CAP or RESERVED limit is exceeded
     */
    async enforceQuota(ctx, resource, amount = 1) {
        const result = await this.checkQuota(ctx.userId, ctx.organizationId ?? null, ctx.departmentId ?? null, resource, amount);
        if (!result.allowed) {
            log.warn({
                userId: ctx.userId,
                organizationId: ctx.organizationId,
                departmentId: ctx.departmentId,
                resource,
                current: result.current,
                limit: result.limit,
                allocMode: result.allocMode,
            }, 'Quota enforcement blocked action');
            throw new quota_service_1.QuotaExceededError(resource, result.current, result.limit ?? 0);
        }
        // Log warning for soft cap
        if (result.isWarning) {
            log.warn({
                userId: ctx.userId,
                resource,
                current: result.current,
                limit: result.limit,
            }, 'Soft quota limit reached');
        }
        return result;
    }
    /**
     * Get effective limit for a resource following hierarchy
     */
    async getEffectiveLimit(userId, organizationId, departmentId, resource) {
        // 1. Check member allocation first (most specific)
        if (departmentId) {
            const memberAlloc = await prisma_1.prisma.memberAllocation.findUnique({
                where: {
                    userId_departmentId: { userId, departmentId },
                },
            });
            if (memberAlloc) {
                const limit = this.getAllocationLimit(memberAlloc, resource);
                if (limit !== undefined) {
                    return {
                        limit,
                        source: 'member',
                        allocMode: memberAlloc.allocMode,
                    };
                }
            }
        }
        // 2. Check department allocation
        if (departmentId) {
            const deptAlloc = await prisma_1.prisma.deptAllocation.findUnique({
                where: { departmentId },
            });
            if (deptAlloc) {
                const limit = this.getDeptAllocationLimit(deptAlloc, resource);
                if (limit !== undefined) {
                    return {
                        limit,
                        source: 'department',
                        allocMode: deptAlloc.allocMode,
                    };
                }
            }
        }
        // 3. Check organization plan
        if (organizationId) {
            const org = await prisma_1.prisma.organization.findUnique({
                where: { id: organizationId },
                select: { plan: true },
            });
            if (org) {
                const planLimits = org_plans_1.ORG_PLAN_LIMITS[org.plan];
                if (planLimits) {
                    const limit = this.getOrgPlanLimit(planLimits, resource);
                    return {
                        limit,
                        source: 'organization',
                        allocMode: client_1.AllocationMode.SOFT_CAP, // Org plans default to soft cap
                    };
                }
            }
        }
        // 4. Fall back to user's personal plan
        const user = await prisma_1.prisma.user.findUnique({
            where: { id: userId },
            select: { plan: true },
        });
        if (user) {
            const planLimits = plans_1.PLAN_LIMITS[user.plan];
            if (planLimits) {
                const limit = this.getUserPlanLimit(planLimits, resource);
                return {
                    limit,
                    source: 'plan',
                    allocMode: client_1.AllocationMode.HARD_CAP, // Personal plans use hard cap
                };
            }
        }
        // Default: unlimited
        return {
            limit: null,
            source: 'plan',
            allocMode: client_1.AllocationMode.UNLIMITED,
        };
    }
    /**
     * Get multiple effective limits at once (for UI display)
     */
    async getEffectiveLimits(userId, organizationId, departmentId) {
        const resources = [
            quota_types_1.ResourceType.GATEWAY,
            quota_types_1.ResourceType.WORKFLOW,
            quota_types_1.ResourceType.PLUGIN,
            quota_types_1.ResourceType.API_CALL,
            quota_types_1.ResourceType.STORAGE,
        ];
        const limits = {};
        // Batch fetch allocations to minimize DB queries
        const [memberAlloc, deptAlloc, org, user] = await Promise.all([
            departmentId
                ? prisma_1.prisma.memberAllocation.findUnique({
                    where: { userId_departmentId: { userId, departmentId } },
                })
                : null,
            departmentId
                ? prisma_1.prisma.deptAllocation.findUnique({
                    where: { departmentId },
                })
                : null,
            organizationId
                ? prisma_1.prisma.organization.findUnique({
                    where: { id: organizationId },
                    select: { plan: true },
                })
                : null,
            prisma_1.prisma.user.findUnique({
                where: { id: userId },
                select: { plan: true },
            }),
        ]);
        for (const resource of resources) {
            // Check hierarchy
            if (memberAlloc) {
                const limit = this.getAllocationLimit(memberAlloc, resource);
                if (limit !== undefined) {
                    limits[resource] = {
                        limit,
                        source: 'member',
                        allocMode: memberAlloc.allocMode,
                    };
                    continue;
                }
            }
            if (deptAlloc) {
                const limit = this.getDeptAllocationLimit(deptAlloc, resource);
                if (limit !== undefined) {
                    limits[resource] = {
                        limit,
                        source: 'department',
                        allocMode: deptAlloc.allocMode,
                    };
                    continue;
                }
            }
            if (org) {
                const planLimits = org_plans_1.ORG_PLAN_LIMITS[org.plan];
                if (planLimits) {
                    limits[resource] = {
                        limit: this.getOrgPlanLimit(planLimits, resource),
                        source: 'organization',
                        allocMode: client_1.AllocationMode.SOFT_CAP,
                    };
                    continue;
                }
            }
            if (user) {
                const planLimits = plans_1.PLAN_LIMITS[user.plan];
                if (planLimits) {
                    limits[resource] = {
                        limit: this.getUserPlanLimit(planLimits, resource),
                        source: 'plan',
                        allocMode: client_1.AllocationMode.HARD_CAP,
                    };
                    continue;
                }
            }
            // Default
            limits[resource] = {
                limit: null,
                source: 'plan',
                allocMode: client_1.AllocationMode.UNLIMITED,
            };
        }
        return limits;
    }
    // =========================================
    // Private Helpers
    // =========================================
    async getCurrentUsage(userId, organizationId) {
        // Count gateways from the Gateway model
        const gatewayCount = await prisma_1.prisma.gateway.count({
            where: organizationId
                ? { organizationId }
                : { userId, organizationId: null },
        });
        // Count workflows from Workflow model
        const workflowCount = await prisma_1.prisma.workflow.count({
            where: organizationId
                ? { organizationId }
                : { userId, organizationId: null },
        });
        // Count plugins from UserPlugin model (installed plugins)
        const pluginCount = await prisma_1.prisma.userPlugin.count({
            where: organizationId
                ? { organizationId }
                : { userId, organizationId: null },
        });
        // Get API usage from quota record
        const quota = await prisma_1.prisma.resourceQuota.findFirst({
            where: organizationId
                ? { organizationId }
                : { userId },
        });
        return {
            gateways: gatewayCount,
            workflows: workflowCount,
            plugins: pluginCount,
            aiTokensUsed: quota?.usedApiCalls ?? 0,
        };
    }
    getUsageForResource(usage, resource) {
        switch (resource) {
            case quota_types_1.ResourceType.GATEWAY:
                return usage.gateways;
            case quota_types_1.ResourceType.WORKFLOW:
                return usage.workflows;
            case quota_types_1.ResourceType.PLUGIN:
                return usage.plugins;
            case quota_types_1.ResourceType.API_CALL:
                return usage.aiTokensUsed;
            default:
                return 0;
        }
    }
    getAllocationLimit(alloc, resource) {
        switch (resource) {
            case quota_types_1.ResourceType.GATEWAY:
                return alloc.maxGateways;
            case quota_types_1.ResourceType.WORKFLOW:
                return alloc.maxWorkflows;
            case quota_types_1.ResourceType.API_CALL:
                return alloc.aiTokenBudget;
            case quota_types_1.ResourceType.STORAGE:
                return alloc.maxStorageMb;
            default:
                return undefined; // Not set in this allocation
        }
    }
    getDeptAllocationLimit(alloc, resource) {
        switch (resource) {
            case quota_types_1.ResourceType.GATEWAY:
                return alloc.maxGateways;
            case quota_types_1.ResourceType.WORKFLOW:
                return alloc.maxWorkflows;
            case quota_types_1.ResourceType.PLUGIN:
                return alloc.maxPlugins;
            case quota_types_1.ResourceType.API_CALL:
                return alloc.aiTokenBudget;
            case quota_types_1.ResourceType.STORAGE:
                return alloc.maxStorageMb;
            default:
                return undefined;
        }
    }
    getOrgPlanLimit(planLimits, resource) {
        switch (resource) {
            case quota_types_1.ResourceType.GATEWAY:
                return planLimits.sharedGateways === -1 ? null : planLimits.sharedGateways;
            case quota_types_1.ResourceType.WORKFLOW:
                return planLimits.sharedWorkflows === -1 ? null : planLimits.sharedWorkflows;
            case quota_types_1.ResourceType.PLUGIN:
                return planLimits.sharedPlugins === -1 ? null : planLimits.sharedPlugins;
            case quota_types_1.ResourceType.API_CALL:
                return planLimits.sharedAiTokensPerMonth === -1 ? null : planLimits.sharedAiTokensPerMonth;
            case quota_types_1.ResourceType.STORAGE:
                return planLimits.pool?.storageMb ?? null;
            default:
                return null;
        }
    }
    getUserPlanLimit(planLimits, resource) {
        switch (resource) {
            case quota_types_1.ResourceType.GATEWAY:
                return planLimits.gateways === -1 ? null : planLimits.gateways;
            case quota_types_1.ResourceType.WORKFLOW:
                return planLimits.workflows === -1 ? null : planLimits.workflows;
            case quota_types_1.ResourceType.PLUGIN:
                return planLimits.plugins === -1 ? null : planLimits.plugins;
            case quota_types_1.ResourceType.API_CALL:
                return planLimits.executionsPerMonth;
            case quota_types_1.ResourceType.STORAGE:
                return planLimits.workspace?.storageMb ?? null;
            default:
                return null;
        }
    }
}
// Export singleton
exports.QuotaEnforcementService = new QuotaEnforcementServiceImpl();
//# sourceMappingURL=quota-enforcement.service.js.map