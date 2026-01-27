"use strict";
/**
 * Audit Logging Helper
 *
 * Provides non-blocking audit logging for security and compliance.
 * All audit events are stored in the audit_logs table.
 *
 * @module lib/audit
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.auditActions = void 0;
exports.audit = audit;
exports.createAuditContext = createAuditContext;
const logger_1 = require("./logger");
const prisma_1 = require("./prisma");
const auditLogger = logger_1.logger.child({ module: 'audit' });
/**
 * Log an audit event
 *
 * This function is non-blocking - it will not throw errors or fail the request.
 * Any errors are logged but do not propagate.
 *
 * @param ctx - The context (user info + request metadata)
 * @param event - The audit event to log
 */
async function audit(ctx, event) {
    try {
        await prisma_1.prisma.auditLog.create({
            data: {
                userId: ctx.userId ?? null,
                organizationId: ctx.organizationId ?? null,
                action: event.action,
                resource: event.resource,
                resourceId: event.resourceId ?? null,
                metadata: event.metadata ? JSON.parse(JSON.stringify(event.metadata)) : undefined,
                ipAddress: ctx.ipAddress ?? null,
                userAgent: ctx.userAgent ?? null,
                status: event.status ?? 'success',
            },
        });
        auditLogger.debug({
            action: event.action,
            resource: event.resource,
            userId: ctx.userId,
        }, 'Audit event logged');
    }
    catch (error) {
        // Don't fail the request if audit logging fails
        auditLogger.error({ error, event }, 'Failed to create audit log');
    }
}
/**
 * Convenience functions for common audit events
 */
exports.auditActions = {
    // ==========================================
    // Authentication Events
    // ==========================================
    /**
     * Log successful login
     */
    loginSuccess: (ctx) => audit(ctx, {
        action: 'user.login.success',
        resource: 'user',
        resourceId: ctx.userId,
    }),
    /**
     * Log failed login attempt
     */
    loginFailed: (email, ipAddress, userAgent, reason) => audit({ ipAddress, userAgent }, {
        action: 'user.login.failed',
        resource: 'user',
        metadata: { email, reason },
        status: 'failure',
    }),
    /**
     * Log user registration
     */
    userRegistered: (userId, email, ipAddress, userAgent) => audit({ userId, ipAddress, userAgent }, {
        action: 'user.register',
        resource: 'user',
        resourceId: userId,
        metadata: { email },
    }),
    /**
     * Log password reset request
     */
    passwordResetRequested: (email, ipAddress, userAgent) => audit({ ipAddress, userAgent }, {
        action: 'user.password.reset.request',
        resource: 'user',
        metadata: { email },
    }),
    /**
     * Log password reset completion
     */
    passwordResetCompleted: (userId, ipAddress, userAgent) => audit({ userId, ipAddress, userAgent }, {
        action: 'user.password.reset.complete',
        resource: 'user',
        resourceId: userId,
    }),
    /**
     * Log logout
     */
    logout: (ctx) => audit(ctx, {
        action: 'user.logout',
        resource: 'user',
        resourceId: ctx.userId,
    }),
    /**
     * Log context switch (Phase 4)
     */
    contextSwitched: (ctx) => audit(ctx, {
        action: 'user.context.switch',
        resource: 'user',
        resourceId: ctx.userId,
        metadata: {
            contextType: ctx.contextType,
            organizationId: ctx.organizationId,
        },
    }),
    // ==========================================
    // Gateway Events
    // ==========================================
    /**
     * Log gateway creation
     */
    gatewayCreated: (ctx, gatewayId, type, name) => audit(ctx, {
        action: 'gateway.create',
        resource: 'gateway',
        resourceId: gatewayId,
        metadata: { type, name },
    }),
    /**
     * Log gateway update
     */
    gatewayUpdated: (ctx, gatewayId, changes) => audit(ctx, {
        action: 'gateway.update',
        resource: 'gateway',
        resourceId: gatewayId,
        metadata: changes,
    }),
    /**
     * Log gateway deletion
     */
    gatewayDeleted: (ctx, gatewayId) => audit(ctx, {
        action: 'gateway.delete',
        resource: 'gateway',
        resourceId: gatewayId,
    }),
    /**
     * Log gateway connection status change
     */
    gatewayStatusChanged: (ctx, gatewayId, oldStatus, newStatus) => audit(ctx, {
        action: 'gateway.status.change',
        resource: 'gateway',
        resourceId: gatewayId,
        metadata: { oldStatus, newStatus },
    }),
    // ==========================================
    // Plugin Events
    // ==========================================
    /**
     * Log plugin installation
     */
    pluginInstalled: (ctx, pluginId, pluginSlug) => audit(ctx, {
        action: 'plugin.install',
        resource: 'plugin',
        resourceId: pluginId,
        metadata: { slug: pluginSlug },
    }),
    /**
     * Log plugin uninstallation
     */
    pluginUninstalled: (ctx, pluginId, pluginSlug) => audit(ctx, {
        action: 'plugin.uninstall',
        resource: 'plugin',
        resourceId: pluginId,
        metadata: { slug: pluginSlug },
    }),
    // ==========================================
    // Admin Events
    // ==========================================
    /**
     * Log admin action on user
     */
    adminUserAction: (ctx, targetUserId, action, details) => audit(ctx, {
        action: `admin.user.${action}`,
        resource: 'user',
        resourceId: targetUserId,
        metadata: details,
    }),
    // ==========================================
    // Security Events
    // ==========================================
    /**
     * Log security event (suspicious activity, etc.)
     */
    securityEvent: (ctx, eventType, details) => audit(ctx, {
        action: `security.${eventType}`,
        resource: 'security',
        metadata: details,
        status: 'failure',
    }),
};
/**
 * Create audit context from Express request
 */
function createAuditContext(req) {
    return {
        userId: req.user?.userId,
        organizationId: req.user?.organizationId,
        ipAddress: req.ip,
        userAgent: req.headers?.['user-agent'],
    };
}
//# sourceMappingURL=audit.js.map