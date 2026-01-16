/**
 * Plugin Service
 *
 * Handles plugin catalog operations, user plugin installations,
 * configuration management, and execution tracking.
 *
 * @module modules/plugin/plugin.service
 */

import type { GatewayType, Plugin, Prisma, UserPlugin } from "@prisma/client";

import { auditActions, type AuditContext } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { PLAN_LIMITS } from "@/shared/constants/plans";
import { ForbiddenError, NotFoundError, ValidationError } from "@/shared/errors";
import type { ServiceContext } from "@/shared/types/context";

import type {
    InstallPluginRequest,
    PluginDefinition,
    PluginListItem,
    SafeUserPlugin,
    UpdatePluginConfigRequest,
    UserPluginWithPlugin,
} from "./plugin.types";
import { toPluginDefinition, toSafeUserPlugin } from "./plugin.types";
import { validateConfigAgainstSchema } from "./plugin.validation";

const pluginLogger = logger.child({ module: "plugin" });

/**
 * Convert ServiceContext to AuditContext
 */
function toAuditContext(ctx: ServiceContext): AuditContext {
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
class PluginOwnershipError extends ForbiddenError {
  constructor() {
    super("You don't have access to this plugin installation");
  }
}

/**
 * Plugin limit error
 */
class PluginLimitError extends ForbiddenError {
  constructor(plan: string, limit: number) {
    super(`Plugin limit reached for ${plan} plan (max ${limit} plugins)`);
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
  async getAvailablePlugins(options?: {
    category?: string;
    gateway?: GatewayType;
    search?: string;
    tags?: string[];
  }): Promise<PluginListItem[]> {
    const where: Prisma.PluginWhereInput = { isActive: true };

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

    const plugins = await prisma.plugin.findMany({
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
  async getPluginBySlug(slug: string): Promise<PluginDefinition> {
    const plugin = await prisma.plugin.findUnique({
      where: { slug },
    });

    if (!plugin) {
      throw new NotFoundError(`Plugin not found: ${slug}`);
    }

    if (!plugin.isActive) {
      throw new NotFoundError(`Plugin is not available: ${slug}`);
    }

    return toPluginDefinition(plugin);
  }

  /**
   * Get plugin by ID
   */
  async getPluginById(id: string): Promise<Plugin> {
    const plugin = await prisma.plugin.findUnique({
      where: { id },
    });

    if (!plugin) {
      throw new NotFoundError("Plugin not found");
    }

    return plugin;
  }

  // ===========================================
  // User Plugin Management
  // ===========================================

  /**
   * Get user's installed plugins
   */
  async getUserPlugins(
    ctx: ServiceContext,
    options?: { enabled?: boolean; pluginId?: string }
  ): Promise<SafeUserPlugin[]> {
    const where = this.buildUserPluginWhere(ctx);

    if (options?.enabled !== undefined) {
      where.isEnabled = options.enabled;
    }

    if (options?.pluginId) {
      where.pluginId = options.pluginId;
    }

    const userPlugins = await prisma.userPlugin.findMany({
      where,
      include: { plugin: true },
      orderBy: { createdAt: "desc" },
    });

    return userPlugins.map(toSafeUserPlugin);
  }

  /**
   * Get a specific user plugin by ID
   */
  async getUserPluginById(ctx: ServiceContext, id: string): Promise<SafeUserPlugin> {
    const userPlugin = await prisma.userPlugin.findUnique({
      where: { id },
      include: { plugin: true },
    });

    if (!userPlugin) {
      throw new NotFoundError("Plugin installation not found");
    }

    // Check ownership
    this.checkOwnership(ctx, userPlugin);

    return toSafeUserPlugin(userPlugin);
  }

  /**
   * Install a plugin for a user
   */
  async installPlugin(
    ctx: ServiceContext,
    data: InstallPluginRequest
  ): Promise<SafeUserPlugin> {
    pluginLogger.debug({ pluginId: data.pluginId }, "Installing plugin");

    // Get the plugin
    const plugin = await this.getPluginById(data.pluginId);

    if (!plugin.isActive) {
      throw new ValidationError("Plugin is not available for installation", {});
    }

    // Check plan limits
    await this.checkPluginLimit(ctx);

    // Validate config against plugin schema
    if (data.config) {
      const configSchema = plugin.configSchema as Record<string, unknown>;
      const validation = validateConfigAgainstSchema(data.config, configSchema);
      if (!validation.valid) {
        throw new ValidationError("Invalid plugin configuration", {
          config: validation.errors ?? ["Configuration validation failed"],
        });
      }
    }

    // Check if already installed
    const existing = await prisma.userPlugin.findFirst({
      where: {
        userId: ctx.userId,
        pluginId: data.pluginId,
        organizationId: ctx.organizationId ?? null,
      },
    });

    if (existing) {
      throw new ValidationError("Plugin already installed", {
        pluginId: ["You have already installed this plugin"],
      });
    }

    // Verify gateway if provided
    if (data.gatewayId) {
      const gateway = await prisma.gateway.findUnique({
        where: { id: data.gatewayId },
      });

      if (!gateway) {
        throw new NotFoundError("Gateway not found");
      }

      // Check gateway ownership
      const isOwner = ctx.organizationId
        ? gateway.organizationId === ctx.organizationId
        : gateway.userId === ctx.userId && !gateway.organizationId;

      if (!isOwner && !ctx.isSuperAdmin()) {
        throw new ForbiddenError("You don't have access to this gateway");
      }

      // Check if gateway type matches plugin requirements
      if (
        plugin.requiredGateways.length > 0 &&
        !plugin.requiredGateways.includes(gateway.type)
      ) {
        throw new ValidationError("Gateway type mismatch", {
          gatewayId: [
            `This plugin requires one of: ${plugin.requiredGateways.join(", ")}`,
          ],
        });
      }
    }

    // Create user plugin
    const userPlugin = await prisma.userPlugin.create({
      data: {
        userId: ctx.userId,
        pluginId: data.pluginId,
        organizationId: ctx.organizationId ?? null,
        config: (data.config ?? {}) as object,
        gatewayId: data.gatewayId ?? null,
        isEnabled: true,
      },
      include: { plugin: true },
    });

    // Audit log
    void auditActions.pluginInstalled(toAuditContext(ctx), userPlugin.id, plugin.slug);

    pluginLogger.info(
      { userPluginId: userPlugin.id, pluginSlug: plugin.slug },
      "Plugin installed"
    );

    return toSafeUserPlugin(userPlugin as UserPluginWithPlugin);
  }

  /**
   * Uninstall a plugin
   */
  async uninstallPlugin(ctx: ServiceContext, userPluginId: string): Promise<void> {
    const userPlugin = await prisma.userPlugin.findUnique({
      where: { id: userPluginId },
      include: { plugin: true },
    });

    if (!userPlugin) {
      throw new NotFoundError("Plugin installation not found");
    }

    // Check ownership
    this.checkOwnership(ctx, userPlugin);

    // Delete the installation
    await prisma.userPlugin.delete({
      where: { id: userPluginId },
    });

    // Audit log
    void auditActions.pluginUninstalled(toAuditContext(ctx), userPluginId, userPlugin.plugin.slug);

    pluginLogger.info(
      { userPluginId, pluginSlug: userPlugin.plugin.slug },
      "Plugin uninstalled"
    );
  }

  /**
   * Update plugin configuration
   */
  async updatePluginConfig(
    ctx: ServiceContext,
    userPluginId: string,
    data: UpdatePluginConfigRequest
  ): Promise<SafeUserPlugin> {
    const userPlugin = await prisma.userPlugin.findUnique({
      where: { id: userPluginId },
      include: { plugin: true },
    });

    if (!userPlugin) {
      throw new NotFoundError("Plugin installation not found");
    }

    // Check ownership
    this.checkOwnership(ctx, userPlugin);

    // Validate config against plugin schema
    const configSchema = userPlugin.plugin.configSchema as Record<string, unknown>;
    const validation = validateConfigAgainstSchema(data.config, configSchema);
    if (!validation.valid) {
      throw new ValidationError("Invalid plugin configuration", {
        config: validation.errors ?? ["Configuration validation failed"],
      });
    }

    // Build update data
    const updateData: Prisma.UserPluginUpdateInput = {
      config: data.config as object,
    };

    // Update gateway binding if provided
    if (data.gatewayId !== undefined) {
      if (data.gatewayId !== null) {
        // Verify gateway exists and user has access
        const gateway = await prisma.gateway.findUnique({
          where: { id: data.gatewayId },
        });

        if (!gateway) {
          throw new NotFoundError("Gateway not found");
        }

        const isOwner = ctx.organizationId
          ? gateway.organizationId === ctx.organizationId
          : gateway.userId === ctx.userId && !gateway.organizationId;

        if (!isOwner && !ctx.isSuperAdmin()) {
          throw new ForbiddenError("You don't have access to this gateway");
        }

        updateData.gatewayId = data.gatewayId;
      } else {
        updateData.gatewayId = null;
      }
    }

    const updated = await prisma.userPlugin.update({
      where: { id: userPluginId },
      data: updateData,
      include: { plugin: true },
    });

    pluginLogger.debug(
      { userPluginId, pluginSlug: userPlugin.plugin.slug },
      "Plugin config updated"
    );

    return toSafeUserPlugin(updated as UserPluginWithPlugin);
  }

  /**
   * Enable or disable a plugin
   */
  async togglePlugin(
    ctx: ServiceContext,
    userPluginId: string,
    enabled: boolean
  ): Promise<SafeUserPlugin> {
    const userPlugin = await prisma.userPlugin.findUnique({
      where: { id: userPluginId },
      include: { plugin: true },
    });

    if (!userPlugin) {
      throw new NotFoundError("Plugin installation not found");
    }

    // Check ownership
    this.checkOwnership(ctx, userPlugin);

    const updated = await prisma.userPlugin.update({
      where: { id: userPluginId },
      data: { isEnabled: enabled },
      include: { plugin: true },
    });

    pluginLogger.info(
      { userPluginId, pluginSlug: userPlugin.plugin.slug, enabled },
      `Plugin ${enabled ? "enabled" : "disabled"}`
    );

    return toSafeUserPlugin(updated as UserPluginWithPlugin);
  }

  // ===========================================
  // Execution Tracking
  // ===========================================

  /**
   * Record a plugin execution
   */
  async recordExecution(
    userPluginId: string,
    success: boolean,
    error?: string
  ): Promise<void> {
    await prisma.userPlugin.update({
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
  private buildUserPluginWhere(ctx: ServiceContext): {
    userId: string;
    organizationId: string | null;
    isEnabled?: boolean;
    pluginId?: string;
  } {
    return ctx.organizationId
      ? { userId: ctx.userId, organizationId: ctx.organizationId }
      : { userId: ctx.userId, organizationId: null };
  }

  /**
   * Check if user/org owns the plugin installation
   */
  private checkOwnership(ctx: ServiceContext, userPlugin: UserPlugin | UserPluginWithPlugin): void {
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

  /**
   * Check if user can install more plugins based on their plan
   */
  private async checkPluginLimit(ctx: ServiceContext): Promise<void> {
    const limits = PLAN_LIMITS[ctx.userPlan];
    const pluginLimit = limits.plugins;

    // Unlimited
    if (pluginLimit === -1) {
      return;
    }

    // Count current installations
    const count = await prisma.userPlugin.count({
      where: this.buildUserPluginWhere(ctx),
    });

    if (count >= pluginLimit) {
      throw new PluginLimitError(ctx.userPlan, pluginLimit);
    }
  }
}

// Export singleton instance
export const pluginService = new PluginService();
