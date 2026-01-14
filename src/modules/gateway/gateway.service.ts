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
import { prisma } from "@/lib/prisma";
import { ForbiddenError, NotFoundError } from "@/shared/errors";
import type { ServiceContext } from "@/shared/types/context";

import type {
    AICredentials,
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
 * Gateway Service
 * All methods require ServiceContext for authorization and auditing
 */
class GatewayService {
  /**
   * Create a new gateway
   */
  async create(ctx: ServiceContext, data: CreateGatewayRequest): Promise<SafeGateway> {
    gatewayLogger.debug({ type: data.type, name: data.name }, "Creating gateway");

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

    return this.toSafeGateway(gateway, data.credentials);
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

    // Check ownership
    this.checkOwnership(ctx, gateway);

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
        lastConnectedAt: true,
        lastError: true,
        createdAt: true,
      },
    });

    return gateways;
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

    // Prepare update data
    const updateData: {
      name?: string;
      credentialsEnc?: string;
      config?: object;
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

    const gateway = await prisma.gateway.update({
      where: { id },
      data: updateData,
    });

    // Audit log (non-blocking)
    void auditActions.gatewayUpdated(toAuditContext(ctx), gateway.id, {
      nameChanged: data.name !== undefined,
      credentialsChanged: data.credentials !== undefined,
      configChanged: data.config !== undefined,
    });

    gatewayLogger.info({ gatewayId: gateway.id }, "Gateway updated");

    const credentials = this.getDecryptedCredentials(gateway);
    return this.toSafeGateway(gateway, credentials);
  }

  /**
   * Delete gateway
   */
  async delete(ctx: ServiceContext, id: string): Promise<void> {
    // Get existing gateway (with ownership check)
    const gateway = await this.findById(ctx, id);

    await prisma.gateway.delete({
      where: { id },
    });

    // Audit log (non-blocking)
    void auditActions.gatewayDeleted(toAuditContext(ctx), gateway.id);

    gatewayLogger.info({ gatewayId: id }, "Gateway deleted");
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
    const gateway = await this.findById(ctx, id);

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
   * Check if user/org owns the gateway
   */
  private checkOwnership(ctx: ServiceContext, gateway: Gateway): void {
    // Super admins can access any gateway
    if (ctx.isSuperAdmin()) {
      return;
    }

    // Check organization ownership
    if (ctx.organizationId) {
      if (gateway.organizationId !== ctx.organizationId) {
        throw new GatewayOwnershipError();
      }
      return;
    }

    // Check user ownership (and ensure gateway isn't org-owned)
    if (gateway.userId !== ctx.userId || gateway.organizationId !== null) {
      throw new GatewayOwnershipError();
    }
  }

  /**
   * Convert Gateway to SafeGateway (remove encrypted credentials, add info)
   */
  private toSafeGateway(gateway: Gateway, credentials: GatewayCredentials): SafeGateway {
    const { credentialsEnc, ...rest } = gateway;

    // Build credential info (no secrets)
    const credentialInfo: SafeGateway["credentialInfo"] = {
      type: gateway.type,
    };

    if ("provider" in credentials && "apiKey" in credentials) {
      // AI credentials
      const aiCreds = credentials as AICredentials;
      credentialInfo.provider = aiCreds.provider;
      credentialInfo.hasApiKey = true;
      credentialInfo.baseUrl = aiCreds.baseUrl;
    } else if ("botToken" in credentials) {
      // Telegram Bot credentials
      credentialInfo.hasBotToken = true;
    }

    return {
      ...rest,
      credentialInfo,
    };
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
