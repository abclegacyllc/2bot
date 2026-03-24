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

import { bridgeClientManager, workspaceService } from "@/modules/workspace";
import { getPluginEntryPath, pluginDeployService } from "./plugin-deploy.service";
import { pluginIpcService } from "./plugin-ipc.service";
import type {
    ConflictResolution,
    CreateCustomPluginRequest,
    InstallPluginRequest,
    JSONSchema,
    PluginCategory,
    PluginDefinition,
    PluginListItem,
    SafeUserPlugin,
    UpdateCustomPluginRequest,
    UpdatePluginConfigRequest,
    UserPluginWithPlugin,
} from "./plugin.types";
import { extractSchemaDefaults, toPluginDefinition, toSafeUserPlugin } from "./plugin.types";
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
   * Get all available (active) plugins.
   * When userId is provided, also includes the user's own custom (non-public) plugins.
   */
  async getAvailablePlugins(options?: {
    category?: string;
    gateway?: GatewayType;
    search?: string;
    tags?: string[];
    userId?: string;
  }): Promise<PluginListItem[]> {
    // Base filter: active built-in/public plugins
    const baseFilter: Prisma.PluginWhereInput = { isActive: true };

    if (options?.category) {
      baseFilter.category = options.category;
    }

    if (options?.gateway) {
      baseFilter.requiredGateways = { has: options.gateway };
    }

    if (options?.tags && options.tags.length > 0) {
      baseFilter.tags = { hasSome: options.tags };
    }

    if (options?.search) {
      baseFilter.OR = [
        { name: { contains: options.search, mode: "insensitive" } },
        { description: { contains: options.search, mode: "insensitive" } },
        { slug: { contains: options.search, mode: "insensitive" } },
      ];
    }

    // Include user's own custom plugins alongside public/built-in ones
    let where: Prisma.PluginWhereInput;
    if (options?.userId) {
      where = {
        OR: [
          { ...baseFilter, isBuiltin: true },
          { ...baseFilter, isPublic: true },
          { ...baseFilter, authorId: options.userId },
        ],
      };
    } else {
      where = { ...baseFilter, OR: [{ isBuiltin: true }, { isPublic: true }] };
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
        authorType: true,
        isPublic: true,
        installCount: true,
        avgRating: true,
        reviewCount: true,
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
      include: {
        plugin: true,
        gateway: { select: { id: true, name: true, type: true, status: true } },
      },
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
      include: {
        plugin: true,
        gateway: { select: { id: true, name: true, type: true, status: true } },
      },
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
  ): Promise<SafeUserPlugin & { _warnings?: string[]; _resolutions?: ConflictResolution[] }> {
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

    // Check if already installed (scoped to gateway so the same plugin can be
    // installed on multiple bots)
    const existing = await prisma.userPlugin.findFirst({
      where: {
        userId: ctx.userId,
        pluginId: pluginId,
        organizationId: ctx.organizationId ?? null,
        gatewayId: data.gatewayId ?? null,
      },
    });

    if (existing) {
      throw new ValidationError("Plugin already installed", {
        pluginId: ["You have already installed this plugin on this bot"],
      });
    }

    // Verify gateway if provided
    let conflictWarnings: string[] = [];
    let conflictResolutions: ConflictResolution[] = [];
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

      // Check plugin conflicts (event type collisions and explicit conflicts)
      const conflictResult = await this.checkPluginConflicts(
        plugin,
        data.gatewayId,
        ctx.userId,
        ctx.organizationId ?? null,
        pluginId,
      );
      conflictWarnings = conflictResult.warnings;
      conflictResolutions = conflictResult.resolutions;

      if (conflictWarnings.length > 0) {
        pluginLogger.warn(
          { pluginSlug: plugin.slug, conflicts: conflictWarnings },
          "Plugin installed with conflict warnings"
        );
      }
      if (conflictResolutions.length > 0) {
        pluginLogger.info(
          { pluginSlug: plugin.slug, resolutions: conflictResolutions },
          "Plugin conflicts auto-resolved"
        );
      }
    }

    // Apply auto-resolutions: if we need to change the new plugin's event role,
    // update it in the database before creating the user plugin record.
    const hasRoleChange = conflictResolutions.some((r) => r.type === "role_change" && r.to === "observer");
    if (hasRoleChange) {
      await prisma.plugin.update({
        where: { id: pluginId },
        data: { eventRole: "observer" },
      });
    }

    // Merge schema defaults with user-provided config (user values take priority)
    const schemaDefaults = extractSchemaDefaults(plugin.configSchema as JSONSchema);
    const mergedConfig = { ...schemaDefaults, ...(data.config ?? {}) };
    const encryptedConfig = { _encrypted: encrypt(mergedConfig) };
    
    const userPlugin = await prisma.userPlugin.create({
      data: {
        userId: ctx.userId,
        pluginId: pluginId,
        organizationId: ctx.organizationId ?? null,
        config: encryptedConfig,
        gatewayId: data.gatewayId ?? null,
        isEnabled: true,
        entryFile: getPluginEntryPath(data.gatewayId, plugin.slug),
      },
      include: {
        plugin: true,
        gateway: { select: { id: true, name: true, type: true, status: true } },
      },
    });

    // Audit log
    void auditActions.pluginInstalled(toAuditContext(ctx), userPlugin.id, plugin.slug);

    // Increment install count on catalog entry
    await prisma.plugin.update({
      where: { id: pluginId },
      data: { installCount: { increment: 1 } },
    });

    pluginLogger.info(
      { userPluginId: userPlugin.id, pluginSlug: plugin.slug },
      "Plugin installed"
    );

    // Ensure workspace container is running before writing template
    try {
      await workspaceService.ensureContainerRunning(ctx, ctx.organizationId);
    } catch (err) {
      pluginLogger.warn(
        { pluginSlug: plugin.slug, error: (err as Error).message },
        'Failed to ensure workspace running during install — template may not be deployed',
      );
    }

    // Write template code to workspace container and start
    const templateCode = plugin.codeBundle as string | null;
    if (templateCode) {
      const env: Record<string, string> = { PLUGIN_USER_ID: ctx.userId };
      if (ctx.organizationId) env.PLUGIN_ORG_ID = ctx.organizationId;
      if (data.gatewayId) env.PLUGIN_GATEWAY_ID = data.gatewayId;

      try {
        await pluginDeployService.writeTemplateToContainer(
          ctx.userId,
          ctx.organizationId ?? null,
          plugin.slug,
          templateCode,
          env,
          data.gatewayId,
        );
      } catch (err) {
        pluginLogger.warn(
          { pluginSlug: plugin.slug, error: (err as Error).message },
          'Plugin template deploy to workspace failed',
        );
      }
    }

    // Probe bridge for process status (best-effort, non-blocking for response)
    let processStatus: string | undefined;
    try {
      const container = await prisma.workspaceContainer.findFirst({
        where: {
          userId: ctx.userId,
          organizationId: ctx.organizationId ?? null,
          status: 'RUNNING',
        },
        select: { id: true },
      });
      if (container) {
        const client = bridgeClientManager.getExistingClient(container.id);
        if (client) {
          const entryFile = userPlugin.entryFile ?? getPluginEntryPath(data.gatewayId, plugin.slug);
          const list = await client.pluginList() as Array<{ file: string; status: string }>;
          const match = list.find(p => p.file === entryFile);
          processStatus = match?.status ?? 'not_found';
        }
      }
    } catch {
      // Non-critical — don't fail install if probe fails
    }

    // Return with original (unencrypted) config including schema defaults
    const decrypted = { ...userPlugin, config: mergedConfig, processStatus };
    const result = toSafeUserPlugin(decrypted as unknown as UserPluginWithPlugin);
    const enriched: SafeUserPlugin & { _warnings?: string[]; _resolutions?: ConflictResolution[] } = result;
    if (conflictWarnings.length > 0) enriched._warnings = conflictWarnings;
    if (conflictResolutions.length > 0) enriched._resolutions = conflictResolutions;
    return enriched;
  }

  /**
   * Check for plugin conflicts on a gateway before installation.
   * Returns warnings for explicit conflicts (cannot be auto-resolved) and
   * auto-resolutions for event role collisions (applied automatically).
   *
   * Checks:
   * 1. Explicit conflictsWith — warning only (user must decide)
   * 2. Event role collisions — auto-resolved by switching the *new* plugin to observer
   */
  private async checkPluginConflicts(
    newPlugin: Plugin,
    gatewayId: string,
    userId: string,
    organizationId: string | null,
    newPluginId: string,
  ): Promise<{ warnings: string[]; resolutions: ConflictResolution[] }> {
    const warnings: string[] = [];
    const resolutions: ConflictResolution[] = [];

    // Find all other enabled plugins on this gateway
    const existingInstalls = await prisma.userPlugin.findMany({
      where: {
        userId,
        organizationId,
        gatewayId,
        pluginId: { not: newPluginId },
        isEnabled: true,
      },
      include: { plugin: true },
    });

    if (existingInstalls.length === 0) return { warnings, resolutions };

    const newEventTypes = (newPlugin.eventTypes ?? []) as string[];
    const newRole = (newPlugin.eventRole ?? "responder") as string;
    const newConflicts = (newPlugin.conflictsWith ?? []) as string[];

    for (const existing of existingInstalls) {
      const existingPlugin = existing.plugin;
      const existingSlug = existingPlugin.slug;
      const existingEventTypes = (existingPlugin.eventTypes ?? []) as string[];
      const existingRole = (existingPlugin.eventRole ?? "responder") as string;
      const existingConflicts = (existingPlugin.conflictsWith ?? []) as string[];

      // Check 1: Explicit conflict declarations (bidirectional) — warning only
      if (newConflicts.includes(existingSlug)) {
        warnings.push(
          `"${newPlugin.name}" declares a conflict with "${existingPlugin.name}" — they may not work well together on the same bot`
        );
      }
      if (existingConflicts.includes(newPlugin.slug)) {
        warnings.push(
          `"${existingPlugin.name}" declares a conflict with "${newPlugin.name}" — they may not work well together on the same bot`
        );
      }

      // Check 2: Event role collision — auto-resolve by switching new plugin to observer
      if (newRole === "responder" && existingRole === "responder") {
        const overlapping = newEventTypes.filter(et => existingEventTypes.includes(et));
        if (overlapping.length > 0) {
          resolutions.push({
            type: "role_change",
            plugin: newPlugin.slug,
            from: "responder",
            to: "observer",
            reason:
              `"${existingPlugin.name}" already responds to ${overlapping.join(", ")} — ` +
              `"${newPlugin.name}" was set to observer mode to prevent duplicate responses`,
          });
        }
      }
    }

    return { warnings, resolutions };
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

    const plugin = userPlugin.plugin;
    const isCustomPlugin = plugin.authorType === "USER" && !plugin.isBuiltin;

    // For custom plugins, check if this is the last installation
    let shouldDeleteCatalogEntry = false;
    if (isCustomPlugin) {
      const installCount = await prisma.userPlugin.count({
        where: { pluginId: plugin.id },
      });
      // If this is the only installation, delete the catalog entry too
      shouldDeleteCatalogEntry = installCount <= 1;
    }

    // Delete in a transaction: UserPlugin + (optionally) Plugin catalog entry
    await prisma.$transaction(async (tx) => {
      await tx.userPlugin.delete({ where: { id: userPluginId } });
      if (shouldDeleteCatalogEntry) {
        await tx.plugin.delete({ where: { id: plugin.id } });
      } else {
        // Decrement install count if keeping the catalog entry
        await tx.plugin.update({
          where: { id: plugin.id },
          data: { installCount: { decrement: 1 } },
        });
      }
    });

    // Audit log
    void auditActions.pluginUninstalled(toAuditContext(ctx), userPluginId, plugin.slug);

    pluginLogger.info(
      { userPluginId, pluginSlug: plugin.slug, catalogDeleted: shouldDeleteCatalogEntry },
      shouldDeleteCatalogEntry ? "Custom plugin uninstalled and catalog entry deleted" : "Plugin uninstalled"
    );

    // Remove plugin code from workspace container (non-blocking)
    void pluginDeployService.undeployFromWorkspace(
      ctx.userId,
      ctx.organizationId ?? null,
      plugin.slug,
      userPlugin.entryFile ?? undefined,
    ).catch((err) => {
      pluginLogger.warn(
        { pluginSlug: plugin.slug, error: (err as Error).message },
        'Plugin undeploy from workspace failed (non-blocking)',
      );
    });

    // Invalidate IPC context cache so stale plugin data doesn't linger
    pluginIpcService.clearCache();

    // Clean up server-side Redis storage for this plugin installation (non-blocking)
    void pluginIpcService.clearPluginRedisKeys(userPluginId).catch((err) => {
      pluginLogger.warn(
        { userPluginId, error: (err as Error).message },
        'Failed to clear plugin Redis storage (non-blocking)',
      );
    });
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
      include: {
        plugin: true,
        gateway: { select: { id: true, name: true, type: true, status: true } },
      },
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

    // Update storage quota if provided
    if (data.storageQuotaMb !== undefined) {
      updateData.storageQuotaMb = data.storageQuotaMb;
    }

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

        // Pre-flight check: ensure no other install of the same plugin on this gateway
        const conflict = await prisma.userPlugin.findFirst({
          where: {
            userId: ctx.userId,
            pluginId: userPlugin.pluginId,
            organizationId: ctx.organizationId ?? null,
            gatewayId: data.gatewayId,
            id: { not: userPluginId },
          },
        });
        if (conflict) {
          throw new ValidationError("Plugin already installed on this bot", {
            gatewayId: ["This plugin is already installed on the selected bot"],
          });
        }

        updateData.gateway = { connect: { id: data.gatewayId! } };
        updateData.entryFile = getPluginEntryPath(data.gatewayId, userPlugin.plugin.slug);
      } else {
        updateData.gateway = { disconnect: true };
        updateData.entryFile = getPluginEntryPath(null, userPlugin.plugin.slug);
      }
    }

    const updated = await prisma.userPlugin.update({
      where: { id: userPluginId },
      data: updateData,
      include: {
        plugin: true,
        gateway: { select: { id: true, name: true, type: true, status: true } },
      },
    });

    pluginLogger.debug(
      { userPluginId, pluginSlug: userPlugin.plugin.slug },
      "Plugin config updated"
    );

    // Push updated storage quota to running container (instant, no restart needed)
    if (data.storageQuotaMb !== undefined) {
      const entryFile = updated.entryFile ?? getPluginEntryPath(updated.gatewayId, updated.plugin.slug);
      void this.pushStorageQuota(ctx, entryFile, data.storageQuotaMb);
    }

    // Restart running plugin so it picks up new PLUGIN_CONFIG / PLUGIN_GATEWAY_ID (non-blocking)
    // When gateway changes, the old file path differs from the new one — stop the old, start the new
    const oldFile = userPlugin.entryFile ?? getPluginEntryPath(userPlugin.gatewayId, userPlugin.plugin.slug);
    const newFile = updated.entryFile ?? getPluginEntryPath(updated.gatewayId, updated.plugin.slug);
    void (async () => {
      const container = await prisma.workspaceContainer.findFirst({
        where: {
          userId: ctx.userId,
          organizationId: ctx.organizationId ?? null,
          status: 'RUNNING',
        },
        select: { id: true },
      });
      if (!container) return;

      const client = bridgeClientManager.getExistingClient(container.id);
      if (!client) return;

      // Check if plugin is actually running at the old path before restarting
      const list = await client.pluginList() as Array<{ file: string; status: string }>;
      const running = list.find(p => p.file === oldFile && p.status === 'running');
      if (!running && oldFile === newFile) return;

      // Build env with updated config and gateway
      const env: Record<string, string> = {
        PLUGIN_USER_ID: ctx.userId,
        PLUGIN_CONFIG: JSON.stringify(data.config),
      };
      if (ctx.organizationId) env.PLUGIN_ORG_ID = ctx.organizationId;
      if (data.gatewayId !== undefined) {
        if (data.gatewayId) env.PLUGIN_GATEWAY_ID = data.gatewayId;
      } else if (updated.gatewayId) {
        env.PLUGIN_GATEWAY_ID = updated.gatewayId;
      }

      // Stop old process, move file if gateway changed, then start at new path
      await client.pluginStop(oldFile).catch(() => {});
      if (oldFile !== newFile) {
        // Ensure target directory exists, then move the plugin file
        const newDir = newFile.substring(0, newFile.lastIndexOf('/'));
        if (newDir) {
          await client.fileMkdir(newDir).catch(() => {});
        }
        await client.send('file.rename', { oldPath: oldFile, newPath: newFile }).catch(() => {});
      }
      await new Promise(r => setTimeout(r, 300));
      await client.pluginStart(newFile, env, updated.storageQuotaMb);

      pluginLogger.info(
        { userPluginId, pluginSlug: updated.plugin.slug },
        'Plugin restarted after config/gateway update',
      );
    })().catch((err) => {
      pluginLogger.warn(
        { userPluginId, error: (err as Error).message },
        'Plugin restart after config update failed (non-blocking)',
      );
    });

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
      include: {
        plugin: true,
        gateway: { select: { id: true, name: true, type: true, status: true } },
      },
    });

    if (!userPlugin) {
      throw new NotFoundError("Plugin installation not found");
    }

    // Check ownership
    this.checkOwnership(ctx, userPlugin);

    // Pre-flight: check if required gateways are bound BEFORE updating DB
    const plugin = userPlugin.plugin;
    const hasCode = !!(plugin.codeBundle || userPlugin.entryFile);

    if (enabled && hasCode) {
      const reqGateways = plugin.requiredGateways as string[];
      if (reqGateways.length > 0 && !userPlugin.gatewayId) {
        throw new ValidationError("Plugin requires a gateway to be enabled", {
          gatewayId: [`This plugin requires one of: ${reqGateways.join(", ")}. Configure a gateway first.`],
        });
      }
    }

    const updated = await prisma.userPlugin.update({
      where: { id: userPluginId },
      data: { isEnabled: enabled },
      include: {
        plugin: true,
        gateway: { select: { id: true, name: true, type: true, status: true } },
      },
    });

    pluginLogger.info(
      { userPluginId, pluginSlug: userPlugin.plugin.slug, enabled },
      `Plugin ${enabled ? "enabled" : "disabled"}`
    );

    // Start or stop the plugin process in the workspace container (non-blocking)
    if (enabled && hasCode) {

      // Ensure the plugin file exists and process is running (file already on disk)
      const container = await prisma.workspaceContainer.findFirst({
        where: {
          userId: ctx.userId,
          organizationId: ctx.organizationId ?? null,
          status: 'RUNNING',
        },
        select: { id: true },
      });

      if (container) {
        const env: Record<string, string> = { PLUGIN_USER_ID: ctx.userId };
        if (ctx.organizationId) env.PLUGIN_ORG_ID = ctx.organizationId;
        if (userPlugin.gatewayId) env.PLUGIN_GATEWAY_ID = userPlugin.gatewayId;

        void (async () => {
          await pluginDeployService.ensureFileExists(
            container.id,
            plugin.slug,
            ctx.userId,
            ctx.organizationId ?? null,
            userPlugin.entryFile ?? undefined,
          );
          await pluginDeployService.ensureRunning(
            container.id,
            plugin.slug,
            env,
            userPlugin.entryFile ?? undefined,
          );
        })().catch((err) => {
          pluginLogger.warn(
            { pluginSlug: plugin.slug, error: (err as Error).message },
            'Plugin start on enable failed (non-blocking)',
          );
        });
      }
    } else if (!enabled) {
      // Stop the process
      void pluginDeployService.stopPluginInWorkspace(
        ctx.userId,
        ctx.organizationId ?? null,
        plugin.slug,
        userPlugin.entryFile ?? undefined,
      ).catch((err) => {
        pluginLogger.warn(
          { pluginSlug: plugin.slug, error: (err as Error).message },
          'Plugin stop on disable failed (non-blocking)',
        );
      });

      // Warn about workflows that reference this plugin (steps will be skipped at runtime)
      void prisma.workflowStep.findMany({
        where: { pluginId: plugin.id, workflow: { userId: ctx.userId, isEnabled: true } },
        select: { workflow: { select: { id: true, name: true } } },
      }).then((steps) => {
        const workflows = [...new Map(steps.map(s => [s.workflow.id, s.workflow.name])).entries()];
        if (workflows.length > 0) {
          pluginLogger.warn(
            { pluginSlug: plugin.slug, affectedWorkflows: workflows.map(([id, name]) => ({ id, name })) },
            `Plugin disabled — ${workflows.length} active workflow(s) have steps that will be skipped`,
          );
        }
      }).catch(() => { /* best effort logging */ });
    }

    const decrypted = { ...updated, config: this.decryptConfig(updated.config) };
    return toSafeUserPlugin(decrypted as unknown as UserPluginWithPlugin);
  }

  // ===========================================
  // Custom Plugin Management
  // ===========================================

  /**
   * Get a plugin's full data including code.
   * For user-authored plugins: only the author (or super admin) can view.
   * For built-in/installed plugins: returns the catalog template code (Plugin.codeBundle).
   * Actual user code lives on the workspace container filesystem.
   */
  async getCustomPlugin(
    ctx: ServiceContext,
    pluginId: string
  ): Promise<PluginDefinition & { code: string; entryFile?: string | null }> {
    const plugin = await prisma.plugin.findUnique({
      where: { id: pluginId },
    });

    if (!plugin) {
      throw new NotFoundError("Plugin not found");
    }

    // For built-in plugins, look up the user's installation
    if (plugin.isBuiltin) {
      const userPlugin = await prisma.userPlugin.findFirst({
        where: {
          pluginId,
          userId: ctx.userId,
          organizationId: ctx.organizationId ?? null,
        },
      });

      if (!userPlugin) {
        throw new NotFoundError("You have not installed this plugin");
      }

      // Try to read the actual code from the workspace container (source of truth)
      const entryFile = userPlugin.entryFile ?? getPluginEntryPath(userPlugin.gatewayId, plugin.slug);
      const containerCode = await pluginDeployService.readCodeFromContainer(
        ctx.userId,
        ctx.organizationId ?? null,
        entryFile,
      );

      return {
        ...toPluginDefinition(plugin),
        code: containerCode ?? plugin.codeBundle ?? "",
        entryFile: userPlugin.entryFile,
      };
    }

    // For user-authored plugins: only author can view (or super admin)
    if (plugin.authorId !== ctx.userId && !ctx.isSuperAdmin()) {
      throw new ForbiddenError("Only the plugin author can view this plugin's code");
    }

    // Try to read the actual code from the workspace container (source of truth)
    const userPlugin = await prisma.userPlugin.findFirst({
      where: {
        pluginId,
        userId: ctx.userId,
        organizationId: ctx.organizationId ?? null,
      },
    });
    if (userPlugin?.entryFile) {
      const containerCode = await pluginDeployService.readCodeFromContainer(
        ctx.userId,
        ctx.organizationId ?? null,
        userPlugin.entryFile,
      );
      if (containerCode !== null) {
        return {
          ...toPluginDefinition(plugin),
          code: containerCode,
          entryFile: userPlugin.entryFile,
        };
      }
    }

    // Fallback to catalog template if container isn't running
    return {
      ...toPluginDefinition(plugin),
      code: plugin.codeBundle || "",
      entryFile: userPlugin?.entryFile ?? null,
    };
  }

  /**
   * Create a user-authored custom plugin.
   * Creates the Plugin catalog record + auto-installs for the user.
   */
  async createCustomPlugin(
    ctx: ServiceContext,
    data: CreateCustomPluginRequest
  ): Promise<SafeUserPlugin> {
    pluginLogger.debug({ slug: data.slug }, "Creating custom plugin");

    const isDirectory = !!data.files;

    // Check plan limits
    await enforcePluginLimit(ctx);

    // Ensure slug is unique (prefix with user ID to avoid collisions)
    const fullSlug = `custom-${ctx.userId.slice(0, 8)}-${data.slug}`;

    const existingPlugin = await prisma.plugin.findUnique({
      where: { slug: fullSlug },
    });
    if (existingPlugin) {
      // If the existing plugin is an orphaned record (no installations), clean it up
      const installCount = await prisma.userPlugin.count({
        where: { pluginId: existingPlugin.id },
      });
      if (installCount === 0 && existingPlugin.authorId === ctx.userId) {
        await prisma.plugin.delete({ where: { id: existingPlugin.id } });
        pluginLogger.info({ slug: fullSlug }, "Cleaned up orphaned plugin record before re-create");
      } else {
        throw new ValidationError("A plugin with this slug already exists", {
          slug: ["Choose a different slug"],
        });
      }
    }

    // Validate config against configSchema if both are provided
    if (data.config && data.configSchema) {
      const validation = validateConfigAgainstSchema(
        data.config,
        data.configSchema as Record<string, unknown>
      );
      if (!validation.valid) {
        throw new ValidationError("Invalid plugin configuration", {
          config: validation.errors ?? ["Configuration validation failed"],
        });
      }
    }

    // Verify gateway if provided
    if (data.gatewayId) {
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
    }

    // Determine entry file path (bot-dir layout for gateway-bound plugins)
    const entry = data.entry ?? 'index.js';
    const entryFile = isDirectory
      ? (data.gatewayId
        ? `bots/${data.gatewayId}/plugins/${fullSlug}/${entry}`
        : `plugins/${fullSlug}/${entry}`)
      : getPluginEntryPath(data.gatewayId, fullSlug);

    // For single-file plugins, store code in codeBundle for recovery.
    // For directory plugins, codeBundle is not used (files live on container only).
    const codeBundle = isDirectory ? null : (data.code ?? null);

    // Create Plugin catalog entry + UserPlugin installation in a transaction
    const customSchemaDefaults = extractSchemaDefaults(data.configSchema as JSONSchema | undefined);
    const customMergedConfig = { ...customSchemaDefaults, ...(data.config ?? {}) };
    const encryptedConfig = { _encrypted: encrypt(customMergedConfig) };

    const { userPlugin } = await prisma.$transaction(async (tx) => {
      const plugin = await tx.plugin.create({
        data: {
          slug: fullSlug,
          name: data.name,
          description: data.description,
          version: "1.0.0",
          requiredGateways: data.requiredGateways ?? [],
          configSchema: (data.configSchema ?? {}) as Prisma.InputJsonValue,
          category: data.category ?? "general",
          tags: data.tags ?? [],
          isBuiltin: false,
          isActive: true,
          codeBundle,
          authorId: ctx.userId,
          authorType: "USER",
          isPublic: false,
          eventTypes: data.eventTypes ?? [],
          eventRole: data.eventRole ?? "responder",
          conflictsWith: data.conflictsWith ?? [],
        },
      });

      const up = await tx.userPlugin.create({
        data: {
          userId: ctx.userId,
          pluginId: plugin.id,
          organizationId: ctx.organizationId ?? null,
          config: encryptedConfig,
          gatewayId: data.gatewayId ?? null,
          isEnabled: true,
          entryFile,
        },
        include: {
          plugin: true,
          gateway: { select: { id: true, name: true, type: true, status: true } },
        },
      });

      return { userPlugin: up };
    });

    // Audit log
    void auditActions.pluginInstalled(toAuditContext(ctx), userPlugin.id, fullSlug);

    pluginLogger.info(
      { userPluginId: userPlugin.id, pluginSlug: fullSlug, isDirectory },
      "Custom plugin created and installed"
    );

    // Ensure workspace container is running before writing code
    try {
      await workspaceService.ensureContainerRunning(ctx, ctx.organizationId);
    } catch (err) {
      pluginLogger.warn(
        { pluginSlug: fullSlug, error: (err as Error).message },
        'Failed to ensure workspace running during custom plugin create — code may not be deployed',
      );
    }

    // Deploy to workspace container and start
    const deployEnv: Record<string, string> = { PLUGIN_USER_ID: ctx.userId };
    if (ctx.organizationId) deployEnv.PLUGIN_ORG_ID = ctx.organizationId;
    if (data.gatewayId) deployEnv.PLUGIN_GATEWAY_ID = data.gatewayId;

    try {
      if (isDirectory && data.files) {
        // Directory plugin: write multiple files + plugin.json
        const manifestJson = JSON.stringify({
          name: data.name,
          slug: fullSlug,
          version: "1.0.0",
          entry,
          description: data.description,
        }, null, 2);

        await pluginDeployService.writeDirectoryToContainer(
          ctx.userId,
          ctx.organizationId ?? null,
          fullSlug,
          data.files,
          manifestJson,
          entry,
          deployEnv,
        );
      } else if (data.code) {
        // Single-file plugin: write single .js file
        await pluginDeployService.writeTemplateToContainer(
          ctx.userId,
          ctx.organizationId ?? null,
          fullSlug,
          data.code,
          deployEnv,
          data.gatewayId,
        );
      }
    } catch (err) {
      pluginLogger.warn(
        { pluginSlug: fullSlug, error: (err as Error).message },
        'Custom plugin deploy to workspace failed',
      );
    }

    // Return with original (unencrypted) config including schema defaults
    const decrypted = { ...userPlugin, config: customMergedConfig };
    return toSafeUserPlugin(decrypted as unknown as UserPluginWithPlugin);
  }

  /**
   * Create a plugin by cloning a Git repository into the workspace.
   * 
   * Flow:
   * 1. Ensure workspace container is running
   * 2. Clone the repo into /plugins/<repo-name>/
   * 3. Read plugin.json manifest from the cloned directory
   * 4. Create Plugin + UserPlugin records from the manifest
   * 5. Install npm dependencies if package.json exists
   * 6. Start the plugin
   */
  async createPluginFromRepo(
    ctx: ServiceContext,
    data: { gitUrl: string; branch?: string; gatewayId?: string }
  ): Promise<SafeUserPlugin> {
    pluginLogger.info({ gitUrl: data.gitUrl, branch: data.branch }, "Creating plugin from Git repo");

    // Check plan limits
    await enforcePluginLimit(ctx);

    // Step 1: Ensure workspace container is running
    const containerDbId = await workspaceService.ensureContainerRunning(ctx, ctx.organizationId);

    // Step 2: Derive repo name from URL for target directory
    const repoName = data.gitUrl
      .replace(/\.git$/, '')
      .split('/')
      .pop()
      ?.replace(/[^a-zA-Z0-9_-]/g, '-') || 'cloned-plugin';

    const targetDir = `plugins/${repoName}`;

    // Clone the repo
    const cloneResult = await workspaceService.gitClone(ctx, containerDbId, data.gitUrl, {
      targetDir,
      branch: data.branch,
      depth: 1,
    }) as { success: boolean; targetDir: string; fileCount: number; error?: string };

    if (!cloneResult.success) {
      throw new ValidationError("Git clone failed", {
        gitUrl: [cloneResult.error || "Failed to clone repository"],
      });
    }

    pluginLogger.debug(
      { targetDir: cloneResult.targetDir, fileCount: cloneResult.fileCount },
      "Git clone completed"
    );

    // Step 3: Read plugin.json manifest
    let manifest: {
      name?: string;
      slug?: string;
      version?: string;
      entry?: string;
      description?: string;
      category?: string;
      requiredGateways?: string[];
      configSchema?: Record<string, unknown>;
      tags?: string[];
      eventTypes?: string[];
      eventRole?: string;
      conflictsWith?: string[];
    } = {};

    try {
      const manifestResult = await workspaceService.fileRead(
        ctx,
        containerDbId,
        `${targetDir}/plugin.json`
      );

      const content = (manifestResult as { content?: string })?.content;
      if (content) {
        manifest = JSON.parse(content);
      }
    } catch {
      pluginLogger.debug({ targetDir }, "No plugin.json found — using defaults from repo name");
    }

    // Derive values from manifest or repo name
    const pluginSlug = manifest.slug || repoName;
    const pluginName = manifest.name || repoName;
    const pluginDescription = manifest.description || `Plugin cloned from ${data.gitUrl}`;
    const pluginEntry = manifest.entry || 'index.js';
    const pluginCategory = (manifest.category || 'general') as PluginCategory;
    const pluginTags = manifest.tags || [];
    const pluginVersion = manifest.version || '1.0.0';

    // Full slug with user prefix to namespace
    const fullSlug = `custom-${ctx.userId.slice(0, 8)}-${pluginSlug}`;

    // Check for existing slug and clean up orphans
    const existingPlugin = await prisma.plugin.findUnique({
      where: { slug: fullSlug },
    });
    if (existingPlugin) {
      const installCount = await prisma.userPlugin.count({
        where: { pluginId: existingPlugin.id },
      });
      if (installCount === 0 && existingPlugin.authorId === ctx.userId) {
        await prisma.plugin.delete({ where: { id: existingPlugin.id } });
        pluginLogger.info({ slug: fullSlug }, "Cleaned up orphaned plugin record before repo create");
      } else {
        throw new ValidationError("A plugin with this slug already exists", {
          slug: ["Choose a different repository or rename the plugin slug in plugin.json"],
        });
      }
    }

    // Verify gateway if provided
    if (data.gatewayId) {
      const gateway = await prisma.gateway.findUnique({ where: { id: data.gatewayId } });
      if (!gateway) throw new NotFoundError("Gateway not found");
      const isOwner = ctx.organizationId
        ? gateway.organizationId === ctx.organizationId
        : gateway.userId === ctx.userId && !gateway.organizationId;
      if (!isOwner && !ctx.isSuperAdmin()) {
        throw new ForbiddenError("You don't have access to this gateway");
      }
    }

    // Step 4: Create Plugin + UserPlugin records
    const entryFile = `${targetDir}/${pluginEntry}`;
    const encryptedConfig = { _encrypted: encrypt({}) };

    const { userPlugin } = await prisma.$transaction(async (tx) => {
      const plugin = await tx.plugin.create({
        data: {
          slug: fullSlug,
          name: pluginName,
          description: pluginDescription,
          version: pluginVersion,
          requiredGateways: (manifest.requiredGateways ?? []) as Prisma.InputJsonValue as GatewayType[],
          configSchema: (manifest.configSchema ?? {}) as Prisma.InputJsonValue,
          category: pluginCategory,
          tags: pluginTags,
          isBuiltin: false,
          isActive: true,
          codeBundle: null,
          authorId: ctx.userId,
          authorType: "USER",
          isPublic: false,
          eventTypes: manifest.eventTypes ?? [],
          eventRole: manifest.eventRole ?? "responder",
          conflictsWith: manifest.conflictsWith ?? [],
        },
      });

      const up = await tx.userPlugin.create({
        data: {
          userId: ctx.userId,
          pluginId: plugin.id,
          organizationId: ctx.organizationId ?? null,
          config: encryptedConfig,
          gatewayId: data.gatewayId ?? null,
          isEnabled: true,
          entryFile,
        },
        include: {
          plugin: true,
          gateway: { select: { id: true, name: true, type: true, status: true } },
        },
      });

      return { userPlugin: up };
    });

    // Audit log
    void auditActions.pluginInstalled(toAuditContext(ctx), userPlugin.id, fullSlug);

    // Step 5: Install npm dependencies if package.json exists
    try {
      const pkgResult = await workspaceService.fileRead(
        ctx,
        containerDbId,
        `${targetDir}/package.json`
      );
      const pkgContent = (pkgResult as { content?: string })?.content;
      if (pkgContent) {
        pluginLogger.info({ targetDir }, "Found package.json — installing dependencies");
        await workspaceService.packageInstall(ctx, containerDbId, [], { cwd: targetDir });
      }
    } catch {
      pluginLogger.debug({ targetDir }, "No package.json or install skipped");
    }

    // Step 6: Start the plugin
    const deployEnv: Record<string, string> = { PLUGIN_USER_ID: ctx.userId };
    if (ctx.organizationId) deployEnv.PLUGIN_ORG_ID = ctx.organizationId;
    if (data.gatewayId) deployEnv.PLUGIN_GATEWAY_ID = data.gatewayId;

    try {
      await workspaceService.pluginStart(ctx, containerDbId, entryFile, deployEnv, userPlugin.storageQuotaMb);
    } catch (err) {
      pluginLogger.warn(
        { entryFile, error: (err as Error).message },
        "Plugin from repo — auto-start failed (plugin created but not running)",
      );
    }

    pluginLogger.info(
      { userPluginId: userPlugin.id, pluginSlug: fullSlug, entryFile },
      "Plugin from Git repo created, installed, and started"
    );

    const decrypted = { ...userPlugin, config: {} };
    return toSafeUserPlugin(decrypted as unknown as UserPluginWithPlugin);
  }

  /**
   * Register an existing workspace directory as a plugin.
   * Reads plugin.json from the directory, creates DB records, and starts the plugin.
   */
  async registerDirectoryAsPlugin(
    ctx: ServiceContext,
    data: { dirPath: string; gatewayId?: string }
  ): Promise<SafeUserPlugin> {
    pluginLogger.info({ dirPath: data.dirPath }, "Registering directory as plugin");

    // Check plan limits
    await enforcePluginLimit(ctx);

    // Ensure workspace container is running
    const containerDbId = await workspaceService.ensureContainerRunning(ctx, ctx.organizationId);

    // Read plugin.json from the directory
    let manifest: {
      name?: string;
      slug?: string;
      version?: string;
      entry?: string;
      description?: string;
      category?: string;
      requiredGateways?: string[];
      configSchema?: Record<string, unknown>;
      tags?: string[];
      eventTypes?: string[];
      eventRole?: string;
      conflictsWith?: string[];
    };

    try {
      const manifestResult = await workspaceService.fileRead(
        ctx,
        containerDbId,
        `${data.dirPath}/plugin.json`
      );
      const content = (manifestResult as { content?: string })?.content;
      if (!content) {
        throw new Error("Empty manifest");
      }
      manifest = JSON.parse(content);
    } catch {
      throw new ValidationError("Cannot register directory as plugin", {
        dirPath: ["Directory must contain a valid plugin.json file"],
      });
    }

    // Derive values
    const dirName = data.dirPath.split('/').filter(Boolean).pop() || 'unknown-plugin';
    const pluginSlug = manifest.slug || dirName;
    const pluginName = manifest.name || dirName;
    const pluginDescription = manifest.description || `Plugin from workspace directory`;
    const pluginEntry = manifest.entry || 'index.js';
    const pluginCategory = (manifest.category || 'general') as PluginCategory;
    const pluginTags = manifest.tags || [];
    const pluginVersion = manifest.version || '1.0.0';

    const fullSlug = `custom-${ctx.userId.slice(0, 8)}-${pluginSlug}`;

    // Check for existing slug
    const existingPlugin = await prisma.plugin.findUnique({
      where: { slug: fullSlug },
    });
    if (existingPlugin) {
      const installCount = await prisma.userPlugin.count({
        where: { pluginId: existingPlugin.id },
      });
      if (installCount === 0 && existingPlugin.authorId === ctx.userId) {
        await prisma.plugin.delete({ where: { id: existingPlugin.id } });
      } else {
        throw new ValidationError("A plugin with this slug already exists", {
          slug: ["Change the slug in plugin.json or remove the existing plugin first"],
        });
      }
    }

    // Verify gateway
    if (data.gatewayId) {
      const gateway = await prisma.gateway.findUnique({ where: { id: data.gatewayId } });
      if (!gateway) throw new NotFoundError("Gateway not found");
      const isOwner = ctx.organizationId
        ? gateway.organizationId === ctx.organizationId
        : gateway.userId === ctx.userId && !gateway.organizationId;
      if (!isOwner && !ctx.isSuperAdmin()) {
        throw new ForbiddenError("You don't have access to this gateway");
      }
    }

    // Create Plugin + UserPlugin records
    const entryFile = `${data.dirPath}/${pluginEntry}`;
    const encryptedConfig = { _encrypted: encrypt({}) };

    const { userPlugin } = await prisma.$transaction(async (tx) => {
      const plugin = await tx.plugin.create({
        data: {
          slug: fullSlug,
          name: pluginName,
          description: pluginDescription,
          version: pluginVersion,
          requiredGateways: (manifest.requiredGateways ?? []) as Prisma.InputJsonValue as GatewayType[],
          configSchema: (manifest.configSchema ?? {}) as Prisma.InputJsonValue,
          category: pluginCategory,
          tags: pluginTags,
          isBuiltin: false,
          isActive: true,
          codeBundle: null,
          authorId: ctx.userId,
          authorType: "USER",
          isPublic: false,
          eventTypes: manifest.eventTypes ?? [],
          eventRole: manifest.eventRole ?? "responder",
          conflictsWith: manifest.conflictsWith ?? [],
        },
      });

      const up = await tx.userPlugin.create({
        data: {
          userId: ctx.userId,
          pluginId: plugin.id,
          organizationId: ctx.organizationId ?? null,
          config: encryptedConfig,
          gatewayId: data.gatewayId ?? null,
          isEnabled: true,
          entryFile,
        },
        include: {
          plugin: true,
          gateway: { select: { id: true, name: true, type: true, status: true } },
        },
      });

      return { userPlugin: up };
    });

    // Audit log
    void auditActions.pluginInstalled(toAuditContext(ctx), userPlugin.id, fullSlug);

    // Start the plugin
    const deployEnv: Record<string, string> = { PLUGIN_USER_ID: ctx.userId };
    if (ctx.organizationId) deployEnv.PLUGIN_ORG_ID = ctx.organizationId;
    if (data.gatewayId) deployEnv.PLUGIN_GATEWAY_ID = data.gatewayId;

    try {
      await workspaceService.pluginStart(ctx, containerDbId, entryFile, deployEnv, userPlugin.storageQuotaMb);
    } catch (err) {
      pluginLogger.warn(
        { entryFile, error: (err as Error).message },
        "Register dir as plugin — auto-start failed",
      );
    }

    pluginLogger.info(
      { userPluginId: userPlugin.id, pluginSlug: fullSlug, entryFile },
      "Directory registered as plugin and started"
    );

    const decrypted = { ...userPlugin, config: {} };
    return toSafeUserPlugin(decrypted as unknown as UserPluginWithPlugin);
  }

  /**
   * Update a plugin (code, name, description, etc.).
   * For user-authored plugins: updates the Plugin catalog record (author only).
   * For built-in plugins: writes updated code to workspace container (no DB code storage).
   */
  async updateCustomPlugin(
    ctx: ServiceContext,
    pluginId: string,
    data: UpdateCustomPluginRequest
  ): Promise<PluginDefinition> {
    const plugin = await prisma.plugin.findUnique({
      where: { id: pluginId },
    });

    if (!plugin) {
      throw new NotFoundError("Plugin not found");
    }

    // For built-in plugins: write updated code to workspace container
    if (plugin.isBuiltin) {
      const userPlugin = await prisma.userPlugin.findFirst({
        where: { pluginId, userId: ctx.userId },
      });

      if (!userPlugin) {
        throw new NotFoundError("You have not installed this plugin");
      }

      if (data.code !== undefined) {
        // Write updated code to workspace container (source of truth) and restart
        void pluginDeployService.writeCodeToContainer(
          ctx.userId,
          userPlugin.organizationId,
          plugin.slug,
          data.code,
          true, // restart after write
          userPlugin.entryFile ?? undefined,
        ).catch((err) => {
          pluginLogger.warn(
            { pluginSlug: plugin.slug, userId: ctx.userId, error: (err as Error).message },
            "Built-in plugin code write to workspace failed (non-blocking)",
          );
        });
      }

      pluginLogger.info(
        { pluginId, pluginSlug: plugin.slug, userId: ctx.userId },
        "Built-in plugin personal code updated"
      );

      return toPluginDefinition(plugin);
    }

    // For user-authored plugins: only author can update (or super admin)
    if (plugin.authorId !== ctx.userId && !ctx.isSuperAdmin()) {
      throw new ForbiddenError("Only the plugin author can update this plugin");
    }

    // Build update data
    const updateData: Prisma.PluginUpdateInput = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.category !== undefined) updateData.category = data.category;
    if (data.tags !== undefined) updateData.tags = data.tags;
    if (data.configSchema !== undefined) {
      updateData.configSchema = data.configSchema as Prisma.InputJsonValue;
    }
    if (data.code !== undefined) {
      updateData.codeBundle = data.code;
    }

    const updated = await prisma.plugin.update({
      where: { id: pluginId },
      data: updateData,
    });

    pluginLogger.info(
      { pluginId, pluginSlug: updated.slug, fieldsUpdated: Object.keys(updateData) },
      "Custom plugin updated"
    );

    // If code changed, write to all workspace containers that have this plugin installed
    if (data.code !== undefined) {
      const installations = await prisma.userPlugin.findMany({
        where: { pluginId },
        select: { userId: true, organizationId: true },
      });

      for (const inst of installations) {
        void pluginDeployService.writeCodeToContainer(
          inst.userId,
          inst.organizationId,
          updated.slug,
          data.code,
          true, // restart after write
        ).catch((err) => {
          pluginLogger.warn(
            { pluginSlug: updated.slug, userId: inst.userId, error: (err as Error).message },
            "Custom plugin code write failed (non-blocking)",
          );
        });
      }
    }

    return toPluginDefinition(updated);
  }

  /**
   * Delete a user-authored custom plugin.
   * Removes all installations and the catalog entry.
   */
  async deleteCustomPlugin(
    ctx: ServiceContext,
    pluginId: string
  ): Promise<void> {
    const plugin = await prisma.plugin.findUnique({
      where: { id: pluginId },
    });

    if (!plugin) {
      throw new NotFoundError("Plugin not found");
    }

    // Only author can delete (or super admin)
    if (plugin.authorId !== ctx.userId && !ctx.isSuperAdmin()) {
      throw new ForbiddenError("Only the plugin author can delete this plugin");
    }

    if (plugin.isBuiltin) {
      throw new ForbiddenError("Cannot delete a built-in plugin");
    }

    // Find all installations to undeploy
    const installations = await prisma.userPlugin.findMany({
      where: { pluginId },
      select: { id: true, userId: true, organizationId: true },
    });

    // Delete all installations + the plugin in a transaction
    await prisma.$transaction(async (tx) => {
      await tx.userPlugin.deleteMany({ where: { pluginId } });
      await tx.plugin.delete({ where: { id: pluginId } });
    });

    pluginLogger.info(
      { pluginId, pluginSlug: plugin.slug, installationsRemoved: installations.length },
      "Custom plugin deleted"
    );

    // Undeploy from all workspace containers (non-blocking)
    for (const inst of installations) {
      void pluginDeployService.undeployFromWorkspace(
        inst.userId,
        inst.organizationId,
        plugin.slug,
      ).catch((err) => {
        pluginLogger.warn(
          { pluginSlug: plugin.slug, userId: inst.userId, error: (err as Error).message },
          "Custom plugin undeploy failed (non-blocking)",
        );
      });
    }
  }

  // ===========================================
  // Bot Templates — One-Click Setup
  // ===========================================

  /**
   * Install a bot template — creates all plugins from the template on a gateway.
   *
   * @param ctx - Service context
   * @param templateId - Bot template ID (e.g., "ai-assistant")
   * @param gatewayId - Gateway to install the plugins on
   * @returns Array of installed plugins
   */
  async installBotTemplate(
    ctx: ServiceContext,
    templateId: string,
    gatewayId: string,
  ): Promise<{ installed: SafeUserPlugin[]; warnings: string[] }> {
    const { getBotTemplateById } = await import("./bot-templates");
    const { getAnyTemplateById } = await import("./plugin-templates");

    const botTemplate = getBotTemplateById(templateId);
    if (!botTemplate) {
      throw new NotFoundError(`Bot template not found: ${templateId}`);
    }

    // Verify gateway exists and user owns it
    const gateway = await prisma.gateway.findUnique({ where: { id: gatewayId } });
    if (!gateway) throw new NotFoundError("Gateway not found");

    const isOwner = ctx.organizationId
      ? gateway.organizationId === ctx.organizationId
      : gateway.userId === ctx.userId && !gateway.organizationId;
    if (!isOwner && !ctx.isSuperAdmin()) {
      throw new ForbiddenError("You don't have access to this gateway");
    }

    // Verify gateway type matches template
    if (gateway.type !== botTemplate.gatewayType) {
      throw new ValidationError("Gateway type mismatch", {
        gatewayId: [`This template requires a ${botTemplate.gatewayType} gateway`],
      });
    }

    const installed: SafeUserPlugin[] = [];
    const warnings: string[] = [];

    for (const pluginDef of botTemplate.plugins) {
      const pluginTemplate = getAnyTemplateById(pluginDef.templateId);
      if (!pluginTemplate) {
        warnings.push(`Skipped plugin "${pluginDef.templateId}" — template not found`);
        continue;
      }

      try {
        const isDir = "isDirectory" in pluginTemplate && pluginTemplate.isDirectory;
        const result = await this.createCustomPlugin(ctx, {
          slug: `${templateId}-${pluginDef.templateId}`,
          name: pluginTemplate.name,
          description: pluginTemplate.description,
          code: isDir ? undefined : (pluginTemplate as { code: string }).code,
          files: isDir ? (pluginTemplate as { files: Record<string, string> }).files : undefined,
          entry: isDir ? (pluginTemplate as { entry: string }).entry : undefined,
          category: pluginTemplate.category as PluginCategory,
          tags: [...pluginTemplate.tags, `template:${templateId}`],
          requiredGateways: pluginTemplate.requiredGateways,
          configSchema: pluginTemplate.configSchema as Record<string, unknown>,
          config: pluginDef.config ?? {},
          gatewayId,
          eventTypes: pluginDef.eventTypes,
          eventRole: pluginDef.eventRole,
        });
        installed.push(result);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        warnings.push(`Failed to install "${pluginTemplate.name}": ${msg}`);
        pluginLogger.warn(
          { templateId, pluginId: pluginDef.templateId, error: msg },
          "Bot template plugin install failed"
        );
      }
    }

    if (installed.length === 0) {
      throw new ValidationError("No plugins could be installed from this template", {
        templateId: warnings,
      });
    }

    pluginLogger.info(
      { templateId, gatewayId, installed: installed.length, warnings: warnings.length },
      "Bot template installed"
    );

    return { installed, warnings };
  }

  // ===========================================
  // Plugin Health
  // ===========================================

  /**
   * Get health status for all enabled plugins in the user's workspace.
   * Checks file existence and process status via the bridge agent.
   *
   * @returns Array of plugin health entries, empty if no workspace/bridge connection
   */
  async getPluginHealth(
    ctx: ServiceContext,
  ): Promise<Array<{
    pluginSlug: string;
    userPluginId: string;
    entryFile: string;
    fileExists: boolean;
    processRunning: boolean;
  }>> {
    // Find user's running container
    const container = await prisma.workspaceContainer.findFirst({
      where: {
        userId: ctx.userId,
        organizationId: ctx.organizationId ?? null,
        status: 'RUNNING',
      },
      select: { id: true },
    });

    if (!container) return [];

    const client = bridgeClientManager.getExistingClient(container.id);
    if (!client) return [];

    // Get all enabled plugins
    const userPlugins = await prisma.userPlugin.findMany({
      where: {
        userId: ctx.userId,
        organizationId: ctx.organizationId ?? null,
        isEnabled: true,
      },
      include: {
        plugin: { select: { slug: true } },
      },
    });

    if (userPlugins.length === 0) return [];

    // Get running process list once
    let processList: Array<{ file: string; status: string }> = [];
    try {
      processList = await client.pluginList() as Array<{ file: string; status: string }>;
    } catch {
      // pluginList failed — report all as not running
    }

    const results: Array<{
      pluginSlug: string;
      userPluginId: string;
      entryFile: string;
      fileExists: boolean;
      processRunning: boolean;
    }> = [];

    for (const up of userPlugins) {
      const entryFile = up.entryFile ?? `plugins/${up.plugin.slug}.js`;

      // Check file existence
      let fileExists = false;
      try {
        await client.send('file.stat', { path: entryFile });
        fileExists = true;
      } catch {
        // file missing
      }

      // Check process status
      const processRunning = processList.some(
        (p) => p.file === entryFile && p.status === 'running',
      );

      results.push({
        pluginSlug: up.plugin.slug,
        userPluginId: up.id,
        entryFile,
        fileExists,
        processRunning,
      });
    }

    return results;
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
   *
   * Returns the decrypted config or a fallback object with a
   * `_decryptFailed` flag so callers / UI can detect the error.
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
        pluginLogger.error(
          { error, encLength: ((config as Record<string, unknown>)._encrypted as string).length },
          "Failed to decrypt plugin config — returning empty config with failure flag"
        );
        return { _decryptFailed: true }; // Flag so callers/UI can surface the problem
      }
    }
    return (config ?? {}) as Record<string, unknown>;
  }

  /**
   * Push a storage quota update to the running container via WebSocket.
   * Non-blocking — failures are logged but don't bubble up.
   */
  private async pushStorageQuota(ctx: ServiceContext, pluginFile: string, quotaMb: number): Promise<void> {
    try {
      const container = await prisma.workspaceContainer.findFirst({
        where: {
          userId: ctx.userId,
          organizationId: ctx.organizationId ?? null,
          status: 'RUNNING',
        },
        select: { id: true },
      });
      if (!container) return;

      const client = bridgeClientManager.getExistingClient(container.id);
      if (!client) return;

      await client.send('storage.setQuota', { pluginFile, quotaMb });
      pluginLogger.debug({ pluginFile, quotaMb }, 'Storage quota pushed to container');
    } catch (err) {
      pluginLogger.warn(
        { pluginFile, quotaMb, error: (err as Error).message },
        'Failed to push storage quota to container (non-blocking)',
      );
    }
  }

  /**
   * Get per-plugin storage stats from the running container.
   * Returns quota info and per-plugin usage from the bridge agent's local SQLite store.
   */
  async getStorageStats(ctx: ServiceContext): Promise<{
    quota: { dbSizeBytes: number; dbSizeMb: number; defaultQuotaMb: number; plugins: Array<{ pluginFile: string; keyCount: number; totalBytes: number; quotaMb: number }> };
    plugins: Array<{ pluginFile: string; keyCount: number; totalBytes: number; quotaMb: number }>;
  } | null> {
    try {
      const container = await prisma.workspaceContainer.findFirst({
        where: {
          userId: ctx.userId,
          organizationId: ctx.organizationId ?? null,
          status: 'RUNNING',
        },
        select: { id: true },
      });
      if (!container) return null;

      const client = bridgeClientManager.getExistingClient(container.id);
      if (!client) return null;

      const stats = await client.send('storage.stats', {});
      return stats as {
        quota: { dbSizeBytes: number; dbSizeMb: number; defaultQuotaMb: number; plugins: Array<{ pluginFile: string; keyCount: number; totalBytes: number; quotaMb: number }> };
        plugins: Array<{ pluginFile: string; keyCount: number; totalBytes: number; quotaMb: number }>;
      };
    } catch (err) {
      pluginLogger.warn(
        { error: (err as Error).message },
        'Failed to get storage stats from container',
      );
      return null;
    }
  }
}

// Export singleton instance
export const pluginService = new PluginService();
