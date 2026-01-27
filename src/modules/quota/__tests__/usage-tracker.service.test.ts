/**
 * Usage Tracker Service Tests
 *
 * Tests for real-time usage tracking with Redis counters.
 *
 * @module modules/quota/__tests__/usage-tracker.service.test
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ===========================================
// Mock Dependencies
// ===========================================

vi.mock('@/lib/prisma', () => ({
  prisma: {
    quota: {
      findUnique: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
    },
    usageHistory: {
      upsert: vi.fn(),
      groupBy: vi.fn(),
      aggregate: vi.fn(),
    },
    organization: {
      findMany: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock('@/lib/redis', () => ({
  redis: {
    get: vi.fn(),
    incr: vi.fn(),
    incrby: vi.fn(),
    decrby: vi.fn(),
    expire: vi.fn(),
    expireat: vi.fn(),
  },
}));

// Import after mocking
import { prisma } from '@/lib/prisma';
import { redis } from '@/lib/redis';
import { createServiceContext } from '@/shared/types/context';
import { usageTracker } from '../usage-tracker.service';

// Cast to mocked versions
const mockPrisma = prisma as unknown as {
  quota: {
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
  };
  usageHistory: {
    upsert: ReturnType<typeof vi.fn>;
    groupBy: ReturnType<typeof vi.fn>;
    aggregate: ReturnType<typeof vi.fn>;
  };
  organization: {
    findMany: ReturnType<typeof vi.fn>;
  };
  user: {
    findMany: ReturnType<typeof vi.fn>;
  };
};

const mockRedis = redis as unknown as {
  get: ReturnType<typeof vi.fn>;
  incr: ReturnType<typeof vi.fn>;
  incrby: ReturnType<typeof vi.fn>;
  decrby: ReturnType<typeof vi.fn>;
  expire: ReturnType<typeof vi.fn>;
  expireat: ReturnType<typeof vi.fn>;
};

// ===========================================
// Test Context Helper
// ===========================================

function createTestContext(options: {
  userId?: string;
  organizationId?: string;
} = {}) {
  return createServiceContext(
    {
      userId: options.userId || 'user-123',
      role: 'MEMBER',
      plan: 'FREE',
    },
    {},
    {
      contextType: options.organizationId ? 'organization' : 'personal',
      organizationId: options.organizationId,
      effectivePlan: 'FREE',
    }
  );
}

// ===========================================
// Setup / Teardown
// ===========================================

beforeEach(() => {
  vi.clearAllMocks();
  mockRedis.incr.mockResolvedValue(1);
  mockRedis.incrby.mockResolvedValue(1);
  mockRedis.expireat.mockResolvedValue(1);
  mockPrisma.usageHistory.upsert.mockResolvedValue({});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ===========================================
// trackApiCall Tests
// ===========================================

describe('trackApiCall', () => {
  it('increments Redis counter for user context', async () => {
    const ctx = createTestContext();

    await usageTracker.trackApiCall(ctx);

    expect(mockRedis.incr).toHaveBeenCalled();
    expect(mockRedis.expire).toHaveBeenCalled();
  });

  it('increments Redis counter for org context', async () => {
    const ctx = createTestContext({ organizationId: 'org-123' });

    await usageTracker.trackApiCall(ctx);

    expect(mockRedis.incr).toHaveBeenCalled();
  });

  it('updates database usage record', async () => {
    const ctx = createTestContext();

    await usageTracker.trackApiCall(ctx);

    expect(mockPrisma.usageHistory.upsert).toHaveBeenCalled();
  });

  it('handles Redis errors gracefully', async () => {
    mockRedis.incr.mockRejectedValue(new Error('Redis error'));
    const ctx = createTestContext();

    // Should not throw
    await expect(usageTracker.trackApiCall(ctx)).resolves.not.toThrow();
  });
});

// ===========================================
// trackWorkflowRun Tests
// ===========================================

describe('trackWorkflowRun', () => {
  it('increments workflow run counter', async () => {
    const ctx = createTestContext();

    await usageTracker.trackWorkflowRun(ctx, 'workflow-123', 3);

    expect(mockRedis.incr).toHaveBeenCalled();
  });

  it('tracks with step count metadata', async () => {
    const ctx = createTestContext();

    await usageTracker.trackWorkflowRun(ctx, 'workflow-123', 5);

    expect(mockPrisma.usageHistory.upsert).toHaveBeenCalled();
  });
});

// ===========================================
// trackPluginExecution Tests
// ===========================================

describe('trackPluginExecution', () => {
  it('increments plugin execution counter', async () => {
    const ctx = createTestContext();

    await usageTracker.trackPluginExecution(ctx, 'plugin-123');

    expect(mockRedis.incr).toHaveBeenCalled();
  });

  it('persists to database', async () => {
    const ctx = createTestContext();

    await usageTracker.trackPluginExecution(ctx, 'plugin-123');

    expect(mockPrisma.usageHistory.upsert).toHaveBeenCalled();
  });
});

// ===========================================
// trackStorageChange Tests
// ===========================================

describe('trackStorageChange', () => {
  it('increments storage counter for positive delta', async () => {
    const ctx = createTestContext();

    await usageTracker.trackStorageChange(ctx, 1024 * 1024); // 1MB

    expect(mockRedis.incrby).toHaveBeenCalled();
  });

  it('handles negative delta (file deletion)', async () => {
    const ctx = createTestContext();

    await usageTracker.trackStorageChange(ctx, -512 * 1024); // -512KB

    expect(mockRedis.incrby).toHaveBeenCalled();
  });

  it('converts bytes to MB', async () => {
    const ctx = createTestContext();

    await usageTracker.trackStorageChange(ctx, 2 * 1024 * 1024); // 2MB

    // Should increment by 2 (MB)
    expect(mockRedis.incrby).toHaveBeenCalledWith(expect.any(String), 2);
  });
});

// ===========================================
// trackError Tests
// ===========================================

describe('trackError', () => {
  it('increments error counter', async () => {
    const ctx = createTestContext();

    await usageTracker.trackError(ctx, 'VALIDATION_ERROR');

    expect(mockRedis.incr).toHaveBeenCalled();
  });

  it('works without error type', async () => {
    const ctx = createTestContext();

    await usageTracker.trackError(ctx);

    expect(mockRedis.incr).toHaveBeenCalled();
  });
});

// ===========================================
// getRealTimeUsage Tests
// ===========================================

describe('getRealTimeUsage', () => {
  it('returns usage from Redis counters', async () => {
    mockRedis.get
      .mockResolvedValueOnce('100') // apiCalls
      .mockResolvedValueOnce('50')  // workflowRuns
      .mockResolvedValueOnce('25')  // pluginExecutions
      .mockResolvedValueOnce('10')  // storage
      .mockResolvedValueOnce('5');  // errors

    const ctx = createTestContext();
    const usage = await usageTracker.getRealTimeUsage(ctx);

    expect(usage.apiCalls).toBe(100);
    expect(usage.workflowRuns).toBe(50);
    expect(usage.pluginExecutions).toBe(25);
    expect(usage.storageUsed).toBe(10);
    expect(usage.errors).toBe(5);
  });

  it('returns zero for missing counters', async () => {
    mockRedis.get.mockResolvedValue(null);

    const ctx = createTestContext();
    const usage = await usageTracker.getRealTimeUsage(ctx);

    expect(usage.apiCalls).toBe(0);
    expect(usage.workflowRuns).toBe(0);
  });

  it('includes period info', async () => {
    mockRedis.get.mockResolvedValue('0');

    const ctx = createTestContext();
    const usage = await usageTracker.getRealTimeUsage(ctx);

    expect(usage.periodStart).toBeInstanceOf(Date);
    expect(usage.periodType).toBe('DAILY');
  });
});

// ===========================================
// aggregateHourlyUsage Tests
// ===========================================

describe('aggregateHourlyUsage', () => {
  it('aggregates usage for all organizations', async () => {
    mockPrisma.organization.findMany.mockResolvedValue([
      { id: 'org-1' },
      { id: 'org-2' },
    ]);
    mockPrisma.user.findMany.mockResolvedValue([]);
    mockRedis.get.mockResolvedValue('0');
    mockPrisma.usageHistory.upsert.mockResolvedValue({});

    const count = await usageTracker.aggregateHourlyUsage();

    expect(count).toBe(2);
    expect(mockPrisma.usageHistory.upsert).toHaveBeenCalledTimes(2);
  });

  it('includes personal users without org', async () => {
    mockPrisma.organization.findMany.mockResolvedValue([{ id: 'org-1' }]);
    mockPrisma.user.findMany.mockResolvedValue([{ id: 'user-1' }]);
    mockRedis.get.mockResolvedValue('0');
    mockPrisma.usageHistory.upsert.mockResolvedValue({});

    const count = await usageTracker.aggregateHourlyUsage();

    expect(count).toBe(2); // 1 org + 1 user
  });
});
