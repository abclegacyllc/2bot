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

// ===========================================
// Tenant Context (Data Access Layer)
// ===========================================

/**
 * Tenant isolation levels
 * Determines where tenant data is stored
 */
export type IsolationLevel =
  | 'SHARED'        // Data in shared tenant database (Free/Starter/Pro)
  | 'DEDICATED'     // Data in dedicated database (Enterprise orgs)
  | 'USER_ISOLATED'; // User has own isolated storage (Pro+ users, future)

/**
 * Tenant scope - who owns the data being accessed
 */
export type TenantScope =
  | 'USER'          // Personal data (userId only)
  | 'ORGANIZATION'  // Organization-wide data
  | 'DEPARTMENT';   // Department-scoped data

/**
 * Tenant filter for queries
 * Applied automatically by DataClient
 */
export interface TenantFilter {
  userId?: string;
  organizationId?: string | null;
  departmentId?: string;
}

/**
 * Extended context for data access layer
 * Includes tenant routing information
 */
export interface TenantContext extends ServiceContext {
  /** Tenant identification - orgId or `user_${userId}` for personal */
  tenantId: string;

  /** Scope of the data being accessed */
  tenantScope: TenantScope;

  /** Database isolation level */
  isolationLevel: IsolationLevel;

  /** Custom database URL for isolated tenants (null = use default shared DB) */
  databaseUrl?: string;

  /** Check if tenant has dedicated database */
  isIsolated(): boolean;

  /** Get WHERE clause filter for queries */
  getTenantFilter(): TenantFilter;
}

/**
 * Options for creating TenantContext
 */
export interface TenantContextOptions {
  scope?: TenantScope;
  isolationLevel?: IsolationLevel;
  databaseUrl?: string;
}

/**
 * Create TenantContext from ServiceContext
 * Database URL resolved from Organization.databaseConfig or Plan.isolationLevel
 */
export function createTenantContext(
  ctx: ServiceContext,
  options?: TenantContextOptions
): TenantContext {
  const scope = options?.scope ?? (ctx.organizationId ? 'ORGANIZATION' : 'USER');
  const tenantId = ctx.organizationId ?? `user_${ctx.userId}`;
  const isolationLevel = options?.isolationLevel ?? 'SHARED';

  return {
    // Spread ServiceContext properties
    userId: ctx.userId,
    userRole: ctx.userRole,
    userPlan: ctx.userPlan,
    organizationId: ctx.organizationId,
    orgRole: ctx.orgRole,
    departmentId: ctx.departmentId,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,

    // ServiceContext methods
    isAdmin: ctx.isAdmin.bind(ctx),
    isSuperAdmin: ctx.isSuperAdmin.bind(ctx),
    isOrgContext: ctx.isOrgContext.bind(ctx),
    canDo: ctx.canDo.bind(ctx),
    getPermissions: ctx.getPermissions.bind(ctx),

    // TenantContext properties
    tenantId,
    tenantScope: scope,
    isolationLevel,
    databaseUrl: options?.databaseUrl,

    // TenantContext methods
    isIsolated() {
      return this.isolationLevel !== 'SHARED';
    },

    getTenantFilter() {
      // Organization context: filter by orgId only
      if (this.organizationId) {
        const filter: TenantFilter = { organizationId: this.organizationId };
        if (this.tenantScope === 'DEPARTMENT' && this.departmentId) {
          filter.departmentId = this.departmentId;
        }
        return filter;
      }
      // Personal context: filter by userId + orgId=null
      return {
        userId: this.userId,
        organizationId: null,
      };
    },
  };
}

/**
 * Create TenantContext for system operations
 * Used for background jobs that need tenant-aware data access
 */
export function createSystemTenantContext(
  tenantId: string,
  options?: TenantContextOptions
): TenantContext {
  const systemCtx = createSystemContext();
  return createTenantContext(systemCtx, {
    ...options,
    // Override with explicit tenantId parsing
  });
}
