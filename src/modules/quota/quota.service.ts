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

import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import type { PlanType } from '@/shared/constants/plans';
import { AppError } from '@/shared/errors';
import type { ServiceContext } from '@/shared/types/context';
import {
    PLAN_QUOTA_LIMITS,
    ResourceType,
    type PeriodType,
    type QuotaCheckResult,
    type QuotaItem,
    type QuotaOwner,
    type QuotaStatus,
    type ResourceLimits,
    type SetQuotasInput,
    type UsageRecord,
} from './quota.types';

const log = logger.child({ module: 'quota' });

// ===========================================
// Custom Errors
// ===========================================

export class QuotaExceededError extends AppError {
  public readonly resource: ResourceType;
  public readonly current: number;
  public readonly limit: number;

  constructor(resource: ResourceType, current: number, limit: number) {
    super(
      `Quota exceeded for ${resource}: ${current}/${limit}`,
      'QUOTA_EXCEEDED',
      403
    );
    this.resource = resource;
    this.current = current;
    this.limit = limit;
  }
}

// ===========================================
// Quota Service
// ===========================================

class QuotaServiceImpl {
  // ===== Quota Checking =====

  /**
   * Check if operation is allowed within quota
   * Throws QuotaExceededError if limit reached
   */
  async checkQuota(
    ctx: ServiceContext,
    resource: ResourceType,
    amount: number = 1
  ): Promise<void> {
    const result = await this.canUseResource(ctx, resource, amount);

    if (!result.allowed) {
      throw new QuotaExceededError(
        resource,
        result.current,
        result.limit ?? 0
      );
    }
  }

  /**
   * Check if resource can be used (non-throwing)
   */
  async canUseResource(
    ctx: ServiceContext,
    resource: ResourceType,
    amount: number = 1
  ): Promise<QuotaCheckResult> {
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
  async getQuotaStatus(ctx: ServiceContext): Promise<QuotaStatus> {
    const limits = await this.getEffectiveLimits(ctx);
    const usage = await this.getCurrentUsage(ctx);
    const quota = await this.getOrCreateQuota(ctx);

    const createItem = (
      used: number,
      limit: number | null
    ): QuotaItem => {
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
  async getEffectiveLimits(ctx: ServiceContext): Promise<ResourceLimits> {
    const plan = ctx.effectivePlan ?? ctx.userPlan;
    const planLimits = PLAN_QUOTA_LIMITS[plan as PlanType] ?? PLAN_QUOTA_LIMITS.FREE;

    // Start with plan defaults
    let limits: ResourceLimits = { ...planLimits };

    // If in org context, check org quota
    if (ctx.organizationId) {
      const orgQuota = await prisma.resourceQuota.findUnique({
        where: { organizationId: ctx.organizationId },
      });

      if (orgQuota) {
        limits = this.mergeQuotas(limits, orgQuota);
      }

      // If user is in a department, check dept quota
      if (ctx.departmentId) {
        const deptQuota = await prisma.resourceQuota.findUnique({
          where: { departmentId: ctx.departmentId },
        });

        if (deptQuota) {
          limits = this.mergeQuotas(limits, deptQuota);
        }
      }
    }

    // Check user-specific quota
    const userQuota = await prisma.resourceQuota.findUnique({
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
  async incrementUsage(
    ctx: ServiceContext,
    resource: ResourceType,
    amount: number = 1
  ): Promise<void> {
    const quota = await this.getOrCreateQuota(ctx);
    if (!quota) return;

    const field = this.getUsageFieldForResource(resource);
    if (!field) return;

    await prisma.resourceQuota.update({
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
  async decrementUsage(
    ctx: ServiceContext,
    resource: ResourceType,
    amount: number = 1
  ): Promise<void> {
    const quota = await this.getOrCreateQuota(ctx);
    if (!quota) return;

    const field = this.getUsageFieldForResource(resource);
    if (!field) return;

    // Ensure we don't go below 0
    const currentValue = (quota[field as keyof typeof quota] as number) ?? 0;
    const newValue = Math.max(0, currentValue - amount);

    await prisma.resourceQuota.update({
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
  async resetDailyCounters(): Promise<number> {
    const result = await prisma.resourceQuota.updateMany({
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
  async setOrganizationQuotas(
    ctx: ServiceContext,
    organizationId: string,
    quotas: SetQuotasInput
  ): Promise<void> {
    await prisma.resourceQuota.upsert({
      where: { organizationId },
      create: {
        organizationId,
        ...this.sanitizeQuotaInput(quotas),
      },
      update: this.sanitizeQuotaInput(quotas),
    });

    log.info(
      { organizationId, quotas, userId: ctx.userId },
      'Updated organization quotas'
    );
  }

  /**
   * Set quotas for department (Owner only)
   */
  async setDepartmentQuotas(
    ctx: ServiceContext,
    departmentId: string,
    quotas: SetQuotasInput
  ): Promise<void> {
    // Validate quotas don't exceed org limits
    if (ctx.organizationId) {
      const orgLimits = await this.getOrgLimits(ctx.organizationId);
      this.validateQuotasWithinParent(quotas, orgLimits);
    }

    await prisma.resourceQuota.upsert({
      where: { departmentId },
      create: {
        departmentId,
        ...this.sanitizeQuotaInput(quotas),
      },
      update: this.sanitizeQuotaInput(quotas),
    });

    log.info(
      { departmentId, quotas, userId: ctx.userId },
      'Updated department quotas'
    );
  }

  /**
   * Set quotas for employee (Manager only)
   */
  async setEmployeeQuotas(
    ctx: ServiceContext,
    userId: string,
    quotas: SetQuotasInput
  ): Promise<void> {
    // Validate quotas don't exceed dept limits
    if (ctx.departmentId) {
      const deptLimits = await this.getDeptLimits(ctx.departmentId);
      this.validateQuotasWithinParent(quotas, deptLimits);
    }

    await prisma.resourceQuota.upsert({
      where: { userId },
      create: {
        userId,
        ...this.sanitizeQuotaInput(quotas),
      },
      update: this.sanitizeQuotaInput(quotas),
    });

    log.info(
      { targetUserId: userId, quotas, updatedBy: ctx.userId },
      'Updated employee quotas'
    );
  }

  /**
   * Get quotas for a specific entity
   */
  async getQuotas(owner: QuotaOwner): Promise<ResourceLimits | null> {
    let quota;

    if (owner.organizationId) {
      quota = await prisma.resourceQuota.findUnique({
        where: { organizationId: owner.organizationId },
      });
    } else if (owner.departmentId) {
      quota = await prisma.resourceQuota.findUnique({
        where: { departmentId: owner.departmentId },
      });
    } else if (owner.userId) {
      quota = await prisma.resourceQuota.findUnique({
        where: { userId: owner.userId },
      });
    }

    if (!quota) return null;

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
  async recordUsageHistory(
    owner: QuotaOwner,
    record: Omit<UsageRecord, 'periodStart' | 'periodType'>
  ): Promise<void> {
    const periodStart = this.getPeriodStart('DAILY');

    const data = {
      periodStart,
      periodType: 'DAILY' as const,
      apiCalls: record.apiCalls,
      workflowRuns: record.workflowRuns,
      pluginExecutions: record.pluginExecutions,
      storageUsed: record.storageUsed,
      errors: record.errors,
      estimatedCost: record.estimatedCost,
    };

    if (owner.organizationId) {
      await prisma.usageHistory.upsert({
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
    } else if (owner.userId) {
      await prisma.usageHistory.upsert({
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
  async getUsageHistory(
    owner: QuotaOwner,
    periodType: PeriodType,
    startDate: Date,
    endDate: Date
  ): Promise<UsageRecord[]> {
    const where: Record<string, unknown> = {
      periodType,
      periodStart: {
        gte: startDate,
        lte: endDate,
      },
    };

    if (owner.organizationId) {
      where.organizationId = owner.organizationId;
    } else if (owner.departmentId) {
      where.departmentId = owner.departmentId;
    } else if (owner.userId) {
      where.userId = owner.userId;
    }

    const records = await prisma.usageHistory.findMany({
      where,
      orderBy: { periodStart: 'asc' },
    });

    return records.map((r) => ({
      periodStart: r.periodStart,
      periodType: r.periodType as PeriodType,
      apiCalls: r.apiCalls,
      workflowRuns: r.workflowRuns,
      pluginExecutions: r.pluginExecutions,
      storageUsed: r.storageUsed,
      errors: r.errors,
      estimatedCost: r.estimatedCost?.toNumber(),
    }));
  }

  // ===== Private Helpers =====

  private async getOrCreateQuota(
    ctx: ServiceContext
  ): Promise<{
    id: string;
    usedWorkflows: number;
    usedPlugins: number;
    usedApiCalls: number;
    usedStorage: number;
    apiCallsResetAt: Date | null;
  } | null> {
    // Determine which quota to use based on context
    if (ctx.contextType === 'organization' && ctx.organizationId) {
      return prisma.resourceQuota.upsert({
        where: { organizationId: ctx.organizationId },
        create: { organizationId: ctx.organizationId },
        update: {},
      });
    }

    // Personal context - use user quota
    return prisma.resourceQuota.upsert({
      where: { userId: ctx.userId },
      create: { userId: ctx.userId },
      update: {},
    });
  }

  private async getCurrentUsage(
    ctx: ServiceContext
  ): Promise<{
    usedWorkflows: number;
    usedPlugins: number;
    usedApiCalls: number;
    usedStorage: number;
    usedGateways: number;
  }> {
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

  private async countResources(
    ctx: ServiceContext,
    resource: 'workflow' | 'userPlugin' | 'gateway'
  ): Promise<number> {
    const where: Record<string, unknown> =
      ctx.contextType === 'organization' && ctx.organizationId
        ? { organizationId: ctx.organizationId }
        : { userId: ctx.userId };

    if (resource === 'workflow') {
      return prisma.workflow.count({ where });
    } else if (resource === 'userPlugin') {
      return prisma.userPlugin.count({ where });
    } else {
      return prisma.gateway.count({ where });
    }
  }

  private async getOrgLimits(organizationId: string): Promise<ResourceLimits> {
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      include: { resourceQuota: true },
    });

    if (!org) {
      return PLAN_QUOTA_LIMITS.FREE;
    }

    const planLimits = PLAN_QUOTA_LIMITS[org.plan as PlanType] ?? PLAN_QUOTA_LIMITS.FREE;

    if (org.resourceQuota) {
      return this.mergeQuotas(planLimits, org.resourceQuota);
    }

    return planLimits;
  }

  private async getDeptLimits(departmentId: string): Promise<ResourceLimits> {
    const dept = await prisma.department.findUnique({
      where: { id: departmentId },
      include: {
        organization: true,
        resourceQuota: true,
      },
    });

    if (!dept) {
      return PLAN_QUOTA_LIMITS.FREE;
    }

    // Start with org limits
    const orgLimits = await this.getOrgLimits(dept.organizationId);

    // Apply dept overrides
    if (dept.resourceQuota) {
      return this.mergeQuotas(orgLimits, dept.resourceQuota);
    }

    return orgLimits;
  }

  private mergeQuotas(
    base: ResourceLimits,
    override: Partial<ResourceLimits> | null
  ): ResourceLimits {
    if (!override) return base;

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

  private validateQuotasWithinParent(
    quotas: SetQuotasInput,
    parentLimits: ResourceLimits
  ): void {
    const check = (
      value: number | null | undefined,
      parentValue: number | null,
      name: string
    ) => {
      if (value === null || value === undefined) return;
      if (parentValue === null || parentValue === -1) return; // Parent is unlimited
      if (value > parentValue) {
        throw new AppError(
          `${name} cannot exceed parent limit of ${parentValue}`,
          'INVALID_QUOTA',
          400
        );
      }
    };

    check(quotas.maxWorkflows, parentLimits.maxWorkflows, 'maxWorkflows');
    check(quotas.maxPlugins, parentLimits.maxPlugins, 'maxPlugins');
    check(quotas.maxApiCalls, parentLimits.maxApiCalls, 'maxApiCalls');
    check(quotas.maxStorage, parentLimits.maxStorage, 'maxStorage');
    check(quotas.maxSteps, parentLimits.maxSteps, 'maxSteps');
  }

  private sanitizeQuotaInput(
    input: SetQuotasInput
  ): Record<string, number | null> {
    const result: Record<string, number | null> = {};

    if (input.maxWorkflows !== undefined)
      result.maxWorkflows = input.maxWorkflows;
    if (input.maxPlugins !== undefined) result.maxPlugins = input.maxPlugins;
    if (input.maxApiCalls !== undefined) result.maxApiCalls = input.maxApiCalls;
    if (input.maxStorage !== undefined) result.maxStorage = input.maxStorage;
    if (input.maxSteps !== undefined) result.maxSteps = input.maxSteps;

    return result;
  }

  private getLimitForResource(
    limits: ResourceLimits,
    resource: ResourceType
  ): number | null {
    switch (resource) {
      case ResourceType.WORKFLOW:
        return limits.maxWorkflows;
      case ResourceType.PLUGIN:
        return limits.maxPlugins;
      case ResourceType.API_CALL:
        return limits.maxApiCalls;
      case ResourceType.STORAGE:
        return limits.maxStorage;
      case ResourceType.WORKFLOW_STEP:
        return limits.maxSteps;
      case ResourceType.GATEWAY:
        return limits.maxGateways;
      case ResourceType.DEPARTMENT:
        return limits.maxDepartments;
      case ResourceType.MEMBER:
        return limits.maxMembers;
      default:
        return null;
    }
  }

  private getUsageForResource(
    usage: {
      usedWorkflows: number;
      usedPlugins: number;
      usedApiCalls: number;
      usedStorage: number;
      usedGateways: number;
    },
    resource: ResourceType
  ): number {
    switch (resource) {
      case ResourceType.WORKFLOW:
        return usage.usedWorkflows;
      case ResourceType.PLUGIN:
        return usage.usedPlugins;
      case ResourceType.API_CALL:
        return usage.usedApiCalls;
      case ResourceType.STORAGE:
        return usage.usedStorage;
      case ResourceType.GATEWAY:
        return usage.usedGateways;
      default:
        return 0;
    }
  }

  private getUsageFieldForResource(resource: ResourceType): string | null {
    switch (resource) {
      case ResourceType.WORKFLOW:
        return 'usedWorkflows';
      case ResourceType.PLUGIN:
        return 'usedPlugins';
      case ResourceType.API_CALL:
        return 'usedApiCalls';
      case ResourceType.STORAGE:
        return 'usedStorage';
      default:
        return null;
    }
  }

  private getNextResetTime(): Date {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    return tomorrow;
  }

  private getPeriodStart(periodType: PeriodType): Date {
    const now = new Date();

    switch (periodType) {
      case 'HOURLY':
        return new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate(),
          now.getHours(),
          0,
          0,
          0
        );
      case 'DAILY':
        return new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate(),
          0,
          0,
          0,
          0
        );
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
export const quotaService = new QuotaServiceImpl();
