/**
 * Execution Tracker Service
 *
 * Tracks workflow and API executions against plan limits.
 * Provides warning levels based on usage thresholds.
 *
 * @module modules/quota/execution-tracker.service
 */

import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { redis } from '@/lib/redis';
import { ORG_PLAN_LIMITS, type OrgPlanType } from '@/shared/constants/org-plans';
import {
  PLAN_LIMITS,
  type PlanType
} from '@/shared/constants/plans';
import type { ServiceContext } from '@/shared/types/context';
import {
  type CanExecuteResult,
  type ExecutionCount,
  type ExecutionResourceUsage,
  type TrackResult,
  type UsageSummary,
  WARNING_THRESHOLDS,
  type WarningLevel,
  getCurrentPeriodEnd,
  getCurrentPeriodStart,
  getNextPeriodStart,
} from './execution-tracker.types';

const log = logger.child({ module: 'execution-tracker' });

// Redis key prefix for monthly execution counts
const EXEC_KEY_PREFIX = 'exec:monthly';

// ===========================================
// Warning Level Calculator
// ===========================================

/**
 * Calculate warning level based on usage percentage
 */
function getWarningLevel(current: number, limit: number | null): WarningLevel {
  if (limit === null || limit === -1) return 'none'; // Unlimited
  if (limit === 0) return 'blocked'; // Edge case
  
  const percentage = (current / limit) * 100;
  
  if (percentage >= WARNING_THRESHOLDS.BLOCKED) return 'blocked';
  if (percentage >= WARNING_THRESHOLDS.CRITICAL) return 'critical';
  if (percentage >= WARNING_THRESHOLDS.WARNING) return 'warning';
  return 'none';
}

/**
 * Calculate percentage (capped at 100)
 */
function calcPercentage(current: number, limit: number | null): number {
  if (limit === null || limit === -1 || limit === 0) return 0;
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
  async trackExecution(
    ctx: ServiceContext,
    workflowId?: string
  ): Promise<TrackResult> {
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
        log.warn(
          { 
            userId: ctx.userId, 
            organizationId: ctx.organizationId,
            current: execCount.current,
            limit: execCount.limit,
          },
          'Execution blocked - limit reached'
        );
        
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
        log.warn(
          { userId: ctx.userId, current: newCount, limit: execCount.limit },
          'Critical: 95% of execution limit used'
        );
      } else if (warningLevel === 'warning') {
        log.info(
          { userId: ctx.userId, current: newCount, limit: execCount.limit },
          'Warning: 80% of execution limit used'
        );
      }
      
      return {
        success: true,
        newCount,
        warningLevel,
        message: warningLevel !== 'none'
          ? `${calcPercentage(newCount, execCount.limit)}% of monthly limit used`
          : undefined,
      };
    } catch (err) {
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
  async getExecutionCount(ctx: ServiceContext): Promise<ExecutionCount> {
    const periodStart = getCurrentPeriodStart();
    const periodEnd = getCurrentPeriodEnd();
    
    // Get limit based on context (org or user)
    const { limit, isServerless } = await this.getExecutionLimit(ctx);
    
    // Get current count from Redis
    const key = this.buildRedisKey(ctx);
    const currentStr = await redis.get(key);
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
  async canExecute(ctx: ServiceContext): Promise<CanExecuteResult> {
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
  async getResetTime(ctx: ServiceContext): Promise<Date> {
    return getNextPeriodStart();
  }

  /**
   * Get full usage summary for a user/org
   */
  async getUsageSummary(ctx: ServiceContext): Promise<UsageSummary> {
    const execCount = await this.getExecutionCount(ctx);
    
    // Get resource counts
    const [gatewayCount, workflowCount, pluginCount, quotaRecord] = 
      await Promise.all([
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
      aiTokens: this.buildResourceUsage(
        quotaRecord?.usedApiCalls ?? 0, 
        limits.aiTokens
      ),
      storage: this.buildResourceUsage(
        quotaRecord?.usedStorage ?? 0, 
        limits.storage
      ),
    };
  }

  // =========================================
  // Private Helpers
  // =========================================

  private async getExecutionLimit(ctx: ServiceContext): Promise<{
    limit: number | null;
    isServerless: boolean;
  }> {
    // If in org context, check org plan
    if (ctx.organizationId) {
      const org = await prisma.organization.findUnique({
        where: { id: ctx.organizationId },
        select: { plan: true },
      });
      
      if (org) {
        const orgLimits = ORG_PLAN_LIMITS[org.plan as OrgPlanType];
        if (orgLimits) {
          // All org plans are workspace mode (unlimited executions)
          return { limit: null, isServerless: false };
        }
      }
    }
    
    // Get user's plan
    const user = await prisma.user.findUnique({
      where: { id: ctx.userId },
      select: { plan: true, executionMode: true },
    });
    
    if (!user) {
      return { limit: 500, isServerless: true }; // Default to FREE
    }
    
    const plan = user.plan as PlanType;
    const planLimits = PLAN_LIMITS[plan];
    
    // Check if user has workspace mode (via plan or add-on)
    const isServerless = user.executionMode === 'SERVERLESS';
    
    return {
      limit: isServerless ? planLimits.executionsPerMonth : null,
      isServerless,
    };
  }

  private async getResourceLimits(ctx: ServiceContext): Promise<{
    gateways: number | null;
    workflows: number | null;
    plugins: number | null;
    aiTokens: number | null;
    storage: number | null;
  }> {
    // If in org context, use org limits
    if (ctx.organizationId) {
      const org = await prisma.organization.findUnique({
        where: { id: ctx.organizationId },
        select: { plan: true },
      });
      
      if (org) {
        const limits = ORG_PLAN_LIMITS[org.plan as OrgPlanType];
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
    const user = await prisma.user.findUnique({
      where: { id: ctx.userId },
      select: { plan: true },
    });
    
    const plan = (user?.plan ?? 'FREE') as PlanType;
    const limits = PLAN_LIMITS[plan];
    
    return {
      gateways: limits.gateways === -1 ? null : limits.gateways,
      workflows: limits.workflows === -1 ? null : limits.workflows,
      plugins: limits.plugins === -1 ? null : limits.plugins,
      aiTokens: limits.aiTokensPerMonth === -1 ? null : limits.aiTokensPerMonth,
      storage: limits.workspace?.storageMb ?? null,
    };
  }

  private buildResourceUsage(
    current: number,
    limit: number | null
  ): ExecutionResourceUsage {
    return {
      current,
      limit,
      percentage: calcPercentage(current, limit),
      warningLevel: getWarningLevel(current, limit),
    };
  }

  private async incrementExecutionCount(ctx: ServiceContext): Promise<number> {
    const key = this.buildRedisKey(ctx);
    
    // Increment and set expiry to end of month + 1 day buffer
    const newCount = await redis.incr(key);
    
    // Set expiry if this is the first increment
    if (newCount === 1) {
      const periodEnd = getCurrentPeriodEnd();
      const ttlSeconds = Math.ceil((periodEnd.getTime() - Date.now()) / 1000) + 86400;
      await redis.expire(key, ttlSeconds);
    }
    
    return newCount;
  }

  private buildRedisKey(ctx: ServiceContext): string {
    const period = this.getCurrentPeriodKey();
    
    if (ctx.organizationId) {
      return `${EXEC_KEY_PREFIX}:org:${ctx.organizationId}:${period}`;
    }
    return `${EXEC_KEY_PREFIX}:user:${ctx.userId}:${period}`;
  }

  private getCurrentPeriodKey(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  private async countGateways(ctx: ServiceContext): Promise<number> {
    return prisma.gateway.count({
      where: ctx.organizationId
        ? { organizationId: ctx.organizationId }
        : { userId: ctx.userId, organizationId: null },
    });
  }

  private async countWorkflows(ctx: ServiceContext): Promise<number> {
    return prisma.workflow.count({
      where: ctx.organizationId
        ? { organizationId: ctx.organizationId }
        : { userId: ctx.userId, organizationId: null },
    });
  }

  private async countPlugins(ctx: ServiceContext): Promise<number> {
    return prisma.userPlugin.count({
      where: ctx.organizationId
        ? { organizationId: ctx.organizationId }
        : { userId: ctx.userId, organizationId: null },
    });
  }

  private async getQuotaRecord(ctx: ServiceContext) {
    return prisma.resourceQuota.findFirst({
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
export const ExecutionTrackerService = new ExecutionTrackerServiceImpl();
