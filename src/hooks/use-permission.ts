/**
 * Permission Check Hook
 * 
 * Client-side permission checking based on user role.
 * This mirrors the server-side permission logic.
 * 
 * @module hooks/use-permission
 */

import { useAuth } from "@/components/providers/auth-provider";
import { PERMISSIONS, type Permission } from "@/shared/constants/permissions";

/**
 * Hook to check if current user has a specific permission
 */
export function usePermission(permission: Permission): boolean {
  const { user } = useAuth();
  
  if (!user) return false;
  
  const allowedRoles = PERMISSIONS[permission] as readonly string[];
  return allowedRoles.includes(user.role);
}

/**
 * Hook to check if current user has any of the specified permissions
 */
export function useAnyPermission(permissions: Permission[]): boolean {
  const { user } = useAuth();
  
  if (!user) return false;
  
  return permissions.some(permission => {
    const allowedRoles = PERMISSIONS[permission] as readonly string[];
    return allowedRoles.includes(user.role);
  });
}

/**
 * Hook to check if current user has all of the specified permissions
 */
export function useAllPermissions(permissions: Permission[]): boolean {
  const { user } = useAuth();
  
  if (!user) return false;
  
  return permissions.every(permission => {
    const allowedRoles = PERMISSIONS[permission] as readonly string[];
    return allowedRoles.includes(user.role);
  });
}

/**
 * Hook to get all permissions for current user
 */
export function useUserPermissions(): Permission[] {
  const { user } = useAuth();
  
  if (!user) return [];
  
  return (Object.keys(PERMISSIONS) as Permission[]).filter(permission => {
    const allowedRoles = PERMISSIONS[permission] as readonly string[];
    return allowedRoles.includes(user.role);
  });
}
