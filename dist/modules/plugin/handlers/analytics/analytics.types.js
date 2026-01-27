"use strict";
/**
 * Analytics Plugin Types
 *
 * Data structures for the built-in analytics plugin that tracks
 * message statistics and user activity for Telegram bots.
 *
 * @module modules/plugin/handlers/analytics/analytics.types
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ANALYTICS_KEYS = exports.DEFAULT_ANALYTICS_CONFIG = void 0;
/**
 * Default configuration
 */
exports.DEFAULT_ANALYTICS_CONFIG = {
    trackUsers: true,
    trackChats: true,
    retentionDays: 30,
    enableHourlyStats: true,
    topUsersLimit: 10,
    topChatsLimit: 10,
};
// ===========================================
// Storage Keys
// ===========================================
/**
 * Redis key patterns for analytics storage
 * All keys are prefixed with the userPluginId for isolation
 */
exports.ANALYTICS_KEYS = {
    /** Main stats: analytics:{userPluginId}:stats */
    stats: (userPluginId) => `analytics:${userPluginId}:stats`,
    /** Daily stats: analytics:{userPluginId}:daily:{YYYY-MM-DD} */
    daily: (userPluginId, date) => `analytics:${userPluginId}:daily:${date}`,
    /** Hourly stats: analytics:{userPluginId}:hourly:{YYYY-MM-DD-HH} */
    hourly: (userPluginId, hour) => `analytics:${userPluginId}:hourly:${hour}`,
    /** Users set: analytics:{userPluginId}:users (sorted set by message count) */
    users: (userPluginId) => `analytics:${userPluginId}:users`,
    /** User details: analytics:{userPluginId}:user:{telegramUserId} */
    userDetail: (userPluginId, telegramUserId) => `analytics:${userPluginId}:user:${telegramUserId}`,
    /** Chats set: analytics:{userPluginId}:chats (sorted set by message count) */
    chats: (userPluginId) => `analytics:${userPluginId}:chats`,
    /** Chat details: analytics:{userPluginId}:chat:{chatId} */
    chatDetail: (userPluginId, chatId) => `analytics:${userPluginId}:chat:${chatId}`,
    /** Daily users set: analytics:{userPluginId}:daily:{date}:users */
    dailyUsers: (userPluginId, date) => `analytics:${userPluginId}:daily:${date}:users`,
};
//# sourceMappingURL=analytics.types.js.map