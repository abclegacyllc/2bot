/**
 * Role-Based Access Control Middleware
 * 
 * Provides middleware for checking user roles and permissions.
 * 
 * @module server/middleware/role
 */

import type { RequestHandler } from 'express';
import { 
  type Permission, 
  hasPermission,
  type UserRole,
  type OrgRole,
} from '@/shared/constants/permissions';

/**
 * Require specific user roles
 * 
 * @example
 * router.get('/admin', requireRole('ADMIN', 'SUPER_ADMIN'), handler);
 */
export function requireRole(...roles: UserRole[]): RequestHandler {
  return (req, res, next): void => {
    const userRole = req.user?.role as UserRole | undefined;

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
 */
export function requirePermission(permission: Permission): RequestHandler {
  return (req, res, next): void => {
    const userRole = req.user?.role as string | undefined;
    const orgRole = req.user?.orgRole as OrgRole | undefined;

    if (!userRole || !hasPermission(userRole, orgRole ?? null, permission)) {
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
export function requireAnyPermission(permissions: Permission[]): RequestHandler {
  return (req, res, next): void => {
    const userRole = req.user?.role as string | undefined;
    const orgRole = req.user?.orgRole as OrgRole | undefined;

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

    const hasAny = permissions.some(p => hasPermission(userRole, orgRole ?? null, p));

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
export function requireAllPermissions(permissions: Permission[]): RequestHandler {
  return (req, res, next): void => {
    const userRole = req.user?.role as string | undefined;
    const orgRole = req.user?.orgRole as OrgRole | undefined;

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

    const hasAll = permissions.every(p => hasPermission(userRole, orgRole ?? null, p));

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
export const requireAdmin: RequestHandler = (req, res, next): void => {
  const userRole = req.user?.role as string | undefined;

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

/**
 * Require super admin role (SUPER_ADMIN only)
 * 
 * @example
 * router.delete('/system/reset', requireSuperAdmin, handler);
 */
export const requireSuperAdmin: RequestHandler = (req, res, next): void => {
  const userRole = req.user?.role as string | undefined;

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

/**
 * Require organization context
 * User must be part of an organization to access this route
 * 
 * @example
 * router.use('/org', requireOrgContext, orgRouter);
 */
export const requireOrgContext: RequestHandler = (req, res, next): void => {
  const organizationId = req.user?.organizationId;

  if (!organizationId) {
    res.status(403).json({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Organization membership required',
      },
    });
    return;
  }

  next();
};

/**
 * Require organization owner or admin role
 * 
 * @example
 * router.delete('/org/settings', requireOrgAdmin, handler);
 */
export const requireOrgAdmin: RequestHandler = (req, res, next): void => {
  const orgRole = req.user?.orgRole as OrgRole | undefined;

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

/**
 * Require organization owner role only
 * 
 * @example
 * router.delete('/org', requireOrgOwner, handler);
 */
export const requireOrgOwner: RequestHandler = (req, res, next): void => {
  const orgRole = req.user?.orgRole as OrgRole | undefined;

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

/**
 * Require developer role or higher
 * For marketplace/developer features
 * 
 * @example
 * router.post('/marketplace/submit', requireDeveloper, handler);
 */
export const requireDeveloper: RequestHandler = (req, res, next): void => {
  const userRole = req.user?.role as string | undefined;

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