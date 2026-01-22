/**
 * Quota Allocation Types
 *
 * Types for department and member quota allocation system.
 * Admins allocate org resources to departments,
 * Managers allocate department resources to members.
 *
 * @module modules/quota/quota-allocation.types
 */

import type { AllocationMode } from '@prisma/client';

// ===========================================
// Quota Allocation Values
// ===========================================

/**
 * Represents allocatable resource values
 * Used for both department and member allocations
 */
export interface QuotaAllocation {
  maxGateways?: number | null;
  maxWorkflows?: number | null;
  maxPlugins?: number | null;
  aiTokenBudget?: number | null;
  maxRamMb?: number | null;
  maxCpuCores?: number | null;
  maxStorageMb?: number | null;
}

/**
 * Allocation with mode (how strictly to enforce)
 */
export interface AllocationWithMode extends QuotaAllocation {
  allocMode: AllocationMode;
}

// ===========================================
// Department Allocation Types
// ===========================================

/**
 * Request to set department allocation (Admin action)
 */
export interface SetDeptAllocationRequest extends QuotaAllocation {
  allocMode?: AllocationMode;
}

/**
 * Department allocation response (from DB)
 */
export interface DeptAllocationResponse {
  id: string;
  departmentId: string;
  departmentName?: string;
  maxGateways: number | null;
  maxWorkflows: number | null;
  maxPlugins: number | null;
  aiTokenBudget: number | null;
  maxRamMb: number | null;
  maxCpuCores: number | null;
  maxStorageMb: number | null;
  allocMode: AllocationMode;
  setById: string;
  setByName?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ===========================================
// Member Allocation Types
// ===========================================

/**
 * Request to set member allocation (Manager action)
 */
export interface SetMemberAllocationRequest extends QuotaAllocation {
  allocMode?: AllocationMode;
}

/**
 * Member allocation response (from DB)
 */
export interface MemberAllocationResponse {
  id: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  departmentId: string;
  departmentName?: string;
  maxGateways: number | null;
  maxWorkflows: number | null;
  aiTokenBudget: number | null;
  maxRamMb: number | null;
  maxCpuCores: number | null;
  maxStorageMb: number | null;
  allocMode: AllocationMode;
  setById: string;
  setByName?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ===========================================
// Validation Types
// ===========================================

/**
 * Validation error detail
 */
export interface ValidationError {
  field: string;
  message: string;
  current?: number;
  requested?: number;
  available?: number;
}

/**
 * Result of allocation validation
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

// ===========================================
// Unallocated Resources Types
// ===========================================

/**
 * Resources remaining in pool after allocations
 */
export interface UnallocatedResources {
  gateways: number | null;       // null = unlimited
  workflows: number | null;
  plugins: number | null;
  aiTokenBudget: number | null;
  ramMb: number | null;
  cpuCores: number | null;
  storageMb: number | null;
}

// ===========================================
// Summary Types
// ===========================================

/**
 * Summary of allocations for an organization
 */
export interface OrgAllocationSummary {
  /** Total org limits from plan */
  orgLimits: QuotaAllocation;
  /** Sum of all department allocations */
  allocatedToDepts: QuotaAllocation;
  /** Remaining after dept allocations */
  unallocated: UnallocatedResources;
  /** Number of departments with allocations */
  deptCount: number;
}

/**
 * Summary of allocations for a department
 */
export interface DeptAllocationSummary {
  /** Department's allocation from org */
  deptAllocation: QuotaAllocation | null;
  /** Sum of all member allocations */
  allocatedToMembers: QuotaAllocation;
  /** Remaining after member allocations */
  unallocated: UnallocatedResources;
  /** Number of members with allocations */
  memberCount: number;
}
