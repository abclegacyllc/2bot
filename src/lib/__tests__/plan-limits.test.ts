/**
 * Plan Limits Tests
 *
 * Tests for resource limit checking and enforcement based on subscription plans.
 *
 * @module lib/__tests__/plan-limits.test
 */

import { ORG_PLAN_LIMITS } from '@/shared/constants/org-plans';
import type { PlanType } from '@/shared/constants/plans';
import { PLAN_LIMITS } from '@/shared/constants/plans';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ===========================================
// Mock Dependencies
// ===========================================

vi.mock('@/lib/prisma', () => ({
  prisma: {
    gateway: {
      count: vi.fn(),
    },
    userPlugin: {
      count: vi.fn(),
    },
    organization: {
      findUnique: vi.fn(),
    },
  },
}));

// Import after mocking
import { prisma } from '@/lib/prisma';
import { createServiceContext } from '@/shared/types/context';
import {
    checkExecutionLimit,
    checkGatewayLimit,
    checkPluginLimit,
    enforceExecutionLimit,
    enforceGatewayLimit,
    enforcePluginLimit,
    getResourceUsage,
    PlanLimitError,
} from '../plan-limits';

const mockedPrisma = prisma as unknown as {
  gateway: {
    count: ReturnType<typeof vi.fn>;
  };
  userPlugin: {
    count: ReturnType<typeof vi.fn>;
  };
  organization: {
    findUnique: ReturnType<typeof vi.fn>;
  };
};

// ===========================================
// Test Context Helper
// ===========================================

function createTestContext(options: {
  userId?: string;
  organizationId?: string;
  plan?: PlanType;
} = {}) {
  return createServiceContext(
    {
      userId: options.userId || 'user-123',
      role: 'MEMBER',
      plan: options.plan || 'FREE',
    },
    {},
    {
      contextType: options.organizationId ? 'organization' : 'personal',
      organizationId: options.organizationId,
      effectivePlan: options.plan || 'FREE',
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
// PlanLimitError Tests
// ===========================================

describe('PlanLimitError', () => {
  it('creates error with correct properties', () => {
    const error = new PlanLimitError(
      'Gateway limit reached',
      'gateways',
      ORG_PLAN_LIMITS.ORG_FREE.sharedGateways,
      ORG_PLAN_LIMITS.ORG_FREE.sharedGateways
    );

    expect(error.message).toBe('Gateway limit reached');
    expect(error.name).toBe('PlanLimitError');
    expect(error.resource).toBe('gateways');
    expect(error.current).toBe(ORG_PLAN_LIMITS.ORG_FREE.sharedGateways);
    expect(error.max).toBe(ORG_PLAN_LIMITS.ORG_FREE.sharedGateways);
    expect(error.upgradeUrl).toBe('/billing/upgrade');
  });

  it('serializes to JSON correctly', () => {
    const error = new PlanLimitError(
      'Plugin limit reached',
      'plugins',
      10,
      10
    );

    const json = error.toJSON();

    expect(json).toEqual({
      error: 'PlanLimitError',
      message: 'Plugin limit reached',
      resource: 'plugins',
      current: 10,
      max: 10,
      upgradeUrl: '/billing/upgrade',
    });
  });
});

// ===========================================
// checkGatewayLimit Tests
// ===========================================

describe('checkGatewayLimit', () => {
  it('returns allowed=true when under limit', async () => {
    mockedPrisma.gateway.count.mockResolvedValue(0);

    const ctx = createTestContext({ plan: 'FREE' });
    const result = await checkGatewayLimit(ctx);

    expect(result.allowed).toBe(true);
    expect(result.current).toBe(0);
    expect(result.max).toBe(PLAN_LIMITS.FREE.gateways);
    expect(result.remaining).toBe(PLAN_LIMITS.FREE.gateways);
  });

  it('returns allowed=false when at limit', async () => {
    mockedPrisma.gateway.count.mockResolvedValue(PLAN_LIMITS.FREE.gateways);

    const ctx = createTestContext({ plan: 'FREE' });
    const result = await checkGatewayLimit(ctx);

    expect(result.allowed).toBe(false);
    expect(result.current).toBe(PLAN_LIMITS.FREE.gateways);
    expect(result.max).toBe(PLAN_LIMITS.FREE.gateways);
    expect(result.remaining).toBe(0);
  });

  it('returns unlimited for ENTERPRISE plan', async () => {
    const ctx = createTestContext({ plan: 'ENTERPRISE' }); // ENTERPRISE = unlimited
    const result = await checkGatewayLimit(ctx);

    expect(result.allowed).toBe(true);
    expect(result.max).toBe(-1);
    expect(result.remaining).toBe(-1);
    // Should not call database for unlimited plans
    expect(mockedPrisma.gateway.count).not.toHaveBeenCalled();
  });

  it('uses organizationId filter for org context', async () => {
    mockedPrisma.gateway.count.mockResolvedValue(3);
    mockedPrisma.organization.findUnique.mockResolvedValue({
      id: 'org-123',
      plan: 'ORG_PRO',
    } as any);

    const ctx = createTestContext({ 
      plan: 'PRO',
      organizationId: 'org-123',
    });
    await checkGatewayLimit(ctx);

    expect(mockedPrisma.gateway.count).toHaveBeenCalledWith({
      where: { organizationId: 'org-123' },
    });
  });

  it('uses userId filter for personal context', async () => {
    mockedPrisma.gateway.count.mockResolvedValue(1);

    const ctx = createTestContext({ plan: 'FREE' });
    await checkGatewayLimit(ctx);

    expect(mockedPrisma.gateway.count).toHaveBeenCalledWith({
      where: { userId: 'user-123', organizationId: null },
    });
  });
});

// ===========================================
// checkPluginLimit Tests
// ===========================================

describe('checkPluginLimit', () => {
  it('returns allowed=true when under limit', async () => {
    const currentCount = PLAN_LIMITS.FREE.plugins - 1;
    mockedPrisma.userPlugin.count.mockResolvedValue(currentCount);

    const ctx = createTestContext({ plan: 'FREE' });
    const result = await checkPluginLimit(ctx);

    expect(result.allowed).toBe(true);
    expect(result.current).toBe(currentCount);
    expect(result.max).toBe(PLAN_LIMITS.FREE.plugins);
    expect(result.remaining).toBe(PLAN_LIMITS.FREE.plugins - currentCount);
  });

  it('returns allowed=false when at limit', async () => {
    mockedPrisma.userPlugin.count.mockResolvedValue(PLAN_LIMITS.FREE.plugins);

    const ctx = createTestContext({ plan: 'FREE' });
    const result = await checkPluginLimit(ctx);

    expect(result.allowed).toBe(false);
    expect(result.current).toBe(PLAN_LIMITS.FREE.plugins);
    expect(result.max).toBe(PLAN_LIMITS.FREE.plugins);
    expect(result.remaining).toBe(0);
  });

  it('returns unlimited for ENTERPRISE plan', async () => {
    const ctx = createTestContext({ plan: 'ENTERPRISE' });
    const result = await checkPluginLimit(ctx);

    expect(result.allowed).toBe(true);
    expect(result.max).toBe(-1);
    expect(mockedPrisma.userPlugin.count).not.toHaveBeenCalled();
  });
});

// ===========================================
// checkExecutionLimit Tests
// ===========================================

describe('checkExecutionLimit', () => {
  it('returns unlimited for ENTERPRISE plan', async () => {
    const ctx = createTestContext({ plan: 'ENTERPRISE' });
    const result = await checkExecutionLimit(ctx);

    expect(result.allowed).toBe(true);
    expect(result.max).toBe(-1);
    expect(result.remaining).toBe(-1);
  });

  it('returns unlimited for PRO plan (null workflowRunsPerMonth)', async () => {
    const ctx = createTestContext({ plan: 'PRO' });
    const result = await checkExecutionLimit(ctx);

    expect(result.allowed).toBe(true);
    expect(result.max).toBe(-1);
  });

  it('calculates daily limit from monthly for FREE plan', async () => {
    const ctx = createTestContext({ plan: 'FREE' }); // 500 executions/month
    const result = await checkExecutionLimit(ctx);

    expect(result.allowed).toBe(true);
    // 500/30 = 16.67, ceil = 17
    expect(result.max).toBe(17);
  });

  it('calculates daily limit from monthly for STARTER plan', async () => {
    const ctx = createTestContext({ plan: 'STARTER' }); // 5000 executions/month
    const result = await checkExecutionLimit(ctx);

    expect(result.allowed).toBe(true);
    // 5000/30 = 166.67, ceil = 167
    expect(result.max).toBe(167);
  });
});

// ===========================================
// enforceGatewayLimit Tests
// ===========================================

describe('enforceGatewayLimit', () => {
  it('does not throw when under limit', async () => {
    mockedPrisma.gateway.count.mockResolvedValue(0);

    const ctx = createTestContext({ plan: 'FREE' }); // FREE plan = 1 gateway

    await expect(enforceGatewayLimit(ctx)).resolves.toBeUndefined();
  });

  it('throws PlanLimitError when at limit', async () => {
    mockedPrisma.gateway.count.mockResolvedValue(PLAN_LIMITS.FREE.gateways);

    const ctx = createTestContext({ plan: 'FREE' });

    await expect(enforceGatewayLimit(ctx)).rejects.toThrow(PlanLimitError);
    await expect(enforceGatewayLimit(ctx)).rejects.toThrow('Gateway limit reached');
  });

  it('never throws for ENTERPRISE plan', async () => {
    const ctx = createTestContext({ plan: 'ENTERPRISE' });

    await expect(enforceGatewayLimit(ctx)).resolves.toBeUndefined();
  });
});

// ===========================================
// enforcePluginLimit Tests
// ===========================================

describe('enforcePluginLimit', () => {
  it('does not throw when under limit', async () => {
    mockedPrisma.userPlugin.count.mockResolvedValue(PLAN_LIMITS.FREE.plugins - 1);

    const ctx = createTestContext({ plan: 'FREE' });

    await expect(enforcePluginLimit(ctx)).resolves.toBeUndefined();
  });

  it('throws PlanLimitError when at limit', async () => {
    mockedPrisma.userPlugin.count.mockResolvedValue(PLAN_LIMITS.FREE.plugins);

    const ctx = createTestContext({ plan: 'FREE' });

    await expect(enforcePluginLimit(ctx)).rejects.toThrow(PlanLimitError);
    await expect(enforcePluginLimit(ctx)).rejects.toThrow('Plugin limit reached');
  });
});

// ===========================================
// enforceExecutionLimit Tests
// ===========================================

describe('enforceExecutionLimit', () => {
  it('does not throw for unlimited plans', async () => {
    const ctx = createTestContext({ plan: 'ENTERPRISE' });

    await expect(enforceExecutionLimit(ctx)).resolves.toBeUndefined();
  });

  it('does not throw when under daily limit', async () => {
    const ctx = createTestContext({ plan: 'FREE' });

    // Current implementation returns 0 for current executions (stub)
    await expect(enforceExecutionLimit(ctx)).resolves.toBeUndefined();
  });
});

// ===========================================
// getResourceUsage Tests
// ===========================================

describe('getResourceUsage', () => {
  it('returns all resource usage for context', async () => {
    mockedPrisma.gateway.count.mockResolvedValue(0);
    mockedPrisma.userPlugin.count.mockResolvedValue(2);

    const ctx = createTestContext({ plan: 'FREE' });
    const usage = await getResourceUsage(ctx);

    expect(usage.plan).toBe('FREE');
    expect(usage.gateways.current).toBe(0);
    expect(usage.gateways.max).toBe(PLAN_LIMITS.FREE.gateways);
    expect(usage.plugins.current).toBe(2);
    expect(usage.plugins.max).toBe(PLAN_LIMITS.FREE.plugins);
    expect(usage.executionsToday).toBeDefined();
  });

  it('returns unlimited values for ENTERPRISE', async () => {
    const ctx = createTestContext({ plan: 'ENTERPRISE' });
    const usage = await getResourceUsage(ctx);

    expect(usage.plan).toBe('ENTERPRISE');
    expect(usage.gateways.max).toBe(-1);
    expect(usage.plugins.max).toBe(-1);
    expect(usage.executionsToday.max).toBe(-1);
  });

  it('fetches in parallel for efficiency', async () => {
    mockedPrisma.gateway.count.mockImplementation(() => 
      new Promise(resolve => setTimeout(() => resolve(1), 10))
    );
    mockedPrisma.userPlugin.count.mockImplementation(() => 
      new Promise(resolve => setTimeout(() => resolve(2), 10))
    );

    const ctx = createTestContext({ plan: 'FREE' });
    
    const start = Date.now();
    await getResourceUsage(ctx);
    const duration = Date.now() - start;

    // If parallel, should complete in ~10ms, not 20ms+
    expect(duration).toBeLessThan(50);
  });
});

// ===========================================
// Plan-specific Limits Tests
// ===========================================

describe('Plan-specific limits', () => {
  it('FREE plan has correct limits', async () => {
    mockedPrisma.gateway.count.mockResolvedValue(0);
    mockedPrisma.userPlugin.count.mockResolvedValue(0);

    const ctx = createTestContext({ plan: 'FREE' });
    const usage = await getResourceUsage(ctx);

    expect(usage.gateways.max).toBe(PLAN_LIMITS.FREE.gateways);
    expect(usage.plugins.max).toBe(PLAN_LIMITS.FREE.plugins);
  });

  it('STARTER plan has correct limits', async () => {
    mockedPrisma.gateway.count.mockResolvedValue(0);
    mockedPrisma.userPlugin.count.mockResolvedValue(0);

    const ctx = createTestContext({ plan: 'STARTER' });
    const usage = await getResourceUsage(ctx);

    expect(usage.gateways.max).toBe(PLAN_LIMITS.STARTER.gateways);
    expect(usage.plugins.max).toBe(PLAN_LIMITS.STARTER.plugins);
  });

  it('PRO plan has correct limits', async () => {
    mockedPrisma.gateway.count.mockResolvedValue(0);
    mockedPrisma.userPlugin.count.mockResolvedValue(0);

    const ctx = createTestContext({ plan: 'PRO' });
    const usage = await getResourceUsage(ctx);

    expect(usage.gateways.max).toBe(PLAN_LIMITS.PRO.gateways);
    expect(usage.plugins.max).toBe(PLAN_LIMITS.PRO.plugins);
  });

  it('BUSINESS plan has correct limits', async () => {
    mockedPrisma.gateway.count.mockResolvedValue(0);
    mockedPrisma.userPlugin.count.mockResolvedValue(0);

    const ctx = createTestContext({ plan: 'BUSINESS' });
    const usage = await getResourceUsage(ctx);

    expect(usage.gateways.max).toBe(PLAN_LIMITS.BUSINESS.gateways);
    expect(usage.plugins.max).toBe(PLAN_LIMITS.BUSINESS.plugins);
  });

  it('ENTERPRISE plan has unlimited everything', async () => {
    const ctx = createTestContext({ plan: 'ENTERPRISE' });
    const usage = await getResourceUsage(ctx);

    expect(usage.gateways.max).toBe(-1);
    expect(usage.plugins.max).toBe(-1);
    expect(usage.executionsToday.max).toBe(-1);
  });
});
