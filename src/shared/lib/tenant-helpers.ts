/**
 * Tenant-Aware Query Helpers
 *
 * Common patterns for ownership checks and filtering in multi-tenant queries.
 * These helpers ensure consistent access control across the application.
 *
 * @module shared/lib/tenant-helpers
 */

import { ForbiddenError } from '../errors';
import type { ServiceContext, TenantFilter } from '../types/context';

// ===========================================
// Ownership Filters
// ===========================================

/**
 * Build ownership filter for queries
 * Handles both personal and organization contexts
 *
 * @example
 * ```typescript
 * const filter = getOwnershipFilter(ctx);
 * const gateways = await prisma.gateway.findMany({ where: filter });
 * ```
 */
export function getOwnershipFilter(ctx: ServiceContext): TenantFilter {
  if (ctx.organizationId) {
    return { organizationId: ctx.organizationId };
  }
  return {
    userId: ctx.userId,
    organizationId: null,
  };
}

/**
 * Build ownership filter including department scope
 * Use for resources that support department-level access control
 */
export function getDepartmentFilter(ctx: ServiceContext): TenantFilter {
  const filter = getOwnershipFilter(ctx);
  if (ctx.departmentId) {
    filter.departmentId = ctx.departmentId;
  }
  return filter;
}

/**
 * Build ownership filter for user-only resources (no org support)
 * Use for resources that are always personal (e.g., user preferences)
 */
export function getUserFilter(ctx: ServiceContext): { userId: string } {
  return { userId: ctx.userId };
}

// ===========================================
// Ownership Checks
// ===========================================

/**
 * Resource that can be owned by user or organization
 */
interface OwnableResource {
  userId: string;
  organizationId?: string | null;
}

/**
 * Resource with department scope
 */
interface DepartmentResource extends OwnableResource {
  departmentId?: string | null;
}

/**
 * Check if user owns a resource
 * Throws ForbiddenError if not authorized
 *
 * @example
 * ```typescript
 * const gateway = await prisma.gateway.findUnique({ where: { id } });
 * if (!gateway) throw new NotFoundError('Gateway not found');
 * checkOwnership(ctx, gateway, 'Gateway');
 * ```
 */
export function checkOwnership(
  ctx: ServiceContext,
  resource: OwnableResource,
  resourceName = 'Resource'
): void {
  // Super admins can access anything
  if (ctx.isSuperAdmin()) {
    return;
  }

  // Organization context: check org ownership
  if (ctx.organizationId) {
    if (resource.organizationId !== ctx.organizationId) {
      throw new ForbiddenError(`You don't have access to this ${resourceName}`);
    }
    return;
  }

  // Personal context: check user ownership AND no org
  if (resource.userId !== ctx.userId || resource.organizationId !== null) {
    throw new ForbiddenError(`You don't have access to this ${resourceName}`);
  }
}

/**
 * Check department-level access
 * For resources scoped to departments within an organization
 */
export function checkDepartmentAccess(
  ctx: ServiceContext,
  resource: DepartmentResource,
  resourceName = 'Resource'
): void {
  // First check org-level ownership
  checkOwnership(ctx, resource, resourceName);

  // If resource has department, check department access
  if (resource.departmentId && ctx.departmentId) {
    // Org owners/admins can access all departments
    if (ctx.orgRole === 'ORG_OWNER' || ctx.orgRole === 'ORG_ADMIN') {
      return;
    }
    // Dept managers and members can only access their department
    if (resource.departmentId !== ctx.departmentId) {
      throw new ForbiddenError(`You don't have access to this ${resourceName}`);
    }
  }
}

/**
 * Check if user can access a resource (returns boolean instead of throwing)
 */
export function canAccess(
  ctx: ServiceContext,
  resource: OwnableResource
): boolean {
  try {
    checkOwnership(ctx, resource);
    return true;
  } catch {
    return false;
  }
}

// ===========================================
// Context Assertions
// ===========================================

/**
 * Assert that context has organization
 * Useful for org-only features
 *
 * @example
 * ```typescript
 * requireOrgContext(ctx);
 * // ctx.organizationId is guaranteed to be string here
 * await createTeamResource(ctx.organizationId);
 * ```
 */
export function requireOrgContext(
  ctx: ServiceContext
): asserts ctx is ServiceContext & { organizationId: string } {
  if (!ctx.organizationId) {
    throw new ForbiddenError('This feature requires an organization context');
  }
}

/**
 * Assert that context is personal (no org)
 * Useful for user-only features
 */
export function requirePersonalContext(ctx: ServiceContext): void {
  if (ctx.organizationId) {
    throw new ForbiddenError('This feature is only available in personal workspace');
  }
}

/**
 * Assert that user has admin role (ADMIN or SUPER_ADMIN)
 */
export function requireAdmin(ctx: ServiceContext): void {
  if (!ctx.isAdmin()) {
    throw new ForbiddenError('Admin access required');
  }
}

/**
 * Assert that user has super admin role
 */
export function requireSuperAdmin(ctx: ServiceContext): void {
  if (!ctx.isSuperAdmin()) {
    throw new ForbiddenError('Super admin access required');
  }
}

/**
 * Assert that user has specific org role
 */
export function requireOrgRole(
  ctx: ServiceContext,
  ...roles: Array<'ORG_OWNER' | 'ORG_ADMIN' | 'DEPT_MANAGER' | 'ORG_MEMBER'>
): void {
  requireOrgContext(ctx);
  if (!ctx.orgRole || !roles.includes(ctx.orgRole)) {
    throw new ForbiddenError(
      `This action requires one of these roles: ${roles.join(', ')}`
    );
  }
}

// ===========================================
// Query Helpers
// ===========================================

/**
 * Add tenant filter to Prisma where clause
 * Merges with existing where conditions
 */
export function withTenantFilter<T extends Record<string, unknown>>(
  ctx: ServiceContext,
  where?: T
): T & TenantFilter {
  const filter = getOwnershipFilter(ctx);
  return { ...filter, ...where } as T & TenantFilter;
}

/**
 * Add ownership data to create operations
 * Automatically sets userId and organizationId
 */
export function withOwnership<T extends Record<string, unknown>>(
  ctx: ServiceContext,
  data: T
): T & { userId: string; organizationId: string | null } {
  return {
    ...data,
    userId: ctx.userId,
    organizationId: ctx.organizationId ?? null,
  };
}

/**
 * Add ownership data including department
 */
export function withDepartment<T extends Record<string, unknown>>(
  ctx: ServiceContext,
  data: T
): T & { userId: string; organizationId: string | null; departmentId: string | null } {
  return {
    ...data,
    userId: ctx.userId,
    organizationId: ctx.organizationId ?? null,
    departmentId: ctx.departmentId ?? null,
  };
}
