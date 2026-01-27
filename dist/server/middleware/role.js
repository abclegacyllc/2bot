"use strict";
/**
 * Role-Based Access Control Middleware
 *
 * Provides middleware for checking user roles and permissions.
 *
 * @module server/middleware/role
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireDeveloper = exports.requireOrgOwner = exports.requireOrgAdmin = exports.requireOrgContext = exports.requireSuperAdmin = exports.requireAdmin = void 0;
exports.requireRole = requireRole;
exports.requirePermission = requirePermission;
exports.requireAnyPermission = requireAnyPermission;
exports.requireAllPermissions = requireAllPermissions;
const permissions_1 = require("@/shared/constants/permissions");
/**
 * Require specific user roles
 *
 * @example
 * router.get('/admin', requireRole('ADMIN', 'SUPER_ADMIN'), handler);
 */
function requireRole(...roles) {
    return (req, res, next) => {
        const userRole = req.user?.role;
        if (!userRole || !roles.includes(userRole)) {
            res.status(403).json({
                success: false,
                error: {
                    code: 'FORBIDDEN',
                    message: 'You do not have permission to access this resource',
                },
            });
            return;
        }
        next();
    };
}
/**
 * Require a specific permission
 *
 * @example
 * router.delete('/users/:id', requirePermission('admin:users:delete'), handler);
 *
 * NOTE: orgRole is now determined by checking Membership model at request time.
 * For performance, org context should be set by an earlier middleware that
 * looks up the user's active organization membership.
 */
function requirePermission(permission) {
    return (req, res, next) => {
        const userRole = req.user?.role;
        // orgRole should be set by organization context middleware
        const orgRole = req.orgRole;
        if (!userRole || !(0, permissions_1.hasPermission)(userRole, orgRole ?? null, permission)) {
            res.status(403).json({
                success: false,
                error: {
                    code: 'FORBIDDEN',
                    message: `Permission denied: ${permission}`,
                },
            });
            return;
        }
        next();
    };
}
/**
 * Require any of the specified permissions (OR logic)
 *
 * @example
 * router.get('/content', requireAnyPermission(['admin:users:read', 'org:manage']), handler);
 */
function requireAnyPermission(permissions) {
    return (req, res, next) => {
        const userRole = req.user?.role;
        const orgRole = req.orgRole;
        if (!userRole) {
            res.status(403).json({
                success: false,
                error: {
                    code: 'FORBIDDEN',
                    message: 'Authentication required',
                },
            });
            return;
        }
        const hasAny = permissions.some(p => (0, permissions_1.hasPermission)(userRole, orgRole ?? null, p));
        if (!hasAny) {
            res.status(403).json({
                success: false,
                error: {
                    code: 'FORBIDDEN',
                    message: 'Permission denied',
                },
            });
            return;
        }
        next();
    };
}
/**
 * Require all of the specified permissions (AND logic)
 *
 * @example
 * router.post('/dangerous', requireAllPermissions(['admin:users:write', 'system:config']), handler);
 */
function requireAllPermissions(permissions) {
    return (req, res, next) => {
        const userRole = req.user?.role;
        const orgRole = req.orgRole;
        if (!userRole) {
            res.status(403).json({
                success: false,
                error: {
                    code: 'FORBIDDEN',
                    message: 'Authentication required',
                },
            });
            return;
        }
        const hasAll = permissions.every(p => (0, permissions_1.hasPermission)(userRole, orgRole ?? null, p));
        if (!hasAll) {
            res.status(403).json({
                success: false,
                error: {
                    code: 'FORBIDDEN',
                    message: 'Insufficient permissions',
                },
            });
            return;
        }
        next();
    };
}
/**
 * Require admin role (ADMIN or SUPER_ADMIN)
 *
 * @example
 * router.use('/admin', requireAdmin, adminRouter);
 */
const requireAdmin = (req, res, next) => {
    const userRole = req.user?.role;
    if (!userRole || !['ADMIN', 'SUPER_ADMIN'].includes(userRole)) {
        res.status(403).json({
            success: false,
            error: {
                code: 'FORBIDDEN',
                message: 'Admin access required',
            },
        });
        return;
    }
    next();
};
exports.requireAdmin = requireAdmin;
/**
 * Require super admin role (SUPER_ADMIN only)
 *
 * @example
 * router.delete('/system/reset', requireSuperAdmin, handler);
 */
const requireSuperAdmin = (req, res, next) => {
    const userRole = req.user?.role;
    if (userRole !== 'SUPER_ADMIN') {
        res.status(403).json({
            success: false,
            error: {
                code: 'FORBIDDEN',
                message: 'Super admin access required',
            },
        });
        return;
    }
    next();
};
exports.requireSuperAdmin = requireSuperAdmin;
/**
 * Require organization context
 * User must be part of an organization to access this route.
 * Organization context should be set by earlier middleware that reads
 * the X-Organization-Id header and validates membership.
 *
 * @example
 * router.use('/org', requireOrgContext, orgRouter);
 */
const requireOrgContext = (req, res, next) => {
    const organizationId = req.organizationId;
    if (!organizationId) {
        res.status(403).json({
            success: false,
            error: {
                code: 'FORBIDDEN',
                message: 'Organization context required. Set X-Organization-Id header.',
            },
        });
        return;
    }
    next();
};
exports.requireOrgContext = requireOrgContext;
/**
 * Require organization owner or admin role
 * NOTE: orgRole must be set by organization context middleware
 *
 * @example
 * router.delete('/org/settings', requireOrgAdmin, handler);
 */
const requireOrgAdmin = (req, res, next) => {
    const orgRole = req.orgRole;
    if (!orgRole || !['ORG_OWNER', 'ORG_ADMIN'].includes(orgRole)) {
        res.status(403).json({
            success: false,
            error: {
                code: 'FORBIDDEN',
                message: 'Organization admin access required',
            },
        });
        return;
    }
    next();
};
exports.requireOrgAdmin = requireOrgAdmin;
/**
 * Require organization owner role only
 * NOTE: orgRole must be set by organization context middleware
 *
 * @example
 * router.delete('/org', requireOrgOwner, handler);
 */
const requireOrgOwner = (req, res, next) => {
    const orgRole = req.orgRole;
    if (orgRole !== 'ORG_OWNER') {
        res.status(403).json({
            success: false,
            error: {
                code: 'FORBIDDEN',
                message: 'Organization owner access required',
            },
        });
        return;
    }
    next();
};
exports.requireOrgOwner = requireOrgOwner;
/**
 * Require developer role or higher
 * For marketplace/developer features
 *
 * @example
 * router.post('/marketplace/submit', requireDeveloper, handler);
 */
const requireDeveloper = (req, res, next) => {
    const userRole = req.user?.role;
    if (!userRole || !['DEVELOPER', 'ADMIN', 'SUPER_ADMIN'].includes(userRole)) {
        res.status(403).json({
            success: false,
            error: {
                code: 'FORBIDDEN',
                message: 'Developer access required',
            },
        });
        return;
    }
    next();
};
exports.requireDeveloper = requireDeveloper;
//# sourceMappingURL=role.js.map