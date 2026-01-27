"use strict";
/**
 * Gateway Service
 *
 * Handles CRUD operations for gateways with encrypted credential storage,
 * ownership checks (user and organization), and audit logging.
 *
 * @module modules/gateway/gateway.service
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.gatewayService = void 0;
const audit_1 = require("@/lib/audit");
const encryption_1 = require("@/lib/encryption");
const logger_1 = require("@/lib/logger");
const plan_limits_1 = require("@/lib/plan-limits");
const prisma_1 = require("@/lib/prisma");
const errors_1 = require("@/shared/errors");
const gatewayLogger = logger_1.logger.child({ module: "gateway" });
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
 * Gateway ownership error
 */
class GatewayOwnershipError extends errors_1.ForbiddenError {
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
    async create(ctx, data) {
        gatewayLogger.debug({ type: data.type, name: data.name }, "Creating gateway");
        // Check plan limits before creating
        await (0, plan_limits_1.enforceGatewayLimit)(ctx);
        // Encrypt credentials
        const credentialsEnc = (0, encryption_1.encrypt)(data.credentials);
        const gateway = await prisma_1.prisma.gateway.create({
            data: {
                userId: ctx.userId,
                organizationId: ctx.organizationId ?? null,
                name: data.name,
                type: data.type,
                status: "DISCONNECTED",
                credentialsEnc,
                config: (data.config ?? {}),
            },
        });
        // Audit log (non-blocking)
        void audit_1.auditActions.gatewayCreated(toAuditContext(ctx), gateway.id, gateway.type, gateway.name);
        gatewayLogger.info({ gatewayId: gateway.id, type: gateway.type }, "Gateway created");
        return this.toSafeGateway(gateway, data.credentials);
    }
    /**
     * Find gateway by ID with ownership check
     */
    async findById(ctx, id) {
        const gateway = await prisma_1.prisma.gateway.findUnique({
            where: { id },
        });
        if (!gateway) {
            throw new errors_1.NotFoundError("Gateway not found");
        }
        // Check ownership
        this.checkOwnership(ctx, gateway);
        return gateway;
    }
    /**
     * Find gateway by ID and return safe version (no credentials)
     */
    async findByIdSafe(ctx, id) {
        const gateway = await this.findById(ctx, id);
        const credentials = this.getDecryptedCredentials(gateway);
        return this.toSafeGateway(gateway, credentials);
    }
    /**
     * Find all gateways for current user/organization
     */
    async findByUser(ctx) {
        const where = ctx.organizationId
            ? { organizationId: ctx.organizationId }
            : { userId: ctx.userId, organizationId: null };
        const gateways = await prisma_1.prisma.gateway.findMany({
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
    async update(ctx, id, data) {
        // Get existing gateway (with ownership check)
        const existing = await this.findById(ctx, id);
        // Prepare update data
        const updateData = {};
        if (data.name !== undefined) {
            updateData.name = data.name;
        }
        if (data.credentials !== undefined) {
            updateData.credentialsEnc = (0, encryption_1.encrypt)(data.credentials);
        }
        if (data.config !== undefined) {
            // Merge with existing config
            updateData.config = { ...existing.config, ...data.config };
        }
        const gateway = await prisma_1.prisma.gateway.update({
            where: { id },
            data: updateData,
        });
        // Audit log (non-blocking)
        void audit_1.auditActions.gatewayUpdated(toAuditContext(ctx), gateway.id, {
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
    async delete(ctx, id) {
        // Get existing gateway (with ownership check)
        const gateway = await this.findById(ctx, id);
        await prisma_1.prisma.gateway.delete({
            where: { id },
        });
        // Audit log (non-blocking)
        void audit_1.auditActions.gatewayDeleted(toAuditContext(ctx), gateway.id);
        gatewayLogger.info({ gatewayId: id }, "Gateway deleted");
    }
    /**
     * Update gateway status (internal use, no ownership check)
     * Used by gateway connectors to update connection status
     */
    async updateStatus(id, status, error) {
        const now = new Date();
        const data = {
            status,
        };
        if (status === "CONNECTED") {
            data.lastConnectedAt = now;
            data.lastError = null;
        }
        else if (status === "ERROR" && error) {
            data.lastErrorAt = now;
            data.lastError = error;
        }
        const gateway = await prisma_1.prisma.gateway.update({
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
    async updateStatusWithAuth(ctx, id, status, error) {
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
    getDecryptedCredentials(gateway) {
        return (0, encryption_1.decryptJson)(gateway.credentialsEnc);
    }
    /**
     * Check if user/org owns the gateway
     */
    checkOwnership(ctx, gateway) {
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
    toSafeGateway(gateway, credentials) {
        const { credentialsEnc, ...rest } = gateway;
        // Build credential info (no secrets)
        const credentialInfo = {
            type: gateway.type,
        };
        if ("provider" in credentials && "apiKey" in credentials) {
            // AI credentials
            const aiCreds = credentials;
            credentialInfo.provider = aiCreds.provider;
            credentialInfo.hasApiKey = true;
            credentialInfo.baseUrl = aiCreds.baseUrl;
        }
        else if ("botToken" in credentials) {
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
    async countByType(ctx, type) {
        const where = ctx.organizationId
            ? { organizationId: ctx.organizationId, type }
            : { userId: ctx.userId, organizationId: null, type };
        return prisma_1.prisma.gateway.count({ where });
    }
    /**
     * Count all gateways for a user/org
     */
    async countTotal(ctx) {
        const where = ctx.organizationId
            ? { organizationId: ctx.organizationId }
            : { userId: ctx.userId, organizationId: null };
        return prisma_1.prisma.gateway.count({ where });
    }
}
// Export singleton instance
exports.gatewayService = new GatewayService();
//# sourceMappingURL=gateway.service.js.map