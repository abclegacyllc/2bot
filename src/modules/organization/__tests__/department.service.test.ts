/**
 * Department Service Tests
 *
 * Tests for department CRUD and member management.
 *
 * @module modules/organization/__tests__/department.service.test
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ===========================================
// Mock Dependencies
// ===========================================

vi.mock('@/lib/prisma', () => ({
  prisma: {
    department: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    departmentMember: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    membership: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('@/lib/audit', () => ({
  audit: vi.fn(),
}));

vi.mock('../organization.service', () => ({
  organizationService: {
    requireMembership: vi.fn(),
    checkMembership: vi.fn(),
  },
}));

// Import after mocking
import { prisma } from '@/lib/prisma';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/shared/errors';
import { createServiceContext } from '@/shared/types/context';
import { departmentService } from '../department.service';
import { organizationService } from '../organization.service';

// Cast to mocked versions
const mockPrisma = prisma as unknown as {
  department: {
    findUnique: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  departmentMember: {
    findUnique: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  membership: {
    findUnique: ReturnType<typeof vi.fn>;
  };
};

const mockOrgService = organizationService as unknown as {
  requireMembership: ReturnType<typeof vi.fn>;
  checkMembership: ReturnType<typeof vi.fn>;
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
      organizationId: options.organizationId || 'org-123',
      effectivePlan: 'FREE',
    }
  );
}

// ===========================================
// Mock Data Factories
// ===========================================

function createMockDepartment(overrides = {}) {
  return {
    id: 'dept-123',
    organizationId: 'org-123',
    name: 'Engineering',
    description: 'Development team',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    _count: { members: 5, workflows: 10 },
    ...overrides,
  };
}

function createMockDeptMember(overrides = {}) {
  return {
    id: 'member-123',
    userId: 'user-456',
    departmentId: 'dept-123',
    membershipId: 'membership-123',
    role: 'MEMBER',
    maxWorkflows: null,
    maxPlugins: null,
    createdAt: new Date(),
    user: {
      id: 'user-456',
      name: 'Test User',
      email: 'test@example.com',
      image: null,
    },
    ...overrides,
  };
}

// ===========================================
// Setup / Teardown
// ===========================================

beforeEach(() => {
  vi.clearAllMocks();
  mockOrgService.requireMembership.mockResolvedValue(undefined);
  mockOrgService.checkMembership.mockResolvedValue({
    id: 'membership-123',
    status: 'ACTIVE',
    role: 'ORG_MEMBER',
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ===========================================
// create Tests
// ===========================================

describe('create', () => {
  it('creates a new department', async () => {
    mockPrisma.department.findUnique.mockResolvedValue(null);
    mockPrisma.department.create.mockResolvedValue(createMockDepartment());

    const ctx = createTestContext();
    const result = await departmentService.create(ctx, 'org-123', {
      name: 'Engineering',
      description: 'Development team',
    });

    expect(result.name).toBe('Engineering');
    expect(mockPrisma.department.create).toHaveBeenCalled();
  });

  it('requires admin permission', async () => {
    mockOrgService.requireMembership.mockRejectedValue(
      new ForbiddenError('Admin access required')
    );

    const ctx = createTestContext();

    await expect(
      departmentService.create(ctx, 'org-123', { name: 'Test' })
    ).rejects.toThrow(ForbiddenError);
  });

  it('throws ConflictError for duplicate name', async () => {
    mockPrisma.department.findUnique.mockResolvedValue(createMockDepartment());

    const ctx = createTestContext();

    await expect(
      departmentService.create(ctx, 'org-123', { name: 'Engineering' })
    ).rejects.toThrow(ConflictError);
  });
});

// ===========================================
// getById Tests
// ===========================================

describe('getById', () => {
  it('returns department when found', async () => {
    mockPrisma.department.findUnique.mockResolvedValue(createMockDepartment());

    const ctx = createTestContext();
    const result = await departmentService.getById(ctx, 'dept-123');

    expect(result.id).toBe('dept-123');
    expect(result.name).toBe('Engineering');
  });

  it('throws NotFoundError when not found', async () => {
    mockPrisma.department.findUnique.mockResolvedValue(null);

    const ctx = createTestContext();

    await expect(
      departmentService.getById(ctx, 'nonexistent')
    ).rejects.toThrow(NotFoundError);
  });
});

// ===========================================
// update Tests
// ===========================================

describe('update', () => {
  it('updates department properties', async () => {
    // Mock for requireManagePermission
    mockPrisma.department.findUnique
      .mockResolvedValueOnce(createMockDepartment()) // For requireManagePermission
      .mockResolvedValueOnce(createMockDepartment()) // For update method
      .mockResolvedValueOnce(null); // No duplicate name
    
    // Mock org membership check
    mockOrgService.checkMembership.mockResolvedValue({
      role: 'ORG_ADMIN',
      status: 'ACTIVE',
    });
    
    mockPrisma.department.update.mockResolvedValue(
      createMockDepartment({ name: 'New Name' })
    );

    const ctx = createTestContext();
    const result = await departmentService.update(ctx, 'dept-123', {
      name: 'New Name',
    });

    expect(result.name).toBe('New Name');
  });

  it('throws NotFoundError when department not found', async () => {
    mockPrisma.department.findUnique.mockResolvedValue(null);

    const ctx = createTestContext();

    await expect(
      departmentService.update(ctx, 'nonexistent', { name: 'Test' })
    ).rejects.toThrow(NotFoundError);
  });

  it('throws ConflictError for duplicate name', async () => {
    // Mock for requireManagePermission
    mockPrisma.department.findUnique
      .mockResolvedValueOnce(createMockDepartment()) // For requireManagePermission
      .mockResolvedValueOnce(createMockDepartment()) // For update method (get original)
      .mockResolvedValueOnce(createMockDepartment({ id: 'other-dept', name: 'Existing Name' })); // Duplicate found
    
    // Mock org membership check
    mockOrgService.checkMembership.mockResolvedValue({
      role: 'ORG_ADMIN',
      status: 'ACTIVE',
    });

    const ctx = createTestContext();

    await expect(
      departmentService.update(ctx, 'dept-123', { name: 'Existing Name' })
    ).rejects.toThrow(ConflictError);
  });
});

// ===========================================
// delete Tests
// ===========================================

describe('delete', () => {
  it('deletes the department', async () => {
    mockPrisma.department.findUnique.mockResolvedValue(createMockDepartment());
    mockPrisma.department.delete.mockResolvedValue({});

    const ctx = createTestContext();
    await departmentService.delete(ctx, 'dept-123');

    expect(mockPrisma.department.delete).toHaveBeenCalledWith({
      where: { id: 'dept-123' },
    });
  });

  it('throws NotFoundError when not found', async () => {
    mockPrisma.department.findUnique.mockResolvedValue(null);

    const ctx = createTestContext();

    await expect(
      departmentService.delete(ctx, 'nonexistent')
    ).rejects.toThrow(NotFoundError);
  });
});

// ===========================================
// getOrgDepartments Tests
// ===========================================

describe('getOrgDepartments', () => {
  it('returns all departments for org', async () => {
    mockPrisma.department.findMany.mockResolvedValue([
      createMockDepartment({ id: 'dept-1', name: 'Engineering' }),
      createMockDepartment({ id: 'dept-2', name: 'Marketing' }),
    ]);

    const ctx = createTestContext();
    const result = await departmentService.getOrgDepartments(ctx, 'org-123');

    expect(result).toHaveLength(2);
    expect(result[0]?.name).toBe('Engineering');
  });

  it('filters by active only when specified', async () => {
    mockPrisma.department.findMany.mockResolvedValue([]);

    const ctx = createTestContext();
    await departmentService.getOrgDepartments(ctx, 'org-123', { activeOnly: true });

    expect(mockPrisma.department.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isActive: true,
        }),
      })
    );
  });
});

// ===========================================
// addMember Tests
// ===========================================

describe('addMember', () => {
  it('adds member to department', async () => {
    mockPrisma.department.findUnique.mockResolvedValue(createMockDepartment());
    mockPrisma.departmentMember.findUnique
      .mockResolvedValueOnce({ role: 'MANAGER' }) // For permission check
      .mockResolvedValueOnce(null); // Not already a member
    mockPrisma.departmentMember.create.mockResolvedValue(createMockDeptMember());

    const ctx = createTestContext();
    const result = await departmentService.addMember(ctx, 'dept-123', {
      userId: 'user-456',
      role: 'MEMBER',
    });

    expect(result.user.email).toBe('test@example.com');
    expect(mockPrisma.departmentMember.create).toHaveBeenCalled();
  });

  it('throws NotFoundError when department not found', async () => {
    mockPrisma.department.findUnique.mockResolvedValue(null);

    const ctx = createTestContext();

    await expect(
      departmentService.addMember(ctx, 'nonexistent', { userId: 'user-456' })
    ).rejects.toThrow(NotFoundError);
  });

  it('throws ValidationError when user not org member', async () => {
    mockPrisma.department.findUnique
      .mockResolvedValueOnce(createMockDepartment()) // for requireManagePermission
      .mockResolvedValueOnce(createMockDepartment()); // for addMember lookup
    mockOrgService.checkMembership
      .mockResolvedValueOnce({ id: 'membership-admin', status: 'ACTIVE', role: 'ORG_ADMIN' }) // permission check passes
      .mockResolvedValueOnce(null); // user-456 is not an org member

    const ctx = createTestContext();

    await expect(
      departmentService.addMember(ctx, 'dept-123', { userId: 'user-456' })
    ).rejects.toThrow(ValidationError);
  });

  it('throws ConflictError when already a member', async () => {
    mockPrisma.department.findUnique.mockResolvedValue(createMockDepartment());
    mockPrisma.departmentMember.findUnique
      .mockResolvedValueOnce({ role: 'MANAGER' }) // Permission check
      .mockResolvedValueOnce(createMockDeptMember()); // Already a member

    const ctx = createTestContext();

    await expect(
      departmentService.addMember(ctx, 'dept-123', { userId: 'user-456' })
    ).rejects.toThrow(ConflictError);
  });
});

// ===========================================
// removeMember Tests
// ===========================================

describe('removeMember', () => {
  it('removes member from department', async () => {
    mockPrisma.department.findUnique.mockResolvedValue(createMockDepartment());
    mockPrisma.departmentMember.findUnique
      .mockResolvedValueOnce({ role: 'MANAGER' }) // Permission check
      .mockResolvedValueOnce(createMockDeptMember()); // Member to remove
    mockPrisma.departmentMember.delete.mockResolvedValue({});

    const ctx = createTestContext();
    await departmentService.removeMember(ctx, 'dept-123', 'user-456');

    expect(mockPrisma.departmentMember.delete).toHaveBeenCalled();
  });

  it('throws NotFoundError when member not found', async () => {
    mockPrisma.department.findUnique.mockResolvedValue(createMockDepartment());
    mockPrisma.departmentMember.findUnique
      .mockResolvedValueOnce({ role: 'MANAGER' }) // Permission check
      .mockResolvedValueOnce(null); // Not a member

    const ctx = createTestContext();

    await expect(
      departmentService.removeMember(ctx, 'dept-123', 'user-456')
    ).rejects.toThrow(NotFoundError);
  });
});

// ===========================================
// getMembers Tests
// ===========================================

describe('getMembers', () => {
  it('returns all department members', async () => {
    mockPrisma.department.findUnique.mockResolvedValue(createMockDepartment());
    mockPrisma.departmentMember.findMany.mockResolvedValue([
      createMockDeptMember({ userId: 'user-1' }),
      createMockDeptMember({ userId: 'user-2' }),
    ]);

    const ctx = createTestContext();
    const result = await departmentService.getMembers(ctx, 'dept-123');

    expect(result).toHaveLength(2);
  });

  it('throws NotFoundError when department not found', async () => {
    mockPrisma.department.findUnique.mockResolvedValue(null);

    const ctx = createTestContext();

    await expect(
      departmentService.getMembers(ctx, 'nonexistent')
    ).rejects.toThrow(NotFoundError);
  });
});
