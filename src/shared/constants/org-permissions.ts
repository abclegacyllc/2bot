/**
 * Organization Role Permissions - Single Source of Truth
 * 
 * This file defines all permissions for organization roles.
 * Use this file for consistent permission checking across:
 * - Backend route middleware
 * - Frontend UI conditional rendering
 * - API authorization
 * 
 * Role Hierarchy (highest to lowest):
 * - ORG_OWNER (level 4): Full control over organization
 * - ORG_ADMIN (level 3): Manage members, settings, and resources
 * - DEPT_MANAGER (level 2): Manage own department resources
 * - ORG_MEMBER (level 1): Read access, use assigned resources
 * 
 * NOTE: OrgRole type is defined in permissions.ts, re-exported here for convenience
 */

import { type OrgRole, ORG_ROLES } from './permissions';

// Re-export for convenience
export { ORG_ROLES, type OrgRole };

// ===========================================
// Type Definitions
// ===========================================

export type OrgPermission =
  // Organization
  | 'org:view'
  | 'org:update'
  | 'org:delete'
  | 'org:transfer'
  // Members
  | 'org:members:list'
  | 'org:members:invite'
  | 'org:members:remove'
  | 'org:members:update_role'
  // Invitations
  | 'org:invites:list'
  | 'org:invites:cancel'
  | 'org:invites:resend'
  // Departments
  | 'org:departments:list'
  | 'org:departments:view'
  | 'org:departments:create'
  | 'org:departments:update'
  | 'org:departments:delete'
  | 'org:departments:manage_members'
  | 'org:departments:manage_quotas'
  // Gateways
  | 'org:gateways:list'
  | 'org:gateways:view'
  | 'org:gateways:create'
  | 'org:gateways:update'
  | 'org:gateways:delete'
  | 'org:gateways:test'
  | 'org:gateways:assign_department'
  // Plugins
  | 'org:plugins:list'
  | 'org:plugins:view'
  | 'org:plugins:install'
  | 'org:plugins:uninstall'
  | 'org:plugins:configure'
  | 'org:plugins:toggle'
  | 'org:plugins:assign_department'
  // Workflows
  | 'org:workflows:list'
  | 'org:workflows:view'
  | 'org:workflows:create'
  | 'org:workflows:update'
  | 'org:workflows:delete'
  | 'org:workflows:execute'
  | 'org:workflows:assign_department'
  // Billing
  | 'org:billing:view'
  | 'org:billing:manage'
  | 'org:billing:update_payment'
  // Usage & Quotas
  | 'org:usage:view'
  | 'org:usage:view_all'
  // Settings
  | 'org:settings:view'
  | 'org:settings:update'
  // Audit Logs
  | 'org:audit:view';

// ===========================================
// Role Constants
// ===========================================

export const ORG_ROLE_HIERARCHY: Record<OrgRole, number> = {
  ORG_OWNER: 4,
  ORG_ADMIN: 3,
  DEPT_MANAGER: 2,
  ORG_MEMBER: 1,
};

export const ORG_ROLE_DISPLAY_NAMES: Record<OrgRole, string> = {
  ORG_OWNER: 'Owner',
  ORG_ADMIN: 'Admin',
  DEPT_MANAGER: 'Department Manager',
  ORG_MEMBER: 'Member',
};

export const ORG_ROLE_DESCRIPTIONS: Record<OrgRole, string> = {
  ORG_OWNER: 'Full control over the organization including billing and deletion',
  ORG_ADMIN: 'Manage members, settings, and all organization resources',
  DEPT_MANAGER: 'Manage resources within assigned departments',
  ORG_MEMBER: 'View and use assigned resources',
};

// ===========================================
// Permission Matrix - Single Source of Truth
// ===========================================
// Maps each permission to the minimum required role level.
// Higher roles automatically inherit permissions from lower roles.

export const ORG_PERMISSION_MATRIX: Record<OrgPermission, OrgRole> = {
  // Organization Management
  'org:view': 'ORG_MEMBER',           // All members can view org details
  'org:update': 'ORG_ADMIN',          // Admins+ can update org settings
  'org:delete': 'ORG_OWNER',          // Only owner can delete org
  'org:transfer': 'ORG_OWNER',        // Only owner can transfer ownership

  // Member Management
  'org:members:list': 'ORG_MEMBER',        // All members can see member list
  'org:members:invite': 'ORG_ADMIN',       // Admins+ can invite members
  'org:members:remove': 'ORG_ADMIN',       // Admins+ can remove members
  'org:members:update_role': 'ORG_ADMIN',  // Admins+ can change roles (with restrictions)

  // Invitation Management
  'org:invites:list': 'ORG_ADMIN',     // Admins+ can see pending invites
  'org:invites:cancel': 'ORG_ADMIN',   // Admins+ can cancel invites
  'org:invites:resend': 'ORG_ADMIN',   // Admins+ can resend invites

  // Department Management
  'org:departments:list': 'ORG_MEMBER',           // All members can list departments
  'org:departments:view': 'ORG_MEMBER',           // All members can view department details
  'org:departments:create': 'ORG_ADMIN',          // Admins+ can create departments
  'org:departments:update': 'DEPT_MANAGER',       // Managers+ can update their departments
  'org:departments:delete': 'ORG_ADMIN',          // Admins+ can delete departments
  'org:departments:manage_members': 'DEPT_MANAGER', // Managers+ can manage dept members
  'org:departments:manage_quotas': 'ORG_ADMIN',   // Admins+ can set dept quotas

  // Gateway Management
  'org:gateways:list': 'ORG_MEMBER',              // All members can list gateways
  'org:gateways:view': 'ORG_MEMBER',              // All members can view gateway details
  'org:gateways:create': 'ORG_ADMIN',             // Admins+ can create gateways
  'org:gateways:update': 'DEPT_MANAGER',          // Managers+ can update gateways
  'org:gateways:delete': 'ORG_ADMIN',             // Admins+ can delete gateways
  'org:gateways:test': 'ORG_MEMBER',              // All members can test gateways
  'org:gateways:assign_department': 'ORG_ADMIN', // Admins+ can assign to departments

  // Plugin Management
  'org:plugins:list': 'ORG_MEMBER',               // All members can list plugins
  'org:plugins:view': 'ORG_MEMBER',               // All members can view plugin details
  'org:plugins:install': 'ORG_ADMIN',             // Admins+ can install plugins
  'org:plugins:uninstall': 'ORG_ADMIN',           // Admins+ can uninstall plugins
  'org:plugins:configure': 'DEPT_MANAGER',        // Managers+ can configure plugins
  'org:plugins:toggle': 'DEPT_MANAGER',           // Managers+ can enable/disable plugins
  'org:plugins:assign_department': 'ORG_ADMIN',  // Admins+ can assign to departments

  // Workflow Management
  'org:workflows:list': 'ORG_MEMBER',             // All members can list workflows
  'org:workflows:view': 'ORG_MEMBER',             // All members can view workflow details
  'org:workflows:create': 'DEPT_MANAGER',         // Managers+ can create workflows
  'org:workflows:update': 'DEPT_MANAGER',         // Managers+ can update workflows
  'org:workflows:delete': 'ORG_ADMIN',            // Admins+ can delete workflows
  'org:workflows:execute': 'ORG_MEMBER',          // All members can execute workflows
  'org:workflows:assign_department': 'ORG_ADMIN', // Admins+ can assign to departments

  // Billing Management
  'org:billing:view': 'ORG_ADMIN',            // Admins+ can view billing
  'org:billing:manage': 'ORG_OWNER',          // Only owner can change plans
  'org:billing:update_payment': 'ORG_OWNER',  // Only owner can update payment

  // Usage & Quotas
  'org:usage:view': 'ORG_MEMBER',         // All members can view their usage
  'org:usage:view_all': 'ORG_ADMIN',      // Admins+ can view all usage

  // Settings
  'org:settings:view': 'ORG_MEMBER',      // All members can view settings
  'org:settings:update': 'ORG_ADMIN',     // Admins+ can update settings

  // Audit Logs
  'org:audit:view': 'ORG_ADMIN',          // Admins+ can view audit logs
};

// ===========================================
// Permission Checking Functions
// ===========================================

/**
 * Check if a role meets the minimum required level
 * @param userRole - The user's role in the organization
 * @param minRole - The minimum required role
 * @returns true if user's role is >= minRole
 */
export function hasMinRole(userRole: OrgRole, minRole: OrgRole): boolean {
  return ORG_ROLE_HIERARCHY[userRole] >= ORG_ROLE_HIERARCHY[minRole];
}

/**
 * Check if a role has a specific permission
 * @param userRole - The user's role in the organization
 * @param permission - The permission to check
 * @returns true if the role has the permission
 */
export function hasOrgPermission(userRole: OrgRole, permission: OrgPermission): boolean {
  const requiredRole = ORG_PERMISSION_MATRIX[permission];
  return hasMinRole(userRole, requiredRole);
}

/**
 * Check if a role has ALL of the specified permissions
 * @param userRole - The user's role in the organization
 * @param permissions - Array of permissions to check
 * @returns true if the role has ALL permissions
 */
export function hasAllOrgPermissions(userRole: OrgRole, permissions: OrgPermission[]): boolean {
  return permissions.every(permission => hasOrgPermission(userRole, permission));
}

/**
 * Check if a role has ANY of the specified permissions
 * @param userRole - The user's role in the organization
 * @param permissions - Array of permissions to check
 * @returns true if the role has at least one permission
 */
export function hasAnyOrgPermission(userRole: OrgRole, permissions: OrgPermission[]): boolean {
  return permissions.some(permission => hasOrgPermission(userRole, permission));
}

/**
 * Get all permissions for a specific role
 * @param userRole - The user's role
 * @returns Array of all permissions the role has
 */
export function getOrgPermissions(userRole: OrgRole): OrgPermission[] {
  return (Object.keys(ORG_PERMISSION_MATRIX) as OrgPermission[]).filter(
    permission => hasOrgPermission(userRole, permission)
  );
}

/**
 * Get the minimum required role for a permission
 * @param permission - The permission to check
 * @returns The minimum required role
 */
export function getRequiredRole(permission: OrgPermission): OrgRole {
  return ORG_PERMISSION_MATRIX[permission];
}

// ===========================================
// Role Comparison Functions
// ===========================================

/**
 * Check if orgRoleA is higher than orgRoleB in the org hierarchy
 */
export function isHigherOrgRole(roleA: OrgRole, roleB: OrgRole): boolean {
  return ORG_ROLE_HIERARCHY[roleA] > ORG_ROLE_HIERARCHY[roleB];
}

/**
 * Check if orgRoleA is equal to or higher than orgRoleB
 */
export function isAtLeastOrgRole(roleA: OrgRole, roleB: OrgRole): boolean {
  return ORG_ROLE_HIERARCHY[roleA] >= ORG_ROLE_HIERARCHY[roleB];
}

/**
 * Get the highest role from an array
 */
export function getHighestOrgRole(roles: OrgRole[]): OrgRole {
  return roles.reduce((highest, role) => 
    ORG_ROLE_HIERARCHY[role] > ORG_ROLE_HIERARCHY[highest] ? role : highest
  );
}

/**
 * Get roles that a user can assign to others
 * Users can only assign roles lower than their own (owners can assign any)
 */
export function getAssignableRoles(userRole: OrgRole): OrgRole[] {
  if (userRole === 'ORG_OWNER') {
    // Owners can assign any role except owner (special transfer process)
    return ['ORG_ADMIN', 'DEPT_MANAGER', 'ORG_MEMBER'];
  }
  
  if (userRole === 'ORG_ADMIN') {
    // Admins can assign lower roles
    return ['DEPT_MANAGER', 'ORG_MEMBER'];
  }
  
  // Others cannot assign roles
  return [];
}

/**
 * Check if a user can modify another user's role
 */
export function canModifyUserRole(
  actorRole: OrgRole, 
  targetCurrentRole: OrgRole, 
  targetNewRole?: OrgRole
): boolean {
  // Can't modify if same or higher level
  if (!isHigherOrgRole(actorRole, targetCurrentRole)) {
    return false;
  }
  
  // If setting a new role, must be able to assign it
  if (targetNewRole) {
    const assignable = getAssignableRoles(actorRole);
    return assignable.includes(targetNewRole);
  }
  
  return true;
}

/**
 * Check if a user can remove another member
 */
export function canRemoveMember(actorRole: OrgRole, targetRole: OrgRole): boolean {
  // Must have remove permission
  if (!hasOrgPermission(actorRole, 'org:members:remove')) {
    return false;
  }
  
  // Can't remove someone of same or higher level
  return isHigherOrgRole(actorRole, targetRole);
}

// ===========================================
// Permission Groups (for UI rendering)
// ===========================================

export const ORG_PERMISSION_GROUPS = {
  organization: {
    label: 'Organization',
    permissions: ['org:view', 'org:update', 'org:delete', 'org:transfer'] as OrgPermission[],
  },
  members: {
    label: 'Members',
    permissions: ['org:members:list', 'org:members:invite', 'org:members:remove', 'org:members:update_role'] as OrgPermission[],
  },
  invitations: {
    label: 'Invitations',
    permissions: ['org:invites:list', 'org:invites:cancel', 'org:invites:resend'] as OrgPermission[],
  },
  departments: {
    label: 'Departments',
    permissions: [
      'org:departments:list', 'org:departments:view', 'org:departments:create',
      'org:departments:update', 'org:departments:delete', 'org:departments:manage_members',
      'org:departments:manage_quotas'
    ] as OrgPermission[],
  },
  gateways: {
    label: 'Gateways',
    permissions: [
      'org:gateways:list', 'org:gateways:view', 'org:gateways:create',
      'org:gateways:update', 'org:gateways:delete', 'org:gateways:test',
      'org:gateways:assign_department'
    ] as OrgPermission[],
  },
  plugins: {
    label: 'Plugins',
    permissions: [
      'org:plugins:list', 'org:plugins:view', 'org:plugins:install',
      'org:plugins:uninstall', 'org:plugins:configure', 'org:plugins:toggle',
      'org:plugins:assign_department'
    ] as OrgPermission[],
  },
  workflows: {
    label: 'Workflows',
    permissions: [
      'org:workflows:list', 'org:workflows:view', 'org:workflows:create',
      'org:workflows:update', 'org:workflows:delete', 'org:workflows:execute',
      'org:workflows:assign_department'
    ] as OrgPermission[],
  },
  billing: {
    label: 'Billing',
    permissions: ['org:billing:view', 'org:billing:manage', 'org:billing:update_payment'] as OrgPermission[],
  },
  usage: {
    label: 'Usage',
    permissions: ['org:usage:view', 'org:usage:view_all'] as OrgPermission[],
  },
  settings: {
    label: 'Settings',
    permissions: ['org:settings:view', 'org:settings:update'] as OrgPermission[],
  },
  audit: {
    label: 'Audit Logs',
    permissions: ['org:audit:view'] as OrgPermission[],
  },
} as const;

// ===========================================
// Permission Labels (for UI)
// ===========================================

export const ORG_PERMISSION_LABELS: Record<OrgPermission, string> = {
  'org:view': 'View organization details',
  'org:update': 'Update organization settings',
  'org:delete': 'Delete organization',
  'org:transfer': 'Transfer ownership',
  
  'org:members:list': 'View member list',
  'org:members:invite': 'Invite new members',
  'org:members:remove': 'Remove members',
  'org:members:update_role': 'Change member roles',
  
  'org:invites:list': 'View pending invitations',
  'org:invites:cancel': 'Cancel invitations',
  'org:invites:resend': 'Resend invitations',
  
  'org:departments:list': 'List departments',
  'org:departments:view': 'View department details',
  'org:departments:create': 'Create departments',
  'org:departments:update': 'Update departments',
  'org:departments:delete': 'Delete departments',
  'org:departments:manage_members': 'Manage department members',
  'org:departments:manage_quotas': 'Set department quotas',
  
  'org:gateways:list': 'List gateways',
  'org:gateways:view': 'View gateway details',
  'org:gateways:create': 'Create gateways',
  'org:gateways:update': 'Update gateways',
  'org:gateways:delete': 'Delete gateways',
  'org:gateways:test': 'Test gateways',
  'org:gateways:assign_department': 'Assign gateways to departments',
  
  'org:plugins:list': 'List plugins',
  'org:plugins:view': 'View plugin details',
  'org:plugins:install': 'Install plugins',
  'org:plugins:uninstall': 'Uninstall plugins',
  'org:plugins:configure': 'Configure plugins',
  'org:plugins:toggle': 'Enable/disable plugins',
  'org:plugins:assign_department': 'Assign plugins to departments',
  
  'org:workflows:list': 'List workflows',
  'org:workflows:view': 'View workflow details',
  'org:workflows:create': 'Create workflows',
  'org:workflows:update': 'Update workflows',
  'org:workflows:delete': 'Delete workflows',
  'org:workflows:execute': 'Execute workflows',
  'org:workflows:assign_department': 'Assign workflows to departments',
  
  'org:billing:view': 'View billing information',
  'org:billing:manage': 'Manage subscription',
  'org:billing:update_payment': 'Update payment method',
  
  'org:usage:view': 'View own usage',
  'org:usage:view_all': 'View all usage',
  
  'org:settings:view': 'View settings',
  'org:settings:update': 'Update settings',
  
  'org:audit:view': 'View audit logs',
};

// ===========================================
// Route to Permission Mapping (for middleware)
// ===========================================
// Maps API routes to required permissions for easy middleware use

export const ORG_ROUTE_PERMISSIONS = {
  // Organization
  'GET /orgs/:orgId': 'org:view',
  'PUT /orgs/:orgId': 'org:update',
  'DELETE /orgs/:orgId': 'org:delete',
  
  // Members
  'GET /orgs/:orgId/members': 'org:members:list',
  'POST /orgs/:orgId/members': 'org:members:invite',
  'DELETE /orgs/:orgId/members/:memberId': 'org:members:remove',
  'PUT /orgs/:orgId/members/:memberId': 'org:members:update_role',
  
  // Invitations
  'GET /orgs/:orgId/invites': 'org:invites:list',
  'DELETE /orgs/:orgId/invites/:inviteId': 'org:invites:cancel',
  'POST /orgs/:orgId/invites/:inviteId/resend': 'org:invites:resend',
  
  // Departments
  'GET /orgs/:orgId/departments': 'org:departments:list',
  'GET /orgs/:orgId/departments/:deptId': 'org:departments:view',
  'POST /orgs/:orgId/departments': 'org:departments:create',
  'PUT /orgs/:orgId/departments/:deptId': 'org:departments:update',
  'DELETE /orgs/:orgId/departments/:deptId': 'org:departments:delete',
  
  // Gateways
  'GET /orgs/:orgId/gateways': 'org:gateways:list',
  'GET /orgs/:orgId/gateways/:gatewayId': 'org:gateways:view',
  'POST /orgs/:orgId/gateways': 'org:gateways:create',
  'PUT /orgs/:orgId/gateways/:gatewayId': 'org:gateways:update',
  'DELETE /orgs/:orgId/gateways/:gatewayId': 'org:gateways:delete',
  'POST /orgs/:orgId/gateways/:gatewayId/test': 'org:gateways:test',
  
  // Plugins
  'GET /orgs/:orgId/plugins': 'org:plugins:list',
  'GET /orgs/:orgId/plugins/:pluginId': 'org:plugins:view',
  'POST /orgs/:orgId/plugins': 'org:plugins:install',
  'DELETE /orgs/:orgId/plugins/:pluginId': 'org:plugins:uninstall',
  'PUT /orgs/:orgId/plugins/:pluginId': 'org:plugins:configure',
  'POST /orgs/:orgId/plugins/:pluginId/toggle': 'org:plugins:toggle',
  
  // Billing
  'GET /orgs/:orgId/billing': 'org:billing:view',
  'POST /orgs/:orgId/billing/subscribe': 'org:billing:manage',
  'PUT /orgs/:orgId/billing/payment': 'org:billing:update_payment',
  
  // Usage
  'GET /orgs/:orgId/usage': 'org:usage:view',
  'GET /orgs/:orgId/usage/all': 'org:usage:view_all',
  
  // Settings
  'GET /orgs/:orgId/settings': 'org:settings:view',
  'PUT /orgs/:orgId/settings': 'org:settings:update',
  
  // Audit
  'GET /orgs/:orgId/audit': 'org:audit:view',
} as const;

// ===========================================
// Type Exports
// ===========================================

export type OrgRouteKey = keyof typeof ORG_ROUTE_PERMISSIONS;
export type OrgPermissionGroup = keyof typeof ORG_PERMISSION_GROUPS;
