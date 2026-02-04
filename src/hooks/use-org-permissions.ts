/**
 * useOrgPermissions Hook
 *
 * Provides permission checking for organization contexts.
 * Uses org-permissions single source of truth.
 *
 * @module hooks/use-org-permissions
 */

"use client";

import {
    canModifyUserRole,
    canRemoveMember,
    getAssignableRoles,
    getOrgPermissions,
    hasAllOrgPermissions,
    hasAnyOrgPermission,
    hasOrgPermission,
    type OrgPermission,
    type OrgRole,
} from "@/shared/constants/org-permissions";
import { useMemo } from "react";
import { useOrganization } from "./use-organization";

interface OrgPermissionsResult {
  /** Check if user has a specific permission */
  can: (permission: OrgPermission) => boolean;
  /** Check if user has ALL of the specified permissions */
  canAll: (permissions: OrgPermission[]) => boolean;
  /** Check if user has ANY of the specified permissions */
  canAny: (permissions: OrgPermission[]) => boolean;
  /** Get all permissions the user has */
  permissions: OrgPermission[];
  /** User's role in the organization */
  role: OrgRole | null;
  /** Check if user can modify another user's role */
  canModifyRole: (targetRole: OrgRole, newRole?: OrgRole) => boolean;
  /** Check if user can remove another member */
  canRemove: (targetRole: OrgRole) => boolean;
  /** Get roles the user can assign to others */
  assignableRoles: OrgRole[];
  /** Whether permissions are loaded (org found) */
  isReady: boolean;
}

/**
 * Hook to check organization permissions.
 * 
 * Usage:
 * ```tsx
 * const { can, canAll, role } = useOrgPermissions();
 * 
 * // Check single permission
 * {can('org:members:invite') && <InviteButton />}
 * 
 * // Check multiple permissions (all required)
 * {canAll(['org:billing:view', 'org:billing:manage']) && <BillingAdmin />}
 * 
 * // Check any of multiple permissions
 * {canAny(['org:gateways:create', 'org:plugins:install']) && <ResourceActions />}
 * ```
 */
export function useOrgPermissions(): OrgPermissionsResult {
  const { orgRole, isFound, isLoading } = useOrganization();

  const result = useMemo(() => {
    const role = orgRole as OrgRole | null;
    const isReady = isFound && !isLoading && role !== null;

    if (!role) {
      return {
        can: () => false,
        canAll: () => false,
        canAny: () => false,
        permissions: [],
        role: null,
        canModifyRole: () => false,
        canRemove: () => false,
        assignableRoles: [],
        isReady: false,
      };
    }

    return {
      can: (permission: OrgPermission) => hasOrgPermission(role, permission),
      canAll: (permissions: OrgPermission[]) => hasAllOrgPermissions(role, permissions),
      canAny: (permissions: OrgPermission[]) => hasAnyOrgPermission(role, permissions),
      permissions: getOrgPermissions(role),
      role,
      canModifyRole: (targetRole: OrgRole, newRole?: OrgRole) => 
        canModifyUserRole(role, targetRole, newRole),
      canRemove: (targetRole: OrgRole) => canRemoveMember(role, targetRole),
      assignableRoles: getAssignableRoles(role),
      isReady,
    };
  }, [orgRole, isFound, isLoading]);

  return result;
}

/**
 * Convenience hooks for common permission patterns
 */

/** Check if user can manage billing */
export function useCanManageBilling(): boolean {
  const { can } = useOrgPermissions();
  return can('org:billing:manage');
}

/** Check if user can invite members */
export function useCanInviteMembers(): boolean {
  const { can } = useOrgPermissions();
  return can('org:members:invite');
}

/** Check if user can manage settings */
export function useCanManageSettings(): boolean {
  const { can } = useOrgPermissions();
  return can('org:settings:update');
}

/** Check if user can create gateways */
export function useCanCreateGateways(): boolean {
  const { can } = useOrgPermissions();
  return can('org:gateways:create');
}

/** Check if user is org admin or above */
export function useIsOrgAdmin(): boolean {
  const { role } = useOrgPermissions();
  return role === 'ORG_ADMIN' || role === 'ORG_OWNER';
}

/** Check if user is org owner */
export function useIsOrgOwner(): boolean {
  const { role } = useOrgPermissions();
  return role === 'ORG_OWNER';
}
