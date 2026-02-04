/**
 * Organization Permissions - Unit Tests
 */
import { describe, expect, it } from 'vitest';
import {
    ORG_PERMISSION_GROUPS,
    ORG_PERMISSION_LABELS,
    ORG_PERMISSION_MATRIX,
    ORG_ROLES,
    ORG_ROLE_DISPLAY_NAMES,
    ORG_ROLE_HIERARCHY,
    OrgPermission,
    canModifyUserRole,
    canRemoveMember,
    getAssignableRoles,
    getHighestOrgRole,
    getOrgPermissions,
    getRequiredRole,
    hasAllOrgPermissions,
    hasAnyOrgPermission,
    hasMinRole,
    hasOrgPermission,
    isAtLeastOrgRole,
    isHigherOrgRole
} from '../org-permissions';

describe('Organization Permissions', () => {
  describe('ORG_ROLES', () => {
    it('should have 4 roles in hierarchy order', () => {
      expect(ORG_ROLES).toEqual(['ORG_MEMBER', 'DEPT_MANAGER', 'ORG_ADMIN', 'ORG_OWNER']);
    });
  });

  describe('ORG_ROLE_HIERARCHY', () => {
    it('should have correct hierarchy values', () => {
      expect(ORG_ROLE_HIERARCHY.ORG_MEMBER).toBe(1);
      expect(ORG_ROLE_HIERARCHY.DEPT_MANAGER).toBe(2);
      expect(ORG_ROLE_HIERARCHY.ORG_ADMIN).toBe(3);
      expect(ORG_ROLE_HIERARCHY.ORG_OWNER).toBe(4);
    });
  });

  describe('hasMinRole', () => {
    it('should return true when user role meets minimum', () => {
      expect(hasMinRole('ORG_OWNER', 'ORG_MEMBER')).toBe(true);
      expect(hasMinRole('ORG_ADMIN', 'ORG_ADMIN')).toBe(true);
      expect(hasMinRole('DEPT_MANAGER', 'ORG_MEMBER')).toBe(true);
    });

    it('should return false when user role is below minimum', () => {
      expect(hasMinRole('ORG_MEMBER', 'ORG_ADMIN')).toBe(false);
      expect(hasMinRole('DEPT_MANAGER', 'ORG_OWNER')).toBe(false);
    });
  });

  describe('hasOrgPermission', () => {
    it('should grant org:view to all members', () => {
      expect(hasOrgPermission('ORG_MEMBER', 'org:view')).toBe(true);
      expect(hasOrgPermission('DEPT_MANAGER', 'org:view')).toBe(true);
      expect(hasOrgPermission('ORG_ADMIN', 'org:view')).toBe(true);
      expect(hasOrgPermission('ORG_OWNER', 'org:view')).toBe(true);
    });

    it('should restrict org:delete to owner only', () => {
      expect(hasOrgPermission('ORG_MEMBER', 'org:delete')).toBe(false);
      expect(hasOrgPermission('DEPT_MANAGER', 'org:delete')).toBe(false);
      expect(hasOrgPermission('ORG_ADMIN', 'org:delete')).toBe(false);
      expect(hasOrgPermission('ORG_OWNER', 'org:delete')).toBe(true);
    });

    it('should grant org:members:invite to admins+', () => {
      expect(hasOrgPermission('ORG_MEMBER', 'org:members:invite')).toBe(false);
      expect(hasOrgPermission('DEPT_MANAGER', 'org:members:invite')).toBe(false);
      expect(hasOrgPermission('ORG_ADMIN', 'org:members:invite')).toBe(true);
      expect(hasOrgPermission('ORG_OWNER', 'org:members:invite')).toBe(true);
    });

    it('should grant org:departments:update to dept managers+', () => {
      expect(hasOrgPermission('ORG_MEMBER', 'org:departments:update')).toBe(false);
      expect(hasOrgPermission('DEPT_MANAGER', 'org:departments:update')).toBe(true);
      expect(hasOrgPermission('ORG_ADMIN', 'org:departments:update')).toBe(true);
      expect(hasOrgPermission('ORG_OWNER', 'org:departments:update')).toBe(true);
    });
  });

  describe('hasAllOrgPermissions', () => {
    it('should return true when user has all permissions', () => {
      expect(hasAllOrgPermissions('ORG_ADMIN', ['org:view', 'org:members:list', 'org:members:invite'])).toBe(true);
    });

    it('should return false when user lacks any permission', () => {
      expect(hasAllOrgPermissions('ORG_ADMIN', ['org:view', 'org:delete'])).toBe(false);
    });
  });

  describe('hasAnyOrgPermission', () => {
    it('should return true when user has at least one permission', () => {
      expect(hasAnyOrgPermission('ORG_MEMBER', ['org:view', 'org:delete'])).toBe(true);
    });

    it('should return false when user has none of the permissions', () => {
      expect(hasAnyOrgPermission('ORG_MEMBER', ['org:delete', 'org:transfer'])).toBe(false);
    });
  });

  describe('getOrgPermissions', () => {
    it('should return all permissions for owner', () => {
      const ownerPermissions = getOrgPermissions('ORG_OWNER');
      expect(ownerPermissions).toContain('org:view');
      expect(ownerPermissions).toContain('org:delete');
      expect(ownerPermissions).toContain('org:transfer');
      expect(ownerPermissions).toContain('org:billing:manage');
    });

    it('should return limited permissions for member', () => {
      const memberPermissions = getOrgPermissions('ORG_MEMBER');
      expect(memberPermissions).toContain('org:view');
      expect(memberPermissions).toContain('org:gateways:list');
      expect(memberPermissions).not.toContain('org:delete');
      expect(memberPermissions).not.toContain('org:members:invite');
    });
  });

  describe('getRequiredRole', () => {
    it('should return correct required role for permissions', () => {
      expect(getRequiredRole('org:view')).toBe('ORG_MEMBER');
      expect(getRequiredRole('org:delete')).toBe('ORG_OWNER');
      expect(getRequiredRole('org:members:invite')).toBe('ORG_ADMIN');
      expect(getRequiredRole('org:departments:update')).toBe('DEPT_MANAGER');
    });
  });

  describe('isHigherOrgRole', () => {
    it('should return true when roleA is higher', () => {
      expect(isHigherOrgRole('ORG_OWNER', 'ORG_ADMIN')).toBe(true);
      expect(isHigherOrgRole('ORG_ADMIN', 'DEPT_MANAGER')).toBe(true);
      expect(isHigherOrgRole('DEPT_MANAGER', 'ORG_MEMBER')).toBe(true);
    });

    it('should return false when roleA is same or lower', () => {
      expect(isHigherOrgRole('ORG_ADMIN', 'ORG_OWNER')).toBe(false);
      expect(isHigherOrgRole('ORG_ADMIN', 'ORG_ADMIN')).toBe(false);
    });
  });

  describe('isAtLeastOrgRole', () => {
    it('should return true when roleA is same or higher', () => {
      expect(isAtLeastOrgRole('ORG_OWNER', 'ORG_ADMIN')).toBe(true);
      expect(isAtLeastOrgRole('ORG_ADMIN', 'ORG_ADMIN')).toBe(true);
    });

    it('should return false when roleA is lower', () => {
      expect(isAtLeastOrgRole('ORG_MEMBER', 'ORG_ADMIN')).toBe(false);
    });
  });

  describe('getHighestOrgRole', () => {
    it('should return highest role from array', () => {
      expect(getHighestOrgRole(['ORG_MEMBER', 'ORG_ADMIN'])).toBe('ORG_ADMIN');
      expect(getHighestOrgRole(['DEPT_MANAGER', 'ORG_OWNER', 'ORG_MEMBER'])).toBe('ORG_OWNER');
    });
  });

  describe('getAssignableRoles', () => {
    it('should allow owner to assign all except owner', () => {
      expect(getAssignableRoles('ORG_OWNER')).toEqual(['ORG_ADMIN', 'DEPT_MANAGER', 'ORG_MEMBER']);
    });

    it('should allow admin to assign lower roles', () => {
      expect(getAssignableRoles('ORG_ADMIN')).toEqual(['DEPT_MANAGER', 'ORG_MEMBER']);
    });

    it('should not allow members to assign roles', () => {
      expect(getAssignableRoles('ORG_MEMBER')).toEqual([]);
      expect(getAssignableRoles('DEPT_MANAGER')).toEqual([]);
    });
  });

  describe('canModifyUserRole', () => {
    it('should allow owner to modify admin roles', () => {
      expect(canModifyUserRole('ORG_OWNER', 'ORG_ADMIN', 'DEPT_MANAGER')).toBe(true);
    });

    it('should not allow admin to modify owner role', () => {
      expect(canModifyUserRole('ORG_ADMIN', 'ORG_OWNER', 'ORG_ADMIN')).toBe(false);
    });

    it('should not allow modifying same level', () => {
      expect(canModifyUserRole('ORG_ADMIN', 'ORG_ADMIN', 'ORG_MEMBER')).toBe(false);
    });
  });

  describe('canRemoveMember', () => {
    it('should allow owner to remove admin', () => {
      expect(canRemoveMember('ORG_OWNER', 'ORG_ADMIN')).toBe(true);
    });

    it('should allow admin to remove member', () => {
      expect(canRemoveMember('ORG_ADMIN', 'ORG_MEMBER')).toBe(true);
    });

    it('should not allow member to remove anyone', () => {
      expect(canRemoveMember('ORG_MEMBER', 'ORG_MEMBER')).toBe(false);
    });

    it('should not allow removing same or higher level', () => {
      expect(canRemoveMember('ORG_ADMIN', 'ORG_ADMIN')).toBe(false);
      expect(canRemoveMember('ORG_ADMIN', 'ORG_OWNER')).toBe(false);
    });
  });

  describe('ORG_PERMISSION_LABELS', () => {
    it('should have labels for all permissions', () => {
      const allPermissions = Object.keys(ORG_PERMISSION_MATRIX) as OrgPermission[];
      allPermissions.forEach(permission => {
        expect(ORG_PERMISSION_LABELS[permission]).toBeDefined();
        expect(typeof ORG_PERMISSION_LABELS[permission]).toBe('string');
      });
    });
  });

  describe('ORG_PERMISSION_GROUPS', () => {
    it('should group permissions correctly', () => {
      expect(ORG_PERMISSION_GROUPS.organization.permissions).toContain('org:view');
      expect(ORG_PERMISSION_GROUPS.members.permissions).toContain('org:members:invite');
      expect(ORG_PERMISSION_GROUPS.gateways.permissions).toContain('org:gateways:create');
    });
  });

  describe('ORG_ROLE_DISPLAY_NAMES', () => {
    it('should have display names for all roles', () => {
      expect(ORG_ROLE_DISPLAY_NAMES.ORG_OWNER).toBe('Owner');
      expect(ORG_ROLE_DISPLAY_NAMES.ORG_ADMIN).toBe('Admin');
      expect(ORG_ROLE_DISPLAY_NAMES.DEPT_MANAGER).toBe('Department Manager');
      expect(ORG_ROLE_DISPLAY_NAMES.ORG_MEMBER).toBe('Member');
    });
  });
});
