"use strict";
/**
 * Tenant-Aware Query Helpers
 *
 * Common patterns for ownership checks and filtering in multi-tenant queries.
 * These helpers ensure consistent access control across the application.
 *
 * @module shared/lib/tenant-helpers
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOwnershipFilter = getOwnershipFilter;
exports.getDepartmentFilter = getDepartmentFilter;
exports.getUserFilter = getUserFilter;
exports.checkOwnership = checkOwnership;
exports.checkDepartmentAccess = checkDepartmentAccess;
exports.canAccess = canAccess;
exports.requireOrgContext = requireOrgContext;
exports.requirePersonalContext = requirePersonalContext;
exports.requireAdmin = requireAdmin;
exports.requireSuperAdmin = requireSuperAdmin;
exports.requireOrgRole = requireOrgRole;
exports.withTenantFilter = withTenantFilter;
exports.withOwnership = withOwnership;
exports.withDepartment = withDepartment;
const errors_1 = require("../errors");
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
function getOwnershipFilter(ctx) {
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
function getDepartmentFilter(ctx) {
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
function getUserFilter(ctx) {
    return { userId: ctx.userId };
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
function checkOwnership(ctx, resource, resourceName = 'Resource') {
    // Super admins can access anything
    if (ctx.isSuperAdmin()) {
        return;
    }
    // Organization context: check org ownership
    if (ctx.organizationId) {
        if (resource.organizationId !== ctx.organizationId) {
            throw new errors_1.ForbiddenError(`You don't have access to this ${resourceName}`);
        }
        return;
    }
    // Personal context: check user ownership AND no org
    if (resource.userId !== ctx.userId || resource.organizationId !== null) {
        throw new errors_1.ForbiddenError(`You don't have access to this ${resourceName}`);
    }
}
/**
 * Check department-level access
 * For resources scoped to departments within an organization
 */
function checkDepartmentAccess(ctx, resource, resourceName = 'Resource') {
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
            throw new errors_1.ForbiddenError(`You don't have access to this ${resourceName}`);
        }
    }
}
/**
 * Check if user can access a resource (returns boolean instead of throwing)
 */
function canAccess(ctx, resource) {
    try {
        checkOwnership(ctx, resource);
        return true;
    }
    catch {
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
function requireOrgContext(ctx) {
    if (!ctx.organizationId) {
        throw new errors_1.ForbiddenError('This feature requires an organization context');
    }
}
/**
 * Assert that context is personal (no org)
 * Useful for user-only features
 */
function requirePersonalContext(ctx) {
    if (ctx.organizationId) {
        throw new errors_1.ForbiddenError('This feature is only available in personal workspace');
    }
}
/**
 * Assert that user has admin role (ADMIN or SUPER_ADMIN)
 */
function requireAdmin(ctx) {
    if (!ctx.isAdmin()) {
        throw new errors_1.ForbiddenError('Admin access required');
    }
}
/**
 * Assert that user has super admin role
 */
function requireSuperAdmin(ctx) {
    if (!ctx.isSuperAdmin()) {
        throw new errors_1.ForbiddenError('Super admin access required');
    }
}
/**
 * Assert that user has specific org role
 */
function requireOrgRole(ctx, ...roles) {
    requireOrgContext(ctx);
    if (!ctx.orgRole || !roles.includes(ctx.orgRole)) {
        throw new errors_1.ForbiddenError(`This action requires one of these roles: ${roles.join(', ')}`);
    }
}
// ===========================================
// Query Helpers
// ===========================================
/**
 * Add tenant filter to Prisma where clause
 * Merges with existing where conditions
 */
function withTenantFilter(ctx, where) {
    const filter = getOwnershipFilter(ctx);
    return { ...filter, ...where };
}
/**
 * Add ownership data to create operations
 * Automatically sets userId and organizationId
 */
function withOwnership(ctx, data) {
    return {
        ...data,
        userId: ctx.userId,
        organizationId: ctx.organizationId ?? null,
    };
}
/**
 * Add ownership data including department
 */
function withDepartment(ctx, data) {
    return {
        ...data,
        userId: ctx.userId,
        organizationId: ctx.organizationId ?? null,
        departmentId: ctx.departmentId ?? null,
    };
}
//# sourceMappingURL=tenant-helpers.js.map