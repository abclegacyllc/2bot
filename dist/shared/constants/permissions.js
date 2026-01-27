"use strict";
/**
 * Permissions Configuration
 *
 * Maps permissions to the roles that can perform them.
 * Used for authorization checks throughout the application.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ORG_ROLES = exports.USER_ROLES = exports.PERMISSIONS = void 0;
exports.hasPermission = hasPermission;
exports.getUserPermissions = getUserPermissions;
exports.hasAllPermissions = hasAllPermissions;
exports.hasAnyPermission = hasAnyPermission;
exports.isHigherRole = isHigherRole;
exports.PERMISSIONS = {
    // Gateway permissions
    'gateway:create': ['MEMBER', 'DEVELOPER', 'ADMIN', 'SUPER_ADMIN'],
    'gateway:read': ['MEMBER', 'DEVELOPER', 'ADMIN', 'SUPER_ADMIN'],
    'gateway:update': ['MEMBER', 'DEVELOPER', 'ADMIN', 'SUPER_ADMIN'],
    'gateway:delete': ['MEMBER', 'DEVELOPER', 'ADMIN', 'SUPER_ADMIN'],
    // Plugin permissions
    'plugin:install': ['MEMBER', 'DEVELOPER', 'ADMIN', 'SUPER_ADMIN'],
    'plugin:configure': ['MEMBER', 'DEVELOPER', 'ADMIN', 'SUPER_ADMIN'],
    'plugin:uninstall': ['MEMBER', 'DEVELOPER', 'ADMIN', 'SUPER_ADMIN'],
    // Admin permissions
    'admin:users:read': ['SUPPORT', 'ADMIN', 'SUPER_ADMIN'],
    'admin:users:write': ['ADMIN', 'SUPER_ADMIN'],
    'admin:users:delete': ['SUPER_ADMIN'],
    'admin:users:impersonate': ['SUPER_ADMIN'],
    // Marketplace permissions
    'marketplace:submit': ['DEVELOPER', 'ADMIN', 'SUPER_ADMIN'],
    'marketplace:review': ['ADMIN', 'SUPER_ADMIN'],
    'marketplace:feature': ['ADMIN', 'SUPER_ADMIN'],
    'marketplace:reject': ['ADMIN', 'SUPER_ADMIN'],
    // Organization permissions (checked against orgRole)
    'org:manage': ['ORG_OWNER', 'ORG_ADMIN'],
    'org:members:invite': ['ORG_OWNER', 'ORG_ADMIN'],
    'org:members:remove': ['ORG_OWNER', 'ORG_ADMIN'],
    'org:members:role': ['ORG_OWNER'],
    'org:billing': ['ORG_OWNER'],
    'org:settings': ['ORG_OWNER', 'ORG_ADMIN'],
    // Billing permissions
    'billing:read': ['MEMBER', 'DEVELOPER', 'ADMIN', 'SUPER_ADMIN'],
    'billing:manage': ['MEMBER', 'DEVELOPER', 'ADMIN', 'SUPER_ADMIN'],
    'billing:admin': ['ADMIN', 'SUPER_ADMIN'],
    // System permissions
    'system:logs': ['ADMIN', 'SUPER_ADMIN'],
    'system:config': ['SUPER_ADMIN'],
    'system:maintenance': ['SUPER_ADMIN'],
};
/**
 * Check if a user has a specific permission
 * @param userRole - The user's platform role
 * @param orgRole - The user's organization role (if any)
 * @param permission - The permission to check
 */
function hasPermission(userRole, orgRole, permission) {
    const allowedRoles = exports.PERMISSIONS[permission];
    // Check user role
    if (allowedRoles.includes(userRole)) {
        return true;
    }
    // Check org role if provided
    if (orgRole && allowedRoles.includes(orgRole)) {
        return true;
    }
    return false;
}
/**
 * Get all permissions for a user based on their roles
 */
function getUserPermissions(userRole, orgRole) {
    return Object.keys(exports.PERMISSIONS).filter(permission => hasPermission(userRole, orgRole, permission));
}
/**
 * Check multiple permissions at once (AND logic)
 */
function hasAllPermissions(userRole, orgRole, permissions) {
    return permissions.every(p => hasPermission(userRole, orgRole, p));
}
/**
 * Check multiple permissions at once (OR logic)
 */
function hasAnyPermission(userRole, orgRole, permissions) {
    return permissions.some(p => hasPermission(userRole, orgRole, p));
}
/**
 * User roles in order of privilege (lowest to highest)
 */
exports.USER_ROLES = [
    'MEMBER',
    'DEVELOPER',
    'SUPPORT',
    'ADMIN',
    'SUPER_ADMIN',
];
/**
 * Organization roles in order of privilege (lowest to highest)
 */
exports.ORG_ROLES = [
    'ORG_MEMBER',
    'DEPT_MANAGER',
    'ORG_ADMIN',
    'ORG_OWNER',
];
/**
 * Check if a role has higher privilege than another
 */
function isHigherRole(role, thanRole) {
    return exports.USER_ROLES.indexOf(role) > exports.USER_ROLES.indexOf(thanRole);
}
//# sourceMappingURL=permissions.js.map