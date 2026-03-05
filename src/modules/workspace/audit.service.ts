/**
 * Workspace Audit Service
 * 
 * Records lifecycle actions on workspace containers for compliance,
 * debugging, and admin visibility. Fire-and-forget — audit failures
 * never block workspace operations.
 * 
 * @module modules/workspace/audit.service
 */

import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';

const log = logger.child({ module: 'workspace:audit' });

// ===========================================
// Types
// ===========================================

export type AuditAction =
  | 'CREATE'
  | 'START'
  | 'STOP'
  | 'DESTROY'
  | 'FORCE_STOP'
  | 'AUTO_STOP'
  | 'AUTO_RESTART'
  | 'ERROR';

export interface AuditEntry {
  userId?: string | null;
  containerId: string;
  containerName?: string;
  action: AuditAction;
  success?: boolean;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

// ===========================================
// Audit Service
// ===========================================

class WorkspaceAuditService {
  /**
   * Log a workspace audit event.
   * Fire-and-forget — errors are silently logged, never thrown.
   */
  async log(entry: AuditEntry): Promise<void> {
    try {
      await prisma.workspaceAuditLog.create({
        data: {
          userId: entry.userId ?? null,
          containerId: entry.containerId,
          containerName: entry.containerName,
          action: entry.action,
          success: entry.success ?? true,
          errorMessage: entry.errorMessage,
          metadata: entry.metadata ? (entry.metadata as Prisma.InputJsonValue) : undefined,
          ipAddress: entry.ipAddress,
          userAgent: entry.userAgent,
        },
      });
    } catch (err) {
      // Never let audit failures break workspace operations
      log.error({ error: (err as Error).message, action: entry.action, containerId: entry.containerId }, 'Failed to write audit log');
    }
  }

  /**
   * Query audit logs for a container (admin/debugging)
   */
  async getByContainer(containerId: string, limit = 50) {
    return prisma.workspaceAuditLog.findMany({
      where: { containerId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Query audit logs for a user
   */
  async getByUser(userId: string, limit = 50) {
    return prisma.workspaceAuditLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Query recent audit logs (admin)
   */
  async getRecent(limit = 100) {
    return prisma.workspaceAuditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}

// ===========================================
// Singleton Export
// ===========================================

export const workspaceAuditService = new WorkspaceAuditService();
