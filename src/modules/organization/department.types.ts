/**
 * Department Types
 *
 * Type definitions for department management.
 *
 * @module modules/organization/department.types
 */

import type {
    Department,
    DepartmentRole,
} from "@prisma/client";

// Re-export Prisma types
export type {
    Department,
    DepartmentMember,
    DepartmentRole
} from "@prisma/client";

// ===========================================
// Department Types
// ===========================================

/**
 * Department with member count
 */
export interface DepartmentWithMemberCount extends Department {
  _count: {
    members: number;
    workflows: number;
  };
}

/**
 * Safe department for API responses
 * 
 * NOTE: Quota/allocation fields are NOT included here.
 * Use DeptAllocation from allocation.service for resource limits.
 * This keeps department info separate from resource management.
 */
export interface SafeDepartment {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  memberCount: number;
  workflowCount: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Convert Department to SafeDepartment
 * 
 * NOTE: Quota/allocation fields are managed separately via DeptAllocation.
 * Use allocationService.getDeptAllocation() for resource limits.
 */
export function toSafeDepartment(
  dept: DepartmentWithMemberCount
): SafeDepartment {
  return {
    id: dept.id,
    organizationId: dept.organizationId,
    name: dept.name,
    description: dept.description,
    memberCount: dept._count.members,
    workflowCount: dept._count.workflows,
    isActive: dept.isActive,
    createdAt: dept.createdAt,
    updatedAt: dept.updatedAt,
  };
}

// ===========================================
// Department Member Types
// ===========================================

/**
 * Department member with user details
 * 
 * NOTE: Quota/allocation fields are NOT included here.
 * Use MemberAllocation from allocation.service for resource limits.
 */
export interface DeptMemberWithUser {
  id: string;
  role: DepartmentRole;
  user: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
  };
  createdAt: Date;
}

// ===========================================
// Request DTOs
// ===========================================

/**
 * Create department request
 */
export interface CreateDeptRequest {
  name: string;
  description?: string;
}

/**
 * Update department request
 */
export interface UpdateDeptRequest {
  name?: string;
  description?: string | null;
  isActive?: boolean;
}

/**
 * Add department member request
 */
export interface AddDeptMemberRequest {
  userId: string;
  role?: DepartmentRole;
}

/**
 * Update department member request
 * 
 * NOTE: Quota/allocation updates are handled separately via
 * allocationService.setMemberAllocation() with MemberAllocationInput.
 */
export interface UpdateDeptMemberRequest {
  role?: DepartmentRole;
}

// ===========================================
// Legacy Quota Types - REMOVED
// ===========================================
// 
// DeptQuotas and MemberQuotas interfaces have been removed.
// Use the new 3-pool resource system instead:
// 
// For department allocations:
//   import { DeptAllocationInput } from '@/modules/resource';
// 
// For member allocations:
//   import { MemberAllocationInput } from '@/modules/resource';
// 
// These provide the full 3-pool structure:
//   - Automation: maxGateways, maxPlugins, maxWorkflows
//   - Workspace: ramMb, cpuCores, storageMb
//   - Budget: creditBudget
//
