/**
 * Organization Plan Limits Tests
 *
 * Tests for organization resource limit checking and enforcement.
 *
 * @module lib/__tests__/org-plan-limits.test
 */

import type { OrgPlanType } from '@/shared/constants/org-plans';
import { ORG_PLAN_LIMITS } from '@/shared/constants/org-plans';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ===========================================
// Mock Dependencies
// ===========================================

vi.mock('@/lib/prisma', () => ({
  prisma: {
    organization: {
      findUnique: vi.fn(),
    },
    gateway: {
      count: vi.fn(),
    },
    userPlugin: {
      count: vi.fn(),
    },
    workflow: {
      count: vi.fn(),
    },
  },
}));

// Import after mocking
import { prisma } from '@/lib/prisma';
import { createServiceContext } from '@/shared/types/context';
import {
    checkOrgGatewayLimit,
    checkOrgPluginLimit,
    checkOrgWorkflowLimit,
    enforceOrgGatewayLimit,
    enforceOrgPluginLimit,
    enforceOrgWorkflowLimit,
    getOrgResourceUsage,
    OrgPlanLimitError,
} from '../org-plan-limits';

const mockedPrisma = prisma as unknown as {
  organization: {
    findUnique: ReturnType<typeof vi.fn>;
  };
  gateway: {
    count: ReturnType<typeof vi.fn>;
  };
  userPlugin: {
    count: ReturnType<typeof vi.fn>;
  };
  workflow: {
    count: ReturnType<typeof vi.fn>;
  };
};

// ===========================================
// Test Context Helper
// ===========================================

function createOrgContext(options: {
  userId?: string;
  organizationId?: string;
  orgPlan?: OrgPlanType;
  userPlan?: 'FREE' | 'PRO';
} = {}) {
  const orgId = options.organizationId || 'org-123';
  
  // Mock organization lookup
  mockedPrisma.organization.findUnique.mockResolvedValue({
    id: orgId,
    plan: options.orgPlan || 'ORG_FREE',
    name: 'Test Org',
    slug: 'test-org',
  } as any);

  return createServiceContext(
    {
      userId: options.userId || 'user-123',
      role: 'MEMBER',
      plan: options.userPlan || 'FREE',
      activeContext: {
        type: 'organization',
        organizationId: orgId,
        orgRole: 'ORG_ADMIN',
        plan: options.userPlan || 'FREE',  // activeContext.plan is the user's plan
      },
    },
    {},
    {
      contextType: 'organization',
      organizationId: orgId,
      effectivePlan: options.userPlan || 'FREE',
    }
  );
}

// ===========================================
// Setup / Teardown
// ===========================================

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ===========================================
// OrgPlanLimitError Tests
// ===========================================

describe('OrgPlanLimitError', () => {
  it('creates error with correct properties', () => {
    const error = new OrgPlanLimitError(
      'Organization gateway limit reached',
      'gateways',
      ORG_PLAN_LIMITS.ORG_FREE.sharedGateways,
      ORG_PLAN_LIMITS.ORG_FREE.sharedGateways
    );

    expect(error.message).toBe('Organization gateway limit reached');
    expect(error.name).toBe('OrgPlanLimitError');
    expect(error.resource).toBe('gateways');
    expect(error.current).toBe(ORG_PLAN_LIMITS.ORG_FREE.sharedGateways);
    expect(error.max).toBe(ORG_PLAN_LIMITS.ORG_FREE.sharedGateways);
    expect(error.upgradeUrl).toBe('/organizations/billing/upgrade');
  });

  it('serializes to JSON correctly', () => {
    const error = new OrgPlanLimitError(
      'Organization plugin limit reached',
      'plugins',
      20,
      20
    );

    const json = error.toJSON();

    expect(json).toEqual({
      error: 'OrgPlanLimitError',
      message: 'Organization plugin limit reached',
      resource: 'plugins',
      current: 20,
      max: 20,
      upgradeUrl: '/organizations/billing/upgrade',
    });
  });
});

// ===========================================
// checkOrgGatewayLimit Tests
// ===========================================

describe('checkOrgGatewayLimit', () => {
  it('ORG_FREE: allows creating 1st gateway (under limit of 2)', async () => {
    const currentCount = ORG_PLAN_LIMITS.ORG_FREE.sharedGateways - 1;
    mockedPrisma.gateway.count.mockResolvedValue(currentCount);

    const ctx = createOrgContext({ orgPlan: 'ORG_FREE' });
    const result = await checkOrgGatewayLimit(ctx);

    expect(result.allowed).toBe(true);
    expect(result.current).toBe(currentCount);
    expect(result.max).toBe(ORG_PLAN_LIMITS.ORG_FREE.sharedGateways);
    expect(result.remaining).toBe(ORG_PLAN_LIMITS.ORG_FREE.sharedGateways - currentCount);
  });

  it('ORG_FREE: blocks creating 3rd gateway (at limit of 2)', async () => {
    mockedPrisma.gateway.count.mockResolvedValue(ORG_PLAN_LIMITS.ORG_FREE.sharedGateways);

    const ctx = createOrgContext({ orgPlan: 'ORG_FREE' });
    const result = await checkOrgGatewayLimit(ctx);

    expect(result.allowed).toBe(false);
    expect(result.current).toBe(ORG_PLAN_LIMITS.ORG_FREE.sharedGateways);
    expect(result.max).toBe(ORG_PLAN_LIMITS.ORG_FREE.sharedGateways);
    expect(result.remaining).toBe(0);
  });

  it('ORG_STARTER: allows up to 5 gateways', async () => {
    const currentCount = ORG_PLAN_LIMITS.ORG_STARTER.sharedGateways - 1;
    mockedPrisma.gateway.count.mockResolvedValue(currentCount);

    const ctx = createOrgContext({ orgPlan: 'ORG_STARTER' });
    const result = await checkOrgGatewayLimit(ctx);

    expect(result.allowed).toBe(true);
    expect(result.current).toBe(currentCount);
    expect(result.max).toBe(ORG_PLAN_LIMITS.ORG_STARTER.sharedGateways);
    expect(result.remaining).toBe(ORG_PLAN_LIMITS.ORG_STARTER.sharedGateways - currentCount);
  });

  it('ORG_GROWTH: allows up to 15 gateways', async () => {
    const currentCount = ORG_PLAN_LIMITS.ORG_GROWTH.sharedGateways - 5;
    mockedPrisma.gateway.count.mockResolvedValue(currentCount);

    const ctx = createOrgContext({ orgPlan: 'ORG_GROWTH' });
    const result = await checkOrgGatewayLimit(ctx);

    expect(result.allowed).toBe(true);
    expect(result.current).toBe(currentCount);
    expect(result.max).toBe(ORG_PLAN_LIMITS.ORG_GROWTH.sharedGateways);
    expect(result.remaining).toBe(ORG_PLAN_LIMITS.ORG_GROWTH.sharedGateways - currentCount);
  });

  it('ORG_PRO: allows up to 50 gateways', async () => {
    const currentCount = ORG_PLAN_LIMITS.ORG_PRO.sharedGateways - 20;
    mockedPrisma.gateway.count.mockResolvedValue(currentCount);

    const ctx = createOrgContext({ orgPlan: 'ORG_PRO' });
    const result = await checkOrgGatewayLimit(ctx);

    expect(result.allowed).toBe(true);
    expect(result.current).toBe(currentCount);
    expect(result.max).toBe(ORG_PLAN_LIMITS.ORG_PRO.sharedGateways);
  });

  it('ORG_BUSINESS: allows up to 150 gateways', async () => {
    const currentCount = ORG_PLAN_LIMITS.ORG_BUSINESS.sharedGateways - 50;
    mockedPrisma.gateway.count.mockResolvedValue(currentCount);

    const ctx = createOrgContext({ orgPlan: 'ORG_BUSINESS' });
    const result = await checkOrgGatewayLimit(ctx);

    expect(result.allowed).toBe(true);
    expect(result.current).toBe(currentCount);
    expect(result.max).toBe(ORG_PLAN_LIMITS.ORG_BUSINESS.sharedGateways);
  });

  it('ORG_ENTERPRISE: has unlimited gateways', async () => {
    const ctx = createOrgContext({ orgPlan: 'ORG_ENTERPRISE' });
    const result = await checkOrgGatewayLimit(ctx);

    expect(result.allowed).toBe(true);
    expect(result.max).toBe(-1);
    expect(result.remaining).toBe(-1);
    // Should not call database for unlimited plans
    expect(mockedPrisma.gateway.count).not.toHaveBeenCalled();
  });

  it('counts only organization gateways (filters by organizationId)', async () => {
    mockedPrisma.gateway.count.mockResolvedValue(1);

    const ctx = createOrgContext({ organizationId: 'org-456' });
    await checkOrgGatewayLimit(ctx);

    expect(mockedPrisma.gateway.count).toHaveBeenCalledWith({
      where: { organizationId: 'org-456' },
    });
  });

  it('throws error if organizationId missing', async () => {
    const ctx = createServiceContext(
      { userId: 'user-123', role: 'MEMBER', plan: 'FREE' },
      {},
      { contextType: 'personal', effectivePlan: 'FREE' }
    );

    await expect(checkOrgGatewayLimit(ctx)).rejects.toThrow(
      'Organization context required'
    );
  });
});

// ===========================================
// checkOrgPluginLimit Tests
// ===========================================

describe('checkOrgPluginLimit', () => {
  it('ORG_FREE: allows up to 5 plugins', async () => {
    const currentCount = ORG_PLAN_LIMITS.ORG_FREE.sharedPlugins - 2;
    mockedPrisma.userPlugin.count.mockResolvedValue(currentCount);

    const ctx = createOrgContext({ orgPlan: 'ORG_FREE' });
    const result = await checkOrgPluginLimit(ctx);

    expect(result.allowed).toBe(true);
    expect(result.current).toBe(currentCount);
    expect(result.max).toBe(ORG_PLAN_LIMITS.ORG_FREE.sharedPlugins);
    expect(result.remaining).toBe(ORG_PLAN_LIMITS.ORG_FREE.sharedPlugins - currentCount);
  });

  it('ORG_FREE: blocks installing 6th plugin', async () => {
    mockedPrisma.userPlugin.count.mockResolvedValue(ORG_PLAN_LIMITS.ORG_FREE.sharedPlugins);

    const ctx = createOrgContext({ orgPlan: 'ORG_FREE' });
    const result = await checkOrgPluginLimit(ctx);

    expect(result.allowed).toBe(false);
    expect(result.current).toBe(ORG_PLAN_LIMITS.ORG_FREE.sharedPlugins);
    expect(result.max).toBe(ORG_PLAN_LIMITS.ORG_FREE.sharedPlugins);
    expect(result.remaining).toBe(0);
  });

  it('ORG_STARTER: allows up to 20 plugins', async () => {
    const currentCount = ORG_PLAN_LIMITS.ORG_STARTER.sharedPlugins - 5;
    mockedPrisma.userPlugin.count.mockResolvedValue(currentCount);

    const ctx = createOrgContext({ orgPlan: 'ORG_STARTER' });
    const result = await checkOrgPluginLimit(ctx);

    expect(result.allowed).toBe(true);
    expect(result.current).toBe(currentCount);
    expect(result.max).toBe(ORG_PLAN_LIMITS.ORG_STARTER.sharedPlugins);
  });

  it('ORG_GROWTH: allows up to 50 plugins', async () => {
    const currentCount = ORG_PLAN_LIMITS.ORG_GROWTH.sharedPlugins - 20;
    mockedPrisma.userPlugin.count.mockResolvedValue(currentCount);

    const ctx = createOrgContext({ orgPlan: 'ORG_GROWTH' });
    const result = await checkOrgPluginLimit(ctx);

    expect(result.allowed).toBe(true);
    expect(result.max).toBe(ORG_PLAN_LIMITS.ORG_GROWTH.sharedPlugins);
  });

  it('ORG_PRO: allows up to 150 plugins', async () => {
    const currentCount = ORG_PLAN_LIMITS.ORG_PRO.sharedPlugins - 50;
    mockedPrisma.userPlugin.count.mockResolvedValue(currentCount);

    const ctx = createOrgContext({ orgPlan: 'ORG_PRO' });
    const result = await checkOrgPluginLimit(ctx);

    expect(result.allowed).toBe(true);
    expect(result.max).toBe(ORG_PLAN_LIMITS.ORG_PRO.sharedPlugins);
  });

  it('ORG_ENTERPRISE: has unlimited plugins', async () => {
    const ctx = createOrgContext({ orgPlan: 'ORG_ENTERPRISE' });
    const result = await checkOrgPluginLimit(ctx);

    expect(result.allowed).toBe(true);
    expect(result.max).toBe(-1);
    expect(mockedPrisma.userPlugin.count).not.toHaveBeenCalled();
  });
});

// ===========================================
// checkOrgWorkflowLimit Tests
// ===========================================

describe('checkOrgWorkflowLimit', () => {
  it('ORG_FREE: allows up to 5 workflows', async () => {
    mockedPrisma.workflow.count.mockResolvedValue(3);
    const ctx = createOrgContext({ orgPlan: 'ORG_FREE' });
    const result = await checkOrgWorkflowLimit(ctx);

    expect(result.allowed).toBe(true);
    expect(result.current).toBe(3);
    expect(result.max).toBe(ORG_PLAN_LIMITS.ORG_FREE.sharedWorkflows);
  });

  it('ORG_STARTER: allows up to 25 workflows', async () => {
    mockedPrisma.workflow.count.mockResolvedValue(10);
    const ctx = createOrgContext({ orgPlan: 'ORG_STARTER' });
    const result = await checkOrgWorkflowLimit(ctx);

    expect(result.current).toBe(10);
    expect(result.max).toBe(ORG_PLAN_LIMITS.ORG_STARTER.sharedWorkflows);
  });

  it('ORG_ENTERPRISE: has unlimited workflows', async () => {
    mockedPrisma.workflow.count.mockResolvedValue(0);
    const ctx = createOrgContext({ orgPlan: 'ORG_ENTERPRISE' });
    const result = await checkOrgWorkflowLimit(ctx);

    expect(result.allowed).toBe(true);
    expect(result.max).toBe(-1);
  });
});

// ===========================================
// enforceOrgGatewayLimit Tests
// ===========================================

describe('enforceOrgGatewayLimit', () => {
  it('does not throw when under limit', async () => {
    mockedPrisma.gateway.count.mockResolvedValue(ORG_PLAN_LIMITS.ORG_FREE.sharedGateways - 1);

    const ctx = createOrgContext({ orgPlan: 'ORG_FREE' });

    await expect(enforceOrgGatewayLimit(ctx)).resolves.toBeUndefined();
  });

  it('throws OrgPlanLimitError when at limit', async () => {
    mockedPrisma.gateway.count.mockResolvedValue(ORG_PLAN_LIMITS.ORG_FREE.sharedGateways);

    const ctx = createOrgContext({ orgPlan: 'ORG_FREE' });

    await expect(enforceOrgGatewayLimit(ctx)).rejects.toThrow(OrgPlanLimitError);
    await expect(enforceOrgGatewayLimit(ctx)).rejects.toThrow(
      'Organization gateway limit reached'
    );
  });

  it('never throws for ORG_ENTERPRISE plan', async () => {
    const ctx = createOrgContext({ orgPlan: 'ORG_ENTERPRISE' });

    await expect(enforceOrgGatewayLimit(ctx)).resolves.toBeUndefined();
  });

  it('includes upgrade URL in error', async () => {
    const starterLimit = ORG_PLAN_LIMITS.ORG_STARTER.sharedGateways;
    mockedPrisma.gateway.count.mockResolvedValue(starterLimit);

    const ctx = createOrgContext({ orgPlan: 'ORG_STARTER' });

    try {
      await enforceOrgGatewayLimit(ctx);
      expect.fail('Should have thrown OrgPlanLimitError');
    } catch (error: any) {
      expect(error).toBeInstanceOf(OrgPlanLimitError);
      expect(error.upgradeUrl).toBe('/organizations/billing/upgrade');
      expect(error.resource).toBe('gateways');
      expect(error.current).toBe(starterLimit);
      expect(error.max).toBe(starterLimit);
    }
  });
});

// ===========================================
// enforceOrgPluginLimit Tests
// ===========================================

describe('enforceOrgPluginLimit', () => {
  it('does not throw when under limit', async () => {
    mockedPrisma.userPlugin.count.mockResolvedValue(ORG_PLAN_LIMITS.ORG_FREE.sharedPlugins - 2);

    const ctx = createOrgContext({ orgPlan: 'ORG_FREE' });

    await expect(enforceOrgPluginLimit(ctx)).resolves.toBeUndefined();
  });

  it('throws OrgPlanLimitError when at limit', async () => {
    mockedPrisma.userPlugin.count.mockResolvedValue(ORG_PLAN_LIMITS.ORG_FREE.sharedPlugins);

    const ctx = createOrgContext({ orgPlan: 'ORG_FREE' });

    await expect(enforceOrgPluginLimit(ctx)).rejects.toThrow(OrgPlanLimitError);
    await expect(enforceOrgPluginLimit(ctx)).rejects.toThrow(
      'Organization plugin limit reached'
    );
  });
});

// ===========================================
// enforceOrgWorkflowLimit Tests
// ===========================================

describe('enforceOrgWorkflowLimit', () => {
  it('does not throw for unlimited plans', async () => {
    mockedPrisma.workflow.count.mockResolvedValue(0);
    const ctx = createOrgContext({ orgPlan: 'ORG_ENTERPRISE' });

    await expect(enforceOrgWorkflowLimit(ctx)).resolves.toBeUndefined();
  });

  it('does not throw when under limit', async () => {
    mockedPrisma.workflow.count.mockResolvedValue(3);  // Under ORG_FREE limit of 5
    const ctx = createOrgContext({ orgPlan: 'ORG_FREE' });

    await expect(enforceOrgWorkflowLimit(ctx)).resolves.toBeUndefined();
  });
});

// ===========================================
// getOrgResourceUsage Tests
// ===========================================

describe('getOrgResourceUsage', () => {
  it('returns all resource usage for organization', async () => {
    const gatewayCount = ORG_PLAN_LIMITS.ORG_FREE.sharedGateways - 1;
    const pluginCount = ORG_PLAN_LIMITS.ORG_FREE.sharedPlugins - 2;
    const workflowCount = ORG_PLAN_LIMITS.ORG_FREE.sharedWorkflows - 1;
    mockedPrisma.gateway.count.mockResolvedValue(gatewayCount);
    mockedPrisma.userPlugin.count.mockResolvedValue(pluginCount);
    mockedPrisma.workflow.count.mockResolvedValue(workflowCount);

    const ctx = createOrgContext({ orgPlan: 'ORG_FREE' });
    const usage = await getOrgResourceUsage(ctx);

    expect(usage.plan).toBe('ORG_FREE');
    expect(usage.gateways.current).toBe(gatewayCount);
    expect(usage.gateways.max).toBe(ORG_PLAN_LIMITS.ORG_FREE.sharedGateways);
    expect(usage.plugins.current).toBe(pluginCount);
    expect(usage.plugins.max).toBe(ORG_PLAN_LIMITS.ORG_FREE.sharedPlugins);
    expect(usage.workflows).toBeDefined();
    expect(usage.workflows.current).toBe(workflowCount);
    expect(usage.workflows.max).toBe(ORG_PLAN_LIMITS.ORG_FREE.sharedWorkflows);
  });

  it('returns unlimited values for ORG_ENTERPRISE', async () => {
    mockedPrisma.gateway.count.mockResolvedValue(0);
    mockedPrisma.userPlugin.count.mockResolvedValue(0);
    mockedPrisma.workflow.count.mockResolvedValue(0);

    const ctx = createOrgContext({ orgPlan: 'ORG_ENTERPRISE' });
    const usage = await getOrgResourceUsage(ctx);

    expect(usage.plan).toBe('ORG_ENTERPRISE');
    expect(usage.gateways.max).toBe(-1);
    expect(usage.plugins.max).toBe(-1);
    expect(usage.workflows.max).toBe(-1);
  });

  it('fetches in parallel for efficiency', async () => {
    mockedPrisma.gateway.count.mockImplementation(() =>
      new Promise(resolve => setTimeout(() => resolve(1), 10))
    );
    mockedPrisma.userPlugin.count.mockImplementation(() =>
      new Promise(resolve => setTimeout(() => resolve(2), 10))
    );
    mockedPrisma.workflow.count.mockImplementation(() =>
      new Promise(resolve => setTimeout(() => resolve(3), 10))
    );

    const ctx = createOrgContext({ orgPlan: 'ORG_STARTER' });

    const start = Date.now();
    await getOrgResourceUsage(ctx);
    const duration = Date.now() - start;

    // If parallel, should complete in ~10ms, not 30ms+
    expect(duration).toBeLessThan(50);
  });
});

// ===========================================
// Organization Plan-specific Limits Tests
// ===========================================

describe('Organization Plan-specific limits', () => {
  const orgPlanTests = [
    { plan: 'ORG_FREE', gateways: ORG_PLAN_LIMITS.ORG_FREE.sharedGateways, plugins: ORG_PLAN_LIMITS.ORG_FREE.sharedPlugins, workflows: ORG_PLAN_LIMITS.ORG_FREE.sharedWorkflows },
    { plan: 'ORG_STARTER', gateways: ORG_PLAN_LIMITS.ORG_STARTER.sharedGateways, plugins: ORG_PLAN_LIMITS.ORG_STARTER.sharedPlugins, workflows: ORG_PLAN_LIMITS.ORG_STARTER.sharedWorkflows },
    { plan: 'ORG_GROWTH', gateways: ORG_PLAN_LIMITS.ORG_GROWTH.sharedGateways, plugins: ORG_PLAN_LIMITS.ORG_GROWTH.sharedPlugins, workflows: ORG_PLAN_LIMITS.ORG_GROWTH.sharedWorkflows },
    { plan: 'ORG_PRO', gateways: ORG_PLAN_LIMITS.ORG_PRO.sharedGateways, plugins: ORG_PLAN_LIMITS.ORG_PRO.sharedPlugins, workflows: ORG_PLAN_LIMITS.ORG_PRO.sharedWorkflows },
    { plan: 'ORG_BUSINESS', gateways: ORG_PLAN_LIMITS.ORG_BUSINESS.sharedGateways, plugins: ORG_PLAN_LIMITS.ORG_BUSINESS.sharedPlugins, workflows: ORG_PLAN_LIMITS.ORG_BUSINESS.sharedWorkflows },
  ];

  orgPlanTests.forEach(({ plan, gateways, plugins, workflows }) => {
    it(`${plan} has correct limits`, async () => {
      mockedPrisma.gateway.count.mockResolvedValue(0);
      mockedPrisma.userPlugin.count.mockResolvedValue(0);
      mockedPrisma.workflow.count.mockResolvedValue(0);

      const ctx = createOrgContext({ orgPlan: plan as OrgPlanType });
      const usage = await getOrgResourceUsage(ctx);

      expect(usage.gateways.max).toBe(gateways);
      expect(usage.plugins.max).toBe(plugins);
      expect(usage.workflows.max).toBe(workflows);
    });
  });

  it('ORG_ENTERPRISE has unlimited everything', async () => {
    mockedPrisma.gateway.count.mockResolvedValue(0);
    mockedPrisma.userPlugin.count.mockResolvedValue(0);
    mockedPrisma.workflow.count.mockResolvedValue(0);

    const ctx = createOrgContext({ orgPlan: 'ORG_ENTERPRISE' });
    const usage = await getOrgResourceUsage(ctx);

    expect(usage.gateways.max).toBe(-1);
    expect(usage.plugins.max).toBe(-1);
    expect(usage.workflows.max).toBe(-1);
  });
});
