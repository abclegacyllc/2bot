/**
 * Gateway Service
 *
 * Handles CRUD operations for gateways with encrypted credential storage,
 * ownership checks (user and organization), and audit logging.
 *
 * @module modules/gateway/gateway.service
 */

import type { Gateway, GatewayStatus, GatewayType } from "@prisma/client";

import { auditActions, type AuditContext } from "@/lib/audit";
import { decryptJson, encrypt } from "@/lib/encryption";
import { logger } from "@/lib/logger";
import { enforceGatewayLimit } from "@/lib/plan-limits";
import { prisma } from "@/lib/prisma";
import { pluginDeployService } from "@/modules/plugin/plugin-deploy.service";
import { pluginIpcService } from "@/modules/plugin/plugin-ipc.service";
import { removeWorkflowCache } from "@/modules/workflow/workflow-cache.service";
import { bridgeClientManager } from "@/modules/workspace";
import { BadRequestError, ForbiddenError, NotFoundError, ValidationError } from "@/shared/errors";
import type { ServiceContext } from "@/shared/types/context";

import type {
    CreateGatewayRequest,
    GatewayCredentials,
    GatewayListItem,
    SafeGateway,
    UpdateGatewayRequest
} from "./gateway.types";

const gatewayLogger = logger.child({ module: "gateway" });

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
 * Gateway ownership error
 */
class GatewayOwnershipError extends ForbiddenError {
  constructor() {
    super("You don't have access to this gateway");
  }
}

/**
 * Extract unique identifier from gateway credentials
 * This is used to prevent duplicate gateways across the platform
 */
function extractCredentialIdentifier(
  type: GatewayType,
  credentials: GatewayCredentials
): string | null {
  if (type === "TELEGRAM_BOT") {
    // For Telegram bots, the bot token is the unique identifier
    // Format: 123456789:ABCdefGHIjklMNOpqrsTUVwxyz
    const botToken = (credentials as { botToken?: string }).botToken;
    if (!botToken) return null;
    
    // Extract bot ID from token (the part before the colon)
    // This uniquely identifies the bot
    const botId = botToken.split(":")[0];
    return `telegram_bot:${botId}`;
  }

  if (type === "DISCORD_BOT") {
    // For Discord bots, the application ID uniquely identifies the bot
    const applicationId = (credentials as { applicationId?: string }).applicationId;
    if (!applicationId) return null;
    return `discord_bot:${applicationId}`;
  }

  if (type === "SLACK_BOT") {
    // For Slack bots, the bot token uniquely identifies the installation
    // Use the app ID if available, otherwise derive from token prefix
    const appId = (credentials as { appId?: string }).appId;
    if (appId) return `slack_bot:${appId}`;
    const botToken = (credentials as { botToken?: string }).botToken;
    if (!botToken) return null;
    // xoxb- tokens contain the team+app segments
    return `slack_bot:${botToken.slice(0, 20)}`;
  }

  if (type === "WHATSAPP_BOT") {
    // For WhatsApp bots, the phone number ID uniquely identifies the installation
    const phoneNumberId = (credentials as { phoneNumberId?: string }).phoneNumberId;
    if (!phoneNumberId) return null;
    return `whatsapp_bot:${phoneNumberId}`;
  }
  
  return null;
}

/**
 * Gateway Service
 * All methods require ServiceContext for authorization and auditing
 */
class GatewayService {
  /**
   * Check if credentials are already in use by another gateway
   */
  private async checkDuplicateCredentials(
    type: GatewayType,
    credentials: GatewayCredentials,
    excludeGatewayId?: string
  ): Promise<void> {
    const identifier = extractCredentialIdentifier(type, credentials);
    if (!identifier) {
      // This gateway type doesn't need duplicate checking
      return;
    }

    // Get all gateways of this type
    const existingGateways = await prisma.gateway.findMany({
      where: {
        type,
        ...(excludeGatewayId && { id: { not: excludeGatewayId } }),
      },
      select: {
        id: true,
        name: true,
        credentialsEnc: true,
        userId: true,
        organizationId: true,
        user: {
          select: {
            email: true,
          },
        },
        organization: {
          select: {
            name: true,
          },
        },
      },
    });

    // Check each gateway's credentials
    for (const gateway of existingGateways) {
      try {
        const existingCreds = decryptJson<GatewayCredentials>(gateway.credentialsEnc);
        const existingIdentifier = extractCredentialIdentifier(type, existingCreds);

        if (existingIdentifier === identifier) {
          // Found a duplicate!
          const owner = gateway.organization
            ? `organization "${gateway.organization.name}"`
            : `user ${gateway.user.email}`;

          throw new BadRequestError(
            `This ${type === "TELEGRAM_BOT" ? "bot token" : "credential"} is already in use by another gateway (${gateway.name}) owned by ${owner}. Each bot token can only be used once across the platform. Please use a different token or contact the owner to remove their gateway.`
          );
        }
      } catch (err) {
        // If we can't decrypt, skip this gateway
        if (err instanceof BadRequestError) {
          throw err; // Re-throw our duplicate error
        }
        gatewayLogger.warn(
          { gatewayId: gateway.id },
          "Failed to decrypt gateway credentials during duplicate check"
        );
      }
    }
  }

  /**
   * Create a new gateway
   */
  async create(ctx: ServiceContext, data: CreateGatewayRequest): Promise<SafeGateway> {
    gatewayLogger.debug({ type: data.type, name: data.name }, "Creating gateway");

    // Check plan limits before creating
    await enforceGatewayLimit(ctx);

    // Check for duplicate credentials
    await this.checkDuplicateCredentials(data.type, data.credentials);

    // Encrypt credentials
    const credentialsEnc = encrypt(data.credentials);

    const gateway = await prisma.gateway.create({
      data: {
        userId: ctx.userId,
        organizationId: ctx.organizationId ?? null,
        name: data.name,
        type: data.type,
        status: "DISCONNECTED",
        credentialsEnc,
        config: (data.config ?? {}) as object,
      },
    });

    // Audit log (non-blocking)
    void auditActions.gatewayCreated(
      toAuditContext(ctx),
      gateway.id,
      gateway.type,
      gateway.name
    );

    gatewayLogger.info({ gatewayId: gateway.id, type: gateway.type }, "Gateway created");

    // Test new gateway automatically (non-blocking)
    void this.testNewGatewayHealth(gateway.id);

    return this.toSafeGateway(gateway, data.credentials);
  }

  /**
   * Test a newly created gateway's health automatically
   * This runs in the background and doesn't block the creation response
   */
  private async testNewGatewayHealth(gatewayId: string): Promise<void> {
    try {
      // Dynamic import to avoid circular dependency
      const { gatewayMonitor } = await import("./gateway-monitor");
      await gatewayMonitor.testNewGateway(gatewayId);
    } catch (error) {
      gatewayLogger.error(
        { gatewayId, error },
        "Failed to test new gateway health"
      );
    }
  }

  /**
   * Find gateway by ID with ownership check
   */
  async findById(ctx: ServiceContext, id: string): Promise<Gateway> {
    const gateway = await prisma.gateway.findUnique({
      where: { id },
    });

    if (!gateway) {
      throw new NotFoundError("Gateway not found");
    }

    // Check ownership (now async - checks org membership too)
    await this.checkOwnership(ctx, gateway);

    return gateway;
  }

  /**
   * Find gateway by ID and return safe version (no credentials)
   */
  async findByIdSafe(ctx: ServiceContext, id: string): Promise<SafeGateway> {
    const gateway = await this.findById(ctx, id);
    const credentials = this.getDecryptedCredentials(gateway);
    return this.toSafeGateway(gateway, credentials);
  }

  /**
   * Find all gateways for current user/organization
   */
  async findByUser(ctx: ServiceContext): Promise<GatewayListItem[]> {
    const where = ctx.organizationId
      ? { organizationId: ctx.organizationId }
      : { userId: ctx.userId, organizationId: null };

    const gateways = await prisma.gateway.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        type: true,
        status: true,
        mode: true,
        lastConnectedAt: true,
        lastError: true,
        createdAt: true,
        workflows: {
          take: 1,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            name: true,
            status: true,
            isEnabled: true,
            executionCount: true,
            lastExecutedAt: true,
            lastError: true,
            _count: { select: { steps: true } },
          },
        },
      },
    });

    return gateways.map((gw) => {
      const wf = gw.workflows[0];
      return {
        id: gw.id,
        name: gw.name,
        type: gw.type,
        status: gw.status,
        mode: gw.mode,
        lastConnectedAt: gw.lastConnectedAt,
        lastError: gw.lastError,
        createdAt: gw.createdAt,
        ...(wf
          ? {
              workflowSummary: {
                id: wf.id,
                name: wf.name,
                status: wf.status,
                isEnabled: wf.isEnabled,
                stepCount: wf._count.steps,
                executionCount: wf.executionCount,
                lastExecutedAt: wf.lastExecutedAt,
                lastError: wf.lastError,
              },
            }
          : {}),
      };
    });
  }

  /**
   * Update gateway
   */
  async update(
    ctx: ServiceContext,
    id: string,
    data: UpdateGatewayRequest
  ): Promise<SafeGateway> {
    // Get existing gateway (with ownership check)
    const existing = await this.findById(ctx, id);

    // Check write permission (admins only for org gateways)
    await this.checkWritePermission(ctx, existing);

    // If updating credentials, check for duplicates
    if (data.credentials !== undefined) {
      await this.checkDuplicateCredentials(existing.type, data.credentials, id);
    }

    // Prepare update data
    const updateData: {
      name?: string;
      credentialsEnc?: string;
      config?: object;
      mode?: string;
    } = {};

    if (data.name !== undefined) {
      updateData.name = data.name;
    }

    if (data.credentials !== undefined) {
      updateData.credentialsEnc = encrypt(data.credentials);
    }

    if (data.config !== undefined) {
      // Merge with existing config
      updateData.config = { ...(existing.config as object), ...data.config };
    }

    if (data.mode !== undefined && data.mode !== existing.mode) {
      // Validate mode switch: prevent orphaning active resources
      if (data.mode === "workflow") {
        // Switching to workflow: check for enabled standalone plugins
        const enabledPlugin = await prisma.userPlugin.findFirst({
          where: { gatewayId: id, isEnabled: true },
        });
        if (enabledPlugin) {
          throw new ValidationError("Disable or uninstall the standalone plugin before switching to workflow mode", {
            mode: ["This bot has an active plugin installed"],
          });
        }
      } else if (data.mode === "plugin") {
        // Switching to plugin: check for active workflows
        const activeWorkflow = await prisma.workflow.findFirst({
          where: { gatewayId: id, status: "ACTIVE" },
        });
        if (activeWorkflow) {
          throw new ValidationError("Deactivate workflows before switching to plugin mode", {
            mode: ["This bot has active workflows"],
          });
        }
      }
      updateData.mode = data.mode;
    }

    const gateway = await prisma.gateway.update({
      where: { id },
      data: updateData,
    });

    // Audit log (non-blocking)
    void auditActions.gatewayUpdated(toAuditContext(ctx), gateway.id, {
      nameChanged: data.name !== undefined,
      credentialsChanged: data.credentials !== undefined,
      configChanged: data.config !== undefined,
      modeChanged: data.mode !== undefined,
    });

    gatewayLogger.info({ gatewayId: gateway.id }, "Gateway updated");

    const credentials = this.getDecryptedCredentials(gateway);
    return this.toSafeGateway(gateway, credentials);
  }

  /**
   * Delete gateway and cascade cleanup: uninstall bound plugins,
   * delete bound workflows, and remove bot directory from container.
   */
  async delete(ctx: ServiceContext, id: string): Promise<void> {
    // Get existing gateway (with ownership check)
    const gateway = await this.findById(ctx, id);

    // Check write permission (admins only for org gateways)
    await this.checkWritePermission(ctx, gateway);

    // ── Pre-delete cleanup: uninstall bound plugins ──
    const boundPlugins = await prisma.userPlugin.findMany({
      where: {
        gatewayId: id,
        userId: ctx.userId,
        organizationId: ctx.organizationId ?? null,
      },
      include: { plugin: true },
    });

    for (const up of boundPlugins) {
      // Remove from container (stop + delete file + clear storage)
      void pluginDeployService.undeployFromWorkspace(
        ctx.userId,
        ctx.organizationId ?? null,
        up.plugin.slug,
        up.entryFile ?? undefined,
      ).catch(() => {});

      // Clear server-side Redis storage
      void pluginIpcService.clearPluginRedisKeys(up.id).catch(() => {});
    }

    // ── Pre-delete cleanup: delete bound workflows ──
    const boundWorkflows = await prisma.workflow.findMany({
      where: {
        gatewayId: id,
        userId: ctx.userId,
        organizationId: ctx.organizationId ?? null,
      },
      select: { id: true },
    });

    for (const wf of boundWorkflows) {
      void removeWorkflowCache(wf.id, ctx.userId, ctx.organizationId ?? null).catch(() => {});
    }

    // Delete all bound records, then the gateway itself in a transaction
    await prisma.$transaction(async (tx) => {
      // Delete workflow steps and workflows bound to this gateway
      if (boundWorkflows.length > 0) {
        const wfIds = boundWorkflows.map(w => w.id);
        await tx.workflowStep.deleteMany({ where: { workflowId: { in: wfIds } } });
        await tx.workflow.deleteMany({ where: { id: { in: wfIds } } });
      }

      // Delete bound plugin installations
      if (boundPlugins.length > 0) {
        await tx.userPlugin.deleteMany({
          where: { id: { in: boundPlugins.map(p => p.id) } },
        });
      }

      // Delete the gateway
      await tx.gateway.delete({ where: { id } });
    });

    // ── Post-delete cleanup: remove bot directory from container ──
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

      // Delete the entire bots/{gatewayId}/ directory
      await client.fileDelete(`bots/${id}`).catch(() => {});
    })().catch(() => {});

    // Invalidate plugin caches
    pluginIpcService.clearCache();

    // Audit log (non-blocking)
    void auditActions.gatewayDeleted(toAuditContext(ctx), gateway.id);

    gatewayLogger.info(
      { gatewayId: id, pluginsRemoved: boundPlugins.length, workflowsRemoved: boundWorkflows.length },
      "Gateway deleted with cascade cleanup",
    );
  }

  /**
   * Update gateway status (internal use, no ownership check)
   * Used by gateway connectors to update connection status
   */
  async updateStatus(
    id: string,
    status: GatewayStatus,
    error?: string
  ): Promise<Gateway> {
    const now = new Date();

    const data: {
      status: GatewayStatus;
      lastConnectedAt?: Date;
      lastErrorAt?: Date;
      lastError?: string | null;
    } = {
      status,
    };

    if (status === "CONNECTED") {
      data.lastConnectedAt = now;
      data.lastError = null;
    } else if (status === "ERROR" && error) {
      data.lastErrorAt = now;
      data.lastError = error;
    }

    const gateway = await prisma.gateway.update({
      where: { id },
      data,
    });

    gatewayLogger.debug({ gatewayId: id, status }, "Gateway status updated");

    // Update gateway routes when a gateway connects or disconnects.
    // A running container may need routes added or removed.
    if (status === "CONNECTED" || status === "DISCONNECTED") {
      this.refreshGatewayRoutes(gateway.userId, gateway.organizationId).catch(err => {
        gatewayLogger.warn(
          { gatewayId: id, status, error: (err as Error).message },
          'Failed to refresh gateway routes after status change',
        );
      });
    }

    // When a gateway disconnects, stop bound plugins in the container
    if (status === "DISCONNECTED" || status === "ERROR") {
      void (async () => {
        const boundPlugins = await prisma.userPlugin.findMany({
          where: { gatewayId: id, isEnabled: true },
          include: { plugin: { select: { slug: true } } },
        });

        for (const up of boundPlugins) {
          await pluginDeployService.stopPluginInWorkspace(
            gateway.userId,
            gateway.organizationId,
            up.plugin.slug,
            up.entryFile ?? undefined,
          ).catch(err => {
            gatewayLogger.warn(
              { gatewayId: id, pluginSlug: up.plugin.slug, error: (err as Error).message },
              'Failed to stop plugin after gateway disconnect',
            );
          });
        }

        if (boundPlugins.length > 0) {
          gatewayLogger.info(
            { gatewayId: id, pluginCount: boundPlugins.length },
            'Stopped bound plugins after gateway disconnect/error',
          );
        }
      })().catch(() => { /* best effort */ });
    }

    return gateway;
  }

  /**
   * Update gateway status with authorization check
   * For user-facing API endpoints
   */
  async updateStatusWithAuth(
    ctx: ServiceContext,
    id: string,
    status: GatewayStatus,
    error?: string
  ): Promise<SafeGateway> {
    // First check ownership
    const _gateway = await this.findById(ctx, id);

    // Update status
    const updated = await this.updateStatus(id, status, error);

    // Get credentials for SafeGateway response
    const credentials = this.getDecryptedCredentials(updated);

    return this.toSafeGateway(updated, credentials);
  }

  /**
   * Get decrypted credentials for a gateway
   */
  getDecryptedCredentials(gateway: Gateway): GatewayCredentials {
    return decryptJson<GatewayCredentials>(gateway.credentialsEnc);
  }

  /**
   * Refresh gateway routes for a user's running container.
   * Called when a gateway connects or disconnects so that the nginx map
   * stays in sync without requiring a container restart.
   *
   * Uses lazy import to avoid circular dependency with workspace module.
   */
  private async refreshGatewayRoutes(userId: string, organizationId: string | null): Promise<void> {
    // Find the user's running container (if any)
    const container = await prisma.workspaceContainer.findFirst({
      where: {
        userId,
        organizationId: organizationId ?? null,
        status: 'RUNNING',
      },
      select: { id: true },
    });

    if (!container) return; // No running container — nothing to update

    // Lazy import to avoid circular dependency
    const { gatewayRouteService } = await import('@/modules/workspace/gateway-route.service');
    await gatewayRouteService.activateRoutes(container.id);
  }

  /**
   * Check if user/org owns the gateway (read access)
   * Allows access if user is a member of the organization that owns the gateway
   */
  private async checkOwnership(ctx: ServiceContext, gateway: Gateway): Promise<void> {
    // Super admins can access any gateway
    if (ctx.isSuperAdmin()) {
      return;
    }

    // Check organization ownership (when accessed via org context)
    if (ctx.organizationId) {
      if (gateway.organizationId !== ctx.organizationId) {
        throw new GatewayOwnershipError();
      }
      return;
    }

    // Check user ownership for personal gateways
    if (gateway.organizationId === null) {
      if (gateway.userId !== ctx.userId) {
        throw new GatewayOwnershipError();
      }
      return;
    }

    // Gateway belongs to an organization, check if user is a member
    const membership = await prisma.membership.findFirst({
      where: {
        userId: ctx.userId,
        organizationId: gateway.organizationId,
        status: "ACTIVE",
      },
    });

    if (!membership) {
      throw new GatewayOwnershipError();
    }

    // User is a member of the org that owns this gateway - allow read access
  }

  /**
   * Check if user has write permission for the gateway (update/delete)
   * For org gateways: requires OWNER or ADMIN role
   * For personal gateways: must be the owner
   */
  private async checkWritePermission(ctx: ServiceContext, gateway: Gateway): Promise<void> {
    // Super admins can modify any gateway
    if (ctx.isSuperAdmin()) {
      return;
    }

    // Personal gateway - only owner can modify
    if (gateway.organizationId === null) {
      if (gateway.userId !== ctx.userId) {
        throw new GatewayOwnershipError();
      }
      return;
    }

    // Org gateway accessed via org context - check role in context
    if (ctx.organizationId) {
      if (gateway.organizationId !== ctx.organizationId) {
        throw new GatewayOwnershipError();
      }
      // Check if user has admin+ role via org membership
      const membership = await prisma.membership.findFirst({
        where: {
          userId: ctx.userId,
          organizationId: ctx.organizationId,
          status: "ACTIVE",
        },
      });

      if (!membership || !['OWNER', 'ADMIN'].includes(membership.role)) {
        throw new ForbiddenError("Only organization admins can modify gateways");
      }
      return;
    }

    // Org gateway accessed without org context - check membership role
    const membership = await prisma.membership.findFirst({
      where: {
        userId: ctx.userId,
        organizationId: gateway.organizationId,
        status: "ACTIVE",
      },
    });

    if (!membership) {
      throw new GatewayOwnershipError();
    }

    // Must be OWNER or ADMIN to modify org gateways
    if (!['OWNER', 'ADMIN'].includes(membership.role)) {
      throw new ForbiddenError("Only organization admins can modify gateways");
    }
  }

  /**
   * Convert Gateway to SafeGateway (remove encrypted credentials, add info)
   */
  private toSafeGateway(gateway: Gateway, credentials: GatewayCredentials): SafeGateway {
    const { credentialsEnc: _credentialsEnc, ...rest } = gateway;

    // Build credential info (no secrets)
    const credentialInfo: SafeGateway["credentialInfo"] = {
      type: gateway.type,
    };

    if ("provider" in credentials && "apiKey" in credentials) {
      // AI credentials (legacy — kept for backward compat with existing rows)
    } else if ("applicationId" in credentials && "publicKey" in credentials && "botToken" in credentials) {
      // Discord Bot credentials
      credentialInfo.hasBotToken = true;
      credentialInfo.hasApplicationId = true;
    } else if ("signingSecret" in credentials && "botToken" in credentials) {
      // Slack Bot credentials
      credentialInfo.hasBotToken = true;
    } else if ("accessToken" in credentials && "phoneNumberId" in credentials) {
      // WhatsApp Bot credentials
      credentialInfo.hasAccessToken = true;
      credentialInfo.phoneNumberId = (credentials as { phoneNumberId: string }).phoneNumberId;
    } else if ("botToken" in credentials) {
      // Telegram Bot credentials
      credentialInfo.hasBotToken = true;
    }

    return {
      ...rest,
      credentialInfo,
      providerMetadata: (gateway.metadata ?? {}) as Record<string, unknown>,
    };
  }

  /**
   * Update gateway metadata (provider-specific info persisted on connect)
   * Internal use — no ownership check (called by providers after connect)
   */
  async updateMetadata(
    id: string,
    metadata: Record<string, unknown>
  ): Promise<Gateway> {
    const gateway = await prisma.gateway.update({
      where: { id },
      data: { metadata: metadata as object },
    });

    gatewayLogger.debug({ gatewayId: id }, "Gateway metadata updated");
    return gateway;
  }

  /**
   * Count gateways by type for a user/org
   */
  async countByType(ctx: ServiceContext, type: GatewayType): Promise<number> {
    const where = ctx.organizationId
      ? { organizationId: ctx.organizationId, type }
      : { userId: ctx.userId, organizationId: null, type };

    return prisma.gateway.count({ where });
  }

  /**
   * Count all gateways for a user/org
   */
  async countTotal(ctx: ServiceContext): Promise<number> {
    const where = ctx.organizationId
      ? { organizationId: ctx.organizationId }
      : { userId: ctx.userId, organizationId: null };

    return prisma.gateway.count({ where });
  }
}

// Export singleton instance
export const gatewayService = new GatewayService();
