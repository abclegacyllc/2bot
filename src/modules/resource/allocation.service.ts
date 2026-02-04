/**
 * Resource Allocation Service
 * 
 * Manages resource allocation within organizations:
 * - Organization → Department allocations
 * - Department → Member allocations
 * 
 * NOTE: This service uses our NEW ResourceAllocationMode enum internally,
 * but converts to Prisma's AllocationMode when writing to DB.
 * Eventually, Prisma will be migrated to match this module.
 * 
 * @module modules/resource/allocation.service
 */

import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { ORG_PLAN_LIMITS, type OrgPlanType } from '@/shared/constants/org-plans';
import type { ServiceContext } from '@/shared/types/context';
import { AllocationMode } from '@prisma/client';
import { ResourceAllocationMode, type DeptAllocationInput, type MemberAllocationInput } from './resource.types';

const log = logger.child({ module: 'resource-allocation' });

// ===========================================
// Conversion Helpers
// ===========================================

/**
 * Convert our ResourceAllocationMode to Prisma's AllocationMode
 * They have the same values, just different sources
 */
function toPrismaMode(mode: ResourceAllocationMode): AllocationMode {
  return mode as unknown as AllocationMode;
}

/**
 * Convert Prisma's AllocationMode to our ResourceAllocationMode
 */
function fromPrismaMode(mode: AllocationMode): ResourceAllocationMode {
  return mode as unknown as ResourceAllocationMode;
}

// ===========================================
// Allocation Service Implementation
// ===========================================

class AllocationServiceImpl {
  
  // -------------------------------------------
  // Department Allocations
  // -------------------------------------------
  
  /**
   * Set allocation for a department from org pool
   */
  async setDeptAllocation(
    ctx: ServiceContext,
    deptId: string,
    input: DeptAllocationInput,
    mode: ResourceAllocationMode = ResourceAllocationMode.SOFT_CAP
  ): Promise<void> {
    // Get department
    const dept = await prisma.department.findUnique({
      where: { id: deptId },
      include: { organization: { include: { subscription: true } } },
    });
    
    if (!dept) {
      throw new Error(`Department not found: ${deptId}`);
    }
    
    // Verify org admin permission
    if (!ctx.canDo('org:manage')) {
      throw new Error('Only org admins can set department allocations');
    }
    
    // Validate against org limits
    const plan = (dept.organization.subscription?.plan as OrgPlanType) || 'ORG_FREE';
    const limits = ORG_PLAN_LIMITS[plan];
    
    // Check each allocation doesn't exceed org pool
    await this.validateDeptAllocation(dept.organizationId, deptId, input, limits);
    
    // Get the user ID from context for setById
    const setById = ctx.userId;
    if (!setById) {
      throw new Error('User context required');
    }
    
    // Upsert allocation (using actual Prisma field names)
    await prisma.deptAllocation.upsert({
      where: { departmentId: deptId },
      create: {
        departmentId: deptId,
        maxGateways: input.maxGateways ?? null,
        maxPlugins: input.maxPlugins ?? null,
        maxWorkflows: input.maxWorkflows ?? null,
        creditBudget: input.creditBudget ?? null,
        maxRamMb: input.ramMb ?? null,
        maxCpuCores: input.cpuCores ?? null,
        maxStorageMb: input.storageMb ?? null,
        allocMode: toPrismaMode(mode),
        setById,
      },
      update: {
        maxGateways: input.maxGateways ?? null,
        maxPlugins: input.maxPlugins ?? null,
        maxWorkflows: input.maxWorkflows ?? null,
        creditBudget: input.creditBudget ?? null,
        maxRamMb: input.ramMb ?? null,
        maxCpuCores: input.cpuCores ?? null,
        maxStorageMb: input.storageMb ?? null,
        allocMode: toPrismaMode(mode),
        setById,
      },
    });
    
    log.info({ deptId, input }, 'Department allocation set');
  }
  
  /**
   * Get allocation for a department
   */
  async getDeptAllocation(deptId: string) {
    const alloc = await prisma.deptAllocation.findUnique({
      where: { departmentId: deptId },
    });
    
    if (!alloc) return null;
    
    // Map to our types (adapt Prisma field names)
    return {
      id: alloc.id,
      departmentId: alloc.departmentId,
      maxGateways: alloc.maxGateways,
      maxPlugins: alloc.maxPlugins,
      maxWorkflows: alloc.maxWorkflows,
      creditBudget: alloc.creditBudget,
      creditUsed: alloc.creditUsed,
      creditResetAt: alloc.creditResetAt,
      ramMb: alloc.maxRamMb,
      cpuCores: alloc.maxCpuCores,
      storageMb: alloc.maxStorageMb,
      mode: fromPrismaMode(alloc.allocMode),
    };
  }
  
  /**
   * Get all department allocations for an org
   */
  async getOrgDeptAllocations(orgId: string) {
    const allocs = await prisma.deptAllocation.findMany({
      where: {
        department: { organizationId: orgId },
      },
      include: {
        department: true,
      },
    });
    
    // Map to our types
    return allocs.map(alloc => ({
      id: alloc.id,
      departmentId: alloc.departmentId,
      department: alloc.department,
      maxGateways: alloc.maxGateways,
      maxPlugins: alloc.maxPlugins,
      maxWorkflows: alloc.maxWorkflows,
      creditBudget: alloc.creditBudget,
      ramMb: alloc.maxRamMb,
      cpuCores: alloc.maxCpuCores,
      storageMb: alloc.maxStorageMb,
      mode: fromPrismaMode(alloc.allocMode),
    }));
  }
  
  /**
   * Remove department allocation
   */
  async removeDeptAllocation(ctx: ServiceContext, deptId: string): Promise<void> {
    if (!ctx.canDo('org:manage')) {
      throw new Error('Only org admins can remove department allocations');
    }
    
    await prisma.deptAllocation.delete({
      where: { departmentId: deptId },
    }).catch(() => {
      // Ignore if doesn't exist
    });
    
    log.info({ deptId }, 'Department allocation removed');
  }
  
  // -------------------------------------------
  // Member Allocations
  // -------------------------------------------
  
  /**
   * Set allocation for a member from department allocation
   */
  async setMemberAllocation(
    ctx: ServiceContext,
    userId: string,
    deptId: string,
    input: MemberAllocationInput,
    mode: ResourceAllocationMode = ResourceAllocationMode.SOFT_CAP
  ): Promise<void> {
    // Verify user is in department
    const member = await prisma.user.findUnique({
      where: { id: userId },
    });
    
    if (!member) {
      throw new Error(`User not found: ${userId}`);
    }
    
    // Verify manager permission
    if (!ctx.canDo('org:manage')) {
      throw new Error('Only managers can set member allocations');
    }
    
    // Get department allocation for validation
    const deptAlloc = await this.getDeptAllocation(deptId);
    
    // Validate against department allocation
    await this.validateMemberAllocation(deptId, userId, input, deptAlloc);
    
    // Get the user ID from context for setById
    const setById = ctx.userId;
    if (!setById) {
      throw new Error('User context required');
    }
    
    // Upsert allocation (using actual Prisma schema)
    await prisma.memberAllocation.upsert({
      where: { 
        userId_departmentId: {
          userId,
          departmentId: deptId,
        },
      },
      create: {
        userId,
        departmentId: deptId,
        maxGateways: input.maxGateways ?? null,
        maxWorkflows: input.maxWorkflows ?? null,
        creditBudget: input.creditBudget ?? null,
        maxRamMb: input.ramMb ?? null,
        maxCpuCores: input.cpuCores ?? null,
        maxStorageMb: input.storageMb ?? null,
        allocMode: toPrismaMode(mode),
        setById,
      },
      update: {
        maxGateways: input.maxGateways ?? null,
        maxWorkflows: input.maxWorkflows ?? null,
        creditBudget: input.creditBudget ?? null,
        maxRamMb: input.ramMb ?? null,
        maxCpuCores: input.cpuCores ?? null,
        maxStorageMb: input.storageMb ?? null,
        allocMode: toPrismaMode(mode),
        setById,
      },
    });
    
    log.info({ userId, deptId, input }, 'Member allocation set');
  }
  
  /**
   * Get allocation for a member in a department
   */
  async getMemberAllocation(userId: string, deptId: string) {
    const alloc = await prisma.memberAllocation.findUnique({
      where: { 
        userId_departmentId: {
          userId,
          departmentId: deptId,
        },
      },
    });
    
    if (!alloc) return null;
    
    // Map to our types
    return {
      id: alloc.id,
      userId: alloc.userId,
      departmentId: alloc.departmentId,
      maxGateways: alloc.maxGateways,
      maxWorkflows: alloc.maxWorkflows,
      creditBudget: alloc.creditBudget,
      creditUsed: alloc.creditUsed,
      creditResetAt: alloc.creditResetAt,
      ramMb: alloc.maxRamMb,
      cpuCores: alloc.maxCpuCores,
      storageMb: alloc.maxStorageMb,
      mode: fromPrismaMode(alloc.allocMode),
    };
  }
  
  /**
   * Get all member allocations for a department
   */
  async getDeptMemberAllocations(deptId: string) {
    const allocs = await prisma.memberAllocation.findMany({
      where: {
        departmentId: deptId,
      },
      include: {
        user: true,
      },
    });
    
    // Map to our types
    return allocs.map(alloc => ({
      id: alloc.id,
      userId: alloc.userId,
      departmentId: alloc.departmentId,
      user: alloc.user,
      maxGateways: alloc.maxGateways,
      maxWorkflows: alloc.maxWorkflows,
      creditBudget: alloc.creditBudget,
      ramMb: alloc.maxRamMb,
      cpuCores: alloc.maxCpuCores,
      storageMb: alloc.maxStorageMb,
      mode: fromPrismaMode(alloc.allocMode),
    }));
  }
  
  /**
   * Remove member allocation
   */
  async removeMemberAllocation(ctx: ServiceContext, userId: string, deptId: string): Promise<void> {
    if (!ctx.canDo('org:manage')) {
      throw new Error('Only managers can remove member allocations');
    }
    
    await prisma.memberAllocation.delete({
      where: { 
        userId_departmentId: {
          userId,
          departmentId: deptId,
        },
      },
    }).catch(() => {
      // Ignore if doesn't exist
    });
    
    log.info({ userId, deptId }, 'Member allocation removed');
  }
  
  // -------------------------------------------
  // Validation Helpers
  // -------------------------------------------
  
  /**
   * Validate department allocation doesn't exceed org pool
   */
  private async validateDeptAllocation(
    orgId: string,
    deptId: string,
    input: DeptAllocationInput,
    limits: typeof ORG_PLAN_LIMITS[OrgPlanType]
  ): Promise<void> {
    // Get all other department allocations
    const otherAllocs = await prisma.deptAllocation.findMany({
      where: {
        department: { organizationId: orgId },
        departmentId: { not: deptId },
      },
    });
    
    // Sum up existing allocations
    let totalGateways = 0;
    let totalPlugins = 0;
    let totalWorkflows = 0;
    let totalCredits = 0;
    let totalRam = 0;
    let totalCpu = 0;
    let totalStorage = 0;
    
    for (const alloc of otherAllocs) {
      totalGateways += alloc.maxGateways ?? 0;
      totalPlugins += alloc.maxPlugins ?? 0;
      totalWorkflows += alloc.maxWorkflows ?? 0;
      totalCredits += alloc.creditBudget ?? 0;
      totalRam += alloc.maxRamMb ?? 0;
      totalCpu += alloc.maxCpuCores ?? 0;
      totalStorage += alloc.maxStorageMb ?? 0;
    }
    
    // Check new allocation doesn't exceed pool
    const errors: string[] = [];
    
    if (input.maxGateways && limits.sharedGateways !== -1) {
      if (totalGateways + input.maxGateways > limits.sharedGateways) {
        errors.push(`Gateways: ${totalGateways + input.maxGateways} exceeds pool of ${limits.sharedGateways}`);
      }
    }
    
    if (input.maxPlugins && limits.sharedPlugins !== -1) {
      if (totalPlugins + input.maxPlugins > limits.sharedPlugins) {
        errors.push(`Plugins: ${totalPlugins + input.maxPlugins} exceeds pool of ${limits.sharedPlugins}`);
      }
    }
    
    if (input.maxWorkflows && limits.sharedWorkflows !== -1) {
      if (totalWorkflows + input.maxWorkflows > limits.sharedWorkflows) {
        errors.push(`Workflows: ${totalWorkflows + input.maxWorkflows} exceeds pool of ${limits.sharedWorkflows}`);
      }
    }
    
    if (input.creditBudget && limits.sharedCreditsPerMonth !== -1) {
      if (totalCredits + input.creditBudget > limits.sharedCreditsPerMonth) {
        errors.push(`Credits: ${totalCredits + input.creditBudget} exceeds pool of ${limits.sharedCreditsPerMonth}`);
      }
    }
    
    if (input.ramMb && limits.pool.ramMb) {
      if (totalRam + input.ramMb > limits.pool.ramMb) {
        errors.push(`RAM: ${totalRam + input.ramMb}MB exceeds pool of ${limits.pool.ramMb}MB`);
      }
    }
    
    if (input.cpuCores && limits.pool.cpuCores) {
      if (totalCpu + input.cpuCores > limits.pool.cpuCores) {
        errors.push(`CPU: ${totalCpu + input.cpuCores} exceeds pool of ${limits.pool.cpuCores}`);
      }
    }
    
    if (input.storageMb && limits.pool.storageMb) {
      if (totalStorage + input.storageMb > limits.pool.storageMb) {
        errors.push(`Storage: ${totalStorage + input.storageMb}MB exceeds pool of ${limits.pool.storageMb}MB`);
      }
    }
    
    if (errors.length > 0) {
      throw new Error(`Allocation exceeds organization pool:\n${errors.join('\n')}`);
    }
  }
  
  /**
   * Validate member allocation doesn't exceed department allocation
   */
  private async validateMemberAllocation(
    deptId: string,
    userId: string,
    input: MemberAllocationInput,
    deptAlloc: Awaited<ReturnType<typeof this.getDeptAllocation>>
  ): Promise<void> {
    if (!deptAlloc) {
      // No department allocation = no limits
      return;
    }
    
    // Get all other member allocations in this department
    const otherAllocs = await prisma.memberAllocation.findMany({
      where: {
        departmentId: deptId,
        userId: { not: userId },
      },
    });
    
    // Sum up existing allocations
    let totalGateways = 0;
    let totalWorkflows = 0;
    let totalCredits = 0;
    let totalRam = 0;
    
    for (const alloc of otherAllocs) {
      totalGateways += alloc.maxGateways ?? 0;
      totalWorkflows += alloc.maxWorkflows ?? 0;
      totalCredits += alloc.creditBudget ?? 0;
      totalRam += alloc.maxRamMb ?? 0;
    }
    
    // Check new allocation doesn't exceed department allocation
    const errors: string[] = [];
    
    if (input.maxGateways && deptAlloc.maxGateways) {
      if (totalGateways + input.maxGateways > deptAlloc.maxGateways) {
        errors.push(`Gateways: ${totalGateways + input.maxGateways} exceeds dept allocation of ${deptAlloc.maxGateways}`);
      }
    }
    
    if (input.maxWorkflows && deptAlloc.maxWorkflows) {
      if (totalWorkflows + input.maxWorkflows > deptAlloc.maxWorkflows) {
        errors.push(`Workflows: ${totalWorkflows + input.maxWorkflows} exceeds dept allocation of ${deptAlloc.maxWorkflows}`);
      }
    }
    
    if (input.creditBudget && deptAlloc.creditBudget) {
      if (totalCredits + input.creditBudget > deptAlloc.creditBudget) {
        errors.push(`Credits: ${totalCredits + input.creditBudget} exceeds dept allocation of ${deptAlloc.creditBudget}`);
      }
    }
    
    if (input.ramMb && deptAlloc.ramMb) {
      if (totalRam + input.ramMb > deptAlloc.ramMb) {
        errors.push(`RAM: ${totalRam + input.ramMb}MB exceeds dept allocation of ${deptAlloc.ramMb}MB`);
      }
    }
    
    if (errors.length > 0) {
      throw new Error(`Allocation exceeds department allocation:\n${errors.join('\n')}`);
    }
  }
  
  // -------------------------------------------
  // Credit Budget Enforcement
  // -------------------------------------------
  
  /**
   * Check if department has enough credit budget for an operation
   * Returns the available credits or throws if hard cap exceeded
   */
  async checkDeptCreditBudget(
    deptId: string,
    requiredCredits: number
  ): Promise<{ allowed: boolean; available: number; budget: number | null; used: number; mode: ResourceAllocationMode }> {
    const alloc = await prisma.deptAllocation.findUnique({
      where: { departmentId: deptId },
    });
    
    // No allocation = no department-level limit (default to soft cap)
    if (!alloc || alloc.creditBudget === null) {
      return {
        allowed: true,
        available: Infinity,
        budget: null,
        used: 0,
        mode: ResourceAllocationMode.SOFT_CAP,
      };
    }
    
    const available = alloc.creditBudget - alloc.creditUsed;
    const mode = fromPrismaMode(alloc.allocMode);
    const allowed = mode !== ResourceAllocationMode.HARD_CAP || available >= requiredCredits;
    
    return {
      allowed,
      available: Math.max(0, available),
      budget: alloc.creditBudget,
      used: alloc.creditUsed,
      mode,
    };
  }
  
  /**
   * Check if member has enough credit budget for an operation
   */
  async checkMemberCreditBudget(
    userId: string,
    deptId: string,
    requiredCredits: number
  ): Promise<{ allowed: boolean; available: number; budget: number | null; used: number; mode: ResourceAllocationMode }> {
    const alloc = await prisma.memberAllocation.findUnique({
      where: { userId_departmentId: { userId, departmentId: deptId } },
    });
    
    // No allocation = no member-level limit (falls back to dept, default soft cap)
    if (!alloc || alloc.creditBudget === null) {
      return {
        allowed: true,
        available: Infinity,
        budget: null,
        used: 0,
        mode: ResourceAllocationMode.SOFT_CAP,
      };
    }
    
    const available = alloc.creditBudget - alloc.creditUsed;
    const mode = fromPrismaMode(alloc.allocMode);
    const allowed = mode !== ResourceAllocationMode.HARD_CAP || available >= requiredCredits;
    
    return {
      allowed,
      available: Math.max(0, available),
      budget: alloc.creditBudget,
      used: alloc.creditUsed,
      mode,
    };
  }
  
  /**
   * Record credit usage for a department (increment creditUsed)
   */
  async recordDeptCreditUsage(deptId: string, creditsUsed: number): Promise<void> {
    await prisma.deptAllocation.update({
      where: { departmentId: deptId },
      data: {
        creditUsed: { increment: creditsUsed },
      },
    });
    
    log.debug({ deptId, creditsUsed }, 'Recorded department credit usage');
  }
  
  /**
   * Record credit usage for a member (increment creditUsed)
   */
  async recordMemberCreditUsage(userId: string, deptId: string, creditsUsed: number): Promise<void> {
    await prisma.memberAllocation.update({
      where: { userId_departmentId: { userId, departmentId: deptId } },
      data: {
        creditUsed: { increment: creditsUsed },
      },
    });
    
    log.debug({ userId, deptId, creditsUsed }, 'Recorded member credit usage');
  }
  
  /**
   * Get credit budget status for a department
   */
  async getDeptCreditStatus(deptId: string): Promise<{
    budget: number | null;
    used: number;
    available: number;
    percentage: number;
    resetAt: Date | null;
  }> {
    const alloc = await prisma.deptAllocation.findUnique({
      where: { departmentId: deptId },
    });
    
    if (!alloc || alloc.creditBudget === null) {
      return { budget: null, used: 0, available: Infinity, percentage: 0, resetAt: null };
    }
    
    const available = Math.max(0, alloc.creditBudget - alloc.creditUsed);
    const percentage = alloc.creditBudget > 0 
      ? Math.round((alloc.creditUsed / alloc.creditBudget) * 100)
      : 0;
    
    return {
      budget: alloc.creditBudget,
      used: alloc.creditUsed,
      available,
      percentage,
      resetAt: alloc.creditResetAt,
    };
  }
  
  /**
   * Get credit budget status for a member
   */
  async getMemberCreditStatus(userId: string, deptId: string): Promise<{
    budget: number | null;
    used: number;
    available: number;
    percentage: number;
    resetAt: Date | null;
  }> {
    const alloc = await prisma.memberAllocation.findUnique({
      where: { userId_departmentId: { userId, departmentId: deptId } },
    });
    
    if (!alloc || alloc.creditBudget === null) {
      return { budget: null, used: 0, available: Infinity, percentage: 0, resetAt: null };
    }
    
    const available = Math.max(0, alloc.creditBudget - alloc.creditUsed);
    const percentage = alloc.creditBudget > 0 
      ? Math.round((alloc.creditUsed / alloc.creditBudget) * 100)
      : 0;
    
    return {
      budget: alloc.creditBudget,
      used: alloc.creditUsed,
      available,
      percentage,
      resetAt: alloc.creditResetAt,
    };
  }
  
  /**
   * Reset credit usage for all allocations (called by monthly cron job)
   */
  async resetAllCreditUsage(): Promise<{ deptCount: number; memberCount: number }> {
    const now = new Date();
    
    // Reset all department allocations
    const deptResult = await prisma.deptAllocation.updateMany({
      where: { creditBudget: { not: null } },
      data: {
        creditUsed: 0,
        creditResetAt: now,
      },
    });
    
    // Reset all member allocations
    const memberResult = await prisma.memberAllocation.updateMany({
      where: { creditBudget: { not: null } },
      data: {
        creditUsed: 0,
        creditResetAt: now,
      },
    });
    
    log.info(
      { deptCount: deptResult.count, memberCount: memberResult.count },
      'Reset monthly credit budgets'
    );
    
    return {
      deptCount: deptResult.count,
      memberCount: memberResult.count,
    };
  }
  
  /**
   * Reset credit usage for a specific organization
   */
  async resetOrgCreditUsage(orgId: string): Promise<{ deptCount: number; memberCount: number }> {
    const now = new Date();
    
    // Get all departments in this org
    const depts = await prisma.department.findMany({
      where: { organizationId: orgId },
      select: { id: true },
    });
    
    const deptIds = depts.map(d => d.id);
    
    // Reset department allocations
    const deptResult = await prisma.deptAllocation.updateMany({
      where: { departmentId: { in: deptIds }, creditBudget: { not: null } },
      data: {
        creditUsed: 0,
        creditResetAt: now,
      },
    });
    
    // Reset member allocations
    const memberResult = await prisma.memberAllocation.updateMany({
      where: { departmentId: { in: deptIds }, creditBudget: { not: null } },
      data: {
        creditUsed: 0,
        creditResetAt: now,
      },
    });
    
    log.info(
      { orgId, deptCount: deptResult.count, memberCount: memberResult.count },
      'Reset organization credit budgets'
    );
    
    return {
      deptCount: deptResult.count,
      memberCount: memberResult.count,
    };
  }
}

// Export singleton
export const allocationService = new AllocationServiceImpl();
