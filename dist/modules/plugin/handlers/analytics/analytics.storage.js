"use strict";
/**
 * Analytics Storage Service
 *
 * Handles persistent storage of analytics data in Redis.
 * Provides methods for tracking events and retrieving statistics.
 *
 * @module modules/plugin/handlers/analytics/analytics.storage
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnalyticsStorage = void 0;
exports.createAnalyticsStorage = createAnalyticsStorage;
const logger_1 = require("@/lib/logger");
const redis_1 = require("@/lib/redis");
const analytics_types_1 = require("./analytics.types");
const analyticsLogger = logger_1.logger.child({ module: "analytics" });
// ===========================================
// Date Helpers
// ===========================================
/**
 * Get date string in YYYY-MM-DD format
 */
function getDateString(date = new Date()) {
    return date.toISOString().split("T")[0];
}
/**
 * Get hour string in YYYY-MM-DD-HH format
 */
function getHourString(date = new Date()) {
    const dateStr = getDateString(date);
    const hour = date.getUTCHours().toString().padStart(2, "0");
    return `${dateStr}-${hour}`;
}
/**
 * Get dates for the last N days
 */
function getLastNDays(n) {
    const dates = [];
    const now = new Date();
    for (let i = 0; i < n; i++) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        dates.push(getDateString(d));
    }
    return dates;
}
/**
 * Get hours for the last N hours
 */
function getLastNHours(n) {
    const hours = [];
    const now = new Date();
    for (let i = 0; i < n; i++) {
        const d = new Date(now);
        d.setHours(d.getHours() - i);
        hours.push(getHourString(d));
    }
    return hours;
}
// ===========================================
// Analytics Storage Class
// ===========================================
/**
 * Analytics Storage Service
 */
class AnalyticsStorage {
    userPluginId;
    config;
    constructor(userPluginId, config) {
        this.userPluginId = userPluginId;
        this.config = { ...analytics_types_1.DEFAULT_ANALYTICS_CONFIG, ...config };
    }
    // ===========================================
    // Event Tracking
    // ===========================================
    /**
     * Track an analytics event
     */
    async trackEvent(event) {
        const pipeline = redis_1.redis.pipeline();
        const date = getDateString(event.timestamp);
        const hour = getHourString(event.timestamp);
        try {
            // Update main stats
            const statsKey = analytics_types_1.ANALYTICS_KEYS.stats(this.userPluginId);
            const isReceived = event.type === "message.received" || event.type === "callback.received";
            const isSent = event.type === "message.sent";
            if (isReceived) {
                pipeline.hincrby(statsKey, "totalMessagesReceived", 1);
            }
            if (isSent) {
                pipeline.hincrby(statsKey, "totalMessagesSent", 1);
            }
            pipeline.hset(statsKey, "lastActivityAt", event.timestamp.toISOString());
            pipeline.hsetnx(statsKey, "firstActivityAt", event.timestamp.toISOString());
            pipeline.hset(statsKey, "updatedAt", new Date().toISOString());
            // Update daily stats
            const dailyKey = analytics_types_1.ANALYTICS_KEYS.daily(this.userPluginId, date);
            const ttlDays = this.config.retentionDays * 24 * 60 * 60; // seconds
            if (isReceived) {
                pipeline.hincrby(dailyKey, "messagesReceived", 1);
            }
            if (isSent) {
                pipeline.hincrby(dailyKey, "messagesSent", 1);
            }
            pipeline.expire(dailyKey, ttlDays);
            // Track unique user for the day
            if (event.userId && isReceived) {
                const dailyUsersKey = analytics_types_1.ANALYTICS_KEYS.dailyUsers(this.userPluginId, date);
                pipeline.sadd(dailyUsersKey, event.userId.toString());
                pipeline.expire(dailyUsersKey, ttlDays);
            }
            // Update hourly stats (if enabled)
            if (this.config.enableHourlyStats && isReceived) {
                const hourlyKey = analytics_types_1.ANALYTICS_KEYS.hourly(this.userPluginId, hour);
                pipeline.hincrby(hourlyKey, "messages", 1);
                pipeline.expire(hourlyKey, 48 * 60 * 60); // Keep 48 hours
            }
            // Track user stats
            if (this.config.trackUsers && event.userId && isReceived) {
                await this.trackUserInternal(pipeline, event);
            }
            // Track chat stats
            if (this.config.trackChats && isReceived) {
                await this.trackChatInternal(pipeline, event);
            }
            await pipeline.exec();
            analyticsLogger.debug({ userPluginId: this.userPluginId, eventType: event.type }, "Analytics event tracked");
        }
        catch (error) {
            analyticsLogger.error({ err: error, userPluginId: this.userPluginId }, "Failed to track analytics event");
            throw error;
        }
    }
    /**
     * Track user stats (internal, adds to pipeline)
     */
    async trackUserInternal(pipeline, event) {
        if (!event.userId)
            return;
        const usersKey = analytics_types_1.ANALYTICS_KEYS.users(this.userPluginId);
        const userDetailKey = analytics_types_1.ANALYTICS_KEYS.userDetail(this.userPluginId, event.userId);
        const statsKey = analytics_types_1.ANALYTICS_KEYS.stats(this.userPluginId);
        // Increment user message count in sorted set
        pipeline.zincrby(usersKey, 1, event.userId.toString());
        // Check if this is a new user
        const exists = await redis_1.redis.exists(userDetailKey);
        if (!exists) {
            // New user - increment total unique users
            pipeline.hincrby(statsKey, "totalUniqueUsers", 1);
        }
        // Update user details
        pipeline.hset(userDetailKey, {
            telegramUserId: event.userId.toString(),
            username: event.username || "",
            firstName: event.firstName || "",
            lastName: event.lastName || "",
            lastSeenAt: event.timestamp.toISOString(),
        });
        pipeline.hsetnx(userDetailKey, "firstSeenAt", event.timestamp.toISOString());
        pipeline.hincrby(userDetailKey, "messageCount", 1);
    }
    /**
     * Track chat stats (internal, adds to pipeline)
     */
    async trackChatInternal(pipeline, event) {
        const chatsKey = analytics_types_1.ANALYTICS_KEYS.chats(this.userPluginId);
        const chatDetailKey = analytics_types_1.ANALYTICS_KEYS.chatDetail(this.userPluginId, event.chatId);
        const statsKey = analytics_types_1.ANALYTICS_KEYS.stats(this.userPluginId);
        // Increment chat message count in sorted set
        pipeline.zincrby(chatsKey, 1, event.chatId.toString());
        // Check if this is a new chat
        const exists = await redis_1.redis.exists(chatDetailKey);
        if (!exists) {
            // New chat - increment total unique chats
            pipeline.hincrby(statsKey, "totalUniqueChats", 1);
        }
        // Update chat details
        pipeline.hset(chatDetailKey, {
            chatId: event.chatId.toString(),
            chatType: event.chatType,
            chatTitle: event.chatTitle || "",
            lastMessageAt: event.timestamp.toISOString(),
        });
        pipeline.hsetnx(chatDetailKey, "firstMessageAt", event.timestamp.toISOString());
        pipeline.hincrby(chatDetailKey, "messageCount", 1);
    }
    // ===========================================
    // Statistics Retrieval
    // ===========================================
    /**
     * Get main analytics data
     */
    async getStats() {
        const statsKey = analytics_types_1.ANALYTICS_KEYS.stats(this.userPluginId);
        const data = await redis_1.redis.hgetall(statsKey);
        return {
            totalMessagesReceived: parseInt(data["totalMessagesReceived"] || "0", 10),
            totalMessagesSent: parseInt(data["totalMessagesSent"] || "0", 10),
            totalUniqueUsers: parseInt(data["totalUniqueUsers"] || "0", 10),
            totalUniqueChats: parseInt(data["totalUniqueChats"] || "0", 10),
            firstActivityAt: data["firstActivityAt"] ? new Date(data["firstActivityAt"]) : null,
            lastActivityAt: data["lastActivityAt"] ? new Date(data["lastActivityAt"]) : null,
            updatedAt: data["updatedAt"] ? new Date(data["updatedAt"]) : new Date(),
        };
    }
    /**
     * Get daily stats for the last N days
     */
    async getDailyStats(days = 7) {
        const dates = getLastNDays(days);
        const stats = [];
        for (const date of dates) {
            const dailyKey = analytics_types_1.ANALYTICS_KEYS.daily(this.userPluginId, date);
            const dailyUsersKey = analytics_types_1.ANALYTICS_KEYS.dailyUsers(this.userPluginId, date);
            const [data, userCount] = await Promise.all([
                redis_1.redis.hgetall(dailyKey),
                redis_1.redis.scard(dailyUsersKey),
            ]);
            stats.push({
                date,
                messagesReceived: parseInt(data["messagesReceived"] || "0", 10),
                messagesSent: parseInt(data["messagesSent"] || "0", 10),
                uniqueUsers: userCount,
                userIds: [], // Not returned for performance, use getDailyUsers if needed
            });
        }
        return stats;
    }
    /**
     * Get hourly stats for the last N hours
     */
    async getHourlyStats(hours = 24) {
        const hourStrings = getLastNHours(hours);
        const stats = [];
        for (const hour of hourStrings) {
            const hourlyKey = analytics_types_1.ANALYTICS_KEYS.hourly(this.userPluginId, hour);
            const data = await redis_1.redis.hgetall(hourlyKey);
            stats.push({
                hour,
                messages: parseInt(data["messages"] || "0", 10),
            });
        }
        return stats;
    }
    /**
     * Get top users by message count
     */
    async getTopUsers(limit = 10) {
        const usersKey = analytics_types_1.ANALYTICS_KEYS.users(this.userPluginId);
        const topUserIds = await redis_1.redis.zrevrange(usersKey, 0, limit - 1, "WITHSCORES");
        const users = [];
        for (let i = 0; i < topUserIds.length; i += 2) {
            const telegramUserId = parseInt(topUserIds[i], 10);
            const messageCount = parseInt(topUserIds[i + 1], 10);
            const userDetailKey = analytics_types_1.ANALYTICS_KEYS.userDetail(this.userPluginId, telegramUserId);
            const details = await redis_1.redis.hgetall(userDetailKey);
            users.push({
                telegramUserId,
                username: details["username"] || undefined,
                firstName: details["firstName"] || "Unknown",
                lastName: details["lastName"] || undefined,
                messageCount,
                firstSeenAt: details["firstSeenAt"] ? new Date(details["firstSeenAt"]) : new Date(),
                lastSeenAt: details["lastSeenAt"] ? new Date(details["lastSeenAt"]) : new Date(),
            });
        }
        return users;
    }
    /**
     * Get top chats by message count
     */
    async getTopChats(limit = 10) {
        const chatsKey = analytics_types_1.ANALYTICS_KEYS.chats(this.userPluginId);
        const topChatIds = await redis_1.redis.zrevrange(chatsKey, 0, limit - 1, "WITHSCORES");
        const chats = [];
        for (let i = 0; i < topChatIds.length; i += 2) {
            const chatId = parseInt(topChatIds[i], 10);
            const messageCount = parseInt(topChatIds[i + 1], 10);
            const chatDetailKey = analytics_types_1.ANALYTICS_KEYS.chatDetail(this.userPluginId, chatId);
            const details = await redis_1.redis.hgetall(chatDetailKey);
            chats.push({
                chatId,
                chatType: details["chatType"] || "private",
                chatTitle: details["chatTitle"] || undefined,
                messageCount,
                firstMessageAt: details["firstMessageAt"] ? new Date(details["firstMessageAt"]) : new Date(),
                lastMessageAt: details["lastMessageAt"] ? new Date(details["lastMessageAt"]) : new Date(),
            });
        }
        return chats;
    }
    /**
     * Get full analytics summary (for API/UI)
     */
    async getSummary() {
        const [stats, dailyStats, hourlyStats, topUsers, topChats] = await Promise.all([
            this.getStats(),
            this.getDailyStats(7),
            this.config.enableHourlyStats ? this.getHourlyStats(24) : Promise.resolve([]),
            this.getTopUsers(this.config.topUsersLimit),
            this.getTopChats(this.config.topChatsLimit),
        ]);
        // Calculate today's stats
        const today = getDateString();
        const todayStats = dailyStats.find((d) => d.date === today);
        return {
            userPluginId: this.userPluginId,
            totals: {
                messagesReceived: stats.totalMessagesReceived,
                messagesSent: stats.totalMessagesSent,
                uniqueUsers: stats.totalUniqueUsers,
                uniqueChats: stats.totalUniqueChats,
            },
            today: {
                messages: (todayStats?.messagesReceived || 0) + (todayStats?.messagesSent || 0),
                uniqueUsers: todayStats?.uniqueUsers || 0,
            },
            dailyStats,
            hourlyStats,
            topUsers: topUsers.map((u) => ({
                telegramUserId: u.telegramUserId,
                username: u.username,
                firstName: u.firstName,
                messageCount: u.messageCount,
            })),
            topChats: topChats.map((c) => ({
                chatId: c.chatId,
                chatType: c.chatType,
                chatTitle: c.chatTitle,
                messageCount: c.messageCount,
            })),
        };
    }
    // ===========================================
    // Cleanup
    // ===========================================
    /**
     * Delete all analytics data for this plugin installation
     */
    async deleteAll() {
        const pattern = `analytics:${this.userPluginId}:*`;
        let cursor = "0";
        do {
            const [newCursor, keys] = await redis_1.redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
            cursor = newCursor;
            if (keys.length > 0) {
                await redis_1.redis.del(...keys);
            }
        } while (cursor !== "0");
        analyticsLogger.info({ userPluginId: this.userPluginId }, "Analytics data deleted");
    }
}
exports.AnalyticsStorage = AnalyticsStorage;
/**
 * Create analytics storage instance for a user plugin
 */
function createAnalyticsStorage(userPluginId, config) {
    return new AnalyticsStorage(userPluginId, config);
}
//# sourceMappingURL=analytics.storage.js.map