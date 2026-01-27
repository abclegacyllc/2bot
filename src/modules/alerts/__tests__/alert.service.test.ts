/**
 * Alert Service Tests
 *
 * Tests for the resource monitoring alert system.
 *
 * @module modules/alerts/__tests__/alert.service.test
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AlertSeverity, AlertType } from '../alert.types';

// ===========================================
// Mock Dependencies
// ===========================================

vi.mock('@/lib/prisma', () => ({
  prisma: {
    alertHistory: {
      create: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    alertConfig: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    organization: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

vi.mock('@/lib/redis', () => ({
  redis: {
    get: vi.fn(),
    setex: vi.fn(),
    del: vi.fn(),
  },
}));

vi.mock('@/lib/email', () => ({
  sendEmail: vi.fn(),
}));

vi.mock('@/lib/plan-limits', () => ({
  getResourceUsage: vi.fn().mockResolvedValue({
    plan: 'FREE',
    gateways: { current: 1, max: 1, remaining: 0 },
    plugins: { current: 2, max: 3, remaining: 1 },
    executionsToday: { current: 400, max: 500, remaining: 100 },
  }),
}));

// Import after mocking
import { sendEmail } from '@/lib/email';
import { prisma } from '@/lib/prisma';
import { redis } from '@/lib/redis';
import { alertService } from '../alert.service';

// Cast to mocked versions
const mockPrisma = prisma as unknown as {
  alertHistory: {
    create: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  alertConfig: {
    findUnique: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
  };
  organization: {
    findUnique: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
  };
};

const mockRedis = redis as unknown as {
  get: ReturnType<typeof vi.fn>;
  setex: ReturnType<typeof vi.fn>;
  del: ReturnType<typeof vi.fn>;
};

const mockSendEmail = sendEmail as unknown as ReturnType<typeof vi.fn>;

// ===========================================
// Test Data Factories
// ===========================================

function createMockAlertConfig(overrides = {}) {
  return {
    id: 'config-123',
    organizationId: 'org-123',
    quotaWarningThreshold: 80,
    quotaCriticalThreshold: 95,
    errorRateThreshold: 10,
    consecutiveFailures: 3,
    dailyCostThreshold: null,
    monthlyCostThreshold: null,
    channels: { email: true, emailAddresses: [], telegram: null, webhook: null },
    enabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function createMockAlertHistory(overrides = {}) {
  return {
    id: 'alert-123',
    organizationId: 'org-123',
    type: AlertType.QUOTA_WARNING,
    severity: AlertSeverity.WARNING,
    title: 'Test Alert',
    message: 'Test message',
    resource: 'gateways',
    currentValue: 80,
    limitValue: 100,
    percentage: 80,
    metadata: null,
    acknowledged: false,
    acknowledgedBy: null,
    acknowledgedAt: null,
    resolvedAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function createMockOrganization(overrides = {}) {
  return {
    id: 'org-123',
    name: 'Test Org',
    memberships: [
      {
        role: 'ORG_OWNER',
        status: 'ACTIVE',
        user: { email: 'owner@test.com', name: 'Test Owner' },
      },
    ],
    ...overrides,
  };
}

// ===========================================
// Setup / Teardown
// ===========================================

beforeEach(() => {
  vi.clearAllMocks();
  // Reset global fetch mock
  global.fetch = vi.fn().mockResolvedValue({ ok: true });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ===========================================
// getAlertConfig Tests
// ===========================================

describe('getAlertConfig', () => {
  it('returns cached config from Redis when available', async () => {
    const cachedConfig = createMockAlertConfig();
    mockRedis.get.mockResolvedValue(JSON.stringify(cachedConfig));

    const result = await alertService.getAlertConfig('org-123');

    expect(mockRedis.get).toHaveBeenCalledWith('alert:config:org-123');
    expect(mockPrisma.alertConfig.findUnique).not.toHaveBeenCalled();
    expect(result.organizationId).toBe('org-123');
  });

  it('fetches from database when not cached', async () => {
    mockRedis.get.mockResolvedValue(null);
    mockPrisma.alertConfig.findUnique.mockResolvedValue(createMockAlertConfig());

    const result = await alertService.getAlertConfig('org-123');

    expect(mockPrisma.alertConfig.findUnique).toHaveBeenCalledWith({
      where: { organizationId: 'org-123' },
    });
    expect(mockRedis.setex).toHaveBeenCalled(); // Should cache result
    expect(result.quotaWarningThreshold).toBe(80);
  });

  it('returns default config when none exists', async () => {
    mockRedis.get.mockResolvedValue(null);
    mockPrisma.alertConfig.findUnique.mockResolvedValue(null);

    const result = await alertService.getAlertConfig('org-123');

    expect(result.organizationId).toBe('org-123');
    expect(result.quotaWarningThreshold).toBe(80); // Default
    expect(result.quotaCriticalThreshold).toBe(95); // Default
    expect(result.enabled).toBe(true); // Default
  });
});

// ===========================================
// updateAlertConfig Tests
// ===========================================

describe('updateAlertConfig', () => {
  // Create a proper ServiceContext using the helper
  function createMockCtx() {
    return {
      userId: 'user-123',
      userRole: 'ADMIN' as const,
      userPlan: 'PRO' as const,
      contextType: 'organization' as const,
      organizationId: 'org-123',
      orgRole: 'ORG_ADMIN' as const,
      effectivePlan: 'PRO' as const,
      isAdmin: () => true,
      isSuperAdmin: () => false,
      isOrgContext: () => true,
      isPersonalContext: () => false,
      getOwnerId: () => 'org-123',
      canDo: () => true,
      getPermissions: () => [],
    };
  }

  it('upserts config and invalidates cache', async () => {
    mockRedis.get.mockResolvedValue(null);
    mockPrisma.alertConfig.findUnique.mockResolvedValue(null);
    mockPrisma.alertConfig.upsert.mockResolvedValue(createMockAlertConfig({
      quotaWarningThreshold: 70,
    }));

    const result = await alertService.updateAlertConfig(createMockCtx(), 'org-123', {
      quotaWarningThreshold: 70,
    });

    expect(mockPrisma.alertConfig.upsert).toHaveBeenCalled();
    expect(mockRedis.del).toHaveBeenCalledWith('alert:config:org-123');
    expect(result.quotaWarningThreshold).toBe(70);
  });

  it('merges channel updates with existing config', async () => {
    const existingConfig = createMockAlertConfig({
      channels: { email: true, emailAddresses: ['old@test.com'] },
    });
    mockRedis.get.mockResolvedValue(JSON.stringify(existingConfig));
    mockPrisma.alertConfig.upsert.mockResolvedValue(createMockAlertConfig({
      channels: { email: true, emailAddresses: ['new@test.com'], telegram: '12345' },
    }));

    await alertService.updateAlertConfig(createMockCtx(), 'org-123', {
      channels: { email: true, telegram: '12345' },
    });

    expect(mockPrisma.alertConfig.upsert).toHaveBeenCalled();
  });
});

// ===========================================
// createAlert Tests
// ===========================================

describe('createAlert', () => {
  it('creates alert and stores in database', async () => {
    mockRedis.get.mockResolvedValue(null); // Not in cooldown
    mockPrisma.alertHistory.create.mockResolvedValue(createMockAlertHistory());
    mockRedis.get.mockResolvedValue(null); // For getAlertConfig
    mockPrisma.alertConfig.findUnique.mockResolvedValue(createMockAlertConfig());
    mockPrisma.organization.findUnique.mockResolvedValue(createMockOrganization());

    const result = await alertService.createAlert('org-123', {
      type: AlertType.QUOTA_WARNING,
      severity: AlertSeverity.WARNING,
      title: 'Test Alert',
      message: 'Test message',
    });

    expect(result).not.toBeNull();
    expect(mockPrisma.alertHistory.create).toHaveBeenCalled();
    expect(mockRedis.setex).toHaveBeenCalled(); // Cooldown set
  });

  it('returns null when alert is in cooldown', async () => {
    mockRedis.get.mockResolvedValue('1'); // In cooldown

    const result = await alertService.createAlert('org-123', {
      type: AlertType.QUOTA_WARNING,
      severity: AlertSeverity.WARNING,
      title: 'Test Alert',
      message: 'Test message',
    });

    expect(result).toBeNull();
    expect(mockPrisma.alertHistory.create).not.toHaveBeenCalled();
  });

  it('sends email notification when configured', async () => {
    mockRedis.get.mockResolvedValueOnce(null); // Not in cooldown
    mockPrisma.alertHistory.create.mockResolvedValue(createMockAlertHistory());
    mockRedis.get.mockResolvedValueOnce(null); // For config cache
    mockPrisma.alertConfig.findUnique.mockResolvedValue(createMockAlertConfig({
      channels: { email: true, emailAddresses: ['extra@test.com'] },
    }));
    mockPrisma.organization.findUnique.mockResolvedValue(createMockOrganization());

    await alertService.createAlert('org-123', {
      type: AlertType.QUOTA_WARNING,
      severity: AlertSeverity.WARNING,
      title: 'Test Alert',
      message: 'Test message',
    });

    // Should send to owner and extra email
    expect(mockSendEmail).toHaveBeenCalled();
  });
});

// ===========================================
// getAlertHistory Tests
// ===========================================

describe('getAlertHistory', () => {
  it('returns paginated alert history', async () => {
    const mockAlerts = [
      createMockAlertHistory({ id: 'alert-1' }),
      createMockAlertHistory({ id: 'alert-2' }),
    ];
    mockPrisma.alertHistory.findMany.mockResolvedValue(mockAlerts);

    const result = await alertService.getAlertHistory('org-123', {
      limit: 10,
      offset: 0,
    });

    expect(result).toHaveLength(2);
    expect(mockPrisma.alertHistory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: 'org-123' },
        take: 10,
        skip: 0,
      })
    );
  });

  it('filters by type when specified', async () => {
    mockPrisma.alertHistory.findMany.mockResolvedValue([]);

    await alertService.getAlertHistory('org-123', {
      type: AlertType.QUOTA_EXCEEDED,
    });

    expect(mockPrisma.alertHistory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: 'org-123', type: AlertType.QUOTA_EXCEEDED },
      })
    );
  });

  it('filters by severity when specified', async () => {
    mockPrisma.alertHistory.findMany.mockResolvedValue([]);

    await alertService.getAlertHistory('org-123', {
      severity: AlertSeverity.CRITICAL,
    });

    expect(mockPrisma.alertHistory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: 'org-123', severity: AlertSeverity.CRITICAL },
      })
    );
  });

  it('filters by acknowledged status', async () => {
    mockPrisma.alertHistory.findMany.mockResolvedValue([]);

    await alertService.getAlertHistory('org-123', {
      acknowledged: false,
    });

    expect(mockPrisma.alertHistory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: 'org-123', acknowledged: false },
      })
    );
  });
});

// ===========================================
// acknowledgeAlert Tests
// ===========================================

describe('acknowledgeAlert', () => {
  it('updates alert with acknowledgement info', async () => {
    mockPrisma.alertHistory.update.mockResolvedValue(createMockAlertHistory({
      acknowledged: true,
      acknowledgedBy: 'user-123',
    }));

    await alertService.acknowledgeAlert('alert-123', 'user-123');

    expect(mockPrisma.alertHistory.update).toHaveBeenCalledWith({
      where: { id: 'alert-123' },
      data: expect.objectContaining({
        acknowledged: true,
        acknowledgedBy: 'user-123',
        acknowledgedAt: expect.any(Date),
      }),
    });
  });
});

// ===========================================
// getAlertStats Tests
// ===========================================

describe('getAlertStats', () => {
  it('returns aggregated alert statistics', async () => {
    mockPrisma.alertHistory.findMany.mockResolvedValue([
      { type: AlertType.QUOTA_WARNING, severity: AlertSeverity.WARNING, acknowledged: false },
      { type: AlertType.QUOTA_WARNING, severity: AlertSeverity.WARNING, acknowledged: true },
      { type: AlertType.QUOTA_EXCEEDED, severity: AlertSeverity.CRITICAL, acknowledged: false },
    ]);

    const stats = await alertService.getAlertStats('org-123');

    expect(stats.total).toBe(3);
    expect(stats.unacknowledged).toBe(2);
    expect(stats.byType[AlertType.QUOTA_WARNING]).toBe(2);
    expect(stats.byType[AlertType.QUOTA_EXCEEDED]).toBe(1);
    expect(stats.bySeverity[AlertSeverity.WARNING]).toBe(2);
    expect(stats.bySeverity[AlertSeverity.CRITICAL]).toBe(1);
  });

  it('handles empty alert history', async () => {
    mockPrisma.alertHistory.findMany.mockResolvedValue([]);

    const stats = await alertService.getAlertStats('org-123');

    expect(stats.total).toBe(0);
    expect(stats.unacknowledged).toBe(0);
  });
});

// ===========================================
// checkAllOrganizationAlerts Tests
// ===========================================

describe('checkAllOrganizationAlerts', () => {
  it('checks alerts for all organizations', async () => {
    mockPrisma.organization.findMany.mockResolvedValue([
      { id: 'org-1' },
      { id: 'org-2' },
    ]);
    
    // Mock checkAlerts to return empty for simplicity
    const checkAlertsSpy = vi.spyOn(alertService, 'checkAlerts').mockResolvedValue([]);

    const count = await alertService.checkAllOrganizationAlerts();

    expect(mockPrisma.organization.findMany).toHaveBeenCalled();
    expect(checkAlertsSpy).toHaveBeenCalledTimes(2);
    expect(count).toBe(0);

    checkAlertsSpy.mockRestore();
  });

  it('continues checking other orgs if one fails', async () => {
    mockPrisma.organization.findMany.mockResolvedValue([
      { id: 'org-1' },
      { id: 'org-2' },
      { id: 'org-3' },
    ]);
    
    const checkAlertsSpy = vi.spyOn(alertService, 'checkAlerts')
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error('DB error'))
      .mockResolvedValueOnce([]);

    const count = await alertService.checkAllOrganizationAlerts();

    expect(checkAlertsSpy).toHaveBeenCalledTimes(3);
    expect(count).toBe(0); // Should not throw, continues processing

    checkAlertsSpy.mockRestore();
  });
});

// ===========================================
// checkAlerts Tests (Integration-style)
// ===========================================

describe('checkAlerts', () => {
  it('returns empty array when alerts are disabled', async () => {
    mockRedis.get.mockResolvedValue(JSON.stringify(createMockAlertConfig({
      enabled: false,
    })));

    const alerts = await alertService.checkAlerts('org-123');

    expect(alerts).toEqual([]);
  });
});
