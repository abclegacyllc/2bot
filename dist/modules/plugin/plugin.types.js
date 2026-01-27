"use strict";
/**
 * Plugin Types
 *
 * Type definitions for the plugin system including plugin definitions,
 * execution context, events, and request/response DTOs.
 *
 * @module modules/plugin/plugin.types
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.toPluginDefinition = toPluginDefinition;
exports.toSafeUserPlugin = toSafeUserPlugin;
/**
 * Convert Prisma Plugin to PluginDefinition
 */
function toPluginDefinition(plugin) {
    return {
        id: plugin.id,
        slug: plugin.slug,
        name: plugin.name,
        description: plugin.description,
        version: plugin.version,
        requiredGateways: plugin.requiredGateways,
        configSchema: plugin.configSchema,
        icon: plugin.icon,
        category: plugin.category,
        tags: plugin.tags,
        isBuiltin: plugin.isBuiltin,
        isActive: plugin.isActive,
        inputSchema: plugin.inputSchema,
        outputSchema: plugin.outputSchema,
    };
}
/**
 * Convert UserPlugin with Plugin to SafeUserPlugin
 */
function toSafeUserPlugin(userPlugin) {
    return {
        id: userPlugin.id,
        pluginId: userPlugin.pluginId,
        pluginSlug: userPlugin.plugin.slug,
        pluginName: userPlugin.plugin.name,
        pluginDescription: userPlugin.plugin.description,
        pluginIcon: userPlugin.plugin.icon,
        pluginCategory: userPlugin.plugin.category,
        config: userPlugin.config,
        gatewayId: userPlugin.gatewayId,
        isEnabled: userPlugin.isEnabled,
        executionCount: userPlugin.executionCount,
        lastExecutedAt: userPlugin.lastExecutedAt,
        lastError: userPlugin.lastError,
        createdAt: userPlugin.createdAt,
        updatedAt: userPlugin.updatedAt,
    };
}
//# sourceMappingURL=plugin.types.js.map