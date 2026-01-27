"use strict";
/**
 * Plugin Event System
 *
 * Routes incoming events (Telegram webhooks, schedules, etc.) to
 * installed and enabled plugins. Handles event filtering based on
 * gateway requirements and plugin state.
 *
 * @module modules/plugin/plugin.events
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerPlugin = void 0;
exports.transformTelegramUpdate = transformTelegramUpdate;
exports.routeEventToPlugins = routeEventToPlugins;
exports.handleTelegramWebhook = handleTelegramWebhook;
exports.triggerPluginManually = triggerPluginManually;
const logger_1 = require("@/lib/logger");
const prisma_1 = require("@/lib/prisma");
const plugin_executor_1 = require("./plugin.executor");
Object.defineProperty(exports, "registerPlugin", { enumerable: true, get: function () { return plugin_executor_1.registerPlugin; } });
const eventLogger = logger_1.logger.child({ module: "plugin-events" });
// ===========================================
// Event Transformation
// ===========================================
/**
 * Transform a Telegram update to a plugin event
 */
function transformTelegramUpdate(update, gatewayId) {
    // Handle message events
    if (update.message) {
        const msg = update.message;
        const data = {
            messageId: msg.message_id,
            chatId: msg.chat.id,
            chatType: msg.chat.type,
            from: msg.from
                ? {
                    id: msg.from.id,
                    isBot: msg.from.is_bot,
                    firstName: msg.from.first_name,
                    lastName: msg.from.last_name,
                    username: msg.from.username,
                }
                : undefined,
            text: msg.text,
            photo: msg.photo?.map((p) => ({
                fileId: p.file_id,
                fileUniqueId: p.file_unique_id,
                width: p.width,
                height: p.height,
            })),
            document: msg.document
                ? {
                    fileId: msg.document.file_id,
                    fileUniqueId: msg.document.file_unique_id,
                    fileName: msg.document.file_name,
                    mimeType: msg.document.mime_type,
                }
                : undefined,
            date: msg.date,
            replyToMessage: msg.reply_to_message
                ? transformTelegramMessage(msg.reply_to_message)
                : undefined,
        };
        return {
            type: "telegram.message",
            data,
            gatewayId,
        };
    }
    // Handle callback query events
    if (update.callback_query) {
        const cb = update.callback_query;
        const data = {
            id: cb.id,
            chatId: cb.message?.chat.id ?? 0,
            from: {
                id: cb.from.id,
                isBot: cb.from.is_bot,
                firstName: cb.from.first_name,
                lastName: cb.from.last_name,
                username: cb.from.username,
            },
            message: cb.message ? transformTelegramMessage(cb.message) : undefined,
            data: cb.data,
        };
        return {
            type: "telegram.callback",
            data,
            gatewayId,
        };
    }
    return null;
}
/**
 * Transform a Telegram message to event data
 */
function transformTelegramMessage(msg) {
    return {
        messageId: msg.message_id,
        chatId: msg.chat.id,
        chatType: msg.chat.type,
        from: msg.from
            ? {
                id: msg.from.id,
                isBot: msg.from.is_bot,
                firstName: msg.from.first_name,
                lastName: msg.from.last_name,
                username: msg.from.username,
            }
            : undefined,
        text: msg.text,
        date: msg.date,
    };
}
/**
 * Find all plugins that should receive an event
 */
async function findTargetPlugins(userId, event) {
    // Get required gateway type from event
    let requiredGateway = null;
    if (event.type === "telegram.message" || event.type === "telegram.callback") {
        requiredGateway = "TELEGRAM_BOT";
    }
    // Find all enabled user plugins
    const userPlugins = await prisma_1.prisma.userPlugin.findMany({
        where: {
            userId,
            isEnabled: true,
        },
        include: {
            plugin: {
                select: {
                    id: true,
                    slug: true,
                    name: true,
                    requiredGateways: true,
                },
            },
        },
    });
    // Filter plugins that can handle this event type
    return userPlugins.filter((up) => {
        // If event requires a specific gateway, check plugin supports it
        if (requiredGateway) {
            return up.plugin.requiredGateways.includes(requiredGateway);
        }
        // For other events, all enabled plugins can receive them
        return true;
    });
}
/**
 * Get user gateways for a specific type
 */
async function getUserGateways(userId, gatewayType) {
    const gateways = await prisma_1.prisma.gateway.findMany({
        where: {
            userId,
            status: "CONNECTED",
            ...(gatewayType ? { type: gatewayType } : {}),
        },
        select: {
            id: true,
            name: true,
            type: true,
        },
    });
    return gateways;
}
/**
 * Create a plugin context for execution
 */
async function createPluginContext(userPlugin, gateways, executeGateway) {
    return {
        userId: userPlugin.userId,
        organizationId: userPlugin.organizationId ?? undefined,
        config: userPlugin.config ?? {},
        userPluginId: userPlugin.id,
        gateways: (0, plugin_executor_1.createGatewayAccessor)(userPlugin.userId, gateways, executeGateway),
        storage: (0, plugin_executor_1.createPluginStorage)(userPlugin.id, userPlugin.userId),
        logger: logger_1.logger.child({
            module: "plugin",
            plugin: userPlugin.plugin.slug,
            userId: userPlugin.userId,
        }),
    };
}
/**
 * Route an event to all applicable plugins for a user
 */
async function routeEventToPlugins(userId, event, executeGateway) {
    const startTime = Date.now();
    eventLogger.debug({ userId, eventType: event.type }, "Routing event to plugins");
    // Find target plugins
    const targetPlugins = await findTargetPlugins(userId, event);
    if (targetPlugins.length === 0) {
        eventLogger.debug({ userId, eventType: event.type }, "No plugins to receive event");
        return {
            pluginsExecuted: 0,
            successCount: 0,
            failureCount: 0,
            results: [],
        };
    }
    // Get user gateways
    const gateways = await getUserGateways(userId);
    // Get executor
    const executor = (0, plugin_executor_1.getPluginExecutor)();
    // Execute each plugin
    const results = [];
    let successCount = 0;
    let failureCount = 0;
    for (const userPlugin of targetPlugins) {
        const pluginStartTime = Date.now();
        try {
            // Create context for this plugin
            const context = await createPluginContext(userPlugin, gateways, executeGateway);
            // Execute the plugin
            const result = await executor.execute(userPlugin.plugin.slug, "", // No code hash for built-in plugins
            event, context);
            if (result.success) {
                successCount++;
            }
            else {
                failureCount++;
            }
            results.push({
                pluginSlug: userPlugin.plugin.slug,
                userPluginId: userPlugin.id,
                success: result.success,
                durationMs: result.metrics.durationMs,
                error: result.error,
            });
        }
        catch (error) {
            failureCount++;
            const errorMessage = error instanceof Error ? error.message : String(error);
            eventLogger.error({
                pluginSlug: userPlugin.plugin.slug,
                userPluginId: userPlugin.id,
                error: errorMessage,
            }, "Plugin execution failed");
            results.push({
                pluginSlug: userPlugin.plugin.slug,
                userPluginId: userPlugin.id,
                success: false,
                durationMs: Date.now() - pluginStartTime,
                error: errorMessage,
            });
        }
    }
    const totalDuration = Date.now() - startTime;
    eventLogger.info({
        userId,
        eventType: event.type,
        pluginsExecuted: targetPlugins.length,
        successCount,
        failureCount,
        totalDurationMs: totalDuration,
    }, "Event routing complete");
    return {
        pluginsExecuted: targetPlugins.length,
        successCount,
        failureCount,
        results,
    };
}
// ===========================================
// Telegram Webhook Handler
// ===========================================
/**
 * Handle a Telegram webhook for a specific gateway
 */
async function handleTelegramWebhook(gatewayId, userId, update, executeGateway) {
    eventLogger.debug({ gatewayId, userId, updateId: update.update_id }, "Handling Telegram webhook");
    // Transform the update to a plugin event
    const event = transformTelegramUpdate(update, gatewayId);
    if (!event) {
        eventLogger.debug({ gatewayId, updateId: update.update_id }, "Unsupported update type, skipping");
        return {
            pluginsExecuted: 0,
            successCount: 0,
            failureCount: 0,
            results: [],
        };
    }
    // Route to plugins
    return routeEventToPlugins(userId, event, executeGateway);
}
// ===========================================
// Manual Trigger
// ===========================================
/**
 * Manually trigger a plugin for a user
 */
async function triggerPluginManually(userPluginId, userId, params, executeGateway) {
    eventLogger.debug({ userPluginId, userId }, "Manual plugin trigger");
    // Get the user plugin
    const userPlugin = await prisma_1.prisma.userPlugin.findFirst({
        where: {
            id: userPluginId,
            userId,
        },
        include: {
            plugin: {
                select: {
                    id: true,
                    slug: true,
                    name: true,
                    requiredGateways: true,
                },
            },
        },
    });
    if (!userPlugin) {
        throw new Error(`UserPlugin not found: ${userPluginId}`);
    }
    if (!userPlugin.isEnabled) {
        throw new Error(`Plugin is not enabled: ${userPlugin.plugin.slug}`);
    }
    // Get user gateways
    const gateways = await getUserGateways(userId);
    // Create context
    const context = await createPluginContext(userPlugin, gateways, executeGateway);
    // Create manual trigger event
    const event = {
        type: "manual.trigger",
        data: {
            triggeredBy: userId,
            triggeredAt: new Date(),
            params,
        },
    };
    // Execute
    const executor = (0, plugin_executor_1.getPluginExecutor)();
    return executor.execute(userPlugin.plugin.slug, "", // No code hash for built-in plugins
    event, context);
}
//# sourceMappingURL=plugin.events.js.map