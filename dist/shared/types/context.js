"use strict";
/**
 * Service Context Types
 *
 * ServiceContext is passed to all service methods to provide:
 * - User identity and roles
 * - Organization context (if applicable)
 * - Request metadata for logging/auditing
 * - Permission checking helpers
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createServiceContext = createServiceContext;
exports.createSystemContext = createSystemContext;
exports.createAnonymousContext = createAnonymousContext;
exports.createTenantContext = createTenantContext;
exports.createSystemTenantContext = createSystemTenantContext;
exports.getOwnershipFilter = getOwnershipFilter;
const permissions_1 = require("../constants/permissions");
/**
 * Create a ServiceContext from token payload and request metadata
 * Phase 6.7: Supports both token-based context (legacy) and URL-based context (new)
 */
function createServiceContext(tokenPayload, requestMeta, contextOptions) {
    // Phase 6.7: Use contextOptions if provided, otherwise fall back to activeContext in token
    const activeContext = tokenPayload.activeContext;
    const contextType = contextOptions?.contextType ?? activeContext?.type ?? 'personal';
    const organizationId = contextOptions?.organizationId ?? activeContext?.organizationId;
    const orgRole = contextOptions?.orgRole ?? activeContext?.orgRole;
    const effectivePlan = contextOptions?.effectivePlan ?? activeContext?.plan ?? tokenPayload.plan;
    const ctx = {
        userId: tokenPayload.userId,
        userRole: tokenPayload.role,
        userPlan: tokenPayload.plan,
        contextType,
        organizationId,
        orgRole,
        effectivePlan,
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
            return this.contextType === 'organization';
        },
        isPersonalContext() {
            return this.contextType === 'personal';
        },
        getOwnerId() {
            return this.isOrgContext() ? (this.organizationId ?? null) : null;
        },
        canDo(permission) {
            return (0, permissions_1.hasPermission)(this.userRole, this.orgRole ?? null, permission);
        },
        getPermissions() {
            return (0, permissions_1.getUserPermissions)(this.userRole, this.orgRole ?? null);
        },
    };
    return ctx;
}
/**
 * Create a system context for background jobs and internal operations
 * Has full permissions but logs as 'system'
 */
function createSystemContext(requestId) {
    return {
        userId: 'system',
        userRole: 'SUPER_ADMIN',
        userPlan: 'ENTERPRISE',
        contextType: 'personal',
        effectivePlan: 'ENTERPRISE',
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
        isPersonalContext() {
            return true;
        },
        getOwnerId() {
            return null;
        },
        canDo() {
            return true;
        },
        getPermissions() {
            return (0, permissions_1.getUserPermissions)('SUPER_ADMIN', null);
        },
    };
}
/**
 * Create context for unauthenticated requests
 */
function createAnonymousContext(meta) {
    return {
        ipAddress: meta?.ipAddress,
        userAgent: meta?.userAgent,
        requestId: meta?.requestId,
    };
}
/**
 * Create TenantContext from ServiceContext
 * Database URL resolved from Organization.databaseConfig or Plan.isolationLevel
 */
function createTenantContext(ctx, options) {
    const scope = options?.scope ?? (ctx.organizationId ? 'ORGANIZATION' : 'USER');
    const tenantId = ctx.organizationId ?? `user_${ctx.userId}`;
    const isolationLevel = options?.isolationLevel ?? 'SHARED';
    return {
        // Spread ServiceContext properties
        userId: ctx.userId,
        userRole: ctx.userRole,
        userPlan: ctx.userPlan,
        contextType: ctx.contextType,
        organizationId: ctx.organizationId,
        orgRole: ctx.orgRole,
        departmentId: ctx.departmentId,
        effectivePlan: ctx.effectivePlan,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
        requestId: ctx.requestId,
        // ServiceContext methods
        isAdmin: ctx.isAdmin.bind(ctx),
        isSuperAdmin: ctx.isSuperAdmin.bind(ctx),
        isOrgContext: ctx.isOrgContext.bind(ctx),
        isPersonalContext: ctx.isPersonalContext.bind(ctx),
        getOwnerId: ctx.getOwnerId.bind(ctx),
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
                const filter = { organizationId: this.organizationId };
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
function createSystemTenantContext(tenantId, options) {
    const systemCtx = createSystemContext();
    return createTenantContext(systemCtx, {
        ...options,
        // Override with explicit tenantId parsing
    });
}
/**
 * Get ownership filter based on context type
 *
 * - Personal context: filter by userId and organizationId=null
 * - Organization context: filter by organizationId only
 *
 * This ensures proper data isolation between personal and org workspaces.
 */
function getOwnershipFilter(ctx) {
    if (ctx.isOrgContext()) {
        return { organizationId: ctx.organizationId };
    }
    return { userId: ctx.userId, organizationId: null };
}
//# sourceMappingURL=context.js.map