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
  // Default: no duplicate gateways
  mockedPrisma.gateway.findMany.mockResolvedValue([]);
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

// ===========================================
// Duplicate Credential Prevention Tests
// ===========================================

describe('Gateway duplicate credential prevention', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prevents creating gateway with duplicate Telegram bot token', async () => {
    const ctx = createTestContext();
    const botToken = '123456789:ABCdefGHIjklMNOpqrsTUVwxyz';
    
    // Mock existing gateway with same bot token
    mockedPrisma.gateway.findMany.mockResolvedValue([
      {
        id: 'existing-gw',
        name: 'Existing Bot',
        type: 'TELEGRAM_BOT',
        credentialsEnc: `encrypted:{"botToken":"${botToken}"}`,
        userId: 'other-user',
        organizationId: null,
        user: { email: 'other@example.com' },
        organization: null,
      },
    ]);

    const newGatewayData = {
      name: 'My Bot',
      type: 'TELEGRAM_BOT' as const,
      credentials: { botToken },
    };

    await expect(gatewayService.create(ctx, newGatewayData)).rejects.toThrow(
      /bot token is already in use/i
    );
  });

  it('prevents updating gateway to use duplicate Telegram bot token', async () => {
    const ctx = createTestContext();
    const duplicateToken = '987654321:XYZabcDEFghiJKLmno';
    
    // Mock the gateway being updated
    mockedPrisma.gateway.findUnique.mockResolvedValue({
      ...mockGateway,
      id: 'gw-to-update',
    });
    
    // Mock existing gateway with the token we're trying to use
    mockedPrisma.gateway.findMany.mockResolvedValue([
      {
        id: 'existing-gw',
        name: 'Other Bot',
        type: 'TELEGRAM_BOT',
        credentialsEnc: `encrypted:{"botToken":"${duplicateToken}"}`,
        userId: 'other-user',
        organizationId: null,
        user: { email: 'other@example.com' },
        organization: null,
      },
    ]);

    await expect(
      gatewayService.update(ctx, 'gw-to-update', {
        credentials: { botToken: duplicateToken },
      })
    ).rejects.toThrow(/bot token is already in use/i);
  });

  it('allows creating gateway with unique Telegram bot token', async () => {
    const ctx = createTestContext();
    const uniqueToken = '111111111:UniqueTokenValue';
    
    // Mock no existing gateways with this token
    mockedPrisma.gateway.findMany.mockResolvedValue([]);
    
    mockedPrisma.gateway.create.mockResolvedValue({
      ...mockGateway,
      credentialsEnc: `encrypted:{"botToken":"${uniqueToken}"}`,
    });

    const result = await gatewayService.create(ctx, {
      name: 'Unique Bot',
      type: 'TELEGRAM_BOT',
      credentials: { botToken: uniqueToken },
    });

    expect(result).toBeDefined();
    expect(mockedPrisma.gateway.create).toHaveBeenCalled();
  });

  it('allows same user to update their own gateway credentials', async () => {
    const ctx = createTestContext();
    const newToken = '222222222:UpdatedTokenValue';
    
    // Mock the gateway being updated (same user)
    mockedPrisma.gateway.findUnique.mockResolvedValue({
      ...mockGateway,
      id: 'gw-update',
      userId: ctx.userId,
    });
    
    // Mock only this gateway exists with old token
    mockedPrisma.gateway.findMany.mockResolvedValue([
      {
        id: 'gw-update',
        name: 'My Bot',
        type: 'TELEGRAM_BOT',
        credentialsEnc: `encrypted:{"botToken":"old-token"}`,
        userId: ctx.userId,
        organizationId: null,
        user: { email: 'user@example.com' },
        organization: null,
      },
    ]);
    
    mockedPrisma.gateway.update.mockResolvedValue({
      ...mockGateway,
      id: 'gw-update',
      credentialsEnc: `encrypted:{"botToken":"${newToken}"}`,
    });

    const result = await gatewayService.update(ctx, 'gw-update', {
      credentials: { botToken: newToken },
    });

    expect(result).toBeDefined();
    expect(mockedPrisma.gateway.update).toHaveBeenCalled();
  });

  it('allows duplicate AI credentials (same API key can be used multiple times)', async () => {
    const ctx = createTestContext();
    const apiKey = 'sk-same-api-key';
    
    // Mock existing AI gateway with same API key
    mockedPrisma.gateway.findMany.mockResolvedValue([
      {
        id: 'existing-ai',
        name: 'Existing AI',
        type: 'AI',
        credentialsEnc: `encrypted:{"provider":"openai","apiKey":"${apiKey}"}`,
        userId: 'other-user',
        organizationId: null,
        user: { email: 'other@example.com' },
        organization: null,
      },
    ]);
    
    mockedPrisma.gateway.create.mockResolvedValue({
      ...mockGateway,
      type: 'AI',
      credentialsEnc: `encrypted:{"provider":"openai","apiKey":"${apiKey}"}`,
    });

    // Should NOT throw - AI credentials can be duplicated
    const result = await gatewayService.create(ctx, {
      name: 'My AI',
      type: 'AI',
      credentials: { provider: 'openai', apiKey },
    });

    expect(result).toBeDefined();
  });

  it('provides helpful error message with owner information', async () => {
    const ctx = createTestContext();
    const botToken = '123456789:ABCdefGHIjklMNOpqrsTUVwxyz';
    
    // Mock existing gateway owned by organization
    mockedPrisma.gateway.findMany.mockResolvedValue([
      {
        id: 'org-gw',
        name: 'Company Bot',
        type: 'TELEGRAM_BOT',
        credentialsEnc: `encrypted:{"botToken":"${botToken}"}`,
        userId: 'org-owner',
        organizationId: 'org-123',
        user: { email: 'owner@company.com' },
        organization: { name: 'ACME Corp' },
      },
    ]);

    try {
      await gatewayService.create(ctx, {
        name: 'My Bot',
        type: 'TELEGRAM_BOT',
        credentials: { botToken },
      });
      expect.fail('Should have thrown error');
    } catch (error: any) {
      expect(error.message).toContain('bot token is already in use');
      expect(error.message).toContain('Company Bot');
      expect(error.message).toContain('ACME Corp');
    }
  });
});
