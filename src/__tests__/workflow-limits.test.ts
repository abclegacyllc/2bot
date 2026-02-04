/**
 * Workflow Limit Tests
 * 
 * Tests workflow creation limits across all plans.
 * Workflows are a key feature with plan-based limits.
 */

import { checkOrgWorkflowLimit, enforceOrgWorkflowLimit, OrgPlanLimitError } from '@/lib/org-plan-limits';
import { checkWorkflowLimit, enforceWorkflowLimit, PlanLimitError } from '@/lib/plan-limits';
import { ORG_PLAN_LIMITS } from '@/shared/constants/org-plans';
import { PLAN_LIMITS } from '@/shared/constants/plans';
import { createServiceContext } from '@/shared/types/context';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock Prisma
vi.mock('@/lib/prisma', () => ({
  prisma: {
    workflow: {
      count: vi.fn(),
    },
    organization: {
      findUnique: vi.fn(),
    },
  },
}));

import { prisma } from '@/lib/prisma';

const mockedPrisma = prisma as any;

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Workflow Limits - Personal Plans', () => {
  it('FREE plan allows up to 3 workflows', async () => {
    const ctx = createServiceContext(
      { userId: 'user-1', role: 'MEMBER', plan: 'FREE' },
      {},
      { contextType: 'personal', effectivePlan: 'FREE' }
    );

    // At 2 workflows - should allow
    mockedPrisma.workflow.count.mockResolvedValue(2);
    let result = await checkWorkflowLimit(ctx);
    expect(result.allowed).toBe(true);
    expect(result.max).toBe(PLAN_LIMITS.FREE.workflows);

    // At 3 workflows - should block
    mockedPrisma.workflow.count.mockResolvedValue(3);
    result = await checkWorkflowLimit(ctx);
    expect(result.allowed).toBe(false);
    expect(result.current).toBe(3);
    expect(result.max).toBe(3);
  });

  it('STARTER plan allows up to 10 workflows', async () => {
    const ctx = createServiceContext(
      { userId: 'user-2', role: 'MEMBER', plan: 'STARTER' },
      {},
      { contextType: 'personal', effectivePlan: 'STARTER' }
    );

    mockedPrisma.workflow.count.mockResolvedValue(9);
    let result = await checkWorkflowLimit(ctx);
    expect(result.allowed).toBe(true);
    expect(result.max).toBe(PLAN_LIMITS.STARTER.workflows);

    mockedPrisma.workflow.count.mockResolvedValue(10);
    result = await checkWorkflowLimit(ctx);
    expect(result.allowed).toBe(false);
  });

  it('PRO plan allows up to 50 workflows', async () => {
    const ctx = createServiceContext(
      { userId: 'user-3', role: 'MEMBER', plan: 'PRO' },
      {},
      { contextType: 'personal', effectivePlan: 'PRO' }
    );

    mockedPrisma.workflow.count.mockResolvedValue(49);
    let result = await checkWorkflowLimit(ctx);
    expect(result.allowed).toBe(true);
    expect(result.max).toBe(PLAN_LIMITS.PRO.workflows);

    mockedPrisma.workflow.count.mockResolvedValue(50);
    result = await checkWorkflowLimit(ctx);
    expect(result.allowed).toBe(false);
  });

  it('BUSINESS plan allows up to 150 workflows', async () => {
    const ctx = createServiceContext(
      { userId: 'user-4', role: 'MEMBER', plan: 'BUSINESS' },
      {},
      { contextType: 'personal', effectivePlan: 'BUSINESS' }
    );

    mockedPrisma.workflow.count.mockResolvedValue(199);
    let result = await checkWorkflowLimit(ctx);
    expect(result.allowed).toBe(true);
    expect(result.max).toBe(PLAN_LIMITS.BUSINESS.workflows);

    mockedPrisma.workflow.count.mockResolvedValue(200);
    result = await checkWorkflowLimit(ctx);
    expect(result.allowed).toBe(false);
  });

  it('ENTERPRISE plan has unlimited workflows', async () => {
    const ctx = createServiceContext(
      { userId: 'user-5', role: 'MEMBER', plan: 'ENTERPRISE' },
      {},
      { contextType: 'personal', effectivePlan: 'ENTERPRISE' }
    );

    // Even with 1000 workflows, should allow more
    mockedPrisma.workflow.count.mockResolvedValue(1000);
    const result = await checkWorkflowLimit(ctx);
    expect(result.allowed).toBe(true);
    expect(result.max).toBe(-1); // Unlimited
  });
});

describe('Workflow Limits - Organization Plans', () => {
  it('ORG_FREE allows up to 5 shared workflows', async () => {
    const ctx = createServiceContext(
      { userId: 'user-6', role: 'MEMBER', plan: 'FREE' },
      {},
      { 
        contextType: 'organization',
        organizationId: 'org-1',
        effectivePlan: 'ORG_FREE' as any,
      }
    );

    // Mock organization lookup
    mockedPrisma.organization.findUnique.mockResolvedValue({
      id: 'org-1',
      plan: 'ORG_FREE',
    } as any);

    mockedPrisma.workflow.count.mockResolvedValue(4);
    let result = await checkOrgWorkflowLimit(ctx);
    expect(result.allowed).toBe(true);
    expect(result.max).toBe(ORG_PLAN_LIMITS.ORG_FREE.sharedWorkflows);

    mockedPrisma.workflow.count.mockResolvedValue(5);
    result = await checkOrgWorkflowLimit(ctx);
    expect(result.allowed).toBe(false);
  });

  it('ORG_STARTER allows up to 25 shared workflows', async () => {
    const ctx = createServiceContext(
      { userId: 'user-7', role: 'MEMBER', plan: 'FREE' },
      {},
      { 
        contextType: 'organization',
        organizationId: 'org-2',
        effectivePlan: 'ORG_STARTER' as any,
      }
    );

    mockedPrisma.organization.findUnique.mockResolvedValue({
      id: 'org-2',
      plan: 'ORG_STARTER',
    } as any);

    mockedPrisma.workflow.count.mockResolvedValue(24);
    let result = await checkOrgWorkflowLimit(ctx);
    expect(result.allowed).toBe(true);
    expect(result.max).toBe(ORG_PLAN_LIMITS.ORG_STARTER.sharedWorkflows);

    mockedPrisma.workflow.count.mockResolvedValue(25);
    result = await checkOrgWorkflowLimit(ctx);
    expect(result.allowed).toBe(false);
  });

  it('ORG_PRO allows up to 250 shared workflows', async () => {
    const ctx = createServiceContext(
      { userId: 'user-8', role: 'MEMBER', plan: 'FREE' },
      {},
      { 
        contextType: 'organization',
        organizationId: 'org-3',
        effectivePlan: 'ORG_PRO' as any,
      }
    );

    mockedPrisma.organization.findUnique.mockResolvedValue({
      id: 'org-3',
      plan: 'ORG_PRO',
    } as any);

    mockedPrisma.workflow.count.mockResolvedValue(249);
    let result = await checkOrgWorkflowLimit(ctx);
    expect(result.allowed).toBe(true);

    mockedPrisma.workflow.count.mockResolvedValue(250);
    result = await checkOrgWorkflowLimit(ctx);
    expect(result.allowed).toBe(false);
  });

  it('ORG_ENTERPRISE has unlimited workflows', async () => {
    const ctx = createServiceContext(
      { userId: 'user-9', role: 'MEMBER', plan: 'FREE' },
      {},
      { 
        contextType: 'organization',
        organizationId: 'org-4',
        effectivePlan: 'ORG_ENTERPRISE' as any,
      }
    );

    mockedPrisma.organization.findUnique.mockResolvedValue({
      id: 'org-4',
      plan: 'ORG_ENTERPRISE',
    } as any);

    mockedPrisma.workflow.count.mockResolvedValue(5000);
    const result = await checkOrgWorkflowLimit(ctx);
    expect(result.allowed).toBe(true);
    expect(result.max).toBe(-1);
  });
});

describe('Workflow Limit Enforcement', () => {
  it('enforceWorkflowLimit throws PlanLimitError when at limit', async () => {
    const ctx = createServiceContext(
      { userId: 'user-10', role: 'MEMBER', plan: 'FREE' },
      {},
      { contextType: 'personal', effectivePlan: 'FREE' }
    );

    mockedPrisma.workflow.count.mockResolvedValue(3); // At FREE limit

    await expect(enforceWorkflowLimit(ctx)).rejects.toThrow(PlanLimitError);
    await expect(enforceWorkflowLimit(ctx)).rejects.toThrow(
      'Workflow limit reached (3/3). Upgrade your plan to create more workflows.'
    );
  });

  it('enforceWorkflowLimit passes when under limit', async () => {
    const ctx = createServiceContext(
      { userId: 'user-11', role: 'MEMBER', plan: 'PRO' },
      {},
      { contextType: 'personal', effectivePlan: 'PRO' }
    );

    mockedPrisma.workflow.count.mockResolvedValue(20); // Under PRO limit of 50

    await expect(enforceWorkflowLimit(ctx)).resolves.toBeUndefined();
  });

  it('enforceOrgWorkflowLimit throws OrgPlanLimitError when at limit', async () => {
    const ctx = createServiceContext(
      { userId: 'user-12', role: 'MEMBER', plan: 'FREE' },
      {},
      { 
        contextType: 'organization',
        organizationId: 'org-5',
        effectivePlan: 'ORG_STARTER' as any,
      }
    );

    mockedPrisma.organization.findUnique.mockResolvedValue({
      id: 'org-5',
      plan: 'ORG_STARTER',
    } as any);

    mockedPrisma.workflow.count.mockResolvedValue(25); // At ORG_STARTER limit

    await expect(enforceOrgWorkflowLimit(ctx)).rejects.toThrow(OrgPlanLimitError);
    await expect(enforceOrgWorkflowLimit(ctx)).rejects.toThrow(
      'Workflow limit reached (25/25). Upgrade your organization plan to create more workflows.'
    );
  });
});

describe('Workflow Limits - Context Switching', () => {
  it('personal and org workflow counts are separate', async () => {
    const userId = 'user-13';
    const orgId = 'org-6';

    // Personal context: 3 workflows (at FREE limit)
    const personalCtx = createServiceContext(
      { userId, role: 'MEMBER', plan: 'FREE' },
      {},
      { contextType: 'personal', effectivePlan: 'FREE' }
    );

    mockedPrisma.workflow.count.mockImplementation((args: any) => {
      if (args.where.userId === userId && args.where.organizationId === null) {
        return Promise.resolve(3); // Personal workflows
      }
      if (args.where.organizationId === orgId) {
        return Promise.resolve(2); // Org workflows
      }
      return Promise.resolve(0);
    });

    mockedPrisma.organization.findUnique.mockResolvedValue({
      id: orgId,
      plan: 'ORG_FREE',
    } as any);

    // Personal workflows at limit
    const personalResult = await checkWorkflowLimit(personalCtx);
    expect(personalResult.allowed).toBe(false);
    expect(personalResult.current).toBe(3);
    expect(personalResult.max).toBe(3);

    // Org workflows still have room (ORG_FREE allows 5)
    const orgCtx = createServiceContext(
      { userId, role: 'MEMBER', plan: 'FREE' },
      {},
      { 
        contextType: 'organization',
        organizationId: orgId,
        effectivePlan: 'ORG_FREE' as any,
      }
    );

    const orgResult = await checkOrgWorkflowLimit(orgCtx);
    expect(orgResult.allowed).toBe(true);
    expect(orgResult.current).toBe(2);
    expect(orgResult.max).toBe(5);
  });
});

describe('Workflow Limits - Boundary Tests', () => {
  it('allows creating exactly at limit minus one', async () => {
    const ctx = createServiceContext(
      { userId: 'user-14', role: 'MEMBER', plan: 'STARTER' },
      {},
      { contextType: 'personal', effectivePlan: 'STARTER' }
    );

    // STARTER limit is 10, at 9
    mockedPrisma.workflow.count.mockResolvedValue(9);
    
    const result = await checkWorkflowLimit(ctx);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(1);
  });

  it('blocks at exact limit', async () => {
    const ctx = createServiceContext(
      { userId: 'user-15', role: 'MEMBER', plan: 'STARTER' },
      {},
      { contextType: 'personal', effectivePlan: 'STARTER' }
    );

    // STARTER limit is 10, at 10
    mockedPrisma.workflow.count.mockResolvedValue(10);
    
    const result = await checkWorkflowLimit(ctx);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('blocks when over limit (downgraded plan)', async () => {
    const ctx = createServiceContext(
      { userId: 'user-16', role: 'MEMBER', plan: 'FREE' },
      {},
      { contextType: 'personal', effectivePlan: 'FREE' }
    );

    // User has 10 workflows but downgraded to FREE (limit 3)
    mockedPrisma.workflow.count.mockResolvedValue(10);
    
    const result = await checkWorkflowLimit(ctx);
    expect(result.allowed).toBe(false);
    expect(result.current).toBe(10);
    expect(result.max).toBe(3);
    expect(result.remaining).toBe(0); // Clamped to 0 (would be -7 without Math.max)
  });
});
