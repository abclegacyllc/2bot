/**
 * Gateway API Plan Limits - E2E Tests
 *
 * End-to-end tests for gateway creation API endpoints
 * verifying plan limits are enforced at the HTTP layer.
 *
 * @module server/routes/__tests__/gateway-api-limits.e2e.test
 */

import { OrgPlanLimitError } from '@/lib/org-plan-limits';
import { PlanLimitError } from '@/lib/plan-limits';
import type { OrgPlanType } from '@/shared/constants/org-plans';
import { ORG_PLAN_LIMITS } from '@/shared/constants/org-plans';
import type { PlanType } from '@/shared/constants/plans';
import { PLAN_LIMITS } from '@/shared/constants/plans';
import type { Request, Response } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ===========================================
// Mock Dependencies
// ===========================================

vi.mock('@/lib/prisma', () => ({
  prisma: {
    gateway: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
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
  },
}));

// Import after mocking
import { prisma } from '@/lib/prisma';
import { gatewayService } from '@/modules/gateway/gateway.service';

const mockedPrisma = prisma as unknown as {
  gateway: {
    create: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
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

// ===========================================
// Test Helpers
// ===========================================

/**
 * Mock Express request/response for testing routes
 */
function createMockRequest(options: {
  userId: string;
  plan: PlanType;
  organizationId?: string;
  orgPlan?: OrgPlanType;
  body?: any;
}): Request {
  return {
    user: {
      id: options.userId,
      role: 'MEMBER',
      plan: options.plan,
    },
    body: options.body || {},
    ip: '127.0.0.1',
    headers: {
      'user-agent': 'test-agent',
    },
  } as any;
}

function createMockResponse(): Response {
  const res: any = {
    json: vi.fn().mockReturnThis(),
    status: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  };
  return res;
}

/**
 * Mock gateway for responses
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
// Personal Gateway API Tests - FREE Plan
// ===========================================

describe('API: POST /api/user/gateways - FREE Plan', () => {
  it('allows creating 1st gateway via service', async () => {
    const userId = 'user-123';

    // Mock limit check passes (count = 0)
    mockedPrisma.gateway.count.mockResolvedValue(0);
    mockedPrisma.gateway.create.mockResolvedValue(
      mockGateway('gw-1', userId, null, 'Test Gateway')
    );

    const result = await gatewayService.create(
      {
        userId,
        plan: 'FREE',
        effectivePlan: 'FREE',
        isOrgContext: () => false,
        organizationId: undefined,
      } as any,
      {
        name: 'Test Gateway',
        type: 'TELEGRAM_BOT',
        credentials: { botToken: 'test-token' },
      }
    );

    expect(result).toBeDefined();
    expect(result.id).toBe('gw-1');
    expect(result.name).toBe('Test Gateway');
  });

  it('blocks creating 2nd gateway via service (limit reached)', async () => {
    const userId = 'user-123';

    // Mock limit check fails (count = 1, at limit)
    mockedPrisma.gateway.count.mockResolvedValue(1);

    await expect(
      gatewayService.create(
        {
          userId,
          plan: 'FREE',
          effectivePlan: 'FREE',
          isOrgContext: () => false,
          organizationId: undefined,
        } as any,
        {
          name: 'Test Gateway 2',
          type: 'AI',
          credentials: { provider: 'openai', apiKey: 'test-key' },
        }
      )
    ).rejects.toThrow(PlanLimitError);
  });

  it('returns error with upgrade URL when limit reached', async () => {
    const userId = 'user-123';

    mockedPrisma.gateway.count.mockResolvedValue(1);

    try {
      await gatewayService.create(
        {
          userId,
          plan: 'FREE',
          effectivePlan: 'FREE',
          isOrgContext: () => false,
          organizationId: undefined,
        } as any,
        {
          name: 'Test Gateway 2',
          type: 'WEBHOOK',
          credentials: { url: 'https://example.com', secret: 'test' },
        }
      );
      throw new Error('Should have thrown PlanLimitError');
    } catch (error: any) {
      expect(error).toBeInstanceOf(PlanLimitError);
      expect(error.upgradeUrl).toBe('/billing/upgrade');
      expect(error.resource).toBe('gateways');
      expect(error.current).toBe(PLAN_LIMITS.FREE.gateways);
      expect(error.max).toBe(PLAN_LIMITS.FREE.gateways);
    }
  });
});

// ===========================================
// All Plan Tiers API Tests
// ===========================================

describe('API: Gateway Limits - All Plan Tiers', () => {
  const planTests: Array<{ plan: PlanType; limit: number }> = [
    { plan: 'FREE', limit: PLAN_LIMITS.FREE.gateways },
    { plan: 'STARTER', limit: PLAN_LIMITS.STARTER.gateways },
    { plan: 'PRO', limit: PLAN_LIMITS.PRO.gateways },
    { plan: 'BUSINESS', limit: PLAN_LIMITS.BUSINESS.gateways },
  ];

  planTests.forEach(({ plan, limit }) => {
    describe(`${plan} Plan`, () => {
      it(`allows creating gateway up to limit (${limit})`, async () => {
        const userId = `user-${plan}`;

        // Mock: at limit - 1 (can create one more)
        mockedPrisma.gateway.count.mockResolvedValue(limit - 1);
        mockedPrisma.gateway.create.mockResolvedValue(
          mockGateway(`gw-${limit}`, userId, null, `Gateway ${limit}`)
        );

        const result = await gatewayService.create(
          {
            userId,
            plan,
            effectivePlan: plan,
            isOrgContext: () => false,
            organizationId: undefined,
          } as any,
          {
            name: `Gateway ${limit}`,
            type: 'AI',
            credentials: { provider: 'openai', apiKey: 'test' },
          }
        );

        expect(result).toBeDefined();
        expect(result.id).toBe(`gw-${limit}`);
      });

      it(`blocks creating gateway over limit (${limit + 1})`, async () => {
        const userId = `user-${plan}`;

        // Mock: at limit (cannot create more)
        mockedPrisma.gateway.count.mockResolvedValue(limit);

        await expect(
          gatewayService.create(
            {
              userId,
              plan,
              effectivePlan: plan,
              isOrgContext: () => false,
              organizationId: undefined,
            } as any,
            {
              name: `Gateway ${limit + 1}`,
              type: 'TELEGRAM_BOT',
              credentials: { botToken: 'test' },
            }
          )
        ).rejects.toThrow(PlanLimitError);
      });
    });
  });

  it('ENTERPRISE plan allows unlimited gateways', async () => {
    const userId = 'user-enterprise';

    // Even with 1000 gateways, should succeed
    mockedPrisma.gateway.count.mockResolvedValue(1000);
    mockedPrisma.gateway.create.mockResolvedValue(
      mockGateway('gw-1001', userId, null, 'Gateway 1001')
    );

    const result = await gatewayService.create(
      {
        userId,
        plan: 'ENTERPRISE',
        effectivePlan: 'ENTERPRISE',
        isOrgContext: () => false,
        organizationId: undefined,
      } as any,
      {
        name: 'Gateway 1001',
        type: 'AI',
        credentials: { provider: 'openai', apiKey: 'test' },
      }
    );

    expect(result).toBeDefined();
  });
});

// ===========================================
// Organization Gateway API Tests
// ===========================================

describe('API: POST /api/orgs/:orgId/gateways - Org Limits', () => {
  it('ORG_FREE allows 2 gateways', async () => {
    const userId = 'user-123';
    const orgId = 'org-123';

    mockedPrisma.organization.findUnique.mockResolvedValue({
      id: orgId,
      plan: 'ORG_FREE',
    } as any);

    // Create 1st gateway
    mockedPrisma.gateway.count.mockResolvedValueOnce(0);
    mockedPrisma.gateway.create.mockResolvedValueOnce(
      mockGateway('gw-1', userId, orgId, 'Org Gateway 1')
    );

    const gateway1 = await gatewayService.create(
      {
        userId,
        plan: 'FREE',
        effectivePlan: 'FREE',
        isOrgContext: () => true,
        organizationId: orgId,
      } as any,
      {
        name: 'Org Gateway 1',
        type: 'AI',
        credentials: { provider: 'openai', apiKey: 'test-1' },
      }
    );
    expect(gateway1).toBeDefined();

    // Create 2nd gateway (at limit)
    mockedPrisma.gateway.count.mockResolvedValueOnce(1);
    mockedPrisma.gateway.create.mockResolvedValueOnce(
      mockGateway('gw-2', userId, orgId, 'Org Gateway 2')
    );

    const gateway2 = await gatewayService.create(
      {
        userId,
        plan: 'FREE',
        effectivePlan: 'FREE',
        isOrgContext: () => true,
        organizationId: orgId,
      } as any,
      {
        name: 'Org Gateway 2',
        type: 'TELEGRAM_BOT',
        credentials: { botToken: 'test-2' },
      }
    );
    expect(gateway2).toBeDefined();

    // 3rd gateway should fail
    mockedPrisma.gateway.count.mockResolvedValueOnce(2);

    await expect(
      gatewayService.create(
        {
          userId,
          plan: 'FREE',
          effectivePlan: 'FREE',
          isOrgContext: () => true,
          organizationId: orgId,
        } as any,
        {
          name: 'Org Gateway 3',
          type: 'WEBHOOK',
          credentials: { url: 'https://example.com', secret: 'test-3' },
        }
      )
    ).rejects.toThrow(OrgPlanLimitError);
  });

  it('uses org plan limit, not user plan limit', async () => {
    const userId = 'user-123';
    const orgId = 'org-123';

    // User has FREE plan (1 gateway), Org has ORG_STARTER
    mockedPrisma.organization.findUnique.mockResolvedValue({
      id: orgId,
      plan: 'ORG_STARTER',
    } as any);

    // Should use org limit, not user limit
    mockedPrisma.gateway.count.mockResolvedValue(ORG_PLAN_LIMITS.ORG_STARTER.sharedGateways - 1);
    mockedPrisma.gateway.create.mockResolvedValue(
      mockGateway('gw-5', userId, orgId, 'Org Gateway 5')
    );

    const result = await gatewayService.create(
      {
        userId,
        plan: 'FREE', // User plan (1 gateway limit)
        effectivePlan: 'FREE',
        isOrgContext: () => true,
        organizationId: orgId, // Org plan (5 gateway limit)
      } as any,
      {
        name: 'Org Gateway 5',
        type: 'AI',
        credentials: { provider: 'openai', apiKey: 'test-5' },
      }
    );

    expect(result).toBeDefined();
  });

  const orgPlanTests: Array<{ plan: OrgPlanType; limit: number }> = [
    { plan: 'ORG_FREE', limit: ORG_PLAN_LIMITS.ORG_FREE.sharedGateways },
    { plan: 'ORG_STARTER', limit: ORG_PLAN_LIMITS.ORG_STARTER.sharedGateways },
    { plan: 'ORG_GROWTH', limit: ORG_PLAN_LIMITS.ORG_GROWTH.sharedGateways },
    { plan: 'ORG_PRO', limit: ORG_PLAN_LIMITS.ORG_PRO.sharedGateways },
  ];

  orgPlanTests.forEach(({ plan, limit }) => {
    it(`${plan} enforces ${limit} gateway limit`, async () => {
      const userId = 'user-123';
      const orgId = 'org-123';

      mockedPrisma.organization.findUnique.mockResolvedValue({
        id: orgId,
        plan,
      } as any);

      // At limit - can't create more
      mockedPrisma.gateway.count.mockResolvedValue(limit);

      await expect(
        gatewayService.create(
          {
            userId,
            plan: 'FREE',
            effectivePlan: 'FREE',
            isOrgContext: () => true,
            organizationId: orgId,
          } as any,
          {
            name: `Gateway ${limit + 1}`,
            type: 'AI',
            credentials: { provider: 'openai', apiKey: 'test' },
          }
        )
      ).rejects.toThrow(OrgPlanLimitError);
    });
  });

  it('ORG_ENTERPRISE allows unlimited gateways', async () => {
    const userId = 'user-123';
    const orgId = 'org-123';

    mockedPrisma.organization.findUnique.mockResolvedValue({
      id: orgId,
      plan: 'ORG_ENTERPRISE',
    } as any);

    // Even with 1000 gateways, should succeed
    mockedPrisma.gateway.count.mockResolvedValue(1000);
    mockedPrisma.gateway.create.mockResolvedValue(
      mockGateway('gw-1001', userId, orgId, 'Gateway 1001')
    );

    const result = await gatewayService.create(
      {
        userId,
        plan: 'FREE',
        effectivePlan: 'FREE',
        isOrgContext: () => true,
        organizationId: orgId,
      } as any,
      {
        name: 'Gateway 1001',
        type: 'AI',
        credentials: { provider: 'openai', apiKey: 'test' },
      }
    );

    expect(result).toBeDefined();
  });
});

// ===========================================
// Error Response Structure Tests
// ===========================================

describe('API: Error Response Structure', () => {
  it('PlanLimitError contains all required fields', async () => {
    const userId = 'user-123';

    mockedPrisma.gateway.count.mockResolvedValue(1); // At FREE limit

    try {
      await gatewayService.create(
        {
          userId,
          plan: 'FREE',
          effectivePlan: 'FREE',
          isOrgContext: () => false,
          organizationId: undefined,
        } as any,
        {
          name: 'Gateway 2',
          type: 'AI',
          credentials: { provider: 'openai', apiKey: 'test' },
        }
      );
      throw new Error('Should have thrown');
    } catch (error: any) {
      expect(error).toBeInstanceOf(PlanLimitError);
      expect(error.name).toBe('PlanLimitError');
      expect(error.message).toContain('Gateway limit reached');
      expect(error.resource).toBe('gateways');
      expect(error.current).toBe(PLAN_LIMITS.FREE.gateways);
      expect(error.max).toBe(PLAN_LIMITS.FREE.gateways);
      expect(error.upgradeUrl).toBe('/billing/upgrade');

      // Verify JSON serialization
      const json = error.toJSON();
      expect(json.error).toBe('PlanLimitError');
      expect(json.resource).toBe('gateways');
      expect(json.current).toBe(PLAN_LIMITS.FREE.gateways);
      expect(json.max).toBe(PLAN_LIMITS.FREE.gateways);
      expect(json.upgradeUrl).toBe('/billing/upgrade');
    }
  });

  it('OrgPlanLimitError contains org-specific upgrade URL', async () => {
    const userId = 'user-123';
    const orgId = 'org-123';

    mockedPrisma.organization.findUnique.mockResolvedValue({
      id: orgId,
      plan: 'ORG_FREE',
    } as any);
    mockedPrisma.gateway.count.mockResolvedValue(ORG_PLAN_LIMITS.ORG_FREE.sharedGateways);

    try {
      await gatewayService.create(
        {
          userId,
          plan: 'FREE',
          effectivePlan: 'FREE',
          isOrgContext: () => true,
          organizationId: orgId,
        } as any,
        {
          name: 'Gateway 3',
          type: 'AI',
          credentials: { provider: 'openai', apiKey: 'test' },
        }
      );
      throw new Error('Should have thrown');
    } catch (error: any) {
      expect(error).toBeInstanceOf(OrgPlanLimitError);
      expect(error.name).toBe('OrgPlanLimitError');
      expect(error.upgradeUrl).toBe('/organizations/billing/upgrade');
      expect(error.resource).toBe('gateways');
    }
  });
});
