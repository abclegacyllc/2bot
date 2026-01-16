/**
 * Usage Tracker Service
 *
 * Real-time usage tracking with Redis for fast counters.
 * Tracks API calls, workflow runs, plugin executions, and storage.
 *
 * Architecture:
 * - Redis: Fast counters for real-time tracking
 * - Database: Periodic flush for persistence
 * - Aggregation: Hourly/daily summaries for reporting
 *
 * @module modules/quota/usage-tracker.service
 */

import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { redis } from '@/lib/redis';
import type { ServiceContext } from '@/shared/types/context';
import type { PeriodType, QuotaOwner } from './quota.types';

const log = logger.child({ module: 'usage-tracker' });

// ===========================================
// Types
// ===========================================

export interface RealTimeUsage {
  apiCalls: number;
  workflowRuns: number;
  pluginExecutions: number;
  storageUsed: number;
  errors: number;
  periodStart: Date;
  periodType: PeriodType;
}

export interface UsageMetrics {
  apiCalls: number;
  workflowRuns: number;
  pluginExecutions: number;
  storageUsed: number;
  errors: number;
}

export interface TrackingEvent {
  type: 'api_call' | 'workflow_run' | 'plugin_execution' | 'storage_change' | 'error';
  amount?: number;
  metadata?: Record<string, unknown>;
}

// Redis key prefixes
const REDIS_KEYS = {
  API_CALLS: 'usage:api_calls',
  WORKFLOW_RUNS: 'usage:workflow_runs',
  PLUGIN_EXECUTIONS: 'usage:plugin_executions',
  STORAGE: 'usage:storage',
  ERRORS: 'usage:errors',
} as const;

// ===========================================
// Usage Tracker Service
// ===========================================

class UsageTrackerServiceImpl {
  /**
   * Track an API call
   * Called from middleware on each API request
   */
  async trackApiCall(ctx: ServiceContext): Promise<void> {
    const key = this.buildKey(REDIS_KEYS.API_CALLS, ctx);
    
    try {
      // Increment Redis counter (expires at end of day)
      await redis.incr(key);
      await this.setExpireAtEndOfDay(key);
      
      // Also increment in database for persistence
      await this.incrementDatabaseUsage(ctx, 'apiCalls');
      
      log.debug({ userId: ctx.userId, organizationId: ctx.organizationId }, 'Tracked API call');
    } catch (err) {
      log.error({ err, userId: ctx.userId }, 'Failed to track API call');
    }
  }

  /**
   * Track a workflow execution
   */
  async trackWorkflowRun(
    ctx: ServiceContext,
    workflowId: string,
    stepCount: number = 1
  ): Promise<void> {
    const key = this.buildKey(REDIS_KEYS.WORKFLOW_RUNS, ctx);
    
    try {
      await redis.incr(key);
      await this.setExpireAtEndOfDay(key);
      
      await this.incrementDatabaseUsage(ctx, 'workflowRuns');
      
      log.debug(
        { userId: ctx.userId, workflowId, stepCount },
        'Tracked workflow run'
      );
    } catch (err) {
      log.error({ err, workflowId }, 'Failed to track workflow run');
    }
  }

  /**
   * Track a plugin execution
   */
  async trackPluginExecution(
    ctx: ServiceContext,
    pluginId: string
  ): Promise<void> {
    const key = this.buildKey(REDIS_KEYS.PLUGIN_EXECUTIONS, ctx);
    
    try {
      await redis.incr(key);
      await this.setExpireAtEndOfDay(key);
      
      await this.incrementDatabaseUsage(ctx, 'pluginExecutions');
      
      log.debug({ userId: ctx.userId, pluginId }, 'Tracked plugin execution');
    } catch (err) {
      log.error({ err, pluginId }, 'Failed to track plugin execution');
    }
  }

  /**
   * Track storage change (positive = added, negative = removed)
   */
  async trackStorageChange(
    ctx: ServiceContext,
    deltaBytes: number
  ): Promise<void> {
    const key = this.buildKey(REDIS_KEYS.STORAGE, ctx);
    
    try {
      // Convert to MB for storage
      const deltaMB = Math.ceil(deltaBytes / (1024 * 1024));
      await redis.incrby(key, deltaMB);
      await this.setExpireAtEndOfDay(key);
      
      // Update database
      if (deltaBytes > 0) {
        await this.incrementDatabaseStorage(ctx, deltaMB);
      } else {
        await this.decrementDatabaseStorage(ctx, Math.abs(deltaMB));
      }
      
      log.debug({ userId: ctx.userId, deltaMB }, 'Tracked storage change');
    } catch (err) {
      log.error({ err, deltaBytes }, 'Failed to track storage change');
    }
  }

  /**
   * Track an error occurrence
   */
  async trackError(
    ctx: ServiceContext,
    errorType?: string
  ): Promise<void> {
    const key = this.buildKey(REDIS_KEYS.ERRORS, ctx);
    
    try {
      await redis.incr(key);
      await this.setExpireAtEndOfDay(key);
      
      await this.incrementDatabaseUsage(ctx, 'errors');
      
      log.debug({ userId: ctx.userId, errorType }, 'Tracked error');
    } catch (err) {
      log.error({ err, errorType }, 'Failed to track error');
    }
  }

  /**
   * Get real-time usage from Redis
   */
  async getRealTimeUsage(ctx: ServiceContext): Promise<RealTimeUsage> {
    try {
      const [apiCalls, workflowRuns, pluginExecutions, storage, errors] = await Promise.all([
        redis.get(this.buildKey(REDIS_KEYS.API_CALLS, ctx)),
        redis.get(this.buildKey(REDIS_KEYS.WORKFLOW_RUNS, ctx)),
        redis.get(this.buildKey(REDIS_KEYS.PLUGIN_EXECUTIONS, ctx)),
        redis.get(this.buildKey(REDIS_KEYS.STORAGE, ctx)),
        redis.get(this.buildKey(REDIS_KEYS.ERRORS, ctx)),
      ]);
      
      return {
        apiCalls: parseInt(apiCalls || '0'),
        workflowRuns: parseInt(workflowRuns || '0'),
        pluginExecutions: parseInt(pluginExecutions || '0'),
        storageUsed: parseInt(storage || '0'),
        errors: parseInt(errors || '0'),
        periodStart: this.getStartOfDay(),
        periodType: 'DAILY',
      };
    } catch (err) {
      log.error({ err, userId: ctx.userId }, 'Failed to get real-time usage');
      
      // Fall back to database
      return this.getUsageFromDatabase(ctx);
    }
  }

  /**
   * Aggregate hourly usage and store in history
   * Should be called by a cron job every hour
   */
  async aggregateHourlyUsage(): Promise<number> {
    const hourStart = this.getStartOfHour();
    let aggregated = 0;
    
    try {
      // Get all organizations
      const orgs = await prisma.organization.findMany({
        select: { id: true },
      });
      
      for (const org of orgs) {
        const metrics = await this.getHourlyMetrics(org.id, 'organization');
        
        await prisma.usageHistory.upsert({
          where: {
            organizationId_periodStart_periodType: {
              organizationId: org.id,
              periodStart: hourStart,
              periodType: 'HOURLY',
            },
          },
          create: {
            organizationId: org.id,
            periodStart: hourStart,
            periodType: 'HOURLY',
            ...metrics,
          },
          update: metrics,
        });
        
        aggregated++;
      }
      
      // Also aggregate for users without organization (personal usage)
      const personalUsers = await prisma.user.findMany({
        where: {
          memberships: { none: {} },
        },
        select: { id: true },
      });
      
      for (const user of personalUsers) {
        const metrics = await this.getHourlyMetrics(user.id, 'user');
        
        await prisma.usageHistory.upsert({
          where: {
            userId_periodStart_periodType: {
              userId: user.id,
              periodStart: hourStart,
              periodType: 'HOURLY',
            },
          },
          create: {
            userId: user.id,
            periodStart: hourStart,
            periodType: 'HOURLY',
            ...metrics,
          },
          update: metrics,
        });
        
        aggregated++;
      }
      
      log.info({ aggregated, hourStart }, 'Completed hourly usage aggregation');
      return aggregated;
    } catch (err) {
      log.error({ err }, 'Failed to aggregate hourly usage');
      throw err;
    }
  }

  /**
   * Aggregate daily usage from hourly records
   * Should be called by a cron job at midnight
   */
  async aggregateDailyUsage(): Promise<number> {
    const dayStart = this.getStartOfDay();
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);
    
    let aggregated = 0;
    
    try {
      // Get all organizations with hourly records for today
      const orgHourlyRecords = await prisma.usageHistory.groupBy({
        by: ['organizationId'],
        where: {
          organizationId: { not: null },
          periodType: 'HOURLY',
          periodStart: { gte: dayStart, lt: dayEnd },
        },
        _sum: {
          apiCalls: true,
          workflowRuns: true,
          pluginExecutions: true,
          errors: true,
        },
        _max: {
          storageUsed: true, // Take max storage for the day
        },
      });
      
      for (const record of orgHourlyRecords) {
        if (!record.organizationId) continue;
        
        await prisma.usageHistory.upsert({
          where: {
            organizationId_periodStart_periodType: {
              organizationId: record.organizationId,
              periodStart: dayStart,
              periodType: 'DAILY',
            },
          },
          create: {
            organizationId: record.organizationId,
            periodStart: dayStart,
            periodType: 'DAILY',
            apiCalls: record._sum.apiCalls || 0,
            workflowRuns: record._sum.workflowRuns || 0,
            pluginExecutions: record._sum.pluginExecutions || 0,
            storageUsed: record._max.storageUsed || 0,
            errors: record._sum.errors || 0,
          },
          update: {
            apiCalls: record._sum.apiCalls || 0,
            workflowRuns: record._sum.workflowRuns || 0,
            pluginExecutions: record._sum.pluginExecutions || 0,
            storageUsed: record._max.storageUsed || 0,
            errors: record._sum.errors || 0,
          },
        });
        
        aggregated++;
      }
      
      // Same for user records
      const userHourlyRecords = await prisma.usageHistory.groupBy({
        by: ['userId'],
        where: {
          userId: { not: null },
          periodType: 'HOURLY',
          periodStart: { gte: dayStart, lt: dayEnd },
        },
        _sum: {
          apiCalls: true,
          workflowRuns: true,
          pluginExecutions: true,
          errors: true,
        },
        _max: {
          storageUsed: true,
        },
      });
      
      for (const record of userHourlyRecords) {
        if (!record.userId) continue;
        
        await prisma.usageHistory.upsert({
          where: {
            userId_periodStart_periodType: {
              userId: record.userId,
              periodStart: dayStart,
              periodType: 'DAILY',
            },
          },
          create: {
            userId: record.userId,
            periodStart: dayStart,
            periodType: 'DAILY',
            apiCalls: record._sum.apiCalls || 0,
            workflowRuns: record._sum.workflowRuns || 0,
            pluginExecutions: record._sum.pluginExecutions || 0,
            storageUsed: record._max.storageUsed || 0,
            errors: record._sum.errors || 0,
          },
          update: {
            apiCalls: record._sum.apiCalls || 0,
            workflowRuns: record._sum.workflowRuns || 0,
            pluginExecutions: record._sum.pluginExecutions || 0,
            storageUsed: record._max.storageUsed || 0,
            errors: record._sum.errors || 0,
          },
        });
        
        aggregated++;
      }
      
      log.info({ aggregated, dayStart }, 'Completed daily usage aggregation');
      return aggregated;
    } catch (err) {
      log.error({ err }, 'Failed to aggregate daily usage');
      throw err;
    }
  }

  /**
   * Get usage history for dashboard charts
   */
  async getUsageHistory(
    owner: QuotaOwner,
    options: {
      period: PeriodType;
      startDate: Date;
      endDate: Date;
    }
  ): Promise<RealTimeUsage[]> {
    const where: Record<string, unknown> = {
      periodType: options.period,
      periodStart: {
        gte: options.startDate,
        lte: options.endDate,
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
      apiCalls: r.apiCalls,
      workflowRuns: r.workflowRuns,
      pluginExecutions: r.pluginExecutions,
      storageUsed: r.storageUsed,
      errors: r.errors,
      periodStart: r.periodStart,
      periodType: r.periodType as PeriodType,
    }));
  }

  /**
   * Flush Redis counters to database
   * Should be called periodically to ensure data persistence
   */
  async flushToDatabase(): Promise<void> {
    log.info('Flushing Redis usage counters to database');
    
    // This is a simplified version - in production you'd want to
    // iterate through all keys and flush them
    // For now, the individual track methods already write to DB
  }

  // ===========================================
  // Private Helpers
  // ===========================================

  private buildKey(prefix: string, ctx: ServiceContext): string {
    const date = this.getDateKey();
    
    if (ctx.contextType === 'organization' && ctx.organizationId) {
      return `${prefix}:org:${ctx.organizationId}:${date}`;
    }
    
    return `${prefix}:user:${ctx.userId}:${date}`;
  }

  private getDateKey(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

  private async setExpireAtEndOfDay(key: string): Promise<void> {
    const now = new Date();
    const endOfDay = new Date(now);
    endOfDay.setDate(endOfDay.getDate() + 1);
    endOfDay.setHours(0, 0, 0, 0);
    
    const ttl = Math.floor((endOfDay.getTime() - now.getTime()) / 1000);
    await redis.expire(key, ttl + 3600); // Add 1 hour buffer
  }

  private getStartOfDay(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  }

  private getStartOfHour(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), 0, 0, 0);
  }

  private async incrementDatabaseUsage(
    ctx: ServiceContext,
    field: 'apiCalls' | 'workflowRuns' | 'pluginExecutions' | 'errors'
  ): Promise<void> {
    const periodStart = this.getStartOfHour();
    
    if (ctx.contextType === 'organization' && ctx.organizationId) {
      await prisma.usageHistory.upsert({
        where: {
          organizationId_periodStart_periodType: {
            organizationId: ctx.organizationId,
            periodStart,
            periodType: 'HOURLY',
          },
        },
        create: {
          organizationId: ctx.organizationId,
          periodStart,
          periodType: 'HOURLY',
          [field]: 1,
        },
        update: {
          [field]: { increment: 1 },
        },
      });
    } else {
      await prisma.usageHistory.upsert({
        where: {
          userId_periodStart_periodType: {
            userId: ctx.userId,
            periodStart,
            periodType: 'HOURLY',
          },
        },
        create: {
          userId: ctx.userId,
          periodStart,
          periodType: 'HOURLY',
          [field]: 1,
        },
        update: {
          [field]: { increment: 1 },
        },
      });
    }
  }

  private async incrementDatabaseStorage(
    ctx: ServiceContext,
    deltaMB: number
  ): Promise<void> {
    const periodStart = this.getStartOfHour();
    
    if (ctx.contextType === 'organization' && ctx.organizationId) {
      await prisma.usageHistory.upsert({
        where: {
          organizationId_periodStart_periodType: {
            organizationId: ctx.organizationId,
            periodStart,
            periodType: 'HOURLY',
          },
        },
        create: {
          organizationId: ctx.organizationId,
          periodStart,
          periodType: 'HOURLY',
          storageUsed: deltaMB,
        },
        update: {
          storageUsed: { increment: deltaMB },
        },
      });
    } else {
      await prisma.usageHistory.upsert({
        where: {
          userId_periodStart_periodType: {
            userId: ctx.userId,
            periodStart,
            periodType: 'HOURLY',
          },
        },
        create: {
          userId: ctx.userId,
          periodStart,
          periodType: 'HOURLY',
          storageUsed: deltaMB,
        },
        update: {
          storageUsed: { increment: deltaMB },
        },
      });
    }
  }

  private async decrementDatabaseStorage(
    ctx: ServiceContext,
    deltaMB: number
  ): Promise<void> {
    const periodStart = this.getStartOfHour();
    
    if (ctx.contextType === 'organization' && ctx.organizationId) {
      // Get current value first to prevent negative
      const current = await prisma.usageHistory.findUnique({
        where: {
          organizationId_periodStart_periodType: {
            organizationId: ctx.organizationId,
            periodStart,
            periodType: 'HOURLY',
          },
        },
      });
      
      const newValue = Math.max(0, (current?.storageUsed || 0) - deltaMB);
      
      await prisma.usageHistory.upsert({
        where: {
          organizationId_periodStart_periodType: {
            organizationId: ctx.organizationId,
            periodStart,
            periodType: 'HOURLY',
          },
        },
        create: {
          organizationId: ctx.organizationId,
          periodStart,
          periodType: 'HOURLY',
          storageUsed: 0,
        },
        update: {
          storageUsed: newValue,
        },
      });
    } else {
      const current = await prisma.usageHistory.findUnique({
        where: {
          userId_periodStart_periodType: {
            userId: ctx.userId,
            periodStart,
            periodType: 'HOURLY',
          },
        },
      });
      
      const newValue = Math.max(0, (current?.storageUsed || 0) - deltaMB);
      
      await prisma.usageHistory.upsert({
        where: {
          userId_periodStart_periodType: {
            userId: ctx.userId,
            periodStart,
            periodType: 'HOURLY',
          },
        },
        create: {
          userId: ctx.userId,
          periodStart,
          periodType: 'HOURLY',
          storageUsed: 0,
        },
        update: {
          storageUsed: newValue,
        },
      });
    }
  }

  private async getHourlyMetrics(
    ownerId: string,
    ownerType: 'organization' | 'user'
  ): Promise<UsageMetrics> {
    const key = ownerType === 'organization' 
      ? `org:${ownerId}` 
      : `user:${ownerId}`;
    const date = this.getDateKey();
    
    try {
      const [apiCalls, workflowRuns, pluginExecutions, storage, errors] = await Promise.all([
        redis.get(`${REDIS_KEYS.API_CALLS}:${key}:${date}`),
        redis.get(`${REDIS_KEYS.WORKFLOW_RUNS}:${key}:${date}`),
        redis.get(`${REDIS_KEYS.PLUGIN_EXECUTIONS}:${key}:${date}`),
        redis.get(`${REDIS_KEYS.STORAGE}:${key}:${date}`),
        redis.get(`${REDIS_KEYS.ERRORS}:${key}:${date}`),
      ]);
      
      return {
        apiCalls: parseInt(apiCalls || '0'),
        workflowRuns: parseInt(workflowRuns || '0'),
        pluginExecutions: parseInt(pluginExecutions || '0'),
        storageUsed: parseInt(storage || '0'),
        errors: parseInt(errors || '0'),
      };
    } catch {
      return {
        apiCalls: 0,
        workflowRuns: 0,
        pluginExecutions: 0,
        storageUsed: 0,
        errors: 0,
      };
    }
  }

  private async getUsageFromDatabase(ctx: ServiceContext): Promise<RealTimeUsage> {
    const periodStart = this.getStartOfHour();
    
    let record;
    if (ctx.contextType === 'organization' && ctx.organizationId) {
      record = await prisma.usageHistory.findUnique({
        where: {
          organizationId_periodStart_periodType: {
            organizationId: ctx.organizationId,
            periodStart,
            periodType: 'HOURLY',
          },
        },
      });
    } else {
      record = await prisma.usageHistory.findUnique({
        where: {
          userId_periodStart_periodType: {
            userId: ctx.userId,
            periodStart,
            periodType: 'HOURLY',
          },
        },
      });
    }
    
    return {
      apiCalls: record?.apiCalls || 0,
      workflowRuns: record?.workflowRuns || 0,
      pluginExecutions: record?.pluginExecutions || 0,
      storageUsed: record?.storageUsed || 0,
      errors: record?.errors || 0,
      periodStart: this.getStartOfDay(),
      periodType: 'DAILY',
    };
  }
}

// Export singleton instance
export const usageTracker = new UsageTrackerServiceImpl();
