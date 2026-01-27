"use strict";
/**
 * Analytics Plugin Handler
 *
 * Built-in plugin that tracks message statistics and user activity
 * for Telegram bots. This is the main plugin implementation that
 * handles incoming events and tracks analytics data.
 *
 * @module modules/plugin/handlers/analytics/analytics.handler
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyticsPlugin = exports.AnalyticsPlugin = void 0;
const client_1 = require("@prisma/client");
const logger_1 = require("@/lib/logger");
const plugin_interface_1 = require("../../plugin.interface");
const index_1 = require("./index");
const analyticsLogger = logger_1.logger.child({ module: "analytics-plugin" });
/**
 * Analytics Plugin
 *
 * Tracks message statistics and user activity for Telegram bots:
 * - Total messages received/sent
 * - Unique users and chats
 * - Daily and hourly statistics
 * - Top users and chats by activity
 */
class AnalyticsPlugin extends plugin_interface_1.BasePlugin {
    // ===========================================
    // Metadata
    // ===========================================
    slug = "analytics";
    name = "Channel Analytics";
    description = "Track message and user statistics for your Telegram bots. " +
        "View total messages, unique users, daily trends, and top active users/chats.";
    version = "1.0.0";
    category = "analytics";
    requiredGateways = [client_1.GatewayType.TELEGRAM_BOT];
    icon = "chart-bar";
    tags = ["analytics", "statistics", "telegram", "tracking"];
    configSchema = {
        type: "object",
        title: "Analytics Configuration",
        properties: {
            trackUsers: {
                type: "boolean",
                title: "Track Users",
                description: "Track individual user statistics",
                default: true,
            },
            trackChats: {
                type: "boolean",
                title: "Track Chats",
                description: "Track individual chat/channel statistics",
                default: true,
            },
            retentionDays: {
                type: "number",
                title: "Data Retention (days)",
                description: "How long to keep detailed statistics",
                minimum: 7,
                maximum: 365,
                default: 30,
            },
            enableHourlyStats: {
                type: "boolean",
                title: "Hourly Statistics",
                description: "Enable hourly granularity (uses more storage)",
                default: true,
            },
            topUsersLimit: {
                type: "number",
                title: "Top Users Limit",
                description: "Number of top users to track",
                minimum: 5,
                maximum: 100,
                default: 10,
            },
            topChatsLimit: {
                type: "number",
                title: "Top Chats Limit",
                description: "Number of top chats to track",
                minimum: 5,
                maximum: 100,
                default: 10,
            },
        },
    };
    inputSchema = {
        type: "object",
        title: "Analytics Input",
        description: "Input when used as a workflow step",
        properties: {
            action: {
                type: "string",
                enum: ["getSummary", "getDailyStats", "getTopUsers", "getTopChats"],
                description: "Action to perform",
            },
            days: {
                type: "number",
                minimum: 1,
                maximum: 90,
                default: 7,
                description: "Number of days for historical data",
            },
            limit: {
                type: "number",
                minimum: 1,
                maximum: 100,
                default: 10,
                description: "Number of items to return for top lists",
            },
        },
    };
    outputSchema = {
        type: "object",
        title: "Analytics Output",
        description: "Statistics output from the analytics plugin",
        properties: {
            totals: {
                type: "object",
                properties: {
                    messagesReceived: { type: "number" },
                    messagesSent: { type: "number" },
                    uniqueUsers: { type: "number" },
                    uniqueChats: { type: "number" },
                },
            },
            today: {
                type: "object",
                properties: {
                    messages: { type: "number" },
                    uniqueUsers: { type: "number" },
                },
            },
        },
    };
    // ===========================================
    // Event Handling
    // ===========================================
    /**
     * Handle incoming plugin events
     */
    async onEvent(event, context) {
        const startTime = Date.now();
        const config = context.config;
        const storage = (0, index_1.createAnalyticsStorage)(context.userPluginId, config);
        try {
            // Handle telegram message events
            if (this.isTelegramMessage(event)) {
                const analyticsEvent = this.mapTelegramMessageToEvent(event);
                await storage.trackEvent(analyticsEvent);
                analyticsLogger.debug({
                    userPluginId: context.userPluginId,
                    chatId: event.data.chatId,
                    messageId: event.data.messageId,
                }, "Tracked telegram message");
                return this.success({ tracked: true, eventType: "message.received" }, { durationMs: Date.now() - startTime });
            }
            // Handle telegram callback events
            if (this.isTelegramCallback(event)) {
                const analyticsEvent = this.mapTelegramCallbackToEvent(event);
                await storage.trackEvent(analyticsEvent);
                analyticsLogger.debug({
                    userPluginId: context.userPluginId,
                    chatId: event.data.chatId,
                }, "Tracked telegram callback");
                return this.success({ tracked: true, eventType: "callback.received" }, { durationMs: Date.now() - startTime });
            }
            // Handle workflow step events (retrieve data)
            if (this.isWorkflowStep(event)) {
                const input = event.data.input;
                const action = input?.action || "getSummary";
                const days = input?.days || 7;
                const limit = input?.limit || 10;
                let result;
                switch (action) {
                    case "getSummary":
                        result = await storage.getSummary();
                        break;
                    case "getDailyStats":
                        result = await storage.getDailyStats(days);
                        break;
                    case "getTopUsers":
                        result = await storage.getTopUsers(limit);
                        break;
                    case "getTopChats":
                        result = await storage.getTopChats(limit);
                        break;
                    default:
                        result = await storage.getSummary();
                }
                return this.success(result, { durationMs: Date.now() - startTime });
            }
            // Unsupported event type
            analyticsLogger.warn({ userPluginId: context.userPluginId, eventType: event.type }, "Unsupported event type for analytics plugin");
            return this.success({ tracked: false, reason: "unsupported_event_type" }, { durationMs: Date.now() - startTime });
        }
        catch (error) {
            analyticsLogger.error({ err: error, userPluginId: context.userPluginId }, "Analytics plugin error");
            return this.failure(error instanceof Error ? error.message : "Unknown error", { durationMs: Date.now() - startTime });
        }
    }
    // ===========================================
    // Lifecycle Hooks
    // ===========================================
    /**
     * Called when plugin is installed
     */
    async onInstall(context) {
        analyticsLogger.info({ userPluginId: context.userPluginId, userId: context.userId }, "Analytics plugin installed");
        // Nothing special needed - storage is created on first event
    }
    /**
     * Called when plugin is uninstalled
     */
    async onUninstall(context) {
        analyticsLogger.info({ userPluginId: context.userPluginId, userId: context.userId }, "Analytics plugin uninstalling - cleaning up data");
        // Clean up all analytics data for this installation
        const config = context.config;
        const storage = (0, index_1.createAnalyticsStorage)(context.userPluginId, config);
        await storage.deleteAll();
    }
    // ===========================================
    // Event Mapping
    // ===========================================
    /**
     * Map telegram message event to analytics event
     */
    mapTelegramMessageToEvent(event) {
        return {
            type: "message.received",
            timestamp: new Date(event.data.date * 1000),
            chatId: event.data.chatId,
            chatType: event.data.chatType,
            chatTitle: undefined, // Not available in message event
            userId: event.data.from?.id,
            username: event.data.from?.username,
            firstName: event.data.from?.firstName,
            lastName: event.data.from?.lastName,
            messageId: event.data.messageId,
        };
    }
    /**
     * Map telegram callback event to analytics event
     */
    mapTelegramCallbackToEvent(event) {
        return {
            type: "callback.received",
            timestamp: new Date(),
            chatId: event.data.chatId,
            chatType: "private", // Callbacks typically from private
            userId: event.data.from.id,
            username: event.data.from.username,
            firstName: event.data.from.firstName,
            lastName: event.data.from.lastName,
        };
    }
}
exports.AnalyticsPlugin = AnalyticsPlugin;
/**
 * Singleton instance of the analytics plugin
 */
exports.analyticsPlugin = new AnalyticsPlugin();
//# sourceMappingURL=analytics.handler.js.map