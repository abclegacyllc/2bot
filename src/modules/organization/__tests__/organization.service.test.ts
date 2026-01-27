/**
 * Organization Service Tests
 *
 * Tests for organization CRUD, membership management,
 * invitations, and role-based access control.
 *
 * @module modules/organization/__tests__/organization.service.test
 */

import type { PlanType } from '@/shared/constants/plans';
import type { UserRole } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ===========================================
// Mock Dependencies
// ===========================================

vi.mock('@/lib/prisma', () => ({
  prisma: {
    organization: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    membership: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
      upsert: vi.fn(),
    },
    orgInvitation: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn((fn) => fn({
      organization: {
        create: vi.fn(),
      },
      membership: {
        create: vi.fn(),
      },
    })),
  },
}));

vi.mock('@/lib/audit', () => ({
  audit: vi.fn(),
}));

// Import after mocking
import { prisma } from '@/lib/prisma';
import { ConflictError, ForbiddenError, NotFoundError } from '@/shared/errors';
import { createServiceContext } from '@/shared/types/context';
import { organizationService } from '../organization.service';

const mockedPrisma = prisma as unknown as {
  organization: {
    findUnique: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  membership: {
    findUnique: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
  };
  orgInvitation: {
    findUnique: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  user: {
    findUnique: ReturnType<typeof vi.fn>;
  };
  $transaction: ReturnType<typeof vi.fn>;
};

// ===========================================
// Test Data
// ===========================================

const mockOrg = {
  id: 'org-123',
  name: 'Test Organization',
  slug: 'test-org',
  plan: 'ORG_STARTER' as const,
  isActive: true,
  maxSeats: 10,
  stripeCustomerId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  _count: { memberships: 2 },
};

const mockMembership = {
  id: 'mem-123',
  userId: 'user-123',
  organizationId: 'org-123',
  role: 'ORG_OWNER' as const,
  status: 'ACTIVE' as const,
  joinedAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockMemberMembership = {
  ...mockMembership,
  id: 'mem-456',
  userId: 'user-456',
  role: 'ORG_MEMBER' as const,
};

// ===========================================
// Test Context Helper
// ===========================================

function createTestContext(options: {
  userId?: string;
  organizationId?: string;
  plan?: PlanType;
  role?: UserRole;
} = {}) {
  return createServiceContext(
    {
      userId: options.userId || 'user-123',
      role: options.role || 'MEMBER',
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

describe('organizationService.create', () => {
  it('creates organization with owner membership', async () => {
    mockedPrisma.organization.findUnique.mockResolvedValue(null); // Slug available
    mockedPrisma.organization.create.mockResolvedValue(mockOrg);

    const ctx = createTestContext();
    const result = await organizationService.create(ctx, {
      name: 'Test Organization',
      slug: 'test-org',
    });

    expect(result.slug).toBe('test-org');
    expect(result.name).toBe('Test Organization');
    expect(mockedPrisma.organization.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'Test Organization',
          slug: 'test-org',
        }),
      })
    );
  });

  it('throws ConflictError if slug already exists', async () => {
    mockedPrisma.organization.findUnique.mockResolvedValue(mockOrg);

    const ctx = createTestContext();

    await expect(
      organizationService.create(ctx, {
        name: 'Another Org',
        slug: 'test-org', // Already exists
      })
    ).rejects.toThrow(ConflictError);
  });
});

// ===========================================
// getById Tests
// ===========================================

describe('organizationService.getById', () => {
  it('returns organization if user is member', async () => {
    mockedPrisma.organization.findUnique.mockResolvedValue(mockOrg);
    mockedPrisma.membership.findUnique.mockResolvedValue(mockMembership);

    const ctx = createTestContext();
    const result = await organizationService.getById(ctx, 'org-123');

    expect(result.id).toBe('org-123');
  });

  it('throws NotFoundError if organization does not exist', async () => {
    mockedPrisma.organization.findUnique.mockResolvedValue(null);

    const ctx = createTestContext();

    await expect(organizationService.getById(ctx, 'org-999')).rejects.toThrow(NotFoundError);
  });

  it('throws ForbiddenError if user is not a member', async () => {
    mockedPrisma.organization.findUnique.mockResolvedValue(mockOrg);
    mockedPrisma.membership.findUnique.mockResolvedValue(null);

    const ctx = createTestContext();

    await expect(organizationService.getById(ctx, 'org-123')).rejects.toThrow(ForbiddenError);
  });
});

// ===========================================
// getUserOrganizations Tests
// ===========================================

describe('organizationService.getUserOrganizations', () => {
  it('returns all organizations user is member of', async () => {
    mockedPrisma.membership.findMany.mockResolvedValue([
      {
        ...mockMembership,
        organization: mockOrg,
      },
    ]);

    // getUserOrganizations takes userId, not ctx
    const result = await organizationService.getUserOrganizations('user-123');

    expect(result).toHaveLength(1);
    expect(result[0]!.slug).toBe('test-org');
  });

  it('returns empty array if user has no organizations', async () => {
    mockedPrisma.membership.findMany.mockResolvedValue([]);

    const result = await organizationService.getUserOrganizations('user-123');

    expect(result).toEqual([]);
  });
});

// ===========================================
// update Tests
// ===========================================

describe('organizationService.update', () => {
  it('updates organization name', async () => {
    mockedPrisma.organization.findUnique.mockResolvedValue(mockOrg);
    mockedPrisma.membership.findUnique.mockResolvedValue(mockMembership);
    mockedPrisma.organization.update.mockResolvedValue({
      ...mockOrg,
      name: 'Updated Name',
    });

    const ctx = createTestContext({ organizationId: 'org-123' });
    const result = await organizationService.update(ctx, 'org-123', {
      name: 'Updated Name',
    });

    expect(result.name).toBe('Updated Name');
  });

  it('throws ForbiddenError if user is not admin or owner', async () => {
    mockedPrisma.organization.findUnique.mockResolvedValue(mockOrg);
    mockedPrisma.membership.findUnique.mockResolvedValue(mockMemberMembership); // ORG_MEMBER role

    const ctx = createTestContext({ userId: 'user-456' });

    await expect(
      organizationService.update(ctx, 'org-123', { name: 'Hacked' })
    ).rejects.toThrow(ForbiddenError);
  });
});

// ===========================================
// getMembers Tests
// ===========================================

describe('organizationService.getMembers', () => {
  it('returns all organization members', async () => {
    mockedPrisma.organization.findUnique.mockResolvedValue(mockOrg);
    mockedPrisma.membership.findUnique.mockResolvedValue(mockMembership);
    mockedPrisma.membership.findMany.mockResolvedValue([
      {
        ...mockMembership,
        user: { id: 'user-123', name: 'Owner', email: 'owner@example.com' },
      },
      {
        ...mockMemberMembership,
        user: { id: 'user-456', name: 'Member', email: 'member@example.com' },
      },
    ]);

    const ctx = createTestContext({ organizationId: 'org-123' });
    const result = await organizationService.getMembers(ctx, 'org-123');

    expect(result).toHaveLength(2);
  });
});

// ===========================================
// Invitation Tests
// ===========================================

describe('organizationService.inviteMember', () => {
  it('creates invitation for existing user', async () => {
    mockedPrisma.membership.findUnique
      .mockResolvedValueOnce(mockMembership) // Caller's membership (owner)
      .mockResolvedValueOnce(null); // Target user not yet member
    mockedPrisma.organization.findUnique.mockResolvedValue({
      ...mockOrg,
      _count: { memberships: 2 },
    });
    mockedPrisma.user.findUnique.mockResolvedValue({
      id: 'user-new',
      email: 'new@example.com',
    });
    mockedPrisma.membership.upsert.mockResolvedValue({
      id: 'mem-new',
      userId: 'user-new',
      organizationId: 'org-123',
      role: 'ORG_MEMBER',
      status: 'INVITED',
      user: { id: 'user-new', name: 'New User', email: 'new@example.com' },
    });

    const ctx = createTestContext({ organizationId: 'org-123' });
    const result = await organizationService.inviteMember(ctx, 'org-123', {
      email: 'new@example.com',
      role: 'ORG_MEMBER',
    });

    expect(result.status).toBe('INVITED');
  });

  it('throws ForbiddenError if non-admin tries to invite', async () => {
    mockedPrisma.membership.findUnique.mockResolvedValue(mockMemberMembership); // Not admin

    const ctx = createTestContext({ userId: 'user-456' });

    await expect(
      organizationService.inviteMember(ctx, 'org-123', {
        email: 'new@example.com',
        role: 'ORG_MEMBER',
      })
    ).rejects.toThrow(ForbiddenError);
  });

  it('creates pending invite for unregistered user', async () => {
    mockedPrisma.membership.findUnique.mockResolvedValue(mockMembership);
    mockedPrisma.organization.findUnique.mockResolvedValue({
      ...mockOrg,
      _count: { memberships: 2 },
    });
    mockedPrisma.user.findUnique.mockResolvedValue(null); // User doesn't exist
    
    // Mock orgInvite for pending invite flow
    const mockOrgInvite = prisma as unknown as {
      orgInvite: {
        findUnique: ReturnType<typeof vi.fn>;
        upsert: ReturnType<typeof vi.fn>;
      };
    };
    mockOrgInvite.orgInvite = {
      findUnique: vi.fn().mockResolvedValue(null), // No existing invite
      upsert: vi.fn().mockResolvedValue({
        id: 'invite-123',
        organizationId: 'org-123',
        email: 'newuser@example.com',
        role: 'ORG_MEMBER',
        token: 'mock-token',
        invitedBy: 'user-123',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      }),
    };

    const ctx = createTestContext({ organizationId: 'org-123' });

    // When user doesn't exist, service creates pending invite (not NotFoundError)
    // The actual implementation calls createPendingInvite which uses orgInvite
    await expect(
      organizationService.inviteMember(ctx, 'org-123', {
        email: 'newuser@example.com',
        role: 'ORG_MEMBER',
      })
    ).resolves.toBeDefined();
  });
});

describe('organizationService.acceptInvite', () => {
  it('accepts pending invitation', async () => {
    mockedPrisma.membership.findUnique.mockResolvedValue({
      id: 'mem-pending',
      userId: 'user-123', // Same as context user
      organizationId: 'org-123',
      role: 'ORG_MEMBER',
      status: 'INVITED',
      organization: mockOrg,
    });
    mockedPrisma.membership.update.mockResolvedValue({
      id: 'mem-pending',
      userId: 'user-123',
      organizationId: 'org-123',
      role: 'ORG_MEMBER',
      status: 'ACTIVE',
      joinedAt: new Date(),
      organization: mockOrg,
    });

    const ctx = createTestContext({ userId: 'user-123' });
    const result = await organizationService.acceptInvite(ctx, 'mem-pending');

    expect(result.status).toBe('ACTIVE');
  });

  it('throws ForbiddenError for wrong user', async () => {
    mockedPrisma.membership.findUnique.mockResolvedValue({
      id: 'mem-pending',
      userId: 'user-other', // Different user
      organizationId: 'org-123',
      role: 'ORG_MEMBER',
      status: 'INVITED',
    });

    const ctx = createTestContext({ userId: 'user-123' });

    await expect(
      organizationService.acceptInvite(ctx, 'mem-pending')
    ).rejects.toThrow(ForbiddenError);
  });

  it('throws NotFoundError for non-existent invite', async () => {
    mockedPrisma.membership.findUnique.mockResolvedValue(null);

    const ctx = createTestContext({ userId: 'user-123' });

    await expect(
      organizationService.acceptInvite(ctx, 'inv-999')
    ).rejects.toThrow(NotFoundError);
  });
});

// ===========================================
// Role Management Tests
// ===========================================

describe('organizationService.updateMemberRole', () => {
  it('allows owner to change member role to admin', async () => {
    mockedPrisma.organization.findUnique.mockResolvedValue(mockOrg);
    mockedPrisma.membership.findUnique
      .mockResolvedValueOnce(mockMembership) // Caller is owner
      .mockResolvedValueOnce(mockMemberMembership); // Target is member
    mockedPrisma.membership.update.mockResolvedValue({
      ...mockMemberMembership,
      role: 'ORG_ADMIN',
    });

    const ctx = createTestContext({ organizationId: 'org-123' });
    const result = await organizationService.updateMemberRole(
      ctx,
      'org-123',
      'user-456',
      { role: 'ORG_ADMIN' }
    );

    expect(result.role).toBe('ORG_ADMIN');
  });

  it('prevents member from changing roles', async () => {
    mockedPrisma.organization.findUnique.mockResolvedValue(mockOrg);
    mockedPrisma.membership.findUnique.mockResolvedValue(mockMemberMembership);

    const ctx = createTestContext({ userId: 'user-456' });

    await expect(
      organizationService.updateMemberRole(ctx, 'org-123', 'user-789', { role: 'ORG_ADMIN' })
    ).rejects.toThrow(ForbiddenError);
  });

  it('prevents changing own owner role', async () => {
    mockedPrisma.organization.findUnique.mockResolvedValue(mockOrg);
    mockedPrisma.membership.findUnique.mockResolvedValue(mockMembership);

    const ctx = createTestContext({ organizationId: 'org-123' });

    await expect(
      organizationService.updateMemberRole(ctx, 'org-123', 'user-123', { role: 'ORG_MEMBER' })
    ).rejects.toThrow(ForbiddenError);
  });
});

// ===========================================
// Delete Organization Tests
// ===========================================

describe('organizationService.delete', () => {
  it('allows owner to delete organization', async () => {
    mockedPrisma.organization.findUnique.mockResolvedValue(mockOrg);
    mockedPrisma.membership.findUnique.mockResolvedValue(mockMembership);
    mockedPrisma.organization.delete.mockResolvedValue(mockOrg);

    const ctx = createTestContext({ organizationId: 'org-123' });
    await organizationService.delete(ctx, 'org-123');

    expect(mockedPrisma.organization.delete).toHaveBeenCalledWith({
      where: { id: 'org-123' },
    });
  });

  it('throws ForbiddenError for non-owner', async () => {
    mockedPrisma.organization.findUnique.mockResolvedValue(mockOrg);
    mockedPrisma.membership.findUnique.mockResolvedValue({
      ...mockMembership,
      role: 'ORG_ADMIN', // Admin, not owner
    });

    const ctx = createTestContext({ organizationId: 'org-123' });

    await expect(organizationService.delete(ctx, 'org-123')).rejects.toThrow(ForbiddenError);
  });
});
