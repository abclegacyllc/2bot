/**
 * Execution Tracker Service Tests
 *
 * Tests for workflow and API execution tracking against plan limits.
 *
 * @module modules/quota/__tests__/execution-tracker.service.test
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ===========================================
// Mock Dependencies
// ===========================================

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
    organization: {
      findUnique: vi.fn(),
    },
    gateway: {
      count: vi.fn(),
    },
    workflow: {
      count: vi.fn(),
    },
    userPlugin: {
      count: vi.fn(),
    },
    quota: {
      findFirst: vi.fn(),
    },
    resourceQuota: {
      findFirst: vi.fn(),
    },
    deptMember: {
      findUnique: vi.fn(),
    },
    deptAllocation: {
      findUnique: vi.fn(),
    },
    memberAllocation: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('@/lib/redis', () => ({
  redis: {
    get: vi.fn(),
    incr: vi.fn(),
    expireat: vi.fn(),
  },
}));

// Import after mocking
import { prisma } from '@/lib/prisma';
import { redis } from '@/lib/redis';
import { createServiceContext } from '@/shared/types/context';
import { ExecutionTrackerService } from '../execution-tracker.service';

// Cast to mocked versions
const mockPrisma = prisma as unknown as {
  user: {
    findUnique: ReturnType<typeof vi.fn>;
  };
  organization: {
    findUnique: ReturnType<typeof vi.fn>;
  };
  gateway: {
    count: ReturnType<typeof vi.fn>;
  };
  workflow: {
    count: ReturnType<typeof vi.fn>;
  };
  userPlugin: {
    count: ReturnType<typeof vi.fn>;
  };
  quota: {
    findFirst: ReturnType<typeof vi.fn>;
  };
  resourceQuota: {
    findFirst: ReturnType<typeof vi.fn>;
  };
  deptMember: {
    findUnique: ReturnType<typeof vi.fn>;
  };
  deptAllocation: {
    findUnique: ReturnType<typeof vi.fn>;
  };
  memberAllocation: {
    findUnique: ReturnType<typeof vi.fn>;
  };
};

const mockRedis = redis as unknown as {
  get: ReturnType<typeof vi.fn>;
  incr: ReturnType<typeof vi.fn>;
  expireat: ReturnType<typeof vi.fn>;
};

// ===========================================
// Test Context Helper
// ===========================================

function createTestContext(options: {
  userId?: string;
  organizationId?: string;
  plan?: string;
} = {}) {
  return createServiceContext(
    {
      userId: options.userId || 'user-123',
      role: 'MEMBER',
      plan: (options.plan || 'FREE') as 'FREE' | 'STARTER' | 'PRO' | 'BUSINESS' | 'ENTERPRISE',
    },
    {},
    {
      contextType: options.organizationId ? 'organization' : 'personal',
      organizationId: options.organizationId,
      effectivePlan: (options.plan || 'FREE') as 'FREE' | 'STARTER' | 'PRO' | 'BUSINESS' | 'ENTERPRISE',
    }
  );
}

// ===========================================
// Setup / Teardown
// ===========================================

beforeEach(() => {
  vi.clearAllMocks();
  mockRedis.get.mockResolvedValue('0');
  mockRedis.incr.mockResolvedValue(1);
  mockRedis.expireat.mockResolvedValue(1);
  mockPrisma.user.findUnique.mockResolvedValue({
    id: 'user-123',
    plan: 'FREE',
    executionMode: 'SERVERLESS',
  });
  mockPrisma.gateway.count.mockResolvedValue(0);
  mockPrisma.workflow.count.mockResolvedValue(0);
  mockPrisma.userPlugin.count.mockResolvedValue(0);
  mockPrisma.resourceQuota.findFirst.mockResolvedValue(null);
  mockPrisma.deptMember.findUnique.mockResolvedValue(null);
  mockPrisma.deptAllocation.findUnique.mockResolvedValue(null);
  mockPrisma.memberAllocation.findUnique.mockResolvedValue(null);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ===========================================
// trackExecution Tests
// ===========================================

describe('trackExecution', () => {
  it('tracks execution for serverless user', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-123',
      plan: 'FREE',
      executionMode: 'SERVERLESS',
    });
    mockRedis.get.mockResolvedValue('10');

    const ctx = createTestContext();
    const result = await ExecutionTrackerService.trackExecution(ctx, 'workflow-123');

    expect(result.success).toBe(true);
    expect(mockRedis.incr).toHaveBeenCalled();
  });

  it('blocks execution when at limit', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-123',
      plan: 'FREE',
      executionMode: 'SERVERLESS',
    });
    mockRedis.get.mockResolvedValue('500'); // FREE plan limit

    const ctx = createTestContext();
    const result = await ExecutionTrackerService.trackExecution(ctx);

    expect(result.success).toBe(false);
    expect(result.warningLevel).toBe('blocked');
    expect(mockRedis.incr).not.toHaveBeenCalled();
  });

  it('returns warning level when near limit', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-123',
      plan: 'FREE',
      executionMode: 'SERVERLESS',
    });
    mockRedis.get.mockResolvedValue('400'); // Current count before increment
    mockRedis.incr.mockResolvedValue(401); // 401/500 = 80.2% = warning

    const ctx = createTestContext();
    const result = await ExecutionTrackerService.trackExecution(ctx);

    expect(result.success).toBe(true);
    expect(result.warningLevel).toBe('warning');
  });

  it('returns critical warning at 95%', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-123',
      plan: 'FREE',
      executionMode: 'SERVERLESS',
    });
    mockRedis.get.mockResolvedValue('475'); // Current count before increment
    mockRedis.incr.mockResolvedValue(476); // 476/500 = 95.2% = critical

    const ctx = createTestContext();
    const result = await ExecutionTrackerService.trackExecution(ctx);

    expect(result.success).toBe(true);
    expect(result.warningLevel).toBe('critical');
  });

  it('never blocks workspace mode users', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-123',
      plan: 'PRO',
      executionMode: 'WORKSPACE',
    });

    const ctx = createTestContext({ plan: 'PRO' });
    const result = await ExecutionTrackerService.trackExecution(ctx);

    expect(result.success).toBe(true);
    expect(result.warningLevel).toBe('none');
  });

  it('handles org context (workspace mode)', async () => {
    mockPrisma.organization.findUnique.mockResolvedValue({
      id: 'org-123',
      plan: 'ORG_STARTER',
    });

    const ctx = createTestContext({ organizationId: 'org-123' });
    const result = await ExecutionTrackerService.trackExecution(ctx);

    expect(result.success).toBe(true);
    expect(result.warningLevel).toBe('none');
  });
});

// ===========================================
// getExecutionCount Tests
// ===========================================

describe('getExecutionCount', () => {
  it('returns current count from Redis', async () => {
    mockRedis.get.mockResolvedValue('123');
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-123',
      plan: 'FREE',
      executionMode: 'SERVERLESS',
    });

    const ctx = createTestContext();
    const count = await ExecutionTrackerService.getExecutionCount(ctx);

    expect(count.current).toBe(123);
    expect(count.limit).toBe(500); // FREE plan limit
    expect(count.isServerless).toBe(true);
  });

  it('returns null limit for workspace mode', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-123',
      plan: 'PRO',
      executionMode: 'WORKSPACE',
    });

    const ctx = createTestContext({ plan: 'PRO' });
    const count = await ExecutionTrackerService.getExecutionCount(ctx);

    expect(count.limit).toBeNull();
    expect(count.isServerless).toBe(false);
  });

  it('includes period boundaries', async () => {
    mockRedis.get.mockResolvedValue('0');

    const ctx = createTestContext();
    const count = await ExecutionTrackerService.getExecutionCount(ctx);

    expect(count.periodStart).toBeInstanceOf(Date);
    expect(count.periodEnd).toBeInstanceOf(Date);
    expect(count.periodEnd > count.periodStart).toBe(true);
  });

  it('calculates percentage correctly', async () => {
    mockRedis.get.mockResolvedValue('250');
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-123',
      plan: 'FREE',
      executionMode: 'SERVERLESS',
    });

    const ctx = createTestContext();
    const count = await ExecutionTrackerService.getExecutionCount(ctx);

    expect(count.percentage).toBe(50); // 250/500 = 50%
  });
});

// ===========================================
// canExecute Tests
// ===========================================

describe('canExecute', () => {
  it('returns allowed=true when under limit', async () => {
    mockRedis.get.mockResolvedValue('100');
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-123',
      plan: 'FREE',
      executionMode: 'SERVERLESS',
    });

    const ctx = createTestContext();
    const result = await ExecutionTrackerService.canExecute(ctx);

    expect(result.allowed).toBe(true);
  });

  it('returns allowed=false when at limit', async () => {
    mockRedis.get.mockResolvedValue('500');
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-123',
      plan: 'FREE',
      executionMode: 'SERVERLESS',
    });

    const ctx = createTestContext();
    const result = await ExecutionTrackerService.canExecute(ctx);

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('limit_reached');
  });

  it('always allows unlimited plans', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-123',
      plan: 'PRO',
      executionMode: 'WORKSPACE',
    });

    const ctx = createTestContext({ plan: 'PRO' });
    const result = await ExecutionTrackerService.canExecute(ctx);

    expect(result.allowed).toBe(true);
    expect(result.limit).toBeNull();
  });
});

// ===========================================
// getResetTime Tests
// ===========================================

describe('getResetTime', () => {
  it('returns next period start date', async () => {
    const ctx = createTestContext();
    const resetTime = await ExecutionTrackerService.getResetTime(ctx);

    expect(resetTime).toBeInstanceOf(Date);
    expect(resetTime > new Date()).toBe(true);
  });
});

// ===========================================
// getUsageSummary Tests
// ===========================================

describe('getUsageSummary', () => {
  it('returns full usage summary', async () => {
    mockRedis.get.mockResolvedValue('50');
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-123',
      plan: 'FREE',
      executionMode: 'SERVERLESS',
    });
    mockPrisma.gateway.count.mockResolvedValue(1);
    mockPrisma.workflow.count.mockResolvedValue(2);
    mockPrisma.userPlugin.count.mockResolvedValue(3);
    mockPrisma.resourceQuota.findFirst.mockResolvedValue({
      usedApiCalls: 100,
      usedStorage: 50,
    });

    const ctx = createTestContext();
    const summary = await ExecutionTrackerService.getUsageSummary(ctx);

    expect(summary.executions).toBeDefined();
    expect(summary.gateways).toBeDefined();
    expect(summary.workflows).toBeDefined();
    expect(summary.plugins).toBeDefined();
  });

  it('includes warning levels for each resource', async () => {
    mockRedis.get.mockResolvedValue('400'); // 80% of 500
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-123',
      plan: 'FREE',
      executionMode: 'SERVERLESS',
    });
    mockPrisma.gateway.count.mockResolvedValue(1); // 1/1 = 100% = blocked
    mockPrisma.workflow.count.mockResolvedValue(3); // 3/3 = 100% = blocked
    mockPrisma.userPlugin.count.mockResolvedValue(3); // 3/3 = 100% = blocked
    mockPrisma.resourceQuota.findFirst.mockResolvedValue(null);

    const ctx = createTestContext();
    const summary = await ExecutionTrackerService.getUsageSummary(ctx);

    // gateways, workflows, plugins have warningLevel property
    expect(summary.gateways.warningLevel).toBe('blocked');
    expect(summary.plugins.warningLevel).toBe('blocked');
  });
});
