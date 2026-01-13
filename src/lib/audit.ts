/**
 * Audit Logging Helper
 * 
 * Provides non-blocking audit logging for security and compliance.
 * All audit events are stored in the audit_logs table.
 * 
 * @module lib/audit
 */

import { prisma } from './prisma';
import { logger } from './logger';

const auditLogger = logger.child({ module: 'audit' });

/**
 * Audit event data
 */
export interface AuditEvent {
  action: string;
  resource: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  status?: 'success' | 'failure';
}

/**
 * Context for audit logging (can be AuditContext or minimal anonymous context)
 */
export interface AuditContext {
  userId?: string;
  organizationId?: string;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Log an audit event
 * 
 * This function is non-blocking - it will not throw errors or fail the request.
 * Any errors are logged but do not propagate.
 * 
 * @param ctx - The context (user info + request metadata)
 * @param event - The audit event to log
 */
export async function audit(
  ctx: AuditContext,
  event: AuditEvent
): Promise<void> {
  try {
    await prisma.auditLog.create({
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
  } catch (error) {
    // Don't fail the request if audit logging fails
    auditLogger.error({ error, event }, 'Failed to create audit log');
  }
}

/**
 * Convenience functions for common audit events
 */
export const auditActions = {
  // ==========================================
  // Authentication Events
  // ==========================================
  
  /**
   * Log successful login
   */
  loginSuccess: (ctx: AuditContext) => audit(ctx, {
    action: 'user.login.success',
    resource: 'user',
    resourceId: ctx.userId,
  }),
  
  /**
   * Log failed login attempt
   */
  loginFailed: (
    email: string, 
    ipAddress?: string, 
    userAgent?: string, 
    reason?: string
  ) => audit(
    { ipAddress, userAgent },
    {
      action: 'user.login.failed',
      resource: 'user',
      metadata: { email, reason },
      status: 'failure',
    }
  ),
  
  /**
   * Log user registration
   */
  userRegistered: (
    userId: string,
    email: string,
    ipAddress?: string,
    userAgent?: string
  ) => audit(
    { userId, ipAddress, userAgent },
    {
      action: 'user.register',
      resource: 'user',
      resourceId: userId,
      metadata: { email },
    }
  ),
  
  /**
   * Log password reset request
   */
  passwordResetRequested: (
    email: string, 
    ipAddress?: string,
    userAgent?: string
  ) => audit(
    { ipAddress, userAgent },
    {
      action: 'user.password.reset.request',
      resource: 'user',
      metadata: { email },
    }
  ),
  
  /**
   * Log password reset completion
   */
  passwordResetCompleted: (
    userId: string, 
    ipAddress?: string,
    userAgent?: string
  ) => audit(
    { userId, ipAddress, userAgent },
    {
      action: 'user.password.reset.complete',
      resource: 'user',
      resourceId: userId,
    }
  ),
  
  /**
   * Log logout
   */
  logout: (ctx: AuditContext) => audit(ctx, {
    action: 'user.logout',
    resource: 'user',
    resourceId: ctx.userId,
  }),

  // ==========================================
  // Gateway Events
  // ==========================================
  
  /**
   * Log gateway creation
   */
  gatewayCreated: (
    ctx: AuditContext, 
    gatewayId: string, 
    type: string,
    name: string
  ) => audit(ctx, {
    action: 'gateway.create',
    resource: 'gateway',
    resourceId: gatewayId,
    metadata: { type, name },
  }),
  
  /**
   * Log gateway update
   */
  gatewayUpdated: (
    ctx: AuditContext, 
    gatewayId: string,
    changes?: Record<string, unknown>
  ) => audit(ctx, {
    action: 'gateway.update',
    resource: 'gateway',
    resourceId: gatewayId,
    metadata: changes,
  }),
  
  /**
   * Log gateway deletion
   */
  gatewayDeleted: (
    ctx: AuditContext, 
    gatewayId: string
  ) => audit(ctx, {
    action: 'gateway.delete',
    resource: 'gateway',
    resourceId: gatewayId,
  }),
  
  /**
   * Log gateway connection status change
   */
  gatewayStatusChanged: (
    ctx: AuditContext,
    gatewayId: string,
    oldStatus: string,
    newStatus: string
  ) => audit(ctx, {
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
  pluginInstalled: (
    ctx: AuditContext,
    pluginId: string,
    pluginSlug: string
  ) => audit(ctx, {
    action: 'plugin.install',
    resource: 'plugin',
    resourceId: pluginId,
    metadata: { slug: pluginSlug },
  }),
  
  /**
   * Log plugin uninstallation
   */
  pluginUninstalled: (
    ctx: AuditContext,
    pluginId: string,
    pluginSlug: string
  ) => audit(ctx, {
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
  adminUserAction: (
    ctx: AuditContext,
    targetUserId: string,
    action: 'suspend' | 'activate' | 'delete' | 'impersonate' | 'role_change',
    details?: Record<string, unknown>
  ) => audit(ctx, {
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
  securityEvent: (
    ctx: AuditContext,
    eventType: string,
    details: Record<string, unknown>
  ) => audit(ctx, {
    action: `security.${eventType}`,
    resource: 'security',
    metadata: details,
    status: 'failure',
  }),
};

/**
 * Create audit context from Express request
 */
export function createAuditContext(req: {
  ip?: string;
  headers?: { 'user-agent'?: string };
  user?: { userId?: string; organizationId?: string };
}): AuditContext {
  return {
    userId: req.user?.userId,
    organizationId: req.user?.organizationId,
    ipAddress: req.ip,
    userAgent: req.headers?.['user-agent'],
  };
}
