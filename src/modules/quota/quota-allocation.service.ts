/**
 * Quota Allocation Service
 *
 * Manages department and member quota allocations.
 * - Admins allocate org pool resources to departments
 * - Managers allocate department resources to members
 *
 * Allocation Hierarchy:
 *   Org Pool (from plan) → DeptAllocation → MemberAllocation
 *
 * @module modules/quota/quota-allocation.service
 */

import { AllocationMode, type OrgRole } from '@prisma/client';
import { audit } from '@/lib/audit';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { ORG_PLAN_LIMITS, type OrgPlanType } from '@/shared/constants/org-plans';
import { AppError, ForbiddenError, NotFoundError } from '@/shared/errors';
import type { ServiceContext } from '@/shared/types/context';
import type {
  DeptAllocationResponse,
  DeptAllocationSummary,
  MemberAllocationResponse,
  OrgAllocationSummary,
  QuotaAllocation,
  SetDeptAllocationRequest,
  SetMemberAllocationRequest,
  UnallocatedResources,
  ValidationError,
  ValidationResult,
} from './quota-allocation.types';

const log = logger.child({ module: 'quota-allocation' });

// ===========================================
// Permission Helpers
// ===========================================

const ADMIN_ROLES: OrgRole[] = ['ORG_OWNER', 'ORG_ADMIN'];
const MANAGER_ROLES: OrgRole[] = ['ORG_OWNER', 'ORG_ADMIN', 'DEPT_MANAGER'];

async function getUserOrgRole(
  userId: string,
  organizationId: string
): Promise<OrgRole | null> {
  const membership = await prisma.membership.findUnique({
    where: {
      userId_organizationId: { userId, organizationId },
    },
    select: { role: true, status: true },
  });
  if (!membership || membership.status !== 'ACTIVE') return null;
  return membership.role;
}

function requireAdminRole(role: OrgRole | null, action: string): void {
  if (!role || !ADMIN_ROLES.includes(role)) {
    throw new ForbiddenError(`Admin access required to ${action}`);
  }
}

function requireManagerRole(role: OrgRole | null, action: string): void {
  if (!role || !MANAGER_ROLES.includes(role)) {
    throw new ForbiddenError(`Manager access required to ${action}`);
  }
}

// ===========================================
// Quota Allocation Service
// ===========================================

class QuotaAllocationServiceImpl {
  // =========================================
  // Department Allocations (Admin sets from org pool)
  // =========================================

  /**
   * Set or update department allocation
   * Only ORG_OWNER or ORG_ADMIN can do this
   */
  async setDeptAllocation(
    ctx: ServiceContext,
    departmentId: string,
    alloc: SetDeptAllocationRequest
  ): Promise<DeptAllocationResponse> {
    // Get department and verify org access
    const dept = await prisma.department.findUnique({
      where: { id: departmentId },
      include: { organization: true },
    });

    if (!dept) {
      throw new NotFoundError('Department not found');
    }

    // Check admin permission
    const role = await getUserOrgRole(ctx.userId, dept.organizationId);
    requireAdminRole(role, 'set department allocation');

    // Validate allocation doesn't exceed org pool
    const validation = await this.validateDepartmentAllocation(
      dept.organizationId,
      alloc,
      departmentId // exclude this dept from calculation
    );

    if (!validation.valid) {
      throw new AppError(
        `Allocation exceeds organization pool: ${validation.errors.map(e => e.message).join(', ')}`,
        'ALLOCATION_EXCEEDED',
        400
      );
    }

    // Upsert the allocation
    const deptAlloc = await prisma.deptAllocation.upsert({
      where: { departmentId },
      create: {
        departmentId,
        maxGateways: alloc.maxGateways ?? null,
        maxWorkflows: alloc.maxWorkflows ?? null,
        maxPlugins: alloc.maxPlugins ?? null,
        aiTokenBudget: alloc.aiTokenBudget ?? null,
        maxRamMb: alloc.maxRamMb ?? null,
        maxCpuCores: alloc.maxCpuCores ?? null,
        maxStorageMb: alloc.maxStorageMb ?? null,
        allocMode: alloc.allocMode ?? AllocationMode.SOFT_CAP,
        setById: ctx.userId,
      },
      update: {
        maxGateways: alloc.maxGateways ?? null,
        maxWorkflows: alloc.maxWorkflows ?? null,
        maxPlugins: alloc.maxPlugins ?? null,
        aiTokenBudget: alloc.aiTokenBudget ?? null,
        maxRamMb: alloc.maxRamMb ?? null,
        maxCpuCores: alloc.maxCpuCores ?? null,
        maxStorageMb: alloc.maxStorageMb ?? null,
        allocMode: alloc.allocMode ?? AllocationMode.SOFT_CAP,
        setById: ctx.userId,
      },
      include: {
        department: { select: { name: true } },
        setBy: { select: { name: true } },
      },
    });

    // Audit log
    await audit(ctx, {
      action: 'quota.dept_allocation.set',
      resource: 'department',
      resourceId: departmentId,
      metadata: { allocation: alloc },
    });

    log.info(
      { departmentId, userId: ctx.userId, allocation: alloc },
      'Department allocation set'
    );

    return {
      id: deptAlloc.id,
      departmentId: deptAlloc.departmentId,
      departmentName: deptAlloc.department.name,
      maxGateways: deptAlloc.maxGateways,
      maxWorkflows: deptAlloc.maxWorkflows,
      maxPlugins: deptAlloc.maxPlugins,
      aiTokenBudget: deptAlloc.aiTokenBudget,
      maxRamMb: deptAlloc.maxRamMb,
      maxCpuCores: deptAlloc.maxCpuCores,
      maxStorageMb: deptAlloc.maxStorageMb,
      allocMode: deptAlloc.allocMode,
      setById: deptAlloc.setById,
      setByName: deptAlloc.setBy.name ?? undefined,
      createdAt: deptAlloc.createdAt,
      updatedAt: deptAlloc.updatedAt,
    };
  }

  /**
   * Get department allocation
   */
  async getDeptAllocation(
    departmentId: string
  ): Promise<DeptAllocationResponse | null> {
    const deptAlloc = await prisma.deptAllocation.findUnique({
      where: { departmentId },
      include: {
        department: { select: { name: true } },
        setBy: { select: { name: true } },
      },
    });

    if (!deptAlloc) return null;

    return {
      id: deptAlloc.id,
      departmentId: deptAlloc.departmentId,
      departmentName: deptAlloc.department.name,
      maxGateways: deptAlloc.maxGateways,
      maxWorkflows: deptAlloc.maxWorkflows,
      maxPlugins: deptAlloc.maxPlugins,
      aiTokenBudget: deptAlloc.aiTokenBudget,
      maxRamMb: deptAlloc.maxRamMb,
      maxCpuCores: deptAlloc.maxCpuCores,
      maxStorageMb: deptAlloc.maxStorageMb,
      allocMode: deptAlloc.allocMode,
      setById: deptAlloc.setById,
      setByName: deptAlloc.setBy.name ?? undefined,
      createdAt: deptAlloc.createdAt,
      updatedAt: deptAlloc.updatedAt,
    };
  }

  /**
   * Get all department allocations for an organization
   */
  async getDeptAllocations(
    organizationId: string
  ): Promise<DeptAllocationResponse[]> {
    const deptAllocs = await prisma.deptAllocation.findMany({
      where: {
        department: { organizationId },
      },
      include: {
        department: { select: { name: true } },
        setBy: { select: { name: true } },
      },
      orderBy: { department: { name: 'asc' } },
    });

    return deptAllocs.map((da) => ({
      id: da.id,
      departmentId: da.departmentId,
      departmentName: da.department.name,
      maxGateways: da.maxGateways,
      maxWorkflows: da.maxWorkflows,
      maxPlugins: da.maxPlugins,
      aiTokenBudget: da.aiTokenBudget,
      maxRamMb: da.maxRamMb,
      maxCpuCores: da.maxCpuCores,
      maxStorageMb: da.maxStorageMb,
      allocMode: da.allocMode,
      setById: da.setById,
      setByName: da.setBy.name ?? undefined,
      createdAt: da.createdAt,
      updatedAt: da.updatedAt,
    }));
  }

  /**
   * Remove department allocation
   */
  async removeDeptAllocation(
    ctx: ServiceContext,
    departmentId: string
  ): Promise<void> {
    const dept = await prisma.department.findUnique({
      where: { id: departmentId },
      select: { organizationId: true },
    });

    if (!dept) {
      throw new NotFoundError('Department not found');
    }

    const role = await getUserOrgRole(ctx.userId, dept.organizationId);
    requireAdminRole(role, 'remove department allocation');

    await prisma.deptAllocation.delete({
      where: { departmentId },
    });

    await audit(ctx, {
      action: 'quota.dept_allocation.remove',
      resource: 'department',
      resourceId: departmentId,
    });

    log.info({ departmentId, userId: ctx.userId }, 'Department allocation removed');
  }

  // =========================================
  // Member Allocations (Manager sets from dept pool)
  // =========================================

  /**
   * Set or update member allocation
   * ORG_OWNER, ORG_ADMIN, or DEPT_MANAGER can do this
   */
  async setMemberAllocation(
    ctx: ServiceContext,
    userId: string,
    departmentId: string,
    alloc: SetMemberAllocationRequest
  ): Promise<MemberAllocationResponse> {
    // Get department and verify access
    const dept = await prisma.department.findUnique({
      where: { id: departmentId },
      include: {
        organization: true,
        deptAllocation: true,
      },
    });

    if (!dept) {
      throw new NotFoundError('Department not found');
    }

    // Check manager permission
    const role = await getUserOrgRole(ctx.userId, dept.organizationId);
    requireManagerRole(role, 'set member allocation');

    // DEPT_MANAGER can only manage their own department
    if (role === 'DEPT_MANAGER') {
      const deptMember = await prisma.departmentMember.findUnique({
        where: {
          userId_departmentId: { userId: ctx.userId, departmentId },
        },
      });
      if (!deptMember) {
        throw new ForbiddenError('Can only manage allocations in your department');
      }
    }

    // Verify user is in this department
    const targetDeptMember = await prisma.departmentMember.findUnique({
      where: {
        userId_departmentId: { userId, departmentId },
      },
      include: { user: { select: { name: true, email: true } } },
    });

    if (!targetDeptMember) {
      throw new NotFoundError('User is not a member of this department');
    }

    // Validate allocation doesn't exceed dept pool
    const validation = await this.validateMemberAllocation(
      departmentId,
      alloc,
      userId // exclude this user from calculation
    );

    if (!validation.valid) {
      throw new AppError(
        `Allocation exceeds department pool: ${validation.errors.map(e => e.message).join(', ')}`,
        'ALLOCATION_EXCEEDED',
        400
      );
    }

    // Upsert the allocation
    const memberAlloc = await prisma.memberAllocation.upsert({
      where: {
        userId_departmentId: { userId, departmentId },
      },
      create: {
        userId,
        departmentId,
        maxGateways: alloc.maxGateways ?? null,
        maxWorkflows: alloc.maxWorkflows ?? null,
        aiTokenBudget: alloc.aiTokenBudget ?? null,
        maxRamMb: alloc.maxRamMb ?? null,
        maxCpuCores: alloc.maxCpuCores ?? null,
        maxStorageMb: alloc.maxStorageMb ?? null,
        allocMode: alloc.allocMode ?? AllocationMode.SOFT_CAP,
        setById: ctx.userId,
      },
      update: {
        maxGateways: alloc.maxGateways ?? null,
        maxWorkflows: alloc.maxWorkflows ?? null,
        aiTokenBudget: alloc.aiTokenBudget ?? null,
        maxRamMb: alloc.maxRamMb ?? null,
        maxCpuCores: alloc.maxCpuCores ?? null,
        maxStorageMb: alloc.maxStorageMb ?? null,
        allocMode: alloc.allocMode ?? AllocationMode.SOFT_CAP,
        setById: ctx.userId,
      },
      include: {
        user: { select: { name: true, email: true } },
        department: { select: { name: true } },
        setBy: { select: { name: true } },
      },
    });

    await audit(ctx, {
      action: 'quota.member_allocation.set',
      resource: 'user',
      resourceId: userId,
      metadata: { departmentId, allocation: alloc },
    });

    log.info(
      { userId, departmentId, setBy: ctx.userId, allocation: alloc },
      'Member allocation set'
    );

    return {
      id: memberAlloc.id,
      userId: memberAlloc.userId,
      userName: memberAlloc.user.name ?? undefined,
      userEmail: memberAlloc.user.email,
      departmentId: memberAlloc.departmentId,
      departmentName: memberAlloc.department.name,
      maxGateways: memberAlloc.maxGateways,
      maxWorkflows: memberAlloc.maxWorkflows,
      aiTokenBudget: memberAlloc.aiTokenBudget,
      maxRamMb: memberAlloc.maxRamMb,
      maxCpuCores: memberAlloc.maxCpuCores,
      maxStorageMb: memberAlloc.maxStorageMb,
      allocMode: memberAlloc.allocMode,
      setById: memberAlloc.setById,
      setByName: memberAlloc.setBy.name ?? undefined,
      createdAt: memberAlloc.createdAt,
      updatedAt: memberAlloc.updatedAt,
    };
  }

  /**
   * Get member allocation
   */
  async getMemberAllocation(
    userId: string,
    departmentId: string
  ): Promise<MemberAllocationResponse | null> {
    const memberAlloc = await prisma.memberAllocation.findUnique({
      where: {
        userId_departmentId: { userId, departmentId },
      },
      include: {
        user: { select: { name: true, email: true } },
        department: { select: { name: true } },
        setBy: { select: { name: true } },
      },
    });

    if (!memberAlloc) return null;

    return {
      id: memberAlloc.id,
      userId: memberAlloc.userId,
      userName: memberAlloc.user.name ?? undefined,
      userEmail: memberAlloc.user.email,
      departmentId: memberAlloc.departmentId,
      departmentName: memberAlloc.department.name,
      maxGateways: memberAlloc.maxGateways,
      maxWorkflows: memberAlloc.maxWorkflows,
      aiTokenBudget: memberAlloc.aiTokenBudget,
      maxRamMb: memberAlloc.maxRamMb,
      maxCpuCores: memberAlloc.maxCpuCores,
      maxStorageMb: memberAlloc.maxStorageMb,
      allocMode: memberAlloc.allocMode,
      setById: memberAlloc.setById,
      setByName: memberAlloc.setBy.name ?? undefined,
      createdAt: memberAlloc.createdAt,
      updatedAt: memberAlloc.updatedAt,
    };
  }

  /**
   * Get all member allocations for a department
   */
  async getMemberAllocations(
    departmentId: string
  ): Promise<MemberAllocationResponse[]> {
    const memberAllocs = await prisma.memberAllocation.findMany({
      where: { departmentId },
      include: {
        user: { select: { name: true, email: true } },
        department: { select: { name: true } },
        setBy: { select: { name: true } },
      },
      orderBy: { user: { name: 'asc' } },
    });

    return memberAllocs.map((ma) => ({
      id: ma.id,
      userId: ma.userId,
      userName: ma.user.name ?? undefined,
      userEmail: ma.user.email,
      departmentId: ma.departmentId,
      departmentName: ma.department.name,
      maxGateways: ma.maxGateways,
      maxWorkflows: ma.maxWorkflows,
      aiTokenBudget: ma.aiTokenBudget,
      maxRamMb: ma.maxRamMb,
      maxCpuCores: ma.maxCpuCores,
      maxStorageMb: ma.maxStorageMb,
      allocMode: ma.allocMode,
      setById: ma.setById,
      setByName: ma.setBy.name ?? undefined,
      createdAt: ma.createdAt,
      updatedAt: ma.updatedAt,
    }));
  }

  /**
   * Remove member allocation
   */
  async removeMemberAllocation(
    ctx: ServiceContext,
    userId: string,
    departmentId: string
  ): Promise<void> {
    const dept = await prisma.department.findUnique({
      where: { id: departmentId },
      select: { organizationId: true },
    });

    if (!dept) {
      throw new NotFoundError('Department not found');
    }

    const role = await getUserOrgRole(ctx.userId, dept.organizationId);
    requireManagerRole(role, 'remove member allocation');

    await prisma.memberAllocation.delete({
      where: {
        userId_departmentId: { userId, departmentId },
      },
    });

    await audit(ctx, {
      action: 'quota.member_allocation.remove',
      resource: 'user',
      resourceId: userId,
      metadata: { departmentId },
    });

    log.info(
      { userId, departmentId, removedBy: ctx.userId },
      'Member allocation removed'
    );
  }

  // =========================================
  // Validation
  // =========================================

  /**
   * Validate department allocation against org pool
   * @param excludeDeptId - Department to exclude (for updates)
   */
  async validateDepartmentAllocation(
    organizationId: string,
    allocation: QuotaAllocation,
    excludeDeptId?: string
  ): Promise<ValidationResult> {
    const errors: ValidationError[] = [];

    // Get org and its plan limits
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { plan: true },
    });

    if (!org) {
      return { valid: false, errors: [{ field: 'organization', message: 'Organization not found' }] };
    }

    const planLimits = ORG_PLAN_LIMITS[org.plan as OrgPlanType];
    if (!planLimits) {
      return { valid: false, errors: [{ field: 'plan', message: 'Unknown organization plan' }] };
    }

    // Get current dept allocations (excluding the one being updated)
    const currentAllocs = await prisma.deptAllocation.findMany({
      where: {
        department: { organizationId },
        departmentId: excludeDeptId ? { not: excludeDeptId } : undefined,
      },
    });

    // Sum current allocations
    const allocated = this.sumAllocations(currentAllocs);

    // Check each resource
    const checks: { field: keyof QuotaAllocation; limit: number | null; name: string }[] = [
      { field: 'maxGateways', limit: planLimits.sharedGateways, name: 'Gateways' },
      { field: 'maxWorkflows', limit: planLimits.sharedWorkflows, name: 'Workflows' },
      { field: 'maxPlugins', limit: planLimits.sharedPlugins, name: 'Plugins' },
      { field: 'aiTokenBudget', limit: planLimits.sharedAiTokensPerMonth, name: 'AI Tokens' },
      { field: 'maxRamMb', limit: planLimits.pool?.ramMb ?? null, name: 'RAM (MB)' },
      { field: 'maxCpuCores', limit: planLimits.pool?.cpuCores ?? null, name: 'CPU Cores' },
      { field: 'maxStorageMb', limit: planLimits.pool?.storageMb ?? null, name: 'Storage (MB)' },
    ];

    for (const check of checks) {
      const requested = allocation[check.field];
      if (requested == null) continue;

      const limit = check.limit;
      if (limit === null || limit === -1) continue; // unlimited

      const currentlyAllocated = allocated[check.field] ?? 0;
      const newTotal = currentlyAllocated + (requested as number);

      if (newTotal > limit) {
        errors.push({
          field: check.field,
          message: `${check.name}: requesting ${requested}, would total ${newTotal}, but only ${limit} available`,
          current: currentlyAllocated,
          requested: requested as number,
          available: limit - currentlyAllocated,
        });
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Validate member allocation against department pool
   */
  async validateMemberAllocation(
    departmentId: string,
    allocation: QuotaAllocation,
    excludeUserId?: string
  ): Promise<ValidationResult> {
    const errors: ValidationError[] = [];

    // Get department allocation
    const deptAlloc = await prisma.deptAllocation.findUnique({
      where: { departmentId },
    });

    // If no dept allocation, members inherit from org (no specific limit)
    if (!deptAlloc) {
      return { valid: true, errors: [] };
    }

    // Get current member allocations (excluding the one being updated)
    const currentAllocs = await prisma.memberAllocation.findMany({
      where: {
        departmentId,
        userId: excludeUserId ? { not: excludeUserId } : undefined,
      },
    });

    const allocated = this.sumMemberAllocations(currentAllocs);

    // Check each resource against dept limits
    const checks: { field: keyof QuotaAllocation; deptField: keyof typeof deptAlloc; name: string }[] = [
      { field: 'maxGateways', deptField: 'maxGateways', name: 'Gateways' },
      { field: 'maxWorkflows', deptField: 'maxWorkflows', name: 'Workflows' },
      { field: 'aiTokenBudget', deptField: 'aiTokenBudget', name: 'AI Tokens' },
      { field: 'maxRamMb', deptField: 'maxRamMb', name: 'RAM (MB)' },
      { field: 'maxCpuCores', deptField: 'maxCpuCores', name: 'CPU Cores' },
      { field: 'maxStorageMb', deptField: 'maxStorageMb', name: 'Storage (MB)' },
    ];

    for (const check of checks) {
      const requested = allocation[check.field];
      if (requested == null) continue;

      const limit = deptAlloc[check.deptField];
      if (limit === null) continue; // unlimited from dept

      const currentlyAllocated = allocated[check.field] ?? 0;
      const newTotal = currentlyAllocated + (requested as number);

      if (newTotal > (limit as number)) {
        errors.push({
          field: check.field,
          message: `${check.name}: requesting ${requested}, would total ${newTotal}, but dept has ${limit}`,
          current: currentlyAllocated,
          requested: requested as number,
          available: (limit as number) - currentlyAllocated,
        });
      }
    }

    return { valid: errors.length === 0, errors };
  }

  // =========================================
  // Unallocated Resources
  // =========================================

  /**
   * Get unallocated org resources (remaining after dept allocations)
   */
  async getUnallocatedOrgResources(
    organizationId: string
  ): Promise<UnallocatedResources> {
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { plan: true },
    });

    if (!org) {
      throw new NotFoundError('Organization not found');
    }

    const planLimits = ORG_PLAN_LIMITS[org.plan as OrgPlanType];
    if (!planLimits) {
      throw new AppError('Unknown organization plan', 'INVALID_PLAN', 400);
    }

    const deptAllocs = await prisma.deptAllocation.findMany({
      where: { department: { organizationId } },
    });

    const allocated = this.sumAllocations(deptAllocs);

    return {
      gateways: this.calcRemaining(planLimits.sharedGateways, allocated.maxGateways ?? 0),
      workflows: this.calcRemaining(planLimits.sharedWorkflows, allocated.maxWorkflows ?? 0),
      plugins: this.calcRemaining(planLimits.sharedPlugins, allocated.maxPlugins ?? 0),
      aiTokenBudget: this.calcRemaining(planLimits.sharedAiTokensPerMonth, allocated.aiTokenBudget ?? 0),
      ramMb: this.calcRemaining(planLimits.pool?.ramMb ?? null, allocated.maxRamMb ?? 0),
      cpuCores: this.calcRemaining(planLimits.pool?.cpuCores ?? null, allocated.maxCpuCores ?? 0),
      storageMb: this.calcRemaining(planLimits.pool?.storageMb ?? null, allocated.maxStorageMb ?? 0),
    };
  }

  /**
   * Get unallocated department resources (remaining after member allocations)
   */
  async getUnallocatedDeptResources(
    departmentId: string
  ): Promise<UnallocatedResources> {
    const deptAlloc = await prisma.deptAllocation.findUnique({
      where: { departmentId },
    });

    // If no dept allocation, everything is "unlimited" (inherited from org)
    if (!deptAlloc) {
      return {
        gateways: null,
        workflows: null,
        plugins: null,
        aiTokenBudget: null,
        ramMb: null,
        cpuCores: null,
        storageMb: null,
      };
    }

    const memberAllocs = await prisma.memberAllocation.findMany({
      where: { departmentId },
    });

    const allocated = this.sumMemberAllocations(memberAllocs);

    return {
      gateways: this.calcRemaining(deptAlloc.maxGateways, allocated.maxGateways ?? 0),
      workflows: this.calcRemaining(deptAlloc.maxWorkflows, allocated.maxWorkflows ?? 0),
      plugins: null, // Member allocations don't have plugins
      aiTokenBudget: this.calcRemaining(deptAlloc.aiTokenBudget, allocated.aiTokenBudget ?? 0),
      ramMb: this.calcRemaining(deptAlloc.maxRamMb, allocated.maxRamMb ?? 0),
      cpuCores: this.calcRemaining(deptAlloc.maxCpuCores, allocated.maxCpuCores ?? 0),
      storageMb: this.calcRemaining(deptAlloc.maxStorageMb, allocated.maxStorageMb ?? 0),
    };
  }

  // =========================================
  // Summary Methods
  // =========================================

  /**
   * Get organization allocation summary
   */
  async getOrgAllocationSummary(
    organizationId: string
  ): Promise<OrgAllocationSummary> {
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { plan: true },
    });

    if (!org) {
      throw new NotFoundError('Organization not found');
    }

    const planLimits = ORG_PLAN_LIMITS[org.plan as OrgPlanType];
    if (!planLimits) {
      throw new AppError('Unknown organization plan', 'INVALID_PLAN', 400);
    }

    const deptAllocs = await prisma.deptAllocation.findMany({
      where: { department: { organizationId } },
    });

    const allocated = this.sumAllocations(deptAllocs);
    const unallocated = await this.getUnallocatedOrgResources(organizationId);

    return {
      orgLimits: {
        maxGateways: planLimits.sharedGateways === -1 ? null : planLimits.sharedGateways,
        maxWorkflows: planLimits.sharedWorkflows === -1 ? null : planLimits.sharedWorkflows,
        maxPlugins: planLimits.sharedPlugins === -1 ? null : planLimits.sharedPlugins,
        aiTokenBudget: planLimits.sharedAiTokensPerMonth === -1 ? null : planLimits.sharedAiTokensPerMonth,
        maxRamMb: planLimits.pool?.ramMb ?? null,
        maxCpuCores: planLimits.pool?.cpuCores ?? null,
        maxStorageMb: planLimits.pool?.storageMb ?? null,
      },
      allocatedToDepts: allocated,
      unallocated,
      deptCount: deptAllocs.length,
    };
  }

  /**
   * Get department allocation summary
   */
  async getDeptAllocationSummary(
    departmentId: string
  ): Promise<DeptAllocationSummary> {
    const deptAlloc = await this.getDeptAllocation(departmentId);

    const memberAllocs = await prisma.memberAllocation.findMany({
      where: { departmentId },
    });

    const allocated = this.sumMemberAllocations(memberAllocs);
    const unallocated = await this.getUnallocatedDeptResources(departmentId);

    return {
      deptAllocation: deptAlloc ? {
        maxGateways: deptAlloc.maxGateways,
        maxWorkflows: deptAlloc.maxWorkflows,
        maxPlugins: deptAlloc.maxPlugins,
        aiTokenBudget: deptAlloc.aiTokenBudget,
        maxRamMb: deptAlloc.maxRamMb,
        maxCpuCores: deptAlloc.maxCpuCores,
        maxStorageMb: deptAlloc.maxStorageMb,
      } : null,
      allocatedToMembers: allocated,
      unallocated,
      memberCount: memberAllocs.length,
    };
  }

  // =========================================
  // Private Helpers
  // =========================================

  private sumAllocations(allocs: Array<{
    maxGateways: number | null;
    maxWorkflows: number | null;
    maxPlugins: number | null;
    aiTokenBudget: number | null;
    maxRamMb: number | null;
    maxCpuCores: number | null;
    maxStorageMb: number | null;
  }>): QuotaAllocation {
    return {
      maxGateways: allocs.reduce((sum, a) => sum + (a.maxGateways ?? 0), 0),
      maxWorkflows: allocs.reduce((sum, a) => sum + (a.maxWorkflows ?? 0), 0),
      maxPlugins: allocs.reduce((sum, a) => sum + (a.maxPlugins ?? 0), 0),
      aiTokenBudget: allocs.reduce((sum, a) => sum + (a.aiTokenBudget ?? 0), 0),
      maxRamMb: allocs.reduce((sum, a) => sum + (a.maxRamMb ?? 0), 0),
      maxCpuCores: allocs.reduce((sum, a) => sum + (a.maxCpuCores ?? 0), 0),
      maxStorageMb: allocs.reduce((sum, a) => sum + (a.maxStorageMb ?? 0), 0),
    };
  }

  private sumMemberAllocations(allocs: Array<{
    maxGateways: number | null;
    maxWorkflows: number | null;
    aiTokenBudget: number | null;
    maxRamMb: number | null;
    maxCpuCores: number | null;
    maxStorageMb: number | null;
  }>): QuotaAllocation {
    return {
      maxGateways: allocs.reduce((sum, a) => sum + (a.maxGateways ?? 0), 0),
      maxWorkflows: allocs.reduce((sum, a) => sum + (a.maxWorkflows ?? 0), 0),
      aiTokenBudget: allocs.reduce((sum, a) => sum + (a.aiTokenBudget ?? 0), 0),
      maxRamMb: allocs.reduce((sum, a) => sum + (a.maxRamMb ?? 0), 0),
      maxCpuCores: allocs.reduce((sum, a) => sum + (a.maxCpuCores ?? 0), 0),
      maxStorageMb: allocs.reduce((sum, a) => sum + (a.maxStorageMb ?? 0), 0),
    };
  }

  private calcRemaining(limit: number | null, allocated: number): number | null {
    if (limit === null || limit === -1) return null; // unlimited
    return Math.max(0, limit - allocated);
  }
}

// Export singleton
export const QuotaAllocationService = new QuotaAllocationServiceImpl();
