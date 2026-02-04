/**
 * Stripe Service Tests
 *
 * Tests for Stripe billing integration.
 * Uses mocked Prisma for unit testing.
 * 
 * Note: Tests that require actual Stripe SDK calls are marked as integration tests
 * and should be run with STRIPE_SECRET_KEY set in test mode.
 *
 * @module modules/billing/__tests__/stripe.service.test
 */

import type { PlanType } from '@/shared/constants/plans';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ===========================================
// Mock Prisma Client
// ===========================================

const mockUser = {
  id: 'user-123',
  email: 'test@example.com',
  name: 'Test User',
  plan: 'FREE' as const,
  stripeCustomerId: null,
};

const mockOrg = {
  id: 'org-123',
  name: 'Test Org',
  slug: 'test-org',
  plan: 'ORG_STARTER' as const,
  stripeCustomerId: null,
  memberships: [
    {
      userId: 'user-123',
      user: { email: 'admin@example.com' },
    },
  ],
};

const mockSubscription = {
  id: 'sub-db-123',
  userId: 'user-123',
  organizationId: null,
  plan: 'PRO',
  stripeSubscriptionId: 'sub_stripe123',
  stripeStatus: 'active',
  currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  cancelAtPeriodEnd: false,
};

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    organization: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    subscription: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

// Import after mocking
import { prisma } from '@/lib/prisma';
import { createServiceContext } from '@/shared/types/context';
import { stripeService } from '../stripe.service';

const mockedPrisma = prisma as unknown as {
  user: {
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  organization: {
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  subscription: {
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
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
      plan: options.plan || 'FREE',
    },
    {},
    {
      contextType: options.organizationId ? 'organization' : 'personal',
      organizationId: options.organizationId,
      effectivePlan: options.plan || 'FREE',
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
// getOrCreateCustomer Tests (Database lookup only)
// ===========================================

describe('stripeService.getOrCreateCustomer', () => {
  describe('personal context', () => {
    it('returns existing customer ID if user has one', async () => {
      mockedPrisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        stripeCustomerId: 'cus_existing',
      });

      const ctx = createTestContext();
      const customerId = await stripeService.getOrCreateCustomer(ctx);

      expect(customerId).toBe('cus_existing');
      expect(mockedPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        select: { stripeCustomerId: true, email: true, name: true },
      });
    });

    it('throws error if user not found', async () => {
      mockedPrisma.user.findUnique.mockResolvedValue(null);

      const ctx = createTestContext();

      await expect(stripeService.getOrCreateCustomer(ctx)).rejects.toThrow('User not found');
    });
  });

  describe('organization context', () => {
    it('returns existing org customer ID if has one', async () => {
      mockedPrisma.organization.findUnique.mockResolvedValue({
        ...mockOrg,
        stripeCustomerId: 'cus_org_existing',
      });

      const ctx = createTestContext({ organizationId: 'org-123' });
      const customerId = await stripeService.getOrCreateCustomer(ctx);

      expect(customerId).toBe('cus_org_existing');
    });

    it('throws error if organization not found', async () => {
      mockedPrisma.organization.findUnique.mockResolvedValue(null);

      const ctx = createTestContext({ organizationId: 'org-123' });

      await expect(stripeService.getOrCreateCustomer(ctx)).rejects.toThrow('Organization not found');
    });
  });
});

// ===========================================
// createCheckoutSession Tests (Validation only)
// ===========================================

describe('stripeService.createCheckoutSession', () => {
  it('throws error for FREE plan (no Stripe price)', async () => {
    const ctx = createTestContext();

    await expect(
      stripeService.createCheckoutSession(
        ctx,
        'FREE',
        'https://app.com/success',
        'https://app.com/cancel'
      )
    ).rejects.toThrow('Plan FREE cannot be purchased via Stripe checkout');
  });

  it('throws error for ENTERPRISE plan (contact sales)', async () => {
    const ctx = createTestContext();

    await expect(
      stripeService.createCheckoutSession(
        ctx,
        'ENTERPRISE',
        'https://app.com/success',
        'https://app.com/cancel'
      )
    ).rejects.toThrow('Plan ENTERPRISE cannot be purchased via Stripe checkout');
  });
});

// ===========================================
// getSubscriptionInfo Tests
// ===========================================

describe('stripeService.getSubscriptionInfo', () => {
  it('returns subscription info for user with subscription', async () => {
    mockedPrisma.subscription.findUnique.mockResolvedValue(mockSubscription);

    const ctx = createTestContext();
    const info = await stripeService.getSubscriptionInfo(ctx);

    expect(info.plan).toBe('PRO');
    expect(info.status).toBe('active');
    expect(info.cancelAtPeriodEnd).toBe(false);
    expect(info.id).toBe('sub-db-123');
  });

  it('returns FREE plan info for user without subscription', async () => {
    mockedPrisma.subscription.findUnique.mockResolvedValue(null);

    const ctx = createTestContext();
    const info = await stripeService.getSubscriptionInfo(ctx);

    expect(info.plan).toBe('FREE');
    expect(info.status).toBe('none');
    expect(info.id).toBe('');
  });

  it('includes plan limits in response', async () => {
    mockedPrisma.subscription.findUnique.mockResolvedValue(mockSubscription);

    const ctx = createTestContext();
    const info = await stripeService.getSubscriptionInfo(ctx);

    expect(info.limits).toBeDefined();
    expect(info.limits.gateways).toBeDefined();
    expect(info.limits.plugins).toBeDefined();
    expect(info.limits.workflowRunsPerMonth).toBeDefined();
  });

  it('returns cancelAtPeriodEnd when subscription is being cancelled', async () => {
    mockedPrisma.subscription.findUnique.mockResolvedValue({
      ...mockSubscription,
      cancelAtPeriodEnd: true,
    });

    const ctx = createTestContext();
    const info = await stripeService.getSubscriptionInfo(ctx);

    expect(info.cancelAtPeriodEnd).toBe(true);
  });

  it('returns currentPeriodEnd for active subscription', async () => {
    mockedPrisma.subscription.findUnique.mockResolvedValue(mockSubscription);

    const ctx = createTestContext();
    const info = await stripeService.getSubscriptionInfo(ctx);

    expect(info.currentPeriodEnd).toBeDefined();
  });
});

// ===========================================
// cancelSubscription Tests (Error cases)
// ===========================================

describe('stripeService.cancelSubscription', () => {
  it('throws error if no subscription exists', async () => {
    mockedPrisma.subscription.findUnique.mockResolvedValue(null);

    const ctx = createTestContext();

    await expect(stripeService.cancelSubscription(ctx)).rejects.toThrow('No active subscription found');
  });

  it('throws error if subscription has no Stripe ID', async () => {
    mockedPrisma.subscription.findUnique.mockResolvedValue({
      ...mockSubscription,
      stripeSubscriptionId: null,
    });

    const ctx = createTestContext();

    await expect(stripeService.cancelSubscription(ctx)).rejects.toThrow('No active subscription found');
  });
});

// ===========================================
// Context-Aware Tests
// ===========================================

describe('Context-aware billing', () => {
  it('uses user for personal context', async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({
      ...mockUser,
      stripeCustomerId: 'cus_personal',
    });

    const ctx = createTestContext();
    const customerId = await stripeService.getOrCreateCustomer(ctx);

    expect(customerId).toBe('cus_personal');
    expect(mockedPrisma.user.findUnique).toHaveBeenCalled();
    expect(mockedPrisma.organization.findUnique).not.toHaveBeenCalled();
  });

  it('uses org for organization context', async () => {
    mockedPrisma.organization.findUnique.mockResolvedValue({
      ...mockOrg,
      stripeCustomerId: 'cus_org',
    });

    const ctx = createTestContext({ organizationId: 'org-123' });
    const customerId = await stripeService.getOrCreateCustomer(ctx);

    expect(customerId).toBe('cus_org');
    expect(mockedPrisma.organization.findUnique).toHaveBeenCalled();
    expect(mockedPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('gets subscription for personal context', async () => {
    mockedPrisma.subscription.findUnique.mockResolvedValue(mockSubscription);

    const ctx = createTestContext();
    const info = await stripeService.getSubscriptionInfo(ctx);

    expect(mockedPrisma.subscription.findUnique).toHaveBeenCalledWith({
      where: { userId: 'user-123' },
    });
    expect(info.plan).toBe('PRO');
  });

  it('gets subscription for organization context', async () => {
    const orgSubscription = {
      ...mockSubscription,
      userId: null,
      organizationId: 'org-123',
      plan: 'BUSINESS', // Use valid plan type for organization
    };
    mockedPrisma.subscription.findUnique.mockResolvedValue(orgSubscription);

    const ctx = createTestContext({ organizationId: 'org-123' });
    const info = await stripeService.getSubscriptionInfo(ctx);

    expect(mockedPrisma.subscription.findUnique).toHaveBeenCalledWith({
      where: { organizationId: 'org-123' },
    });
    expect(info.plan).toBe('BUSINESS');
  });
});

// ===========================================
// Plan Limits Integration Tests
// ===========================================

describe('Plan limits in subscription info', () => {
  it('returns FREE plan limits when no subscription', async () => {
    mockedPrisma.subscription.findUnique.mockResolvedValue(null);

    const ctx = createTestContext();
    const info = await stripeService.getSubscriptionInfo(ctx);

    // FREE plan should have limited resources
    expect(info.limits.gateways).toBeDefined();
    expect(typeof info.limits.gateways).toBe('number');
  });

  it('returns PRO plan limits for PRO subscription', async () => {
    mockedPrisma.subscription.findUnique.mockResolvedValue(mockSubscription);

    const ctx = createTestContext();
    const info = await stripeService.getSubscriptionInfo(ctx);

    // PRO plan should have higher limits than FREE
    expect(info.limits.gateways).toBeGreaterThan(0);
  });
});
