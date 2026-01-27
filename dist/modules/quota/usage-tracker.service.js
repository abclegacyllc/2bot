"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.usageTracker = void 0;
const logger_1 = require("@/lib/logger");
const prisma_1 = require("@/lib/prisma");
const redis_1 = require("@/lib/redis");
const log = logger_1.logger.child({ module: 'usage-tracker' });
// Redis key prefixes
const REDIS_KEYS = {
    API_CALLS: 'usage:api_calls',
    WORKFLOW_RUNS: 'usage:workflow_runs',
    PLUGIN_EXECUTIONS: 'usage:plugin_executions',
    STORAGE: 'usage:storage',
    ERRORS: 'usage:errors',
};
// ===========================================
// Usage Tracker Service
// ===========================================
class UsageTrackerServiceImpl {
    /**
     * Track an API call
     * Called from middleware on each API request
     */
    async trackApiCall(ctx) {
        const key = this.buildKey(REDIS_KEYS.API_CALLS, ctx);
        try {
            // Increment Redis counter (expires at end of day)
            await redis_1.redis.incr(key);
            await this.setExpireAtEndOfDay(key);
            // Also increment in database for persistence
            await this.incrementDatabaseUsage(ctx, 'apiCalls');
            log.debug({ userId: ctx.userId, organizationId: ctx.organizationId }, 'Tracked API call');
        }
        catch (err) {
            log.error({ err, userId: ctx.userId }, 'Failed to track API call');
        }
    }
    /**
     * Track a workflow execution
     */
    async trackWorkflowRun(ctx, workflowId, stepCount = 1) {
        const key = this.buildKey(REDIS_KEYS.WORKFLOW_RUNS, ctx);
        try {
            await redis_1.redis.incr(key);
            await this.setExpireAtEndOfDay(key);
            await this.incrementDatabaseUsage(ctx, 'workflowRuns');
            log.debug({ userId: ctx.userId, workflowId, stepCount }, 'Tracked workflow run');
        }
        catch (err) {
            log.error({ err, workflowId }, 'Failed to track workflow run');
        }
    }
    /**
     * Track a plugin execution
     */
    async trackPluginExecution(ctx, pluginId) {
        const key = this.buildKey(REDIS_KEYS.PLUGIN_EXECUTIONS, ctx);
        try {
            await redis_1.redis.incr(key);
            await this.setExpireAtEndOfDay(key);
            await this.incrementDatabaseUsage(ctx, 'pluginExecutions');
            log.debug({ userId: ctx.userId, pluginId }, 'Tracked plugin execution');
        }
        catch (err) {
            log.error({ err, pluginId }, 'Failed to track plugin execution');
        }
    }
    /**
     * Track storage change (positive = added, negative = removed)
     */
    async trackStorageChange(ctx, deltaBytes) {
        const key = this.buildKey(REDIS_KEYS.STORAGE, ctx);
        try {
            // Convert to MB for storage
            const deltaMB = Math.ceil(deltaBytes / (1024 * 1024));
            await redis_1.redis.incrby(key, deltaMB);
            await this.setExpireAtEndOfDay(key);
            // Update database
            if (deltaBytes > 0) {
                await this.incrementDatabaseStorage(ctx, deltaMB);
            }
            else {
                await this.decrementDatabaseStorage(ctx, Math.abs(deltaMB));
            }
            log.debug({ userId: ctx.userId, deltaMB }, 'Tracked storage change');
        }
        catch (err) {
            log.error({ err, deltaBytes }, 'Failed to track storage change');
        }
    }
    /**
     * Track an error occurrence
     */
    async trackError(ctx, errorType) {
        const key = this.buildKey(REDIS_KEYS.ERRORS, ctx);
        try {
            await redis_1.redis.incr(key);
            await this.setExpireAtEndOfDay(key);
            await this.incrementDatabaseUsage(ctx, 'errors');
            log.debug({ userId: ctx.userId, errorType }, 'Tracked error');
        }
        catch (err) {
            log.error({ err, errorType }, 'Failed to track error');
        }
    }
    /**
     * Get real-time usage from Redis
     */
    async getRealTimeUsage(ctx) {
        try {
            const [apiCalls, workflowRuns, pluginExecutions, storage, errors] = await Promise.all([
                redis_1.redis.get(this.buildKey(REDIS_KEYS.API_CALLS, ctx)),
                redis_1.redis.get(this.buildKey(REDIS_KEYS.WORKFLOW_RUNS, ctx)),
                redis_1.redis.get(this.buildKey(REDIS_KEYS.PLUGIN_EXECUTIONS, ctx)),
                redis_1.redis.get(this.buildKey(REDIS_KEYS.STORAGE, ctx)),
                redis_1.redis.get(this.buildKey(REDIS_KEYS.ERRORS, ctx)),
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
        }
        catch (err) {
            log.error({ err, userId: ctx.userId }, 'Failed to get real-time usage');
            // Fall back to database
            return this.getUsageFromDatabase(ctx);
        }
    }
    /**
     * Aggregate hourly usage and store in history
     * Should be called by a cron job every hour
     */
    async aggregateHourlyUsage() {
        const hourStart = this.getStartOfHour();
        let aggregated = 0;
        try {
            // Get all organizations
            const orgs = await prisma_1.prisma.organization.findMany({
                select: { id: true },
            });
            for (const org of orgs) {
                const metrics = await this.getHourlyMetrics(org.id, 'organization');
                await prisma_1.prisma.usageHistory.upsert({
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
            const personalUsers = await prisma_1.prisma.user.findMany({
                where: {
                    memberships: { none: {} },
                },
                select: { id: true },
            });
            for (const user of personalUsers) {
                const metrics = await this.getHourlyMetrics(user.id, 'user');
                await prisma_1.prisma.usageHistory.upsert({
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
        }
        catch (err) {
            log.error({ err }, 'Failed to aggregate hourly usage');
            throw err;
        }
    }
    /**
     * Aggregate daily usage from hourly records
     * Should be called by a cron job at midnight
     */
    async aggregateDailyUsage() {
        const dayStart = this.getStartOfDay();
        const dayEnd = new Date(dayStart);
        dayEnd.setDate(dayEnd.getDate() + 1);
        let aggregated = 0;
        try {
            // Get all organizations with hourly records for today
            const orgHourlyRecords = await prisma_1.prisma.usageHistory.groupBy({
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
                if (!record.organizationId)
                    continue;
                await prisma_1.prisma.usageHistory.upsert({
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
            const userHourlyRecords = await prisma_1.prisma.usageHistory.groupBy({
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
                if (!record.userId)
                    continue;
                await prisma_1.prisma.usageHistory.upsert({
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
        }
        catch (err) {
            log.error({ err }, 'Failed to aggregate daily usage');
            throw err;
        }
    }
    /**
     * Get usage history for dashboard charts
     */
    async getUsageHistory(owner, options) {
        const where = {
            periodType: options.period,
            periodStart: {
                gte: options.startDate,
                lte: options.endDate,
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
            apiCalls: r.apiCalls,
            workflowRuns: r.workflowRuns,
            pluginExecutions: r.pluginExecutions,
            storageUsed: r.storageUsed,
            errors: r.errors,
            periodStart: r.periodStart,
            periodType: r.periodType,
        }));
    }
    /**
     * Flush Redis counters to database
     * Should be called periodically to ensure data persistence
     */
    async flushToDatabase() {
        log.info('Flushing Redis usage counters to database');
        // This is a simplified version - in production you'd want to
        // iterate through all keys and flush them
        // For now, the individual track methods already write to DB
    }
    // ===========================================
    // Private Helpers
    // ===========================================
    buildKey(prefix, ctx) {
        const date = this.getDateKey();
        if (ctx.contextType === 'organization' && ctx.organizationId) {
            return `${prefix}:org:${ctx.organizationId}:${date}`;
        }
        return `${prefix}:user:${ctx.userId}:${date}`;
    }
    getDateKey() {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    }
    async setExpireAtEndOfDay(key) {
        const now = new Date();
        const endOfDay = new Date(now);
        endOfDay.setDate(endOfDay.getDate() + 1);
        endOfDay.setHours(0, 0, 0, 0);
        const ttl = Math.floor((endOfDay.getTime() - now.getTime()) / 1000);
        await redis_1.redis.expire(key, ttl + 3600); // Add 1 hour buffer
    }
    getStartOfDay() {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    }
    getStartOfHour() {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), 0, 0, 0);
    }
    async incrementDatabaseUsage(ctx, field) {
        const periodStart = this.getStartOfHour();
        if (ctx.contextType === 'organization' && ctx.organizationId) {
            await prisma_1.prisma.usageHistory.upsert({
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
        }
        else {
            await prisma_1.prisma.usageHistory.upsert({
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
    async incrementDatabaseStorage(ctx, deltaMB) {
        const periodStart = this.getStartOfHour();
        if (ctx.contextType === 'organization' && ctx.organizationId) {
            await prisma_1.prisma.usageHistory.upsert({
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
        }
        else {
            await prisma_1.prisma.usageHistory.upsert({
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
    async decrementDatabaseStorage(ctx, deltaMB) {
        const periodStart = this.getStartOfHour();
        if (ctx.contextType === 'organization' && ctx.organizationId) {
            // Get current value first to prevent negative
            const current = await prisma_1.prisma.usageHistory.findUnique({
                where: {
                    organizationId_periodStart_periodType: {
                        organizationId: ctx.organizationId,
                        periodStart,
                        periodType: 'HOURLY',
                    },
                },
            });
            const newValue = Math.max(0, (current?.storageUsed || 0) - deltaMB);
            await prisma_1.prisma.usageHistory.upsert({
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
        }
        else {
            const current = await prisma_1.prisma.usageHistory.findUnique({
                where: {
                    userId_periodStart_periodType: {
                        userId: ctx.userId,
                        periodStart,
                        periodType: 'HOURLY',
                    },
                },
            });
            const newValue = Math.max(0, (current?.storageUsed || 0) - deltaMB);
            await prisma_1.prisma.usageHistory.upsert({
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
    async getHourlyMetrics(ownerId, ownerType) {
        const key = ownerType === 'organization'
            ? `org:${ownerId}`
            : `user:${ownerId}`;
        const date = this.getDateKey();
        try {
            const [apiCalls, workflowRuns, pluginExecutions, storage, errors] = await Promise.all([
                redis_1.redis.get(`${REDIS_KEYS.API_CALLS}:${key}:${date}`),
                redis_1.redis.get(`${REDIS_KEYS.WORKFLOW_RUNS}:${key}:${date}`),
                redis_1.redis.get(`${REDIS_KEYS.PLUGIN_EXECUTIONS}:${key}:${date}`),
                redis_1.redis.get(`${REDIS_KEYS.STORAGE}:${key}:${date}`),
                redis_1.redis.get(`${REDIS_KEYS.ERRORS}:${key}:${date}`),
            ]);
            return {
                apiCalls: parseInt(apiCalls || '0'),
                workflowRuns: parseInt(workflowRuns || '0'),
                pluginExecutions: parseInt(pluginExecutions || '0'),
                storageUsed: parseInt(storage || '0'),
                errors: parseInt(errors || '0'),
            };
        }
        catch {
            return {
                apiCalls: 0,
                workflowRuns: 0,
                pluginExecutions: 0,
                storageUsed: 0,
                errors: 0,
            };
        }
    }
    async getUsageFromDatabase(ctx) {
        const periodStart = this.getStartOfHour();
        let record;
        if (ctx.contextType === 'organization' && ctx.organizationId) {
            record = await prisma_1.prisma.usageHistory.findUnique({
                where: {
                    organizationId_periodStart_periodType: {
                        organizationId: ctx.organizationId,
                        periodStart,
                        periodType: 'HOURLY',
                    },
                },
            });
        }
        else {
            record = await prisma_1.prisma.usageHistory.findUnique({
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
    /**
     * Get daily execution count for a specific date
     * Used for usage history charts
     */
    async getDailyCount(userId, dateStr) {
        try {
            // Try to get from database first
            const periodStart = new Date(dateStr);
            periodStart.setHours(0, 0, 0, 0);
            const record = await prisma_1.prisma.usageHistory.findUnique({
                where: {
                    userId_periodStart_periodType: {
                        userId,
                        periodStart,
                        periodType: 'DAILY',
                    },
                },
            });
            if (record) {
                // Return sum of API calls, workflow runs, plugin executions
                return (record.apiCalls || 0) + (record.workflowRuns || 0) + (record.pluginExecutions || 0);
            }
            // If no record, try Redis for current day
            const today = new Date().toISOString().split('T')[0];
            if (dateStr === today) {
                const key = `user:${userId}`;
                const [apiCalls, workflowRuns, pluginExecutions] = await Promise.all([
                    redis_1.redis.get(`${REDIS_KEYS.API_CALLS}:${key}:${dateStr}`),
                    redis_1.redis.get(`${REDIS_KEYS.WORKFLOW_RUNS}:${key}:${dateStr}`),
                    redis_1.redis.get(`${REDIS_KEYS.PLUGIN_EXECUTIONS}:${key}:${dateStr}`),
                ]);
                return parseInt(apiCalls || '0') + parseInt(workflowRuns || '0') + parseInt(pluginExecutions || '0');
            }
            return 0;
        }
        catch (err) {
            log.error({ err, userId, dateStr }, 'Failed to get daily count');
            return 0;
        }
    }
}
// Export singleton instance
exports.usageTracker = new UsageTrackerServiceImpl();
//# sourceMappingURL=usage-tracker.service.js.map