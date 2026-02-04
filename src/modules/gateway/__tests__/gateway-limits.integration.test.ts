/**
 * Gateway Plan Limits - Integration Tests
 *
 * Tests gateway creation limits with service layer calls
 * across all plan tiers (personal and organization).
 *
 * @module modules/gateway/__tests__/gateway-limits.integration.test
 */

import { OrgPlanLimitError } from '@/lib/org-plan-limits';
import { PlanLimitError } from '@/lib/plan-limits';
import type { OrgPlanType } from '@/shared/constants/org-plans';
import { ORG_PLAN_LIMITS } from '@/shared/constants/org-plans';
import type { PlanType } from '@/shared/constants/plans';
import { PLAN_LIMITS } from '@/shared/constants/plans';
import { createServiceContext } from '@/shared/types/context';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gatewayService } from '../gateway.service';

// ===========================================
// Mock Dependencies
// ===========================================

vi.mock('@/lib/prisma', () => ({
  prisma: {
    gateway: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    organization: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('@/lib/encryption', () => ({
  encrypt: vi.fn((data) => `encrypted:${JSON.stringify(data)}`),
  decryptJson: vi.fn((data) => {
    const json = data.replace('encrypted:', '');
    return JSON.parse(json);
  }),
}));

vi.mock('@/lib/audit', () => ({
  auditActions: {
    gatewayCreated: vi.fn(),
    gatewayUpdated: vi.fn(),
    gatewayDeleted: vi.fn(),
  },
}));

// Import after mocking
import { prisma } from '@/lib/prisma';

const mockedPrisma = prisma as unknown as {
  gateway: {
    create: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };
  organization: {
    findUnique: ReturnType<typeof vi.fn>;
  };
};

beforeEach(() => {
  vi.clearAllMocks();
  
  // Set default mock return values
  mockedPrisma.gateway.findMany.mockResolvedValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
});


/**
 * Helper to create personal context
 */
function createPersonalContext(userId: string, plan: PlanType) {
  return createServiceContext(
    {
      userId,
      role: 'MEMBER',
      plan,
    },
    {},
    {
      contextType: 'personal',
      organizationId: undefined,
      effectivePlan: plan,
    }
  );
}

/**
 * Helper to create organization context
 */
function createOrgContext(userId: string, orgId: string, userPlan: PlanType, orgPlan: OrgPlanType) {
  return createServiceContext(
    {
      userId,
      role: 'MEMBER',
      plan: userPlan,
    },
    {},
    {
      contextType: 'organization',
      organizationId: orgId,
      effectivePlan: userPlan,
      orgRole: 'ORG_ADMIN',
    }
  );
}

/**
 * Mock gateway helper
 */
function mockGateway(id: string, userId: string, organizationId: string | null, name: string) {
  return {
    id,
    userId,
    organizationId,
    name,
    type: 'AI' as const,
    status: 'DISCONNECTED' as const,
    credentialsEnc: 'encrypted:test',
    config: {},
    lastConnectedAt: null,
    lastError: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

// ===========================================
// Personal Context - FREE Plan Tests
// ===========================================

describe('Gateway Limits - FREE Plan (Personal)', () => {
  it('allows creating 1st gateway (under limit)', async () => {
    const userId = 'user-123';
    const ctx = createPersonalContext(userId, 'FREE');

    // Mock count returns 0 (under limit)
    mockedPrisma.gateway.count.mockResolvedValue(0);
    mockedPrisma.gateway.create.mockResolvedValue(
      mockGateway('gw-1', userId, null, 'Test Gateway 1')
    );

    const gateway = await gatewayService.create(ctx, {
      name: 'Test Gateway 1',
      type: 'TELEGRAM_BOT',
      credentials: { botToken: 'test-token-123' },
    });

    expect(gateway).toBeDefined();
    expect(gateway.id).toBeDefined();
    expect(gateway.name).toBe('Test Gateway 1');
  });

  it('blocks creating 2nd gateway (at limit)', async () => {
    const userId = 'user-123';
    const ctx = createPersonalContext(userId, 'FREE');

    // Mock count returns 1 (at limit)
    mockedPrisma.gateway.count.mockResolvedValue(1);

    // Attempt to create second gateway - should fail
    await expect(
      gatewayService.create(ctx, {
        name: 'Test Gateway 2',
        type: 'AI',
        credentials: { provider: 'openai', apiKey: 'test-key-2' },
      })
    ).rejects.toThrow(PlanLimitError);
  });

  it('includes upgrade URL in error', async () => {
    const userId = 'user-123';
    const ctx = createPersonalContext(userId, 'FREE');

    // Mock count returns 1 (at limit)
    mockedPrisma.gateway.count.mockResolvedValue(1);

    try {
      // Try second gateway
      await gatewayService.create(ctx, {
        name: 'Test Gateway 2',
        type: 'WEBHOOK',
        credentials: { url: 'https://test.com/webhook', secret: 'test-secret' },
      });
      throw new Error('Should have thrown PlanLimitError');
    } catch (error: any) {
      expect(error).toBeInstanceOf(PlanLimitError);
      expect(error.upgradeUrl).toBe('/billing/upgrade');
      expect(error.resource).toBe('gateways');
      expect(error.current).toBe(PLAN_LIMITS.FREE.gateways);
      expect(error.max).toBe(PLAN_LIMITS.FREE.gateways);
    }
  });

  it('allows creating after deleting (back under limit)', async () => {
    const userId = 'user-123';
    const ctx = createPersonalContext(userId, 'FREE');

    // First create: count = 0
    mockedPrisma.gateway.count.mockResolvedValueOnce(0);
    mockedPrisma.gateway.create.mockResolvedValueOnce(
      mockGateway('gw-1', userId, null, 'Test Gateway 1')
    );

    const gateway1 = await gatewayService.create(ctx, {
      name: 'Test Gateway 1',
      type: 'TELEGRAM_BOT',
      credentials: { botToken: 'test-token' },
    });

    // Delete gateway
    mockedPrisma.gateway.findUnique.mockResolvedValue(gateway1);
    mockedPrisma.gateway.delete.mockResolvedValue(gateway1);
    await gatewayService.delete(ctx, gateway1.id);

    // Second create: count = 0 (after delete)
    mockedPrisma.gateway.count.mockResolvedValueOnce(0);
    mockedPrisma.gateway.create.mockResolvedValueOnce(
      mockGateway('gw-2', userId, null, 'Test Gateway 2')
    );

    const gateway2 = await gatewayService.create(ctx, {
      name: 'Test Gateway 2',
      type: 'WEBHOOK',
      credentials: { url: 'https://test.com/webhook', secret: 'test-secret' },
    });

    expect(gateway2).toBeDefined();
    expect(gateway2.name).toBe('Test Gateway 2');
  });
});

// ===========================================
// All Plan Tiers - Boundary Testing
// ===========================================

describe('Gateway Limits - All Plans (Boundary)', () => {
  const planTests: Array<{ plan: PlanType; limit: number }> = [
    { plan: 'FREE', limit: PLAN_LIMITS.FREE.gateways },
    { plan: 'STARTER', limit: PLAN_LIMITS.STARTER.gateways },
    { plan: 'PRO', limit: PLAN_LIMITS.PRO.gateways },
    { plan: 'BUSINESS', limit: PLAN_LIMITS.BUSINESS.gateways },
  ];

  planTests.forEach(({ plan, limit }) => {
    describe(`${plan} Plan`, () => {
      it(`allows creating up to ${limit} gateways`, async () => {
        const userId = 'user-123';
        const ctx = createPersonalContext(userId, plan);

        // Mock count for limit check (create gateway at position limit-1)
        mockedPrisma.gateway.count.mockResolvedValue(limit - 1);
        mockedPrisma.gateway.create.mockResolvedValue(
          mockGateway(`gw-${limit}`, userId, null, `Gateway ${limit}`)
        );

        const gateway = await gatewayService.create(ctx, {
          name: `Gateway ${limit}`,
          type: 'AI',
          credentials: { provider: 'openai', apiKey: `test-key-${limit}` },
        });

        expect(gateway).toBeDefined();
      });

      it(`blocks creating gateway ${limit + 1}`, async () => {
        const userId = 'user-123';
        const ctx = createPersonalContext(userId, plan);

        // Mock count returns at limit
        mockedPrisma.gateway.count.mockResolvedValue(limit);

        // Try to create one more - should fail
        await expect(
          gatewayService.create(ctx, {
            name: `Gateway ${limit + 1}`,
            type: 'TELEGRAM_BOT',
            credentials: { botToken: 'test-token' },
          })
        ).rejects.toThrow(PlanLimitError);
      });
    });
  });

  it('ENTERPRISE has unlimited gateways', async () => {
    const userId = 'user-123';
    const ctx = createPersonalContext(userId, 'ENTERPRISE');

    // Even with 1000 gateways, should not fail
    mockedPrisma.gateway.count.mockResolvedValue(1000);
    mockedPrisma.gateway.create.mockResolvedValue(
      mockGateway('gw-1001', userId, null, 'Gateway 1001')
    );

    const gateway = await gatewayService.create(ctx, {
      name: 'Gateway 1001',
      type: 'AI',
      credentials: { provider: 'openai', apiKey: 'test-key-1001' },
    });

    expect(gateway).toBeDefined();
  });
});

// ===========================================
// Organization Context Tests
// ===========================================

describe('Gateway Limits - Organization Context', () => {
  it('ORG_FREE allows 2 shared gateways', async () => {
    const userId = 'user-123';
    const orgId = 'org-123';
    const ctx = createOrgContext(userId, orgId, 'FREE', 'ORG_FREE');

    // Mock org lookup
    mockedPrisma.organization.findUnique.mockResolvedValue({
      id: orgId,
      plan: 'ORG_FREE',
    } as any);

    // Create 2 gateways (at limit)
    mockedPrisma.gateway.count.mockResolvedValueOnce(0);
    mockedPrisma.gateway.create.mockResolvedValueOnce(
      mockGateway('gw-1', userId, orgId, 'Org Gateway 1')
    );
    await gatewayService.create(ctx, {
      name: 'Org Gateway 1',
      type: 'AI',
      credentials: { provider: 'openai', apiKey: 'test-1' },
    });

    mockedPrisma.gateway.count.mockResolvedValueOnce(1);
    mockedPrisma.gateway.create.mockResolvedValueOnce(
      mockGateway('gw-2', userId, orgId, 'Org Gateway 2')
    );
    await gatewayService.create(ctx, {
      name: 'Org Gateway 2',
      type: 'TELEGRAM_BOT',
      credentials: { botToken: 'test-2' },
    });

    // Try 3rd - should fail
    mockedPrisma.gateway.count.mockResolvedValueOnce(2);
    await expect(
      gatewayService.create(ctx, {
        name: 'Org Gateway 3',
        type: 'WEBHOOK',
        credentials: { url: 'https://test.com/webhook', secret: 'test-3' },
      })
    ).rejects.toThrow(OrgPlanLimitError);
  });

  it('uses organization limit, not user limit', async () => {
    const userId = 'user-123';
    const orgId = 'org-123';
    // User has FREE plan (1 gateway limit)
    // Org has ORG_STARTER plan (5 gateway limit)
    const ctx = createOrgContext(userId, orgId, 'FREE', 'ORG_STARTER');

    mockedPrisma.organization.findUnique.mockResolvedValue({
      id: orgId,
      plan: 'ORG_STARTER',
    } as any);

    // Should be able to create using org limit (5), not user limit (1)
    mockedPrisma.gateway.count.mockResolvedValue(4); // At 4, can create 5th
    mockedPrisma.gateway.create.mockResolvedValue(
      mockGateway('gw-5', userId, orgId, 'Org Gateway 5')
    );

    const gateway = await gatewayService.create(ctx, {
      name: 'Org Gateway 5',
      type: 'AI',
      credentials: { provider: 'openai', apiKey: 'test-key-5' },
    });
    expect(gateway).toBeDefined();

    // 6th should fail
    mockedPrisma.gateway.count.mockResolvedValue(5);
    await expect(
      gatewayService.create(ctx, {
        name: 'Org Gateway 6',
        type: 'AI',
        credentials: { provider: 'openai', apiKey: 'test-6' },
      })
    ).rejects.toThrow(OrgPlanLimitError);
  });

  it('personal and org gateways counted separately', async () => {
    const userId = 'user-123';
    const orgId = 'org-123';

    // Personal context: STARTER plan (3 gateways)
    const personalCtx = createPersonalContext(userId, 'STARTER');
    
    // Mock personal gateway count
    mockedPrisma.gateway.count.mockResolvedValue(3);
    
    // Verify personal limit reached
    await expect(
      gatewayService.create(personalCtx, {
        name: 'Personal Gateway 4',
        type: 'AI',
        credentials: { provider: 'openai', apiKey: 'personal-4' },
      })
    ).rejects.toThrow(PlanLimitError);

    // Org context: ORG_FREE plan (2 gateways)
    const orgCtx = createOrgContext(userId, orgId, 'STARTER', 'ORG_FREE');
    
    mockedPrisma.organization.findUnique.mockResolvedValue({
      id: orgId,
      plan: 'ORG_FREE',
    } as any);

    // Should still be able to create org gateways (separate count)
    mockedPrisma.gateway.count.mockResolvedValue(0);
    mockedPrisma.gateway.create.mockResolvedValue(
      mockGateway('gw-org-1', userId, orgId, 'Org Gateway 1')
    );

    const orgGateway = await gatewayService.create(orgCtx, {
      name: 'Org Gateway 1',
      type: 'AI',
      credentials: { provider: 'openai', apiKey: 'org-1' },
    });

    expect(orgGateway).toBeDefined();
  });

  const orgPlanTests: Array<{ plan: OrgPlanType; limit: number }> = [
    { plan: 'ORG_FREE', limit: ORG_PLAN_LIMITS.ORG_FREE.sharedGateways },
    { plan: 'ORG_STARTER', limit: ORG_PLAN_LIMITS.ORG_STARTER.sharedGateways },
    { plan: 'ORG_GROWTH', limit: ORG_PLAN_LIMITS.ORG_GROWTH.sharedGateways },
    { plan: 'ORG_PRO', limit: ORG_PLAN_LIMITS.ORG_PRO.sharedGateways },
  ];

  orgPlanTests.forEach(({ plan, limit }) => {
    it(`${plan} allows ${limit} shared gateways`, async () => {
      const userId = 'user-123';
      const orgId = 'org-123';
      const ctx = createOrgContext(userId, orgId, 'FREE', plan);

      mockedPrisma.organization.findUnique.mockResolvedValue({
        id: orgId,
        plan,
      } as any);

      // Create at limit
      mockedPrisma.gateway.count.mockResolvedValue(limit - 1);
      mockedPrisma.gateway.create.mockResolvedValue(
        mockGateway(`gw-${limit}`, userId, orgId, `Org Gateway ${limit}`)
      );

      const gateway = await gatewayService.create(ctx, {
        name: `Org Gateway ${limit}`,
        type: 'AI',
        credentials: { provider: 'openai', apiKey: `test-${limit}` },
      });
      expect(gateway).toBeDefined();

      // Try one more - should fail
      mockedPrisma.gateway.count.mockResolvedValue(limit);
      await expect(
        gatewayService.create(ctx, {
          name: `Org Gateway ${limit + 1}`,
          type: 'AI',
          credentials: { provider: 'openai', apiKey: 'test-extra' },
        })
      ).rejects.toThrow(OrgPlanLimitError);
    });
  });

  it('ORG_ENTERPRISE has unlimited gateways', async () => {
    const userId = 'user-123';
    const orgId = 'org-123';
    const ctx = createOrgContext(userId, orgId, 'FREE', 'ORG_ENTERPRISE');

    mockedPrisma.organization.findUnique.mockResolvedValue({
      id: orgId,
      plan: 'ORG_ENTERPRISE',
    } as any);

    // Even with 1000 gateways, should not fail
    mockedPrisma.gateway.count.mockResolvedValue(1000);
    mockedPrisma.gateway.create.mockResolvedValue(
      mockGateway('gw-1001', userId, orgId, 'Gateway 1001')
    );

    const gateway = await gatewayService.create(ctx, {
      name: 'Gateway 1001',
      type: 'AI',
      credentials: { provider: 'openai', apiKey: 'test-1001' },
    });

    expect(gateway).toBeDefined();
  });
});
