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

import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { ORG_PLAN_LIMITS, type OrgPlanType } from '@/shared/constants/org-plans';
import { PLAN_LIMITS, type PlanType } from '@/shared/constants/plans';
import type { ServiceContext } from '@/shared/types/context';
import { AllocationMode } from '@prisma/client';
import { QuotaExceededError } from './quota.service';
import { ResourceType } from './quota.types';

const log = logger.child({ module: 'quota-enforcement' });

// ===========================================
// Types
// ===========================================

export type LimitSource = 'member' | 'department' | 'organization' | 'plan';

export interface EffectiveLimit {
  limit: number | null;  // null = unlimited
  source: LimitSource;
  allocMode: AllocationMode;
}

export interface QuotaEnforcementResult {
  allowed: boolean;
  limitType: LimitSource;
  allocMode: AllocationMode;
  current: number;
  limit: number | null;
  message?: string;
  isWarning?: boolean;  // true for SOFT_CAP at limit
}

export interface ResourceUsageCounts {
  gateways: number;
  workflows: number;
  plugins: number;
  aiTokensUsed: number;
}

// ===========================================
// Quota Enforcement Service
// ===========================================

class QuotaEnforcementServiceImpl {
  /**
   * Check if resource usage is allowed (non-throwing)
   * Follows hierarchy: member → dept → org → plan
   */
  async checkQuota(
    userId: string,
    organizationId: string | null,
    departmentId: string | null,
    resource: ResourceType,
    amount: number = 1
  ): Promise<QuotaEnforcementResult> {
    // Get current usage
    const usage = await this.getCurrentUsage(userId, organizationId);
    const currentUsage = this.getUsageForResource(usage, resource);

    // Get effective limit following hierarchy
    const effectiveLimit = await this.getEffectiveLimit(
      userId,
      organizationId,
      departmentId,
      resource
    );

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
      case AllocationMode.UNLIMITED:
        return {
          allowed: true,
          limitType: effectiveLimit.source,
          allocMode: effectiveLimit.allocMode,
          current: currentUsage,
          limit: null,
        };

      case AllocationMode.SOFT_CAP:
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

      case AllocationMode.HARD_CAP:
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

      case AllocationMode.RESERVED:
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
  async enforceQuota(
    ctx: ServiceContext,
    resource: ResourceType,
    amount: number = 1
  ): Promise<QuotaEnforcementResult> {
    const result = await this.checkQuota(
      ctx.userId,
      ctx.organizationId ?? null,
      ctx.departmentId ?? null,
      resource,
      amount
    );

    if (!result.allowed) {
      log.warn(
        {
          userId: ctx.userId,
          organizationId: ctx.organizationId,
          departmentId: ctx.departmentId,
          resource,
          current: result.current,
          limit: result.limit,
          allocMode: result.allocMode,
        },
        'Quota enforcement blocked action'
      );

      throw new QuotaExceededError(
        resource,
        result.current,
        result.limit ?? 0
      );
    }

    // Log warning for soft cap
    if (result.isWarning) {
      log.warn(
        {
          userId: ctx.userId,
          resource,
          current: result.current,
          limit: result.limit,
        },
        'Soft quota limit reached'
      );
    }

    return result;
  }

  /**
   * Get effective limit for a resource following hierarchy
   */
  async getEffectiveLimit(
    userId: string,
    organizationId: string | null,
    departmentId: string | null,
    resource: ResourceType
  ): Promise<EffectiveLimit> {
    // 1. Check member allocation first (most specific)
    if (departmentId) {
      const memberAlloc = await prisma.memberAllocation.findUnique({
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
      const deptAlloc = await prisma.deptAllocation.findUnique({
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
      const org = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: { plan: true },
      });

      if (org) {
        const planLimits = ORG_PLAN_LIMITS[org.plan as OrgPlanType];
        if (planLimits) {
          const limit = this.getOrgPlanLimit(planLimits, resource);
          return {
            limit,
            source: 'organization',
            allocMode: AllocationMode.SOFT_CAP, // Org plans default to soft cap
          };
        }
      }
    }

    // 4. Fall back to user's personal plan
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { plan: true },
    });

    if (user) {
      const planLimits = PLAN_LIMITS[user.plan as PlanType];
      if (planLimits) {
        const limit = this.getUserPlanLimit(planLimits, resource);
        return {
          limit,
          source: 'plan',
          allocMode: AllocationMode.HARD_CAP, // Personal plans use hard cap
        };
      }
    }

    // Default: unlimited
    return {
      limit: null,
      source: 'plan',
      allocMode: AllocationMode.UNLIMITED,
    };
  }

  /**
   * Get multiple effective limits at once (for UI display)
   */
  async getEffectiveLimits(
    userId: string,
    organizationId: string | null,
    departmentId: string | null
  ): Promise<Record<ResourceType, EffectiveLimit>> {
    const resources: ResourceType[] = [
      ResourceType.GATEWAY,
      ResourceType.WORKFLOW,
      ResourceType.PLUGIN,
      ResourceType.API_CALL,
      ResourceType.STORAGE,
    ];

    const limits: Partial<Record<ResourceType, EffectiveLimit>> = {};

    // Batch fetch allocations to minimize DB queries
    const [memberAlloc, deptAlloc, org, user] = await Promise.all([
      departmentId
        ? prisma.memberAllocation.findUnique({
            where: { userId_departmentId: { userId, departmentId } },
          })
        : null,
      departmentId
        ? prisma.deptAllocation.findUnique({
            where: { departmentId },
          })
        : null,
      organizationId
        ? prisma.organization.findUnique({
            where: { id: organizationId },
            select: { plan: true },
          })
        : null,
      prisma.user.findUnique({
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
        const planLimits = ORG_PLAN_LIMITS[org.plan as OrgPlanType];
        if (planLimits) {
          limits[resource] = {
            limit: this.getOrgPlanLimit(planLimits, resource),
            source: 'organization',
            allocMode: AllocationMode.SOFT_CAP,
          };
          continue;
        }
      }

      if (user) {
        const planLimits = PLAN_LIMITS[user.plan as PlanType];
        if (planLimits) {
          limits[resource] = {
            limit: this.getUserPlanLimit(planLimits, resource),
            source: 'plan',
            allocMode: AllocationMode.HARD_CAP,
          };
          continue;
        }
      }

      // Default
      limits[resource] = {
        limit: null,
        source: 'plan',
        allocMode: AllocationMode.UNLIMITED,
      };
    }

    return limits as Record<ResourceType, EffectiveLimit>;
  }

  // =========================================
  // Private Helpers
  // =========================================

  private async getCurrentUsage(
    userId: string,
    organizationId: string | null
  ): Promise<ResourceUsageCounts> {
    // Count gateways from the Gateway model
    const gatewayCount = await prisma.gateway.count({
      where: organizationId
        ? { organizationId }
        : { userId, organizationId: null },
    });

    // Count workflows from Workflow model
    const workflowCount = await prisma.workflow.count({
      where: organizationId
        ? { organizationId }
        : { userId, organizationId: null },
    });

    // Count plugins from UserPlugin model (installed plugins)
    const pluginCount = await prisma.userPlugin.count({
      where: organizationId
        ? { organizationId }
        : { userId, organizationId: null },
    });

    // Get API usage from quota record
    const quota = await prisma.resourceQuota.findFirst({
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

  private getUsageForResource(
    usage: ResourceUsageCounts,
    resource: ResourceType
  ): number {
    switch (resource) {
      case ResourceType.GATEWAY:
        return usage.gateways;
      case ResourceType.WORKFLOW:
        return usage.workflows;
      case ResourceType.PLUGIN:
        return usage.plugins;
      case ResourceType.API_CALL:
        return usage.aiTokensUsed;
      default:
        return 0;
    }
  }

  private getAllocationLimit(
    alloc: {
      maxGateways: number | null;
      maxWorkflows: number | null;
      aiTokenBudget: number | null;
      maxRamMb: number | null;
      maxCpuCores: number | null;
      maxStorageMb: number | null;
    },
    resource: ResourceType
  ): number | null | undefined {
    switch (resource) {
      case ResourceType.GATEWAY:
        return alloc.maxGateways;
      case ResourceType.WORKFLOW:
        return alloc.maxWorkflows;
      case ResourceType.API_CALL:
        return alloc.aiTokenBudget;
      case ResourceType.STORAGE:
        return alloc.maxStorageMb;
      default:
        return undefined; // Not set in this allocation
    }
  }

  private getDeptAllocationLimit(
    alloc: {
      maxGateways: number | null;
      maxWorkflows: number | null;
      maxPlugins: number | null;
      aiTokenBudget: number | null;
      maxRamMb: number | null;
      maxCpuCores: number | null;
      maxStorageMb: number | null;
    },
    resource: ResourceType
  ): number | null | undefined {
    switch (resource) {
      case ResourceType.GATEWAY:
        return alloc.maxGateways;
      case ResourceType.WORKFLOW:
        return alloc.maxWorkflows;
      case ResourceType.PLUGIN:
        return alloc.maxPlugins;
      case ResourceType.API_CALL:
        return alloc.aiTokenBudget;
      case ResourceType.STORAGE:
        return alloc.maxStorageMb;
      default:
        return undefined;
    }
  }

  private getOrgPlanLimit(
    planLimits: (typeof ORG_PLAN_LIMITS)[OrgPlanType],
    resource: ResourceType
  ): number | null {
    switch (resource) {
      case ResourceType.GATEWAY:
        return planLimits.sharedGateways === -1 ? null : planLimits.sharedGateways;
      case ResourceType.WORKFLOW:
        return planLimits.sharedWorkflows === -1 ? null : planLimits.sharedWorkflows;
      case ResourceType.PLUGIN:
        return planLimits.sharedPlugins === -1 ? null : planLimits.sharedPlugins;
      case ResourceType.API_CALL:
        return planLimits.sharedAiTokensPerMonth === -1 ? null : planLimits.sharedAiTokensPerMonth;
      case ResourceType.STORAGE:
        return planLimits.pool?.storageMb ?? null;
      default:
        return null;
    }
  }

  private getUserPlanLimit(
    planLimits: (typeof PLAN_LIMITS)[PlanType],
    resource: ResourceType
  ): number | null {
    switch (resource) {
      case ResourceType.GATEWAY:
        return planLimits.gateways === -1 ? null : planLimits.gateways;
      case ResourceType.WORKFLOW:
        return planLimits.workflows === -1 ? null : planLimits.workflows;
      case ResourceType.PLUGIN:
        return planLimits.plugins === -1 ? null : planLimits.plugins;
      case ResourceType.API_CALL:
        return planLimits.executionsPerMonth;
      case ResourceType.STORAGE:
        return planLimits.workspace?.storageMb ?? null;
      default:
        return null;
    }
  }
}

// Export singleton
export const QuotaEnforcementService = new QuotaEnforcementServiceImpl();
