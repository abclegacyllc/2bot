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
import { decryptJson, encrypt } from "@/lib/encryption";
import { logger } from "@/lib/logger";
import { enforcePluginLimit } from "@/lib/plan-limits";
import { prisma } from "@/lib/prisma";
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

    return userPlugins.map((up) => {
      const decrypted = { ...up, config: this.decryptConfig(up.config) };
      return toSafeUserPlugin(decrypted as unknown as UserPluginWithPlugin);
    });
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

    // Decrypt config
    const decrypted = { ...userPlugin, config: this.decryptConfig(userPlugin.config) };

    return toSafeUserPlugin(decrypted as unknown as UserPluginWithPlugin);
  }

  /**
   * Install a plugin for a user
   */
  async installPlugin(
    ctx: ServiceContext,
    data: InstallPluginRequest
  ): Promise<SafeUserPlugin> {
    // Resolve pluginId from slug if needed
    let pluginId = data.pluginId;
    if (!pluginId && data.slug) {
      const plugin = await prisma.plugin.findUnique({
        where: { slug: data.slug },
      });
      if (!plugin) {
        throw new NotFoundError(`Plugin not found: ${data.slug}`);
      }
      pluginId = plugin.id;
    }
    
    if (!pluginId) {
      throw new ValidationError("Either pluginId or slug must be provided", {});
    }

    pluginLogger.debug({ pluginId }, "Installing plugin");

    // Get the plugin
    const plugin = await this.getPluginById(pluginId);

    if (!plugin.isActive) {
      throw new ValidationError("Plugin is not available for installation", {});
    }

    // Check plan limits
    await enforcePluginLimit(ctx);

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
        pluginId: pluginId,
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
    const encryptedConfig = { _encrypted: encrypt(data.config ?? {}) };
    
    const userPlugin = await prisma.userPlugin.create({
      data: {
        userId: ctx.userId,
        pluginId: pluginId,
        organizationId: ctx.organizationId ?? null,
        config: encryptedConfig,
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

    // Return with original (unencrypted) config
    const decrypted = { ...userPlugin, config: data.config ?? {} };
    return toSafeUserPlugin(decrypted as unknown as UserPluginWithPlugin);
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
    const encryptedConfig = { _encrypted: encrypt(data.config) };
    
    const updateData: Prisma.UserPluginUpdateInput = {
      config: encryptedConfig,
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

    // Return with original (unencrypted) config (we know it's data.config)
    const decrypted = { ...updated, config: data.config };
    return toSafeUserPlugin(decrypted as unknown as UserPluginWithPlugin);
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

    const decrypted = { ...updated, config: this.decryptConfig(updated.config) };
    return toSafeUserPlugin(decrypted as unknown as UserPluginWithPlugin);
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
   * Decrypt plugin configuration if encrypted
   */
  private decryptConfig(config: unknown): Record<string, unknown> {
    if (
      typeof config === "object" &&
      config !== null &&
      "_encrypted" in config &&
      typeof (config as Record<string, unknown>)._encrypted === "string"
    ) {
      try {
        return decryptJson((config as Record<string, unknown>)._encrypted as string);
      } catch (error) {
        pluginLogger.error({ error }, "Failed to decrypt plugin config");
        return {}; // Return empty config on error to prevent UI crash
      }
    }
    return (config ?? {}) as Record<string, unknown>;
  }
}

// Export singleton instance
export const pluginService = new PluginService();
