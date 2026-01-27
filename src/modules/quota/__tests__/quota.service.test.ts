/**
 * Quota Service Tests
 *
 * Tests for resource quota checking, usage tracking,
 * and limit enforcement across users and organizations.
 *
 * @module modules/quota/__tests__/quota.service.test
 */

import type { PlanType } from '@/shared/constants/plans';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ===========================================
// Mock Dependencies
// ===========================================

vi.mock('@/lib/prisma', () => ({
  prisma: {
    subscription: {
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
    usageRecord: {
      findMany: vi.fn(),
      create: vi.fn(),
      aggregate: vi.fn(),
    },
    quota: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    resourceQuota: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

// Import after mocking
import { prisma } from '@/lib/prisma';
import { createServiceContext } from '@/shared/types/context';
import { QuotaExceededError, quotaService } from '../quota.service';
import { ResourceType } from '../quota.types';

const mockedPrisma = prisma as unknown as {
  subscription: {
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
  usageRecord: {
    findMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    aggregate: ReturnType<typeof vi.fn>;
  };
  quota: {
    findUnique: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
  };
  resourceQuota: {
    findUnique: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
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
      plan: options.plan || 'PRO',
    },
    {},
    {
      contextType: options.organizationId ? 'organization' : 'personal',
      organizationId: options.organizationId,
      effectivePlan: options.plan || 'PRO',
    }
  );
}

// ===========================================
// Setup / Teardown
// ===========================================

beforeEach(() => {
  vi.clearAllMocks();
  
  // Setup default mocks for all database calls
  // resourceQuota.upsert returns quota record with zeros
  mockedPrisma.resourceQuota.upsert.mockResolvedValue({
    id: 'quota-123',
    usedWorkflows: 0,
    usedPlugins: 0,
    usedApiCalls: 0,
    usedStorage: 0,
    apiCallsResetAt: null,
  });
  
  // Default counts to 0
  mockedPrisma.gateway.count.mockResolvedValue(0);
  mockedPrisma.userPlugin.count.mockResolvedValue(0);
  mockedPrisma.workflow.count.mockResolvedValue(0);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ===========================================
// QuotaExceededError Tests
// ===========================================

describe('QuotaExceededError', () => {
  it('creates error with resource details', () => {
    const error = new QuotaExceededError(ResourceType.GATEWAY, 5, 5);

    expect(error.message).toContain('Quota exceeded');
    expect(error.message).toContain('gateway');
    expect(error.resource).toBe(ResourceType.GATEWAY);
    expect(error.current).toBe(5);
    expect(error.limit).toBe(5);
  });

  it('has correct error code', () => {
    const error = new QuotaExceededError(ResourceType.PLUGIN, 10, 10);

    expect(error.code).toBe('QUOTA_EXCEEDED');
    expect(error.statusCode).toBe(403);
  });
});

// ===========================================
// checkQuota Tests
// ===========================================

describe('quotaService.checkQuota', () => {
  it('allows operation within quota', async () => {
    // PRO plan has 10 gateway limit, user has 2
    mockedPrisma.gateway.count.mockResolvedValue(2);

    const ctx = createTestContext({ plan: 'PRO' });

    // Should not throw - 2 < 10
    await expect(
      quotaService.checkQuota(ctx, ResourceType.GATEWAY)
    ).resolves.toBeUndefined();
  });

  it('throws QuotaExceededError when limit reached', async () => {
    // FREE plan has 1 gateway limit, user has 1
    mockedPrisma.gateway.count.mockResolvedValue(1);

    const ctx = createTestContext({ plan: 'FREE' });

    // Should throw - 1 >= 1 (at limit)
    await expect(
      quotaService.checkQuota(ctx, ResourceType.GATEWAY)
    ).rejects.toThrow(QuotaExceededError);
  });

  it('allows unlimited resources for ENTERPRISE plan', async () => {
    mockedPrisma.gateway.count.mockResolvedValue(100);

    const ctx = createTestContext({ plan: 'ENTERPRISE' });

    // ENTERPRISE is unlimited, should not throw
    await expect(
      quotaService.checkQuota(ctx, ResourceType.GATEWAY)
    ).resolves.toBeUndefined();
  });
});

// ===========================================
// canUseResource Tests
// ===========================================

describe('quotaService.canUseResource', () => {
  it('returns allowed:true when within limits', async () => {
    // PRO plan has 10 gateway limit, user has 2
    mockedPrisma.gateway.count.mockResolvedValue(2);

    const ctx = createTestContext({ plan: 'PRO' });
    const result = await quotaService.canUseResource(ctx, ResourceType.GATEWAY);

    expect(result.allowed).toBe(true);
    expect(result.current).toBe(2);
    expect(result.limit).toBe(10); // PRO limit
    expect(result.resource).toBe(ResourceType.GATEWAY);
  });

  it('returns allowed:false when at limit', async () => {
    // FREE plan has 1 gateway limit, user has 1
    mockedPrisma.gateway.count.mockResolvedValue(1);

    const ctx = createTestContext({ plan: 'FREE' });
    const result = await quotaService.canUseResource(ctx, ResourceType.GATEWAY);

    expect(result.allowed).toBe(false);
    expect(result.current).toBe(1);
    expect(result.limit).toBe(1); // FREE limit
    expect(result.message).toContain('exceed');
  });

  it('checks with custom amount', async () => {
    // PRO plan has 10 gateway limit, user has 8
    mockedPrisma.gateway.count.mockResolvedValue(8);

    const ctx = createTestContext({ plan: 'PRO' });

    // Adding 1 should be allowed (8 + 1 = 9 <= 10)
    const result1 = await quotaService.canUseResource(ctx, ResourceType.GATEWAY, 1);
    expect(result1.allowed).toBe(true);

    // Adding 3 should exceed (8 + 3 = 11 > 10)
    const result2 = await quotaService.canUseResource(ctx, ResourceType.GATEWAY, 3);
    expect(result2.allowed).toBe(false);
  });

  it('returns null limit for ENTERPRISE (unlimited)', async () => {
    mockedPrisma.gateway.count.mockResolvedValue(50);

    const ctx = createTestContext({ plan: 'ENTERPRISE' });
    const result = await quotaService.canUseResource(ctx, ResourceType.GATEWAY);

    expect(result.allowed).toBe(true);
    expect(result.limit).toBeNull();
    expect(result.current).toBe(50);
  });
});

// ===========================================
// getQuotaStatus Tests
// ===========================================

describe('quotaService.getQuotaStatus', () => {
  it('returns status for all resource types', async () => {
    // Gateway count is read directly from database
    mockedPrisma.gateway.count.mockResolvedValue(2);
    // But plugins and workflows are read from quota record (usedPlugins, usedWorkflows)
    // The quota.upsert must return the actual usage values
    mockedPrisma.resourceQuota.upsert.mockResolvedValue({
      id: 'quota-123',
      usedWorkflows: 3,
      usedPlugins: 5,
      usedApiCalls: 100,
      usedStorage: 50,
      apiCallsResetAt: null,
    });

    const ctx = createTestContext({ plan: 'PRO' });
    const status = await quotaService.getQuotaStatus(ctx);

    expect(status).toBeDefined();
    expect(status.gateways).toBeDefined();
    expect(status.gateways.used).toBe(2);  // From gateway.count
    expect(status.gateways.limit).toBe(10); // PRO limit
    expect(status.plugins.used).toBe(5);   // From quota.usedPlugins
    expect(status.workflows.used).toBe(3); // From quota.usedWorkflows
    expect(status.apiCalls.used).toBe(100);
    expect(status.storage.used).toBe(50);
  });

  it('shows isUnlimited for enterprise resources', async () => {
    mockedPrisma.gateway.count.mockResolvedValue(50);
    mockedPrisma.userPlugin.count.mockResolvedValue(100);
    mockedPrisma.workflow.count.mockResolvedValue(200);

    const ctx = createTestContext({ plan: 'ENTERPRISE' });
    const status = await quotaService.getQuotaStatus(ctx);

    // ENTERPRISE has unlimited gateways
    expect(status.gateways.isUnlimited).toBe(true);
  });
});

// ===========================================
// Organization Context Tests
// ===========================================

describe('Quota in organization context', () => {
  it('uses organization quota for org context', async () => {
    mockedPrisma.gateway.count.mockResolvedValue(5);

    const ctx = createTestContext({ organizationId: 'org-123', plan: 'BUSINESS' });
    const result = await quotaService.canUseResource(ctx, ResourceType.GATEWAY);

    expect(result.allowed).toBe(true);
    expect(result.current).toBe(5);
    expect(mockedPrisma.gateway.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        organizationId: 'org-123',
      }),
    });
  });
});

// ===========================================
// Plan Limits Integration Tests
// ===========================================

describe('Plan-based quota limits', () => {
  it('FREE plan has gateway limit of 1', async () => {
    mockedPrisma.gateway.count.mockResolvedValue(0);

    const ctx = createTestContext({ plan: 'FREE' });
    const result = await quotaService.canUseResource(ctx, ResourceType.GATEWAY);

    expect(result.limit).toBe(1);
  });

  it('STARTER plan has gateway limit of 3', async () => {
    mockedPrisma.gateway.count.mockResolvedValue(0);

    const ctx = createTestContext({ plan: 'STARTER' });
    const result = await quotaService.canUseResource(ctx, ResourceType.GATEWAY);

    expect(result.limit).toBe(3);
  });

  it('PRO plan has gateway limit of 10', async () => {
    mockedPrisma.gateway.count.mockResolvedValue(0);

    const ctx = createTestContext({ plan: 'PRO' });
    const result = await quotaService.canUseResource(ctx, ResourceType.GATEWAY);

    expect(result.limit).toBe(10);
  });

  it('BUSINESS plan has gateway limit of 25', async () => {
    mockedPrisma.gateway.count.mockResolvedValue(0);

    const ctx = createTestContext({ plan: 'BUSINESS' });
    const result = await quotaService.canUseResource(ctx, ResourceType.GATEWAY);

    expect(result.limit).toBe(25);
  });

  it('ENTERPRISE plan has unlimited gateways', async () => {
    mockedPrisma.gateway.count.mockResolvedValue(0);

    const ctx = createTestContext({ plan: 'ENTERPRISE' });
    const result = await quotaService.canUseResource(ctx, ResourceType.GATEWAY);

    expect(result.limit).toBeNull();
    expect(result.allowed).toBe(true);
  });
});
