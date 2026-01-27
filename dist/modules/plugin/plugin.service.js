"use strict";
/**
 * Plugin Service
 *
 * Handles plugin catalog operations, user plugin installations,
 * configuration management, and execution tracking.
 *
 * @module modules/plugin/plugin.service
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.pluginService = void 0;
const audit_1 = require("@/lib/audit");
const logger_1 = require("@/lib/logger");
const plan_limits_1 = require("@/lib/plan-limits");
const prisma_1 = require("@/lib/prisma");
const errors_1 = require("@/shared/errors");
const plugin_types_1 = require("./plugin.types");
const plugin_validation_1 = require("./plugin.validation");
const pluginLogger = logger_1.logger.child({ module: "plugin" });
/**
 * Convert ServiceContext to AuditContext
 */
function toAuditContext(ctx) {
    return {
        userId: ctx.userId,
        organizationId: ctx.organizationId,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
    };
}
/**
 * Plugin ownership error
 */
class PluginOwnershipError extends errors_1.ForbiddenError {
    constructor() {
        super("You don't have access to this plugin installation");
    }
}
/**
 * Plugin Service
 */
class PluginService {
    // ===========================================
    // Public Plugin Catalog (no auth required)
    // ===========================================
    /**
     * Get all available (active) plugins
     */
    async getAvailablePlugins(options) {
        const where = { isActive: true };
        if (options?.category) {
            where.category = options.category;
        }
        if (options?.gateway) {
            where.requiredGateways = { has: options.gateway };
        }
        if (options?.tags && options.tags.length > 0) {
            where.tags = { hasSome: options.tags };
        }
        if (options?.search) {
            where.OR = [
                { name: { contains: options.search, mode: "insensitive" } },
                { description: { contains: options.search, mode: "insensitive" } },
                { slug: { contains: options.search, mode: "insensitive" } },
            ];
        }
        const plugins = await prisma_1.prisma.plugin.findMany({
            where,
            orderBy: [{ category: "asc" }, { name: "asc" }],
            select: {
                id: true,
                slug: true,
                name: true,
                description: true,
                version: true,
                icon: true,
                category: true,
                tags: true,
                requiredGateways: true,
                isBuiltin: true,
            },
        });
        return plugins;
    }
    /**
     * Get plugin by slug
     */
    async getPluginBySlug(slug) {
        const plugin = await prisma_1.prisma.plugin.findUnique({
            where: { slug },
        });
        if (!plugin) {
            throw new errors_1.NotFoundError(`Plugin not found: ${slug}`);
        }
        if (!plugin.isActive) {
            throw new errors_1.NotFoundError(`Plugin is not available: ${slug}`);
        }
        return (0, plugin_types_1.toPluginDefinition)(plugin);
    }
    /**
     * Get plugin by ID
     */
    async getPluginById(id) {
        const plugin = await prisma_1.prisma.plugin.findUnique({
            where: { id },
        });
        if (!plugin) {
            throw new errors_1.NotFoundError("Plugin not found");
        }
        return plugin;
    }
    // ===========================================
    // User Plugin Management
    // ===========================================
    /**
     * Get user's installed plugins
     */
    async getUserPlugins(ctx, options) {
        const where = this.buildUserPluginWhere(ctx);
        if (options?.enabled !== undefined) {
            where.isEnabled = options.enabled;
        }
        if (options?.pluginId) {
            where.pluginId = options.pluginId;
        }
        const userPlugins = await prisma_1.prisma.userPlugin.findMany({
            where,
            include: { plugin: true },
            orderBy: { createdAt: "desc" },
        });
        return userPlugins.map(plugin_types_1.toSafeUserPlugin);
    }
    /**
     * Get a specific user plugin by ID
     */
    async getUserPluginById(ctx, id) {
        const userPlugin = await prisma_1.prisma.userPlugin.findUnique({
            where: { id },
            include: { plugin: true },
        });
        if (!userPlugin) {
            throw new errors_1.NotFoundError("Plugin installation not found");
        }
        // Check ownership
        this.checkOwnership(ctx, userPlugin);
        return (0, plugin_types_1.toSafeUserPlugin)(userPlugin);
    }
    /**
     * Install a plugin for a user
     */
    async installPlugin(ctx, data) {
        // Resolve pluginId from slug if needed
        let pluginId = data.pluginId;
        if (!pluginId && data.slug) {
            const plugin = await prisma_1.prisma.plugin.findUnique({
                where: { slug: data.slug },
            });
            if (!plugin) {
                throw new errors_1.NotFoundError(`Plugin not found: ${data.slug}`);
            }
            pluginId = plugin.id;
        }
        if (!pluginId) {
            throw new errors_1.ValidationError("Either pluginId or slug must be provided", {});
        }
        pluginLogger.debug({ pluginId }, "Installing plugin");
        // Get the plugin
        const plugin = await this.getPluginById(pluginId);
        if (!plugin.isActive) {
            throw new errors_1.ValidationError("Plugin is not available for installation", {});
        }
        // Check plan limits
        await (0, plan_limits_1.enforcePluginLimit)(ctx);
        // Validate config against plugin schema
        if (data.config) {
            const configSchema = plugin.configSchema;
            const validation = (0, plugin_validation_1.validateConfigAgainstSchema)(data.config, configSchema);
            if (!validation.valid) {
                throw new errors_1.ValidationError("Invalid plugin configuration", {
                    config: validation.errors ?? ["Configuration validation failed"],
                });
            }
        }
        // Check if already installed
        const existing = await prisma_1.prisma.userPlugin.findFirst({
            where: {
                userId: ctx.userId,
                pluginId: pluginId,
                organizationId: ctx.organizationId ?? null,
            },
        });
        if (existing) {
            throw new errors_1.ValidationError("Plugin already installed", {
                pluginId: ["You have already installed this plugin"],
            });
        }
        // Verify gateway if provided
        if (data.gatewayId) {
            const gateway = await prisma_1.prisma.gateway.findUnique({
                where: { id: data.gatewayId },
            });
            if (!gateway) {
                throw new errors_1.NotFoundError("Gateway not found");
            }
            // Check gateway ownership
            const isOwner = ctx.organizationId
                ? gateway.organizationId === ctx.organizationId
                : gateway.userId === ctx.userId && !gateway.organizationId;
            if (!isOwner && !ctx.isSuperAdmin()) {
                throw new errors_1.ForbiddenError("You don't have access to this gateway");
            }
            // Check if gateway type matches plugin requirements
            if (plugin.requiredGateways.length > 0 &&
                !plugin.requiredGateways.includes(gateway.type)) {
                throw new errors_1.ValidationError("Gateway type mismatch", {
                    gatewayId: [
                        `This plugin requires one of: ${plugin.requiredGateways.join(", ")}`,
                    ],
                });
            }
        }
        // Create user plugin
        const userPlugin = await prisma_1.prisma.userPlugin.create({
            data: {
                userId: ctx.userId,
                pluginId: pluginId,
                organizationId: ctx.organizationId ?? null,
                config: (data.config ?? {}),
                gatewayId: data.gatewayId ?? null,
                isEnabled: true,
            },
            include: { plugin: true },
        });
        // Audit log
        void audit_1.auditActions.pluginInstalled(toAuditContext(ctx), userPlugin.id, plugin.slug);
        pluginLogger.info({ userPluginId: userPlugin.id, pluginSlug: plugin.slug }, "Plugin installed");
        return (0, plugin_types_1.toSafeUserPlugin)(userPlugin);
    }
    /**
     * Uninstall a plugin
     */
    async uninstallPlugin(ctx, userPluginId) {
        const userPlugin = await prisma_1.prisma.userPlugin.findUnique({
            where: { id: userPluginId },
            include: { plugin: true },
        });
        if (!userPlugin) {
            throw new errors_1.NotFoundError("Plugin installation not found");
        }
        // Check ownership
        this.checkOwnership(ctx, userPlugin);
        // Delete the installation
        await prisma_1.prisma.userPlugin.delete({
            where: { id: userPluginId },
        });
        // Audit log
        void audit_1.auditActions.pluginUninstalled(toAuditContext(ctx), userPluginId, userPlugin.plugin.slug);
        pluginLogger.info({ userPluginId, pluginSlug: userPlugin.plugin.slug }, "Plugin uninstalled");
    }
    /**
     * Update plugin configuration
     */
    async updatePluginConfig(ctx, userPluginId, data) {
        const userPlugin = await prisma_1.prisma.userPlugin.findUnique({
            where: { id: userPluginId },
            include: { plugin: true },
        });
        if (!userPlugin) {
            throw new errors_1.NotFoundError("Plugin installation not found");
        }
        // Check ownership
        this.checkOwnership(ctx, userPlugin);
        // Validate config against plugin schema
        const configSchema = userPlugin.plugin.configSchema;
        const validation = (0, plugin_validation_1.validateConfigAgainstSchema)(data.config, configSchema);
        if (!validation.valid) {
            throw new errors_1.ValidationError("Invalid plugin configuration", {
                config: validation.errors ?? ["Configuration validation failed"],
            });
        }
        // Build update data
        const updateData = {
            config: data.config,
        };
        // Update gateway binding if provided
        if (data.gatewayId !== undefined) {
            if (data.gatewayId !== null) {
                // Verify gateway exists and user has access
                const gateway = await prisma_1.prisma.gateway.findUnique({
                    where: { id: data.gatewayId },
                });
                if (!gateway) {
                    throw new errors_1.NotFoundError("Gateway not found");
                }
                const isOwner = ctx.organizationId
                    ? gateway.organizationId === ctx.organizationId
                    : gateway.userId === ctx.userId && !gateway.organizationId;
                if (!isOwner && !ctx.isSuperAdmin()) {
                    throw new errors_1.ForbiddenError("You don't have access to this gateway");
                }
                updateData.gatewayId = data.gatewayId;
            }
            else {
                updateData.gatewayId = null;
            }
        }
        const updated = await prisma_1.prisma.userPlugin.update({
            where: { id: userPluginId },
            data: updateData,
            include: { plugin: true },
        });
        pluginLogger.debug({ userPluginId, pluginSlug: userPlugin.plugin.slug }, "Plugin config updated");
        return (0, plugin_types_1.toSafeUserPlugin)(updated);
    }
    /**
     * Enable or disable a plugin
     */
    async togglePlugin(ctx, userPluginId, enabled) {
        const userPlugin = await prisma_1.prisma.userPlugin.findUnique({
            where: { id: userPluginId },
            include: { plugin: true },
        });
        if (!userPlugin) {
            throw new errors_1.NotFoundError("Plugin installation not found");
        }
        // Check ownership
        this.checkOwnership(ctx, userPlugin);
        const updated = await prisma_1.prisma.userPlugin.update({
            where: { id: userPluginId },
            data: { isEnabled: enabled },
            include: { plugin: true },
        });
        pluginLogger.info({ userPluginId, pluginSlug: userPlugin.plugin.slug, enabled }, `Plugin ${enabled ? "enabled" : "disabled"}`);
        return (0, plugin_types_1.toSafeUserPlugin)(updated);
    }
    // ===========================================
    // Execution Tracking
    // ===========================================
    /**
     * Record a plugin execution
     */
    async recordExecution(userPluginId, success, error) {
        await prisma_1.prisma.userPlugin.update({
            where: { id: userPluginId },
            data: {
                executionCount: { increment: 1 },
                lastExecutedAt: new Date(),
                lastError: success ? null : error,
            },
        });
        pluginLogger.debug({ userPluginId, success }, "Plugin execution recorded");
    }
    // ===========================================
    // Internal Helpers
    // ===========================================
    /**
     * Build where clause for user plugin queries
     */
    buildUserPluginWhere(ctx) {
        return ctx.organizationId
            ? { userId: ctx.userId, organizationId: ctx.organizationId }
            : { userId: ctx.userId, organizationId: null };
    }
    /**
     * Check if user/org owns the plugin installation
     */
    checkOwnership(ctx, userPlugin) {
        // Super admins can access any installation
        if (ctx.isSuperAdmin()) {
            return;
        }
        // Check organization ownership
        if (ctx.organizationId) {
            if (userPlugin.organizationId !== ctx.organizationId) {
                throw new PluginOwnershipError();
            }
            return;
        }
        // Check user ownership (and ensure not org-owned)
        if (userPlugin.userId !== ctx.userId || userPlugin.organizationId !== null) {
            throw new PluginOwnershipError();
        }
    }
}
// Export singleton instance
exports.pluginService = new PluginService();
//# sourceMappingURL=plugin.service.js.map