/**
 * Audit Logging Tests
 *
 * Tests for audit logging functionality including
 * event creation and pre-defined audit actions.
 *
 * @module lib/__tests__/audit.test
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ===========================================
// Mock Dependencies
// ===========================================

vi.mock('@/lib/prisma', () => ({
  prisma: {
    auditLog: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

// Import after mocking
import { prisma } from '@/lib/prisma';
import { audit, auditActions, type AuditContext, type AuditEvent } from '../audit';

const mockedPrisma = prisma as unknown as {
  auditLog: {
    create: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
  };
};

// ===========================================
// Test Data
// ===========================================

const mockContext: AuditContext = {
  userId: 'user-123',
  organizationId: 'org-123',
  ipAddress: '192.168.1.1',
  userAgent: 'Mozilla/5.0 Test',
};

const mockEvent: AuditEvent = {
  action: 'test.action',
  resource: 'test',
  resourceId: 'resource-123',
  metadata: { key: 'value' },
  status: 'success',
};

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
// audit() Function Tests
// ===========================================

describe('audit()', () => {
  it('creates audit log entry', async () => {
    mockedPrisma.auditLog.create.mockResolvedValue({ id: 'log-123' });

    await audit(mockContext, mockEvent);

    expect(mockedPrisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-123',
        organizationId: 'org-123',
        action: 'test.action',
        resource: 'test',
        resourceId: 'resource-123',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0 Test',
        status: 'success',
      }),
    });
  });

  it('handles missing optional fields', async () => {
    mockedPrisma.auditLog.create.mockResolvedValue({ id: 'log-123' });

    const minimalContext: AuditContext = {
      userId: 'user-123',
    };
    const minimalEvent: AuditEvent = {
      action: 'test.action',
      resource: 'test',
    };

    await audit(minimalContext, minimalEvent);

    expect(mockedPrisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-123',
        organizationId: null,
        resourceId: null,
        ipAddress: null,
        userAgent: null,
        status: 'success', // Default
      }),
    });
  });

  it('does not throw on database error', async () => {
    mockedPrisma.auditLog.create.mockRejectedValue(new Error('DB error'));

    // Should not throw
    await expect(audit(mockContext, mockEvent)).resolves.toBeUndefined();
  });

  it('logs failure status', async () => {
    mockedPrisma.auditLog.create.mockResolvedValue({ id: 'log-123' });

    await audit(mockContext, { ...mockEvent, status: 'failure' });

    expect(mockedPrisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: 'failure',
      }),
    });
  });

  it('serializes metadata correctly', async () => {
    mockedPrisma.auditLog.create.mockResolvedValue({ id: 'log-123' });

    const metadata = {
      nested: { deep: 'value' },
      array: [1, 2, 3],
      null: null,
    };

    await audit(mockContext, { ...mockEvent, metadata });

    expect(mockedPrisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        metadata: expect.objectContaining({
          nested: { deep: 'value' },
          array: [1, 2, 3],
        }),
      }),
    });
  });
});

// ===========================================
// auditActions Tests - Authentication
// ===========================================

describe('auditActions - Authentication', () => {
  it('logs login success', async () => {
    mockedPrisma.auditLog.create.mockResolvedValue({ id: 'log-123' });

    await auditActions.loginSuccess(mockContext);

    expect(mockedPrisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'user.login.success',
        resource: 'user',
        resourceId: 'user-123',
      }),
    });
  });

  it('logs login failed', async () => {
    mockedPrisma.auditLog.create.mockResolvedValue({ id: 'log-123' });

    await auditActions.loginFailed('test@example.com', '192.168.1.1', 'Mozilla', 'invalid_password');

    expect(mockedPrisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'user.login.failed',
        status: 'failure',
      }),
    });
  });

  it('logs logout', async () => {
    mockedPrisma.auditLog.create.mockResolvedValue({ id: 'log-123' });

    await auditActions.logout(mockContext);

    expect(mockedPrisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'user.logout',
      }),
    });
  });

  it('logs password reset completed', async () => {
    mockedPrisma.auditLog.create.mockResolvedValue({ id: 'log-123' });

    await auditActions.passwordResetCompleted('user-123', '192.168.1.1', 'Mozilla');

    expect(mockedPrisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'user.password.reset.complete',
      }),
    });
  });
});

// ===========================================
// auditActions Tests - Gateway
// ===========================================

describe('auditActions - Gateway', () => {
  it('logs gateway created', async () => {
    mockedPrisma.auditLog.create.mockResolvedValue({ id: 'log-123' });

    await auditActions.gatewayCreated(mockContext, 'gw-123', 'TELEGRAM', 'My Bot');

    expect(mockedPrisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'gateway.create',
        resource: 'gateway',
        resourceId: 'gw-123',
      }),
    });
  });

  it('logs gateway updated', async () => {
    mockedPrisma.auditLog.create.mockResolvedValue({ id: 'log-123' });

    await auditActions.gatewayUpdated(mockContext, 'gw-123', {
      nameChanged: true,
      credentialsChanged: false,
    });

    expect(mockedPrisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'gateway.update',
        resourceId: 'gw-123',
      }),
    });
  });

  it('logs gateway deleted', async () => {
    mockedPrisma.auditLog.create.mockResolvedValue({ id: 'log-123' });

    await auditActions.gatewayDeleted(mockContext, 'gw-123');

    expect(mockedPrisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'gateway.delete',
        resourceId: 'gw-123',
      }),
    });
  });
});

// ===========================================
// auditActions Tests - Plugin
// ===========================================

describe('auditActions - Plugin', () => {
  it('logs plugin installed', async () => {
    mockedPrisma.auditLog.create.mockResolvedValue({ id: 'log-123' });

    await auditActions.pluginInstalled(mockContext, 'up-123', 'auto-reply');

    expect(mockedPrisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'plugin.install',
        resource: 'plugin',
        resourceId: 'up-123',
      }),
    });
  });

  it('logs plugin uninstalled', async () => {
    mockedPrisma.auditLog.create.mockResolvedValue({ id: 'log-123' });

    await auditActions.pluginUninstalled(mockContext, 'up-123', 'auto-reply');

    expect(mockedPrisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'plugin.uninstall',
        resourceId: 'up-123',
      }),
    });
  });
});

// ===========================================
// auditActions Tests - User Registration
// ===========================================

describe('auditActions - User Registration', () => {
  it('logs user registered', async () => {
    mockedPrisma.auditLog.create.mockResolvedValue({ id: 'log-123' });

    await auditActions.userRegistered('user-123', 'test@example.com', '192.168.1.1', 'Mozilla');

    expect(mockedPrisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'user.register',
        resource: 'user',
        resourceId: 'user-123',
      }),
    });
  });

  it('logs password reset requested', async () => {
    mockedPrisma.auditLog.create.mockResolvedValue({ id: 'log-123' });

    await auditActions.passwordResetRequested('test@example.com', '192.168.1.1', 'Mozilla');

    expect(mockedPrisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'user.password.reset.request',
        resource: 'user',
      }),
    });
  });
});

// ===========================================
// Context Handling Tests
// ===========================================

describe('Audit context handling', () => {
  it('handles anonymous context', async () => {
    mockedPrisma.auditLog.create.mockResolvedValue({ id: 'log-123' });

    const anonymousContext: AuditContext = {};

    await audit(anonymousContext, mockEvent);

    expect(mockedPrisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: null,
        organizationId: null,
      }),
    });
  });

  it('handles partial context', async () => {
    mockedPrisma.auditLog.create.mockResolvedValue({ id: 'log-123' });

    const partialContext: AuditContext = {
      userId: 'user-123',
      // No org, IP, or UA
    };

    await audit(partialContext, mockEvent);

    expect(mockedPrisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-123',
        organizationId: null,
        ipAddress: null,
        userAgent: null,
      }),
    });
  });
});

// ===========================================
// Non-Blocking Behavior Tests
// ===========================================

describe('Non-blocking audit behavior', () => {
  it('continues even when database fails', async () => {
    mockedPrisma.auditLog.create.mockRejectedValue(new Error('Connection lost'));

    // Should complete without throwing
    const result = await audit(mockContext, mockEvent);

    expect(result).toBeUndefined();
  });

  it('logs error but does not throw', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockedPrisma.auditLog.create.mockRejectedValue(new Error('DB error'));

    await audit(mockContext, mockEvent);

    // The function should have caught and logged the error
    expect(mockedPrisma.auditLog.create).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
