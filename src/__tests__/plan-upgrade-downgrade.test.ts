/**
 * Plan Upgrade/Downgrade Tests
 * 
 * Tests how plan changes affect resource limits and existing resources.
 * Critical for billing and subscription management.
 */

import { PlanLimitError } from '@/lib/plan-limits';
import { gatewayService } from '@/modules/gateway/gateway.service';
import { pluginService } from '@/modules/plugin/plugin.service';
import { createServiceContext } from '@/shared/types/context';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies
vi.mock('@/lib/prisma', () => ({
  prisma: {
    gateway: {
      create: vi.fn(),
      count: vi.fn(),
      findMany: vi.fn(),
    },
    userPlugin: {
      create: vi.fn(),
      count: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    plugin: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('@/lib/encryption', () => ({
  encrypt: vi.fn((data) => `encrypted:${JSON.stringify(data)}`),
}));

vi.mock('@/lib/audit', () => ({
  auditActions: {
    gatewayCreated: vi.fn(),
    pluginInstalled: vi.fn(),
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

describe('Plan Upgrades - Gateway Limits', () => {
  it('FREE -> STARTER allows creating more gateways immediately', async () => {
    const userId = 'user-upgrade-1';
    
    // Start with FREE plan (1 gateway), already at limit
    mockedPrisma.gateway.count.mockResolvedValue(1);
    
    const freeCtx = createServiceContext(
      { userId, role: 'MEMBER', plan: 'FREE' },
      {},
      { contextType: 'personal', effectivePlan: 'FREE' }
    );
    
    // Should fail - at FREE limit
    await expect(
      gatewayService.create(freeCtx, {
        name: 'Gateway 2',
        type: 'AI',
        credentials: { provider: 'openai', apiKey: 'test' },
      })
    ).rejects.toThrow(PlanLimitError);
    
    // Upgrade to STARTER (3 gateways)
    const starterCtx = createServiceContext(
      { userId, role: 'MEMBER', plan: 'STARTER' },
      {},
      { contextType: 'personal', effectivePlan: 'STARTER' }
    );
    
    mockedPrisma.gateway.create.mockResolvedValue({
      id: 'gw-2',
      userId,
      name: 'Gateway 2',
      type: 'AI',
      organizationId: null,
    });
    
    // Should now succeed - STARTER allows 3 total
    const result = await gatewayService.create(starterCtx, {
      name: 'Gateway 2',
      type: 'AI',
      credentials: { provider: 'openai', apiKey: 'test' },
    });
    
    expect(result).toBeDefined();
    expect(result.id).toBe('gw-2');
  });

  it('STARTER -> PRO increases gateway limit from 3 to 10', async () => {
    const userId = 'user-upgrade-2';
    
    // User has 3 gateways (at STARTER limit)
    mockedPrisma.gateway.count.mockResolvedValue(3);
    
    const starterCtx = createServiceContext(
      { userId, role: 'MEMBER', plan: 'STARTER' },
      {},
      { contextType: 'personal', effectivePlan: 'STARTER' }
    );
    
    // Should fail - at STARTER limit
    await expect(
      gatewayService.create(starterCtx, {
        name: 'Gateway 4',
        type: 'AI',
        credentials: { provider: 'openai', apiKey: 'test' },
      })
    ).rejects.toThrow('Gateway limit reached (3/3)');
    
    // Upgrade to PRO (10 gateways)
    const proCtx = createServiceContext(
      { userId, role: 'MEMBER', plan: 'PRO' },
      {},
      { contextType: 'personal', effectivePlan: 'PRO' }
    );
    
    mockedPrisma.gateway.create.mockResolvedValue({
      id: 'gw-4',
      userId,
      name: 'Gateway 4',
      type: 'AI',
      organizationId: null,
    });
    
    // Should now succeed - PRO allows 10 total
    const result = await gatewayService.create(proCtx, {
      name: 'Gateway 4',
      type: 'AI',
      credentials: { provider: 'openai', apiKey: 'test' },
    });
    
    expect(result).toBeDefined();
  });

  it('PRO -> ENTERPRISE removes all limits', async () => {
    const userId = 'user-upgrade-3';
    
    // User has 10 gateways (at PRO limit)
    mockedPrisma.gateway.count.mockResolvedValue(10);
    
    const proCtx = createServiceContext(
      { userId, role: 'MEMBER', plan: 'PRO' },
      {},
      { contextType: 'personal', effectivePlan: 'PRO' }
    );
    
    // Should fail - at PRO limit
    await expect(
      gatewayService.create(proCtx, {
        name: 'Gateway 11',
        type: 'AI',
        credentials: { provider: 'openai', apiKey: 'test' },
      })
    ).rejects.toThrow('Gateway limit reached (10/10)');
    
    // Upgrade to ENTERPRISE (unlimited)
    const enterpriseCtx = createServiceContext(
      { userId, role: 'MEMBER', plan: 'ENTERPRISE' },
      {},
      { contextType: 'personal', effectivePlan: 'ENTERPRISE' }
    );
    
    mockedPrisma.gateway.create.mockResolvedValue({
      id: 'gw-11',
      userId,
      name: 'Gateway 11',
      type: 'AI',
      organizationId: null,
    });
    
    // Should succeed - ENTERPRISE is unlimited (-1)
    const result = await gatewayService.create(enterpriseCtx, {
      name: 'Gateway 11',
      type: 'AI',
      credentials: { provider: 'openai', apiKey: 'test' },
    });
    
    expect(result).toBeDefined();
  });
});

describe('Plan Downgrades - Existing Resources', () => {
  it('PRO -> FREE keeps existing gateways but blocks new ones', async () => {
    const userId = 'user-downgrade-1';
    
    // User currently has 5 gateways (was on PRO)
    const existingGateways = Array.from({ length: 5 }, (_, i) => ({
      id: `gw-${i + 1}`,
      userId,
      name: `Gateway ${i + 1}`,
      type: 'AI',
      organizationId: null,
    }));
    
    mockedPrisma.gateway.count.mockResolvedValue(5);
    mockedPrisma.gateway.findMany.mockResolvedValue(existingGateways);
    
    // Downgrade to FREE (limit = 1)
    const freeCtx = createServiceContext(
      { userId, role: 'MEMBER', plan: 'FREE' },
      {},
      { contextType: 'personal', effectivePlan: 'FREE' }
    );
    
    // Existing gateways should still be accessible
    const gateways = await gatewayService.findByUser(freeCtx);
    expect(gateways).toHaveLength(5);
    
    // But cannot create new ones (already over limit)
    await expect(
      gatewayService.create(freeCtx, {
        name: 'Gateway 6',
        type: 'AI',
        credentials: { provider: 'openai', apiKey: 'test' },
      })
    ).rejects.toThrow('Gateway limit reached (5/1)');
  });

  it('BUSINESS -> STARTER keeps existing but blocks new (over limit)', async () => {
    const userId = 'user-downgrade-2';
    
    // User has 15 gateways (was on BUSINESS)
    mockedPrisma.gateway.count.mockResolvedValue(15);
    
    // Downgrade to STARTER (limit = 3)
    const starterCtx = createServiceContext(
      { userId, role: 'MEMBER', plan: 'STARTER' },
      {},
      { contextType: 'personal', effectivePlan: 'STARTER' }
    );
    
    // Cannot create new gateway - way over limit
    await expect(
      gatewayService.create(starterCtx, {
        name: 'Gateway 16',
        type: 'AI',
        credentials: { provider: 'openai', apiKey: 'test' },
      })
    ).rejects.toThrow('Gateway limit reached (15/3)');
  });
});

describe('Plan Upgrades - Plugin Limits', () => {
  it('FREE -> PRO increases plugin limit from 3 to 25', async () => {
    const userId = 'user-plugin-upgrade';
    const pluginId = 'plugin-test';
    
    // User has 3 plugins (at FREE limit)
    mockedPrisma.userPlugin.count.mockResolvedValue(3);
    mockedPrisma.userPlugin.findFirst.mockResolvedValue(null); // Not already installed
    
    const freeCtx = createServiceContext(
      { userId, role: 'MEMBER', plan: 'FREE' },
      {},
      { contextType: 'personal', effectivePlan: 'FREE' }
    );
    
    mockedPrisma.plugin.findUnique.mockResolvedValue({
      id: pluginId,
      name: 'Test Plugin',
      slug: 'test-plugin',
      version: '1.0.0',
      isActive: true,
      configSchema: {
        type: 'object',
        properties: {},
        required: [],
      },
    });
    
    // Should fail - at FREE limit
    await expect(
      pluginService.installPlugin(freeCtx, {
        pluginId,
        config: {},
      })
    ).rejects.toThrow('Plugin limit reached (3/3)');
    
    // Upgrade to PRO (25 plugins)
    const proCtx = createServiceContext(
      { userId, role: 'MEMBER', plan: 'PRO' },
      {},
      { contextType: 'personal', effectivePlan: 'PRO' }
    );
    
    mockedPrisma.userPlugin.create.mockResolvedValue({
      id: 'up-4',
      userId,
      pluginId,
      organizationId: null,
      config: {},
      isEnabled: true,
      plugin: {
        id: pluginId,
        name: 'Test Plugin',
        slug: 'test-plugin',
        description: 'A test plugin',
        version: '1.0.0',
        isActive: true,
      },
    });
    
    // Should succeed - PRO allows 25 total
    const result = await pluginService.installPlugin(proCtx, {
      pluginId,
      config: {},
    });
    
    expect(result).toBeDefined();
  });
});

describe('Edge Cases - Plan Changes', () => {
  it('handles rapid plan changes correctly', async () => {
    const userId = 'user-rapid-change';
    let currentCount = 1;
    
    mockedPrisma.gateway.count.mockImplementation(() => Promise.resolve(currentCount));
    
    // FREE: 1 gateway limit, at limit
    const freeCtx = createServiceContext(
      { userId, role: 'MEMBER', plan: 'FREE' },
      {},
      { contextType: 'personal', effectivePlan: 'FREE' }
    );
    
    await expect(
      gatewayService.create(freeCtx, {
        name: 'Gateway 2',
        type: 'AI',
        credentials: { provider: 'openai', apiKey: 'test' },
      })
    ).rejects.toThrow(PlanLimitError);
    
    // Upgrade to STARTER
    const starterCtx = createServiceContext(
      { userId, role: 'MEMBER', plan: 'STARTER' },
      {},
      { contextType: 'personal', effectivePlan: 'STARTER' }
    );
    
    mockedPrisma.gateway.create.mockResolvedValue({
      id: 'gw-2',
      userId,
      name: 'Gateway 2',
      type: 'AI',
      organizationId: null,
    });
    
    // Should work now
    await gatewayService.create(starterCtx, {
      name: 'Gateway 2',
      type: 'AI',
      credentials: { provider: 'openai', apiKey: 'test' },
    });
    
    currentCount = 2;
    
    // Immediately upgrade to PRO
    const proCtx = createServiceContext(
      { userId, role: 'MEMBER', plan: 'PRO' },
      {},
      { contextType: 'personal', effectivePlan: 'PRO' }
    );
    
    mockedPrisma.gateway.create.mockResolvedValue({
      id: 'gw-3',
      userId,
      name: 'Gateway 3',
      type: 'AI',
      organizationId: null,
    });
    
    // Should still work
    const result = await gatewayService.create(proCtx, {
      name: 'Gateway 3',
      type: 'AI',
      credentials: { provider: 'openai', apiKey: 'test' },
    });
    
    expect(result).toBeDefined();
  });

  it('validates limits use current plan, not cached', async () => {
    const userId = 'user-cache-test';
    
    mockedPrisma.gateway.count.mockResolvedValue(2);
    
    // Create with STARTER context (3 limit)
    const starterCtx = createServiceContext(
      { userId, role: 'MEMBER', plan: 'STARTER' },
      {},
      { contextType: 'personal', effectivePlan: 'STARTER' }
    );
    
    mockedPrisma.gateway.create.mockResolvedValue({
      id: 'gw-3',
      userId,
      name: 'Gateway 3',
      type: 'AI',
      organizationId: null,
    });
    
    // Should succeed - 2/3
    await gatewayService.create(starterCtx, {
      name: 'Gateway 3',
      type: 'AI',
      credentials: { provider: 'openai', apiKey: 'test' },
    });
    
    // Now count is 3
    mockedPrisma.gateway.count.mockResolvedValue(3);
    
    // If downgraded to FREE, limit check should use new plan
    const freeCtx = createServiceContext(
      { userId, role: 'MEMBER', plan: 'FREE' },
      {},
      { contextType: 'personal', effectivePlan: 'FREE' }
    );
    
    // Should fail with FREE limit (3/1), not STARTER limit
    await expect(
      gatewayService.create(freeCtx, {
        name: 'Gateway 4',
        type: 'AI',
        credentials: { provider: 'openai', apiKey: 'test' },
      })
    ).rejects.toThrow('Gateway limit reached (3/1)');
  });
});
