/**
 * Gateway Service Tests
 *
 * Tests for Gateway CRUD operations, ownership checks,
 * credential encryption, and plan limit enforcement.
 *
 * @module modules/gateway/__tests__/gateway.service.test
 */

import type { PlanType } from '@/shared/constants/plans';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ===========================================
// Mock Dependencies
// ===========================================

vi.mock('@/lib/prisma', () => ({
  prisma: {
    gateway: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    subscription: {
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

vi.mock('@/lib/plan-limits', () => ({
  enforceGatewayLimit: vi.fn(),
}));

// Import after mocking
import { enforceGatewayLimit } from '@/lib/plan-limits';
import { prisma } from '@/lib/prisma';
import { ForbiddenError, NotFoundError } from '@/shared/errors';
import { createServiceContext } from '@/shared/types/context';
import { gatewayService } from '../gateway.service';

const mockedPrisma = prisma as unknown as {
  gateway: {
    findUnique: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };
  subscription: {
    findUnique: ReturnType<typeof vi.fn>;
  };
};

// ===========================================
// Test Data
// ===========================================

const mockGateway = {
  id: 'gw-123',
  userId: 'user-123',
  organizationId: null,
  name: 'My Telegram Bot',
  type: 'TELEGRAM_BOT' as const,
  status: 'CONNECTED' as const,
  credentialsEnc: 'encrypted:{"botToken":"123456:ABC"}',
  config: {},
  lastConnectedAt: new Date(),
  lastError: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockOrgGateway = {
  ...mockGateway,
  id: 'gw-org-123',
  userId: 'user-456',
  organizationId: 'org-123',
  name: 'Org Telegram Bot',
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
// create Tests
// ===========================================

describe('gatewayService.create', () => {
  it('creates a gateway with encrypted credentials', async () => {
    mockedPrisma.gateway.create.mockResolvedValue(mockGateway);
    (enforceGatewayLimit as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const ctx = createTestContext();
    const result = await gatewayService.create(ctx, {
      name: 'My Telegram Bot',
      type: 'TELEGRAM_BOT',
      credentials: { botToken: '123456:ABC' },
    });

    expect(result.id).toBe('gw-123');
    expect(result.name).toBe('My Telegram Bot');
    expect(result.type).toBe('TELEGRAM_BOT');
    expect(mockedPrisma.gateway.create).toHaveBeenCalled();
  });

  it('checks plan limits before creating', async () => {
    mockedPrisma.gateway.create.mockResolvedValue(mockGateway);
    (enforceGatewayLimit as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const ctx = createTestContext();
    await gatewayService.create(ctx, {
      name: 'My Bot',
      type: 'TELEGRAM_BOT',
      credentials: { botToken: '123' },
    });

    expect(enforceGatewayLimit).toHaveBeenCalledWith(ctx);
  });

  it('throws error if plan limit exceeded', async () => {
    (enforceGatewayLimit as ReturnType<typeof vi.fn>).mockRejectedValue(
      new ForbiddenError('Gateway limit exceeded')
    );

    const ctx = createTestContext({ plan: 'FREE' });

    await expect(
      gatewayService.create(ctx, {
        name: 'My Bot',
        type: 'TELEGRAM_BOT',
        credentials: { botToken: '123' },
      })
    ).rejects.toThrow('Gateway limit exceeded');
  });

  it('creates gateway in organization context', async () => {
    mockedPrisma.gateway.create.mockResolvedValue(mockOrgGateway);
    (enforceGatewayLimit as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const ctx = createTestContext({ organizationId: 'org-123' });
    const result = await gatewayService.create(ctx, {
      name: 'Org Bot',
      type: 'TELEGRAM_BOT',
      credentials: { botToken: '123' },
    });

    expect(result.id).toBe('gw-org-123');
    expect(mockedPrisma.gateway.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: 'org-123',
        }),
      })
    );
  });
});

// ===========================================
// findById Tests
// ===========================================

describe('gatewayService.findById', () => {
  it('returns gateway if user owns it', async () => {
    mockedPrisma.gateway.findUnique.mockResolvedValue(mockGateway);

    const ctx = createTestContext();
    const result = await gatewayService.findById(ctx, 'gw-123');

    expect(result.id).toBe('gw-123');
  });

  it('throws NotFoundError if gateway does not exist', async () => {
    mockedPrisma.gateway.findUnique.mockResolvedValue(null);

    const ctx = createTestContext();

    await expect(gatewayService.findById(ctx, 'gw-999')).rejects.toThrow(NotFoundError);
  });

  it('throws ForbiddenError if user does not own gateway', async () => {
    mockedPrisma.gateway.findUnique.mockResolvedValue({
      ...mockGateway,
      userId: 'other-user',
    });

    const ctx = createTestContext();

    await expect(gatewayService.findById(ctx, 'gw-123')).rejects.toThrow(ForbiddenError);
  });

  it('allows access if gateway belongs to user organization', async () => {
    mockedPrisma.gateway.findUnique.mockResolvedValue(mockOrgGateway);

    const ctx = createTestContext({ organizationId: 'org-123' });
    const result = await gatewayService.findById(ctx, 'gw-org-123');

    expect(result.id).toBe('gw-org-123');
  });
});

// ===========================================
// findByUser Tests
// ===========================================

describe('gatewayService.findByUser', () => {
  it('returns user gateways in personal context', async () => {
    mockedPrisma.gateway.findMany.mockResolvedValue([
      { id: 'gw-1', name: 'Bot 1', type: 'TELEGRAM_BOT', status: 'CONNECTED' },
      { id: 'gw-2', name: 'Bot 2', type: 'AI', status: 'DISCONNECTED' },
    ]);

    const ctx = createTestContext();
    const result = await gatewayService.findByUser(ctx);

    expect(result).toHaveLength(2);
    expect(mockedPrisma.gateway.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-123', organizationId: null },
      })
    );
  });

  it('returns org gateways in organization context', async () => {
    mockedPrisma.gateway.findMany.mockResolvedValue([mockOrgGateway]);

    const ctx = createTestContext({ organizationId: 'org-123' });
    const result = await gatewayService.findByUser(ctx);

    expect(result).toHaveLength(1);
    expect(mockedPrisma.gateway.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: 'org-123' },
      })
    );
  });

  it('returns empty array if no gateways', async () => {
    mockedPrisma.gateway.findMany.mockResolvedValue([]);

    const ctx = createTestContext();
    const result = await gatewayService.findByUser(ctx);

    expect(result).toEqual([]);
  });
});

// ===========================================
// update Tests
// ===========================================

describe('gatewayService.update', () => {
  it('updates gateway name', async () => {
    mockedPrisma.gateway.findUnique.mockResolvedValue(mockGateway);
    mockedPrisma.gateway.update.mockResolvedValue({
      ...mockGateway,
      name: 'Updated Name',
    });

    const ctx = createTestContext();
    const result = await gatewayService.update(ctx, 'gw-123', {
      name: 'Updated Name',
    });

    expect(result.name).toBe('Updated Name');
    expect(mockedPrisma.gateway.update).toHaveBeenCalledWith({
      where: { id: 'gw-123' },
      data: expect.objectContaining({ name: 'Updated Name' }),
    });
  });

  it('updates and re-encrypts credentials', async () => {
    mockedPrisma.gateway.findUnique.mockResolvedValue(mockGateway);
    mockedPrisma.gateway.update.mockResolvedValue(mockGateway);

    const ctx = createTestContext();
    await gatewayService.update(ctx, 'gw-123', {
      credentials: { botToken: 'new-token' },
    });

    expect(mockedPrisma.gateway.update).toHaveBeenCalledWith({
      where: { id: 'gw-123' },
      data: expect.objectContaining({
        credentialsEnc: expect.stringContaining('encrypted:'),
      }),
    });
  });

  it('throws ForbiddenError if updating another user gateway', async () => {
    mockedPrisma.gateway.findUnique.mockResolvedValue({
      ...mockGateway,
      userId: 'other-user',
    });

    const ctx = createTestContext();

    await expect(
      gatewayService.update(ctx, 'gw-123', { name: 'Hacked' })
    ).rejects.toThrow(ForbiddenError);
  });
});

// ===========================================
// delete Tests
// ===========================================

describe('gatewayService.delete', () => {
  it('deletes owned gateway', async () => {
    mockedPrisma.gateway.findUnique.mockResolvedValue(mockGateway);
    mockedPrisma.gateway.delete.mockResolvedValue(mockGateway);

    const ctx = createTestContext();
    await gatewayService.delete(ctx, 'gw-123');

    expect(mockedPrisma.gateway.delete).toHaveBeenCalledWith({
      where: { id: 'gw-123' },
    });
  });

  it('throws ForbiddenError if deleting another user gateway', async () => {
    mockedPrisma.gateway.findUnique.mockResolvedValue({
      ...mockGateway,
      userId: 'other-user',
    });

    const ctx = createTestContext();

    await expect(gatewayService.delete(ctx, 'gw-123')).rejects.toThrow(ForbiddenError);
  });

  it('throws NotFoundError if gateway does not exist', async () => {
    mockedPrisma.gateway.findUnique.mockResolvedValue(null);

    const ctx = createTestContext();

    await expect(gatewayService.delete(ctx, 'gw-999')).rejects.toThrow(NotFoundError);
  });
});

// ===========================================
// updateStatus Tests
// ===========================================

describe('gatewayService.updateStatus', () => {
  it('updates status to CONNECTED', async () => {
    mockedPrisma.gateway.findUnique.mockResolvedValue(mockGateway);
    mockedPrisma.gateway.update.mockResolvedValue({
      ...mockGateway,
      status: 'CONNECTED',
      lastConnectedAt: new Date(),
    });

    const result = await gatewayService.updateStatus('gw-123', 'CONNECTED');

    expect(result.status).toBe('CONNECTED');
  });

  it('updates status to DISCONNECTED with error', async () => {
    mockedPrisma.gateway.findUnique.mockResolvedValue(mockGateway);
    mockedPrisma.gateway.update.mockResolvedValue({
      ...mockGateway,
      status: 'DISCONNECTED',
      lastError: 'Connection timeout',
    });

    const result = await gatewayService.updateStatus('gw-123', 'DISCONNECTED', 'Connection timeout');

    expect(result.status).toBe('DISCONNECTED');
  });
});

// ===========================================
// Credential Security Tests
// ===========================================

describe('Gateway credential security', () => {
  it('never exposes raw credentials in responses', async () => {
    mockedPrisma.gateway.findUnique.mockResolvedValue(mockGateway);

    const ctx = createTestContext();
    const result = await gatewayService.findByIdSafe(ctx, 'gw-123');

    // SafeGateway should not have raw encrypted credentials
    expect(result).not.toHaveProperty('credentialsEnc');
    // Should have credentialInfo instead
    expect(result.credentialInfo).toBeDefined();
    expect(result.credentialInfo.type).toBe('TELEGRAM_BOT');
  });
});
