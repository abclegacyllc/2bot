/**
 * Plugin Service Tests
 *
 * Tests for plugin catalog, installation, configuration,
 * and ownership checks.
 *
 * @module modules/plugin/__tests__/plugin.service.test
 */

import type { PlanType } from '@/shared/constants/plans';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ===========================================
// Mock Dependencies
// ===========================================

vi.mock('@/lib/prisma', () => ({
  prisma: {
    plugin: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    userPlugin: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    gateway: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    subscription: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('@/lib/audit', () => ({
  auditActions: {
    pluginInstalled: vi.fn(),
    pluginUninstalled: vi.fn(),
    pluginConfigured: vi.fn(),
  },
}));

vi.mock('@/lib/plan-limits', () => ({
  enforcePluginLimit: vi.fn(),
}));

// Import after mocking
import { enforcePluginLimit } from '@/lib/plan-limits';
import { prisma } from '@/lib/prisma';
import { ForbiddenError, NotFoundError, ValidationError } from '@/shared/errors';
import { createServiceContext } from '@/shared/types/context';
import { pluginService } from '../plugin.service';

const mockedPrisma = prisma as unknown as {
  plugin: {
    findUnique: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
  };
  userPlugin: {
    findUnique: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };
  gateway: {
    findUnique: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
  };
  subscription: {
    findUnique: ReturnType<typeof vi.fn>;
  };
};

// ===========================================
// Test Data
// ===========================================

const mockPlugin = {
  id: 'plugin-123',
  slug: 'auto-reply',
  name: 'Auto Reply',
  description: 'Automatically reply to messages',
  version: '1.0.0',
  category: 'automation',
  isActive: true,
  isPremium: false,
  requiredGateways: ['TELEGRAM_BOT'],
  tags: ['automation', 'messages'],
  icon: '🤖',
  author: '2bot',
  configSchema: {
    type: 'object',
    properties: {
      message: { type: 'string' },
      delay: { type: 'number', default: 0 },
    },
    required: ['message'],
  },
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockUserPlugin = {
  id: 'up-123',
  userId: 'user-123',
  organizationId: null,
  pluginId: 'plugin-123',
  gatewayId: 'gw-123',
  isEnabled: true,
  config: { message: 'Hello!' },
  executionCount: 100,
  lastExecutedAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
  plugin: mockPlugin,
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
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ===========================================
// getAvailablePlugins Tests
// ===========================================

describe('pluginService.getAvailablePlugins', () => {
  it('returns all active plugins', async () => {
    mockedPrisma.plugin.findMany.mockResolvedValue([mockPlugin]);

    const result = await pluginService.getAvailablePlugins();

    expect(result).toHaveLength(1);
    expect(result[0]!.slug).toBe('auto-reply');
    expect(mockedPrisma.plugin.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isActive: true },
      })
    );
  });

  it('filters by category', async () => {
    mockedPrisma.plugin.findMany.mockResolvedValue([mockPlugin]);

    await pluginService.getAvailablePlugins({ category: 'automation' });

    expect(mockedPrisma.plugin.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isActive: true,
          category: 'automation',
        }),
      })
    );
  });

  it('filters by required gateway', async () => {
    mockedPrisma.plugin.findMany.mockResolvedValue([mockPlugin]);

    await pluginService.getAvailablePlugins({ gateway: 'TELEGRAM_BOT' });

    expect(mockedPrisma.plugin.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          requiredGateways: { has: 'TELEGRAM_BOT' },
        }),
      })
    );
  });

  it('searches by name or description', async () => {
    mockedPrisma.plugin.findMany.mockResolvedValue([mockPlugin]);

    await pluginService.getAvailablePlugins({ search: 'reply' });

    expect(mockedPrisma.plugin.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            expect.objectContaining({ name: expect.any(Object) }),
          ]),
        }),
      })
    );
  });
});

// ===========================================
// getPluginBySlug Tests
// ===========================================

describe('pluginService.getPluginBySlug', () => {
  it('returns plugin definition by slug', async () => {
    mockedPrisma.plugin.findUnique.mockResolvedValue(mockPlugin);

    const result = await pluginService.getPluginBySlug('auto-reply');

    expect(result.slug).toBe('auto-reply');
    expect(result.name).toBe('Auto Reply');
  });

  it('throws NotFoundError for non-existent plugin', async () => {
    mockedPrisma.plugin.findUnique.mockResolvedValue(null);

    await expect(pluginService.getPluginBySlug('non-existent')).rejects.toThrow(NotFoundError);
  });

  it('throws NotFoundError for inactive plugin', async () => {
    mockedPrisma.plugin.findUnique.mockResolvedValue({
      ...mockPlugin,
      isActive: false,
    });

    await expect(pluginService.getPluginBySlug('auto-reply')).rejects.toThrow(NotFoundError);
  });
});

// ===========================================
// installPlugin Tests
// ===========================================

describe('pluginService.installPlugin', () => {
  it('installs plugin for user', async () => {
    mockedPrisma.plugin.findUnique.mockResolvedValue(mockPlugin);
    mockedPrisma.userPlugin.findFirst.mockResolvedValue(null); // Not already installed
    mockedPrisma.gateway.findUnique.mockResolvedValue({ id: 'gw-123', type: 'TELEGRAM_BOT', userId: 'user-123' });
    mockedPrisma.userPlugin.create.mockResolvedValue(mockUserPlugin);
    (enforcePluginLimit as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const ctx = createTestContext();
    const result = await pluginService.installPlugin(ctx, {
      slug: 'auto-reply',
      gatewayId: 'gw-123',
      config: { message: 'Hello!' },
    });

    expect(result.pluginId).toBe('plugin-123');
    expect(mockedPrisma.userPlugin.create).toHaveBeenCalled();
  });

  it('validates config against schema', async () => {
    mockedPrisma.plugin.findUnique.mockResolvedValue(mockPlugin);
    mockedPrisma.userPlugin.findFirst.mockResolvedValue(null);
    mockedPrisma.gateway.findUnique.mockResolvedValue({ id: 'gw-123', type: 'TELEGRAM_BOT', userId: 'user-123' });
    (enforcePluginLimit as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const ctx = createTestContext();

    // Missing required 'message' field
    await expect(
      pluginService.installPlugin(ctx, {
        slug: 'auto-reply',
        gatewayId: 'gw-123',
        config: { delay: 100 }, // Missing 'message'
      })
    ).rejects.toThrow(ValidationError);
  });

  it('checks plan limits', async () => {
    mockedPrisma.plugin.findUnique.mockResolvedValue(mockPlugin);
    (enforcePluginLimit as ReturnType<typeof vi.fn>).mockRejectedValue(
      new ForbiddenError('Plugin limit exceeded')
    );

    const ctx = createTestContext({ plan: 'FREE' });

    await expect(
      pluginService.installPlugin(ctx, {
        slug: 'auto-reply',
        gatewayId: 'gw-123',
        config: { message: 'Hi' },
      })
    ).rejects.toThrow('Plugin limit exceeded');
  });

  it('requires matching gateway type', async () => {
    mockedPrisma.plugin.findUnique.mockResolvedValue(mockPlugin); // Requires TELEGRAM
    mockedPrisma.userPlugin.findFirst.mockResolvedValue(null);
    mockedPrisma.gateway.findUnique.mockResolvedValue({ id: 'gw-123', type: 'WHATSAPP', userId: 'user-123' }); // Has WHATSAPP
    (enforcePluginLimit as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const ctx = createTestContext();

    await expect(
      pluginService.installPlugin(ctx, {
        slug: 'auto-reply',
        gatewayId: 'gw-123',
        config: { message: 'Hi' },
      })
    ).rejects.toThrow(); // Should throw because gateway type doesn't match
  });
});

// ===========================================
// getUserPlugins Tests
// ===========================================

describe('pluginService.getUserPlugins', () => {
  it('returns user installed plugins', async () => {
    mockedPrisma.userPlugin.findMany.mockResolvedValue([mockUserPlugin]);

    const ctx = createTestContext();
    const result = await pluginService.getUserPlugins(ctx);

    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('up-123');
  });

  it('filters by enabled status', async () => {
    mockedPrisma.userPlugin.findMany.mockResolvedValue([mockUserPlugin]);

    const ctx = createTestContext();
    await pluginService.getUserPlugins(ctx, { enabled: true });

    expect(mockedPrisma.userPlugin.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isEnabled: true,
        }),
      })
    );
  });

  it('returns empty array if no plugins installed', async () => {
    mockedPrisma.userPlugin.findMany.mockResolvedValue([]);

    const ctx = createTestContext();
    const result = await pluginService.getUserPlugins(ctx);

    expect(result).toEqual([]);
  });
});

// ===========================================
// updatePluginConfig Tests
// ===========================================

describe('pluginService.updatePluginConfig', () => {
  it('updates plugin configuration', async () => {
    mockedPrisma.userPlugin.findUnique.mockResolvedValue(mockUserPlugin);
    mockedPrisma.userPlugin.update.mockResolvedValue({
      ...mockUserPlugin,
      config: { message: 'Updated!' },
    });

    const ctx = createTestContext();
    const result = await pluginService.updatePluginConfig(ctx, 'up-123', {
      config: { message: 'Updated!' },
    });

    expect(result.config).toEqual({ message: 'Updated!' });
  });

  it('validates new config against schema', async () => {
    mockedPrisma.userPlugin.findUnique.mockResolvedValue(mockUserPlugin);

    const ctx = createTestContext();

    await expect(
      pluginService.updatePluginConfig(ctx, 'up-123', {
        config: { delay: 'invalid' }, // Should be number
      })
    ).rejects.toThrow(ValidationError);
  });

  it('throws ForbiddenError for other user plugin', async () => {
    mockedPrisma.userPlugin.findUnique.mockResolvedValue({
      ...mockUserPlugin,
      userId: 'other-user',
    });

    const ctx = createTestContext();

    await expect(
      pluginService.updatePluginConfig(ctx, 'up-123', {
        config: { message: 'Hacked!' },
      })
    ).rejects.toThrow(ForbiddenError);
  });
});

// ===========================================
// togglePlugin Tests
// ===========================================

describe('pluginService.togglePlugin', () => {
  it('enables disabled plugin', async () => {
    mockedPrisma.userPlugin.findUnique.mockResolvedValue({
      ...mockUserPlugin,
      isEnabled: false,
    });
    mockedPrisma.userPlugin.update.mockResolvedValue({
      ...mockUserPlugin,
      isEnabled: true,
    });

    const ctx = createTestContext();
    const result = await pluginService.togglePlugin(ctx, 'up-123', true);

    expect(result.isEnabled).toBe(true);
  });

  it('disables enabled plugin', async () => {
    mockedPrisma.userPlugin.findUnique.mockResolvedValue(mockUserPlugin);
    mockedPrisma.userPlugin.update.mockResolvedValue({
      ...mockUserPlugin,
      isEnabled: false,
    });

    const ctx = createTestContext();
    const result = await pluginService.togglePlugin(ctx, 'up-123', false);

    expect(result.isEnabled).toBe(false);
  });
});

// ===========================================
// uninstallPlugin Tests
// ===========================================

describe('pluginService.uninstallPlugin', () => {
  it('uninstalls owned plugin', async () => {
    mockedPrisma.userPlugin.findUnique.mockResolvedValue(mockUserPlugin);
    mockedPrisma.userPlugin.delete.mockResolvedValue(mockUserPlugin);

    const ctx = createTestContext();
    await pluginService.uninstallPlugin(ctx, 'up-123');

    expect(mockedPrisma.userPlugin.delete).toHaveBeenCalledWith({
      where: { id: 'up-123' },
    });
  });

  it('throws ForbiddenError for other user plugin', async () => {
    mockedPrisma.userPlugin.findUnique.mockResolvedValue({
      ...mockUserPlugin,
      userId: 'other-user',
    });

    const ctx = createTestContext();

    await expect(pluginService.uninstallPlugin(ctx, 'up-123')).rejects.toThrow(ForbiddenError);
  });

  it('throws NotFoundError for non-existent installation', async () => {
    mockedPrisma.userPlugin.findUnique.mockResolvedValue(null);

    const ctx = createTestContext();

    await expect(pluginService.uninstallPlugin(ctx, 'up-999')).rejects.toThrow(NotFoundError);
  });
});
