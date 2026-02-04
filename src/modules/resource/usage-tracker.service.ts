/**
 * Usage Tracker Service
 * 
 * Tracks resource usage metrics:
 * - Workflow runs
 * - Gateway requests
 * - Plugin executions
 * - Credit consumption
 * 
 * Uses Redis for real-time counters and Prisma for historical data.
 * 
 * @module modules/resource/usage-tracker.service
 */

import { logger } from '@/lib/logger';
import { redis } from '@/lib/redis';
import type { ServiceContext } from '@/shared/types/context';
import { UsageResourceType, type PeriodType, type UsageRecord } from './resource.types';

const log = logger.child({ module: 'usage-tracker' });

// Redis key prefixes
const KEYS = {
  USAGE: 'usage',
  DAILY: 'daily',
  HOURLY: 'hourly',
};

// ===========================================
// Usage Tracker Implementation
// ===========================================

class UsageTrackerImpl {
  
  // -------------------------------------------
  // Track Usage
  // -------------------------------------------
  
  /**
   * Track a workflow run
   */
  async trackWorkflowRun(ctx: ServiceContext, workflowId: string, steps: number): Promise<void> {
    const key = this.getRedisKey(ctx, 'workflow_runs');
    await redis.incr(key);
    await redis.expire(key, 86400 * 32); // 32 days TTL
    
    // Also track steps
    const stepsKey = this.getRedisKey(ctx, 'workflow_steps');
    await redis.incrby(stepsKey, steps);
    await redis.expire(stepsKey, 86400 * 32);
    
    log.debug({ workflowId, steps }, 'Tracked workflow run');
  }
  
  /**
   * Track a gateway request
   */
  async trackGatewayRequest(ctx: ServiceContext, gatewayId: string): Promise<void> {
    const key = this.getRedisKey(ctx, 'gateway_requests');
    await redis.incr(key);
    await redis.expire(key, 86400 * 32);
    
    log.debug({ gatewayId }, 'Tracked gateway request');
  }
  
  /**
   * Track a plugin execution
   */
  async trackPluginExecution(ctx: ServiceContext, pluginId: string): Promise<void> {
    const key = this.getRedisKey(ctx, 'plugin_executions');
    await redis.incr(key);
    await redis.expire(key, 86400 * 32);
    
    log.debug({ pluginId }, 'Tracked plugin execution');
  }
  
  /**
   * Track API call (for monitoring)
   */
  async trackApiCall(ctx: ServiceContext): Promise<void> {
    const key = this.getRedisKey(ctx, 'api_calls');
    await redis.incr(key);
    await redis.expire(key, 86400 * 32);
  }
  
  /**
   * Track an error
   */
  async trackError(ctx: ServiceContext, errorType: string): Promise<void> {
    const key = `${this.getRedisKey(ctx, 'errors')}:${errorType}`;
    await redis.incr(key);
    await redis.expire(key, 86400 * 32);
  }
  
  /**
   * Track credit usage
   */
  async trackCreditUsage(ctx: ServiceContext, amount: number, category: 'ai' | 'marketplace'): Promise<void> {
    const key = this.getRedisKey(ctx, `credits_${category}`);
    await redis.incrbyfloat(key, amount);
    await redis.expire(key, 86400 * 32);
    
    // Also track total
    const totalKey = this.getRedisKey(ctx, 'credits_total');
    await redis.incrbyfloat(totalKey, amount);
    await redis.expire(totalKey, 86400 * 32);
    
    log.debug({ amount, category }, 'Tracked credit usage');
  }
  
  // -------------------------------------------
  // Get Usage
  // -------------------------------------------
  
  /**
   * Get current usage for a resource type
   */
  async getUsage(ctx: ServiceContext, resourceType: UsageResourceType): Promise<number> {
    const key = this.getRedisKey(ctx, resourceType);
    const value = await redis.get(key);
    return value ? parseFloat(value) : 0;
  }
  
  /**
   * Get real-time usage summary
   */
  async getRealTimeUsage(ctx: ServiceContext): Promise<{
    workflowRuns: number;
    workflowSteps: number;
    gatewayRequests: number;
    pluginExecutions: number;
    creditsUsed: number;
  }> {
    const [runs, steps, requests, executions, credits] = await Promise.all([
      this.getUsage(ctx, UsageResourceType.WORKFLOW_RUNS),
      this.getUsage(ctx, UsageResourceType.WORKFLOW_STEPS),
      this.getUsage(ctx, UsageResourceType.GATEWAY_REQUESTS),
      this.getUsage(ctx, UsageResourceType.PLUGIN_EXECUTIONS),
      this.getUsage(ctx, UsageResourceType.CREDITS_TOTAL),
    ]);
    
    return {
      workflowRuns: runs,
      workflowSteps: steps,
      gatewayRequests: requests,
      pluginExecutions: executions,
      creditsUsed: credits,
    };
  }
  
  /**
   * Get daily usage count
   */
  async getDailyCount(ownerId: string, date: string): Promise<number> {
    const key = `${KEYS.USAGE}:${KEYS.DAILY}:${ownerId}:${date}`;
    const value = await redis.get(key);
    return value ? parseInt(value, 10) : 0;
  }
  
  // -------------------------------------------
  // Usage History
  // -------------------------------------------
  
  /**
   * Get usage history for a period
   */
  async getUsageHistory(
    ctx: ServiceContext,
    periodType: PeriodType,
    periods: number = 30
  ): Promise<UsageRecord[]> {
    const records: UsageRecord[] = [];
    const now = new Date();
    
    for (let i = 0; i < periods; i++) {
      const periodStart = this.getPeriodStart(now, periodType, i);
      const record = await this.getUsageForPeriod(ctx, periodStart, periodType);
      records.push(record);
    }
    
    return records.reverse(); // Oldest first
  }
  
  /**
   * Get usage history with date range
   * Alias for quota routes compatibility
   */
  async getHistory(
    ctx: ServiceContext,
    periodType: PeriodType,
    startDate: Date,
    endDate: Date
  ): Promise<UsageRecord[]> {
    // Calculate number of periods between dates
    const periods = this.calculatePeriods(startDate, endDate, periodType);
    return this.getUsageHistory(ctx, periodType, periods);
  }
  
  /**
   * Calculate number of periods between two dates
   */
  private calculatePeriods(start: Date, end: Date, periodType: PeriodType): number {
    const diffMs = end.getTime() - start.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    
    switch (periodType) {
      case 'HOURLY':
        return Math.ceil(diffMs / (1000 * 60 * 60));
      case 'DAILY':
        return Math.ceil(diffDays);
      case 'WEEKLY':
        return Math.ceil(diffDays / 7);
      case 'MONTHLY':
        return Math.ceil(diffDays / 30);
      default:
        return 30;
    }
  }
  
  /**
   * Get usage for a specific period
   */
  private async getUsageForPeriod(
    ctx: ServiceContext,
    periodStart: Date,
    periodType: PeriodType
  ): Promise<UsageRecord> {
    const dateStr = this.formatPeriodKey(periodStart, periodType);
    const ownerId = ctx.getOwnerId();
    
    // Try to get from Redis first
    const cacheKey = `${KEYS.USAGE}:history:${ownerId}:${periodType}:${dateStr}`;
    const cached = await redis.get(cacheKey);
    
    if (cached) {
      return JSON.parse(cached);
    }
    
    // Calculate from Redis counters or return zeros
    const record: UsageRecord = {
      periodStart,
      periodType,
      workflowRuns: 0,
      workflowSteps: 0,
      gatewayRequests: 0,
      pluginExecutions: 0,
      creditsUsed: 0,
      errors: 0,
    };
    
    return record;
  }
  
  // -------------------------------------------
  // Helper Methods
  // -------------------------------------------
  
  /**
   * Get Redis key for a usage metric
   */
  private getRedisKey(ctx: ServiceContext, metric: string): string {
    const ownerId = ctx.getOwnerId();
    const monthKey = this.getCurrentMonthKey();
    return `${KEYS.USAGE}:${metric}:${ownerId}:${monthKey}`;
  }
  
  /**
   * Get current month key (YYYY-MM)
   */
  private getCurrentMonthKey(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }
  
  /**
   * Get period start date
   */
  private getPeriodStart(now: Date, periodType: PeriodType, offset: number): Date {
    const date = new Date(now);
    
    switch (periodType) {
      case 'HOURLY':
        date.setHours(date.getHours() - offset, 0, 0, 0);
        break;
      case 'DAILY':
        date.setDate(date.getDate() - offset);
        date.setHours(0, 0, 0, 0);
        break;
      case 'WEEKLY':
        date.setDate(date.getDate() - (offset * 7));
        date.setHours(0, 0, 0, 0);
        break;
      case 'MONTHLY':
        date.setMonth(date.getMonth() - offset, 1);
        date.setHours(0, 0, 0, 0);
        break;
    }
    
    return date;
  }
  
  /**
   * Format period key for caching
   */
  private formatPeriodKey(date: Date, periodType: PeriodType): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const h = String(date.getHours()).padStart(2, '0');
    
    switch (periodType) {
      case 'HOURLY':
        return `${y}-${m}-${d}-${h}`;
      case 'DAILY':
        return `${y}-${m}-${d}`;
      case 'WEEKLY':
        return `${y}-W${this.getWeekNumber(date)}`;
      case 'MONTHLY':
        return `${y}-${m}`;
    }
  }
  
  /**
   * Get ISO week number
   */
  private getWeekNumber(date: Date): string {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return String(weekNo).padStart(2, '0');
  }
}

// Export singleton
export const usageTracker = new UsageTrackerImpl();
