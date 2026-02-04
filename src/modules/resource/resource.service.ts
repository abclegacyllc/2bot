/**
 * Resource Service
 * 
 * Main service for getting resource status across all 4 contexts:
 * - Personal (PersonalResourceStatus)
 * - Organization (OrgResourceStatus)
 * - Department (OrgDeptResourceStatus)
 * - Member (OrgMemberResourceStatus)
 * 
 * This service works with the CURRENT Prisma schema.
 * Some features are stubbed until schema is updated.
 * 
 * @module modules/resource/resource.service
 */

import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { ORG_PLAN_LIMITS, type OrgPlanType } from '@/shared/constants/org-plans';
import { PLAN_LIMITS, type PlanType } from '@/shared/constants/plans';
import type { ServiceContext } from '@/shared/types/context';
import type {
  AIUsageBreakdown,
  AllocatedResource,
  AllocationQuota,
  AutomationPool,
  BillingPool,
  CountQuota,
  DeptAllocationSummary,
  OrgAllocationSummary,
  OrgDeptResourceStatus,
  OrgMemberResourceStatus,
  OrgResourceStatus,
  PersonalResourceStatus,
  UsageMetric,
  WorkspacePool
} from '@/shared/types/resources';
import { allocationService } from './allocation.service';
import { usageTracker } from './usage-tracker.service';

const log = logger.child({ module: 'resource-service' });

// ===========================================
// Helpers for building resource types
// ===========================================

function createCountQuota(used: number, limit: number | null): CountQuota {
  const effectiveLimit = limit === -1 ? null : limit;
  const isUnlimited = effectiveLimit === null;
  return {
    used,
    limit: effectiveLimit,
    percentage: isUnlimited ? 0 : Math.min(100, Math.round((used / (effectiveLimit || 1)) * 100)),
    isUnlimited,
  };
}

function createUsageMetric(
  current: number,
  limit: number | null,
  period: 'hourly' | 'daily' | 'monthly' = 'monthly'
): UsageMetric {
  const effectiveLimit = limit === -1 ? null : limit;
  const isUnlimited = effectiveLimit === null;
  return {
    current,
    limit: effectiveLimit,
    period,
    resetsAt: null, // TODO: Calculate from billing period
    percentage: isUnlimited ? 0 : Math.min(100, Math.round((current / (effectiveLimit || 1)) * 100)),
    isUnlimited,
  };
}

function createAllocationQuota(
  allocated: number,
  limit: number | null,
  unit: 'MB' | 'GB' | 'cores' | 'vCPU'
): AllocationQuota {
  const effectiveLimit = limit === -1 ? null : limit;
  const isUnlimited = effectiveLimit === null;
  return {
    allocated,
    limit: effectiveLimit,
    unit,
    percentage: isUnlimited ? 0 : Math.min(100, Math.round((allocated / (effectiveLimit || 1)) * 100)),
    isUnlimited,
  };
}

function createAllocatedResource(
  allocated: number | null,
  used: number,
  parentLimit: number | null
): AllocatedResource {
  const isUnlimited = allocated === null;
  return {
    allocated,
    used,
    parentLimit,
    percentage: isUnlimited || !allocated ? 0 : Math.min(100, Math.round((used / allocated) * 100)),
    isUnlimited,
  };
}

function createEmptyAIBreakdown(): AIUsageBreakdown {
  const emptyMetric = createUsageMetric(0, null);
  return {
    chat: emptyMetric,
    images: emptyMetric,
    tts: emptyMetric,
    stt: emptyMetric,
    total: emptyMetric,
  };
}

// ===========================================
// Resource Service Implementation
// ===========================================

class ResourceServiceImpl {
  
  // -------------------------------------------
  // Main Entry Point
  // -------------------------------------------
  
  /**
   * Get resource status based on context type
   */
  async getResourceStatus(ctx: ServiceContext): Promise<
    PersonalResourceStatus | OrgResourceStatus | OrgDeptResourceStatus | OrgMemberResourceStatus
  > {
    if (ctx.isPersonalContext()) {
      return this.getPersonalStatus(ctx);
    }
    
    // Organization context - need to determine which level
    if (ctx.departmentId) {
      // Department or Member context
      return this.getDeptStatus(ctx, ctx.organizationId!, ctx.departmentId);
    }
    
    // Organization-wide context
    return this.getOrgStatus(ctx, ctx.organizationId!);
  }
  
  // -------------------------------------------
  // Personal Resource Status
  // -------------------------------------------
  
  async getPersonalStatus(ctx: ServiceContext): Promise<PersonalResourceStatus> {
    const userId = ctx.userId;
    const plan = ctx.userPlan as PlanType;
    const planLimits = PLAN_LIMITS[plan] || PLAN_LIMITS.FREE;
    
    // Count current resources
    const [gatewayCount, pluginCount, workflowCount, creditWallet] = await Promise.all([
      prisma.gateway.count({ where: { userId, organizationId: null } }),
      prisma.userPlugin.count({ where: { userId, organizationId: null } }),
      prisma.workflow.count({ where: { userId, organizationId: null } }),
      prisma.creditWallet.findUnique({ where: { userId } }),
    ]);
    
    // Get usage from tracker
    const usage = await usageTracker.getRealTimeUsage(ctx);
    
    // Build automation pool
    const automation: AutomationPool = {
      gateways: {
        count: createCountQuota(gatewayCount, planLimits.gateways),
        metrics: {
          requests: createUsageMetric(usage.gatewayRequests, null),
        },
      },
      plugins: {
        count: createCountQuota(pluginCount, planLimits.plugins),
        metrics: {
          executions: createUsageMetric(usage.pluginExecutions, null),
        },
      },
      workflows: {
        count: createCountQuota(workflowCount, planLimits.workflows),
        metrics: {
          runs: createUsageMetric(usage.workflowRuns, planLimits.workflowRunsPerMonth),
          steps: createUsageMetric(usage.workflowSteps, null),
        },
      },
    };
    
    // Build billing pool
    const billing: BillingPool = {
      credits: {
        balance: creditWallet?.balance ?? 0,
        monthlyBudget: planLimits.creditsPerMonth === -1 ? null : planLimits.creditsPerMonth,
        usage: {
          ai: createEmptyAIBreakdown(),
          marketplace: createUsageMetric(0, null),
          total: createUsageMetric(usage.creditsUsed, planLimits.creditsPerMonth),
        },
        resetsAt: null,
      },
      subscription: {
        seats: createCountQuota(1, 1), // Personal = 1 seat
        departments: createCountQuota(0, 0),
        plan: plan,
        planType: 'personal',
        features: {
          sso: false,
          customBranding: plan === 'ENTERPRISE',
          prioritySupport: plan !== 'FREE',
          auditLogs: plan !== 'FREE',
          apiAccess: plan !== 'FREE',
          dedicatedDatabase: plan === 'ENTERPRISE',
        },
      },
    };
    
    const status: PersonalResourceStatus = {
      context: 'personal',
      userId,
      plan,
      executionMode: 'SERVERLESS', // TODO: Determine from plan
      automation,
      workspace: null, // TODO: Implement workspace mode
      billing,
      historyDays: planLimits.historyDays ?? 30,
    };
    
    return status;
  }
  
  // -------------------------------------------
  // Organization Resource Status
  // -------------------------------------------
  
  async getOrgStatus(ctx: ServiceContext, orgId: string): Promise<OrgResourceStatus> {
    // Get org with related data
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      include: {
        subscription: true,
        memberships: true,
        departments: true,
        creditWallet: true,
      },
    });
    
    if (!org) {
      throw new Error(`Organization not found: ${orgId}`);
    }
    
    // Determine plan
    const plan = (org.plan as string) || 'ORG_FREE';
    const planLimits = ORG_PLAN_LIMITS[plan as OrgPlanType] || ORG_PLAN_LIMITS.ORG_FREE;
    
    // Count resources
    const [gatewayCount, pluginCount, workflowCount] = await Promise.all([
      prisma.gateway.count({ where: { organizationId: orgId } }),
      prisma.userPlugin.count({ where: { organizationId: orgId } }),
      prisma.workflow.count({ where: { organizationId: orgId } }),
    ]);
    
    // Get usage
    const usage = await usageTracker.getRealTimeUsage(ctx);
    
    // Get allocation summary
    const deptAllocs = await allocationService.getOrgDeptAllocations(orgId);
    let allocGateways = 0, allocPlugins = 0, allocWorkflows = 0, allocCredits = 0;
    let allocRam = 0, allocCpu = 0, allocStorage = 0;
    
    for (const alloc of deptAllocs) {
      allocGateways += alloc.maxGateways ?? 0;
      allocPlugins += alloc.maxPlugins ?? 0;
      allocWorkflows += alloc.maxWorkflows ?? 0;
      allocCredits += alloc.creditBudget ?? 0;
      allocRam += alloc.ramMb ?? 0;
      allocCpu += alloc.cpuCores ?? 0;
      allocStorage += alloc.storageMb ?? 0;
    }
    
    // Build automation pool
    const automation: AutomationPool = {
      gateways: {
        count: createCountQuota(gatewayCount, planLimits.sharedGateways),
        metrics: {
          requests: createUsageMetric(usage.gatewayRequests, null),
        },
      },
      plugins: {
        count: createCountQuota(pluginCount, planLimits.sharedPlugins),
        metrics: {
          executions: createUsageMetric(usage.pluginExecutions, null),
        },
      },
      workflows: {
        count: createCountQuota(workflowCount, planLimits.sharedWorkflows),
        metrics: {
          runs: createUsageMetric(usage.workflowRuns, planLimits.workflowRunsPerMonth),
          steps: createUsageMetric(usage.workflowSteps, null),
        },
      },
    };
    
    // Build workspace pool
    const workspace: WorkspacePool = {
      compute: {
        ram: createAllocationQuota(org.poolRamMb, org.poolRamMb, 'MB'),
        cpu: createAllocationQuota(org.poolCpuCores, org.poolCpuCores, 'cores'),
      },
      storage: {
        allocation: createAllocationQuota(org.poolStorageMb, org.poolStorageMb, 'MB'),
      },
      containers: createCountQuota(0, null),
    };
    
    // Build billing pool
    const billing: BillingPool = {
      credits: {
        balance: org.creditWallet?.balance ?? 0,
        monthlyBudget: planLimits.sharedCreditsPerMonth === -1 ? null : planLimits.sharedCreditsPerMonth,
        usage: {
          ai: createEmptyAIBreakdown(),
          marketplace: createUsageMetric(0, null),
          total: createUsageMetric(usage.creditsUsed, planLimits.sharedCreditsPerMonth),
        },
        resetsAt: null,
      },
      subscription: {
        seats: createCountQuota(org.memberships.length, org.maxSeats),
        departments: createCountQuota(org.departments.length, planLimits.departments),
        plan: plan,
        planType: 'organization',
        features: {
          sso: plan === 'ORG_ENTERPRISE',
          customBranding: plan === 'ORG_ENTERPRISE',
          prioritySupport: plan !== 'ORG_FREE',
          auditLogs: plan !== 'ORG_FREE',
          apiAccess: plan !== 'ORG_FREE',
          dedicatedDatabase: plan === 'ORG_ENTERPRISE',
        },
      },
    };
    
    // Build allocation summary
    const unlimited = (v: number, limit: number) => limit === -1 ? null : Math.max(0, limit - v);
    const allocations: OrgAllocationSummary = {
      allocated: {
        gateways: allocGateways,
        plugins: allocPlugins,
        workflows: allocWorkflows,
        creditBudget: allocCredits,
        ramMb: allocRam,
        cpuCores: allocCpu,
        storageMb: allocStorage,
      },
      unallocated: {
        gateways: unlimited(allocGateways, planLimits.sharedGateways),
        plugins: unlimited(allocPlugins, planLimits.sharedPlugins),
        workflows: unlimited(allocWorkflows, planLimits.sharedWorkflows),
        creditBudget: unlimited(allocCredits, planLimits.sharedCreditsPerMonth),
        ramMb: Math.max(0, org.poolRamMb - allocRam),
        cpuCores: Math.max(0, org.poolCpuCores - allocCpu),
        storageMb: Math.max(0, org.poolStorageMb - allocStorage),
      },
      departmentCount: org.departments.length,
      memberCount: org.memberships.length,
    };
    
    const status: OrgResourceStatus = {
      context: 'organization',
      organizationId: orgId,
      plan,
      executionMode: 'SERVERLESS', // TODO: Determine from plan
      automation,
      workspace,
      billing,
      allocations,
      historyDays: planLimits.historyDays ?? 30,
    };
    
    return status;
  }
  
  // -------------------------------------------
  // Department Resource Status
  // -------------------------------------------
  
  async getDeptStatus(
    ctx: ServiceContext,
    orgId: string,
    deptId: string
  ): Promise<OrgDeptResourceStatus> {
    // Get department
    const dept = await prisma.department.findUnique({
      where: { id: deptId },
    });
    
    if (!dept || dept.organizationId !== orgId) {
      throw new Error(`Department not found: ${deptId}`);
    }
    
    // Get department allocation
    const deptAlloc = await allocationService.getDeptAllocation(deptId);
    
    // Count current resources
    const [workflowCount] = await Promise.all([
      prisma.workflow.count({ where: { organizationId: orgId, departmentId: deptId } }),
    ]);
    
    // Get usage
    const usage = await usageTracker.getRealTimeUsage(ctx);
    
    // Get member allocations summary
    const memberAllocs = await allocationService.getDeptMemberAllocations(deptId);
    let allocToMembersGateways = 0, allocToMembersWorkflows = 0;
    let allocToMembersCredits = 0, allocToMembersRam = 0;
    
    for (const alloc of memberAllocs) {
      allocToMembersGateways += alloc.maxGateways ?? 0;
      allocToMembersWorkflows += alloc.maxWorkflows ?? 0;
      allocToMembersCredits += alloc.creditBudget ?? 0;
      allocToMembersRam += alloc.ramMb ?? 0;
    }
    
    // Build member allocation summary
    const memberAllocations: DeptAllocationSummary = {
      allocated: {
        gateways: allocToMembersGateways,
        workflows: allocToMembersWorkflows,
        creditBudget: allocToMembersCredits,
        ramMb: allocToMembersRam,
      },
      unallocated: {
        gateways: deptAlloc?.maxGateways === null ? null : Math.max(0, (deptAlloc?.maxGateways ?? 0) - allocToMembersGateways),
        workflows: deptAlloc?.maxWorkflows === null ? null : Math.max(0, (deptAlloc?.maxWorkflows ?? 0) - allocToMembersWorkflows),
        creditBudget: deptAlloc?.creditBudget === null ? null : Math.max(0, (deptAlloc?.creditBudget ?? 0) - allocToMembersCredits),
        ramMb: deptAlloc?.ramMb === null ? null : Math.max(0, (deptAlloc?.ramMb ?? 0) - allocToMembersRam),
      },
      memberCount: memberAllocs.length,
    };
    
    const status: OrgDeptResourceStatus = {
      context: 'department',
      organizationId: orgId,
      departmentId: deptId,
      departmentName: dept.name,
      isActive: dept.isActive,
      
      automation: {
        gateways: createAllocatedResource(deptAlloc?.maxGateways ?? null, 0, null),
        plugins: createAllocatedResource(deptAlloc?.maxPlugins ?? null, 0, null),
        workflows: createAllocatedResource(deptAlloc?.maxWorkflows ?? null, workflowCount, null),
      },
      
      workspace: deptAlloc ? {
        ram: createAllocatedResource(deptAlloc.ramMb ?? null, 0, null),
        cpu: createAllocatedResource(deptAlloc.cpuCores ?? null, 0, null),
        storage: createAllocatedResource(deptAlloc.storageMb ?? null, 0, null),
      } : null,
      
      budget: {
        credits: createAllocatedResource(deptAlloc?.creditBudget ?? null, deptAlloc?.creditUsed ?? 0, null),
      },
      
      usage: {
        workflowRuns: createUsageMetric(usage.workflowRuns, null),
        pluginExecutions: createUsageMetric(usage.pluginExecutions, null),
        gatewayRequests: createUsageMetric(usage.gatewayRequests, null),
      },
      
      memberAllocations,
    };
    
    return status;
  }
  
  // -------------------------------------------
  // Member Resource Status
  // -------------------------------------------
  
  async getMemberStatus(
    ctx: ServiceContext,
    orgId: string,
    deptId: string,
    userId: string
  ): Promise<OrgMemberResourceStatus> {
    // Get member allocation
    const memberAlloc = await allocationService.getMemberAllocation(userId, deptId);
    
    // Get user info
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });
    
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }
    
    // Get membership for role
    const membership = await prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId,
          organizationId: orgId,
        },
      },
    });
    
    // Count resources
    const [gatewayCount, workflowCount] = await Promise.all([
      prisma.gateway.count({ where: { userId, organizationId: orgId } }),
      prisma.workflow.count({ where: { userId, organizationId: orgId, departmentId: deptId } }),
    ]);
    
    // Get usage
    const usage = await usageTracker.getRealTimeUsage(ctx);
    
    const status: OrgMemberResourceStatus = {
      context: 'member',
      organizationId: orgId,
      departmentId: deptId,
      userId,
      memberName: user.name || user.email,
      role: membership?.role || 'ORG_MEMBER',
      
      automation: {
        gateways: createAllocatedResource(memberAlloc?.maxGateways ?? null, gatewayCount, null),
        workflows: createAllocatedResource(memberAlloc?.maxWorkflows ?? null, workflowCount, null),
      },
      
      workspace: memberAlloc ? {
        ram: createAllocatedResource(memberAlloc.ramMb ?? null, 0, null),
        cpu: createAllocatedResource(memberAlloc.cpuCores ?? null, 0, null),
        storage: createAllocatedResource(memberAlloc.storageMb ?? null, 0, null),
      } : null,
      
      budget: {
        credits: createAllocatedResource(memberAlloc?.creditBudget ?? null, memberAlloc?.creditUsed ?? 0, null),
      },
      
      usage: {
        workflowRuns: createUsageMetric(usage.workflowRuns, null),
        gatewayRequests: createUsageMetric(usage.gatewayRequests, null),
      },
    };
    
    return status;
  }
}

// Export singleton
export const resourceService = new ResourceServiceImpl();
