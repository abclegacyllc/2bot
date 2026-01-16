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
 */
export interface SafeDepartment {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  maxWorkflows: number | null;
  maxPlugins: number | null;
  maxApiCalls: number | null;
  maxStorage: number | null;
  memberCount: number;
  workflowCount: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Convert Department to SafeDepartment
 */
export function toSafeDepartment(
  dept: DepartmentWithMemberCount
): SafeDepartment {
  return {
    id: dept.id,
    organizationId: dept.organizationId,
    name: dept.name,
    description: dept.description,
    maxWorkflows: dept.maxWorkflows,
    maxPlugins: dept.maxPlugins,
    maxApiCalls: dept.maxApiCalls,
    maxStorage: dept.maxStorage,
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
 */
export interface DeptMemberWithUser {
  id: string;
  role: DepartmentRole;
  maxWorkflows: number | null;
  maxPlugins: number | null;
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
 */
export interface UpdateDeptMemberRequest {
  role?: DepartmentRole;
  maxWorkflows?: number | null;
  maxPlugins?: number | null;
}

/**
 * Department quotas
 */
export interface DeptQuotas {
  maxWorkflows?: number | null;
  maxPlugins?: number | null;
  maxApiCalls?: number | null;
  maxStorage?: number | null;
}

/**
 * Member quotas
 */
export interface MemberQuotas {
  maxWorkflows?: number | null;
  maxPlugins?: number | null;
}
