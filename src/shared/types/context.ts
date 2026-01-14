/**
 * Service Context Types
 * 
 * ServiceContext is passed to all service methods to provide:
 * - User identity and roles
 * - Organization context (if applicable)
 * - Request metadata for logging/auditing
 * - Permission checking helpers
 */

import {
    type OrgRole,
    type Permission,
    type UserRole,
    getUserPermissions,
    hasPermission
} from '../constants/permissions';
import type { PlanType } from '../constants/plans';

/**
 * Core service context interface
 * Passed to all service methods for authorization and auditing
 */
export interface ServiceContext {
  // Who is making the request
  userId: string;
  userRole: UserRole;
  userPlan: PlanType;

  // Organization context (optional - null for individual users)
  organizationId?: string;
  orgRole?: OrgRole;
  departmentId?: string;

  // Request metadata (for auditing)
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;

  // Helper methods
  isAdmin(): boolean;
  isSuperAdmin(): boolean;
  isOrgContext(): boolean;
  canDo(permission: Permission): boolean;
  getPermissions(): Permission[];
}

/**
 * Token payload shape (from JWT)
 */
export interface TokenPayloadForContext {
  userId: string;
  role: UserRole;
  plan: PlanType;
  organizationId?: string;
  orgRole?: OrgRole;
}

/**
 * Request metadata shape
 */
export interface RequestMetadata {
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
}

/**
 * Create a ServiceContext from token payload and request metadata
 */
export function createServiceContext(
  tokenPayload: TokenPayloadForContext,
  requestMeta?: RequestMetadata
): ServiceContext {
  const ctx: ServiceContext = {
    userId: tokenPayload.userId,
    userRole: tokenPayload.role,
    userPlan: tokenPayload.plan,
    organizationId: tokenPayload.organizationId,
    orgRole: tokenPayload.orgRole,
    ipAddress: requestMeta?.ipAddress,
    userAgent: requestMeta?.userAgent,
    requestId: requestMeta?.requestId,

    isAdmin() {
      return ['ADMIN', 'SUPER_ADMIN'].includes(this.userRole);
    },

    isSuperAdmin() {
      return this.userRole === 'SUPER_ADMIN';
    },

    isOrgContext() {
      return !!this.organizationId;
    },

    canDo(permission: Permission) {
      return hasPermission(this.userRole, this.orgRole ?? null, permission);
    },

    getPermissions() {
      return getUserPermissions(this.userRole, this.orgRole ?? null);
    },
  };

  return ctx;
}

/**
 * Create a system context for background jobs and internal operations
 * Has full permissions but logs as 'system'
 */
export function createSystemContext(requestId?: string): ServiceContext {
  return {
    userId: 'system',
    userRole: 'SUPER_ADMIN',
    userPlan: 'ENTERPRISE',
    requestId,

    isAdmin() {
      return true;
    },

    isSuperAdmin() {
      return true;
    },

    isOrgContext() {
      return false;
    },

    canDo() {
      return true;
    },

    getPermissions() {
      return getUserPermissions('SUPER_ADMIN', null);
    },
  };
}

/**
 * Minimal context for unauthenticated requests (audit logging only)
 */
export interface AnonymousContext {
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
}

/**
 * Create context for unauthenticated requests
 */
export function createAnonymousContext(meta?: RequestMetadata): AnonymousContext {
  return {
    ipAddress: meta?.ipAddress,
    userAgent: meta?.userAgent,
    requestId: meta?.requestId,
  };
}
