/**
 * Permissions Configuration
 * 
 * Maps permissions to the roles that can perform them.
 * Used for authorization checks throughout the application.
 */

export const PERMISSIONS = {
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
} as const;

export type Permission = keyof typeof PERMISSIONS;

/**
 * Check if a user has a specific permission
 * @param userRole - The user's platform role
 * @param orgRole - The user's organization role (if any)
 * @param permission - The permission to check
 */
export function hasPermission(
  userRole: string,
  orgRole: string | null,
  permission: Permission
): boolean {
  const allowedRoles = PERMISSIONS[permission] as readonly string[];
  
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
export function getUserPermissions(
  userRole: string,
  orgRole: string | null
): Permission[] {
  return (Object.keys(PERMISSIONS) as Permission[]).filter(
    permission => hasPermission(userRole, orgRole, permission)
  );
}

/**
 * Check multiple permissions at once (AND logic)
 */
export function hasAllPermissions(
  userRole: string,
  orgRole: string | null,
  permissions: Permission[]
): boolean {
  return permissions.every(p => hasPermission(userRole, orgRole, p));
}

/**
 * Check multiple permissions at once (OR logic)
 */
export function hasAnyPermission(
  userRole: string,
  orgRole: string | null,
  permissions: Permission[]
): boolean {
  return permissions.some(p => hasPermission(userRole, orgRole, p));
}

/**
 * User roles in order of privilege (lowest to highest)
 */
export const USER_ROLES = [
  'MEMBER',
  'DEVELOPER',
  'SUPPORT',
  'ADMIN',
  'SUPER_ADMIN',
] as const;

export type UserRole = (typeof USER_ROLES)[number];

/**
 * Organization roles in order of privilege (lowest to highest)
 */
export const ORG_ROLES = [
  'ORG_MEMBER',
  'DEPT_MANAGER',
  'ORG_ADMIN',
  'ORG_OWNER',
] as const;

export type OrgRole = (typeof ORG_ROLES)[number];

/**
 * Check if a role has higher privilege than another
 */
export function isHigherRole(role: UserRole, thanRole: UserRole): boolean {
  return USER_ROLES.indexOf(role) > USER_ROLES.indexOf(thanRole);
}
