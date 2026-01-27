/**
 * Auth Service Tests
 *
 * Tests for authentication service: register, login, session management.
 * Uses mocked Prisma for unit testing without database.
 *
 * @module modules/auth/__tests__/auth.service.test
 */

import { hashPassword } from '@/lib/password';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthError, authService } from '../auth.service';

// ===========================================
// Mock Prisma Client
// ===========================================

const mockUser = {
  id: 'user-123',
  email: 'test@example.com',
  name: 'Test User',
  passwordHash: '', // Will be set in tests
  plan: 'FREE' as const,
  role: 'MEMBER' as const,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastLoginAt: null,
  stripeCustomerId: null,
  stripeSubscriptionId: null,
  billingPeriodEnd: null,
  executionMode: 'SERVERLESS' as const,
};

const mockSession = {
  id: 'session-456',
  userId: 'user-123',
  token: 'session-token',
  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
  userAgent: null,
  ipAddress: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// Mock Prisma
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    session: {
      create: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      findMany: vi.fn(),
    },
    passwordResetToken: {
      create: vi.fn(),
      findUnique: vi.fn(),
      deleteMany: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

// Import mocked prisma
import { prisma } from '@/lib/prisma';

const mockedPrisma = prisma as unknown as {
  user: {
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  session: {
    create: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
  };
  passwordResetToken: {
    create: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  $transaction: ReturnType<typeof vi.fn>;
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
// AuthError Tests
// ===========================================

describe('AuthError', () => {
  it('creates error with message and code', () => {
    const error = new AuthError('User not found', 'USER_NOT_FOUND');

    expect(error.message).toBe('User not found');
    expect(error.code).toBe('USER_NOT_FOUND');
    expect(error.name).toBe('AuthError');
  });

  it('has all expected error codes', () => {
    const codes = [
      'USER_EXISTS',
      'INVALID_CREDENTIALS',
      'INVALID_PASSWORD',
      'USER_NOT_FOUND',
      'USER_INACTIVE',
      'SESSION_INVALID',
      'SESSION_EXPIRED',
      'PASSWORD_WEAK',
      'TOKEN_INVALID',
      'TOKEN_EXPIRED',
      'TOKEN_USED',
      'INVALID_REQUEST',
      'NOT_MEMBER',
    ];

    for (const code of codes) {
      const error = new AuthError('Test', code as any);
      expect(error.code).toBe(code);
    }
  });
});

// ===========================================
// Register Tests
// ===========================================

describe('authService.register', () => {
  it('registers a new user successfully', async () => {
    const passwordHash = await hashPassword('SecurePass123');

    mockedPrisma.user.findUnique.mockResolvedValue(null);
    mockedPrisma.user.create.mockResolvedValue({
      ...mockUser,
      passwordHash,
    });
    mockedPrisma.session.create.mockResolvedValue(mockSession);

    const result = await authService.register({
      email: 'new@example.com',
      password: 'SecurePass123',
      name: 'New User',
    });

    expect(result.user.email).toBe('test@example.com');
    expect(result.token).toBeDefined();
    expect(result.expiresAt).toBeDefined();
    expect((result.user as any).passwordHash).toBeUndefined(); // SafeUser
  });

  it('throws PASSWORD_WEAK for weak password', async () => {
    await expect(
      authService.register({
        email: 'test@example.com',
        password: 'weak',
      })
    ).rejects.toThrow(AuthError);

    try {
      await authService.register({
        email: 'test@example.com',
        password: 'weak',
      });
    } catch (error) {
      expect(error).toBeInstanceOf(AuthError);
      expect((error as AuthError).code).toBe('PASSWORD_WEAK');
    }
  });

  it('throws USER_EXISTS for duplicate email', async () => {
    mockedPrisma.user.findUnique.mockResolvedValue(mockUser);

    try {
      await authService.register({
        email: 'test@example.com',
        password: 'SecurePass123',
      });
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(AuthError);
      expect((error as AuthError).code).toBe('USER_EXISTS');
    }
  });

  it('normalizes email to lowercase', async () => {
    mockedPrisma.user.findUnique.mockResolvedValue(null);
    mockedPrisma.user.create.mockResolvedValue(mockUser);
    mockedPrisma.session.create.mockResolvedValue(mockSession);

    await authService.register({
      email: 'TEST@EXAMPLE.COM',
      password: 'SecurePass123',
    });

    expect(mockedPrisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'test@example.com' },
    });
  });
});

// ===========================================
// Login Tests
// ===========================================

describe('authService.login', () => {
  it('logs in with valid credentials', async () => {
    const passwordHash = await hashPassword('SecurePass123');

    mockedPrisma.user.findUnique.mockResolvedValue({
      ...mockUser,
      passwordHash,
      memberships: [],
    });
    mockedPrisma.user.update.mockResolvedValue(mockUser);
    mockedPrisma.session.create.mockResolvedValue(mockSession);

    const result = await authService.login({
      email: 'test@example.com',
      password: 'SecurePass123',
    });

    expect(result.user.email).toBe('test@example.com');
    expect(result.token).toBeDefined();
    expect(result.expiresAt).toBeDefined();
  });

  it('throws INVALID_CREDENTIALS for wrong password', async () => {
    const passwordHash = await hashPassword('SecurePass123');

    mockedPrisma.user.findUnique.mockResolvedValue({
      ...mockUser,
      passwordHash,
      memberships: [],
    });

    try {
      await authService.login({
        email: 'test@example.com',
        password: 'WrongPassword1',
      });
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(AuthError);
      expect((error as AuthError).code).toBe('INVALID_CREDENTIALS');
    }
  });

  it('throws INVALID_CREDENTIALS for non-existent email', async () => {
    mockedPrisma.user.findUnique.mockResolvedValue(null);

    try {
      await authService.login({
        email: 'nonexistent@example.com',
        password: 'SecurePass123',
      });
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(AuthError);
      expect((error as AuthError).code).toBe('INVALID_CREDENTIALS');
    }
  });

  it('throws USER_INACTIVE for deactivated user', async () => {
    const passwordHash = await hashPassword('SecurePass123');

    mockedPrisma.user.findUnique.mockResolvedValue({
      ...mockUser,
      passwordHash,
      isActive: false,
      memberships: [],
    });

    try {
      await authService.login({
        email: 'test@example.com',
        password: 'SecurePass123',
      });
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(AuthError);
      expect((error as AuthError).code).toBe('USER_INACTIVE');
    }
  });

  it('normalizes email to lowercase', async () => {
    const passwordHash = await hashPassword('SecurePass123');

    mockedPrisma.user.findUnique.mockResolvedValue({
      ...mockUser,
      passwordHash,
      memberships: [],
    });
    mockedPrisma.user.update.mockResolvedValue(mockUser);
    mockedPrisma.session.create.mockResolvedValue(mockSession);

    await authService.login({
      email: 'TEST@EXAMPLE.COM',
      password: 'SecurePass123',
    });

    expect(mockedPrisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: 'test@example.com' },
      })
    );
  });

  it('updates lastLoginAt on successful login', async () => {
    const passwordHash = await hashPassword('SecurePass123');

    mockedPrisma.user.findUnique.mockResolvedValue({
      ...mockUser,
      passwordHash,
      memberships: [],
    });
    mockedPrisma.user.update.mockResolvedValue(mockUser);
    mockedPrisma.session.create.mockResolvedValue(mockSession);

    await authService.login({
      email: 'test@example.com',
      password: 'SecurePass123',
    });

    expect(mockedPrisma.user.update).toHaveBeenCalledWith({
      where: { id: mockUser.id },
      data: expect.objectContaining({ lastLoginAt: expect.any(Date) }),
    });
  });
});

// ===========================================
// Logout Tests
// ===========================================

describe('authService.logout', () => {
  it('deletes the session', async () => {
    mockedPrisma.session.delete.mockResolvedValue(mockSession);

    await authService.logout('session-123');

    expect(mockedPrisma.session.delete).toHaveBeenCalledWith({
      where: { id: 'session-123' },
    });
  });

  it('handles already deleted session gracefully', async () => {
    mockedPrisma.session.delete.mockRejectedValue(new Error('Not found'));

    // Should not throw
    await expect(authService.logout('nonexistent')).resolves.toBeUndefined();
  });
});

// ===========================================
// validateSession Tests
// ===========================================

describe('authService.validateSession', () => {
  it('returns user for valid session', async () => {
    // Need to import generateToken for this test
    const { generateToken } = await import('@/lib/jwt');

    const token = generateToken({
      userId: mockUser.id,
      email: mockUser.email,
      plan: mockUser.plan,
      sessionId: mockSession.id,
      role: mockUser.role,
    });

    mockedPrisma.session.findUnique.mockResolvedValue({
      ...mockSession,
      user: mockUser,
    });

    const result = await authService.validateSession(token);

    expect(result).not.toBeNull();
    expect(result!.id).toBe(mockUser.id);
  });

  it('returns null for invalid token', async () => {
    const result = await authService.validateSession('invalid-token');
    expect(result).toBeNull();
  });

  it('returns null for expired session', async () => {
    const { generateToken } = await import('@/lib/jwt');

    const token = generateToken({
      userId: mockUser.id,
      email: mockUser.email,
      plan: mockUser.plan,
      sessionId: mockSession.id,
      role: mockUser.role,
    });

    mockedPrisma.session.findUnique.mockResolvedValue({
      ...mockSession,
      expiresAt: new Date(Date.now() - 1000), // Expired
      user: mockUser,
    });
    mockedPrisma.session.delete.mockResolvedValue(mockSession);

    const result = await authService.validateSession(token);
    expect(result).toBeNull();
  });

  it('returns null for inactive user', async () => {
    const { generateToken } = await import('@/lib/jwt');

    const token = generateToken({
      userId: mockUser.id,
      email: mockUser.email,
      plan: mockUser.plan,
      sessionId: mockSession.id,
      role: mockUser.role,
    });

    mockedPrisma.session.findUnique.mockResolvedValue({
      ...mockSession,
      user: { ...mockUser, isActive: false },
    });

    const result = await authService.validateSession(token);
    expect(result).toBeNull();
  });
});

// ===========================================
// getUserById Tests
// ===========================================

describe('authService.getUserById', () => {
  it('returns SafeUser without passwordHash', async () => {
    const passwordHash = await hashPassword('SecurePass123');
    mockedPrisma.user.findUnique.mockResolvedValue({
      ...mockUser,
      passwordHash,
    });

    const result = await authService.getUserById('user-123');

    expect(result).not.toBeNull();
    expect(result!.id).toBe('user-123');
    expect((result as any).passwordHash).toBeUndefined();
  });

  it('returns null for non-existent user', async () => {
    mockedPrisma.user.findUnique.mockResolvedValue(null);

    const result = await authService.getUserById('nonexistent');
    expect(result).toBeNull();
  });
});

// ===========================================
// Session Management Tests
// ===========================================

describe('authService.getUserSessions', () => {
  it('returns active sessions for user', async () => {
    mockedPrisma.session.findMany.mockResolvedValue([mockSession]);

    const result = await authService.getUserSessions('user-123');

    expect(result).toHaveLength(1);
    expect(mockedPrisma.session.findMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-123',
        expiresAt: { gt: expect.any(Date) },
      },
      orderBy: { createdAt: 'desc' },
    });
  });
});

describe('authService.revokeAllSessions', () => {
  it('revokes all sessions for user', async () => {
    mockedPrisma.session.deleteMany.mockResolvedValue({ count: 3 });

    await authService.revokeAllSessions('user-123');

    expect(mockedPrisma.session.deleteMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-123',
        id: undefined,
      },
    });
  });

  it('revokes all sessions except current', async () => {
    mockedPrisma.session.deleteMany.mockResolvedValue({ count: 2 });

    await authService.revokeAllSessions('user-123', 'current-session');

    expect(mockedPrisma.session.deleteMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-123',
        id: { not: 'current-session' },
      },
    });
  });
});

describe('authService.cleanupExpiredSessions', () => {
  it('deletes expired sessions', async () => {
    mockedPrisma.session.deleteMany.mockResolvedValue({ count: 5 });

    const result = await authService.cleanupExpiredSessions();

    expect(result).toBe(5);
    expect(mockedPrisma.session.deleteMany).toHaveBeenCalledWith({
      where: {
        expiresAt: { lt: expect.any(Date) },
      },
    });
  });
});

// ===========================================
// Password Reset Tests
// ===========================================

describe('authService.requestPasswordReset', () => {
  it('returns token for existing user', async () => {
    mockedPrisma.user.findUnique.mockResolvedValue(mockUser);
    mockedPrisma.passwordResetToken.deleteMany.mockResolvedValue({ count: 0 });
    mockedPrisma.passwordResetToken.create.mockResolvedValue({
      id: 'reset-123',
      userId: mockUser.id,
      token: 'reset-token',
      expiresAt: new Date(),
      usedAt: null,
    });

    const result = await authService.requestPasswordReset('test@example.com');

    expect(result).toBeDefined();
    expect(typeof result).toBe('string');
  });

  it('returns null for non-existent email (security)', async () => {
    mockedPrisma.user.findUnique.mockResolvedValue(null);

    const result = await authService.requestPasswordReset('nonexistent@example.com');

    expect(result).toBeNull();
  });

  it('invalidates existing reset tokens', async () => {
    mockedPrisma.user.findUnique.mockResolvedValue(mockUser);
    mockedPrisma.passwordResetToken.deleteMany.mockResolvedValue({ count: 1 });
    mockedPrisma.passwordResetToken.create.mockResolvedValue({
      id: 'reset-123',
      userId: mockUser.id,
      token: 'reset-token',
      expiresAt: new Date(),
      usedAt: null,
    });

    await authService.requestPasswordReset('test@example.com');

    expect(mockedPrisma.passwordResetToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: mockUser.id },
    });
  });
});

describe('authService.resetPassword', () => {
  it('resets password with valid token', async () => {
    mockedPrisma.passwordResetToken.findUnique.mockResolvedValue({
      id: 'reset-123',
      userId: mockUser.id,
      token: 'valid-token',
      expiresAt: new Date(Date.now() + 3600000), // 1 hour
      usedAt: null,
      user: mockUser,
    });
    mockedPrisma.$transaction.mockResolvedValue([{}, {}]);
    mockedPrisma.session.deleteMany.mockResolvedValue({ count: 0 });

    const result = await authService.resetPassword('valid-token', 'NewSecure123');

    expect(result).toBe(mockUser.id);
  });

  it('throws PASSWORD_WEAK for weak new password', async () => {
    try {
      await authService.resetPassword('token', 'weak');
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(AuthError);
      expect((error as AuthError).code).toBe('PASSWORD_WEAK');
    }
  });

  it('throws TOKEN_INVALID for non-existent token', async () => {
    mockedPrisma.passwordResetToken.findUnique.mockResolvedValue(null);

    try {
      await authService.resetPassword('invalid-token', 'NewSecure123');
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(AuthError);
      expect((error as AuthError).code).toBe('TOKEN_INVALID');
    }
  });

  it('throws TOKEN_USED for already used token', async () => {
    mockedPrisma.passwordResetToken.findUnique.mockResolvedValue({
      id: 'reset-123',
      userId: mockUser.id,
      token: 'used-token',
      expiresAt: new Date(Date.now() + 3600000),
      usedAt: new Date(), // Already used
      user: mockUser,
    });

    try {
      await authService.resetPassword('used-token', 'NewSecure123');
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(AuthError);
      expect((error as AuthError).code).toBe('TOKEN_USED');
    }
  });

  it('throws TOKEN_EXPIRED for expired token', async () => {
    mockedPrisma.passwordResetToken.findUnique.mockResolvedValue({
      id: 'reset-123',
      userId: mockUser.id,
      token: 'expired-token',
      expiresAt: new Date(Date.now() - 1000), // Expired
      usedAt: null,
      user: mockUser,
    });

    try {
      await authService.resetPassword('expired-token', 'NewSecure123');
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(AuthError);
      expect((error as AuthError).code).toBe('TOKEN_EXPIRED');
    }
  });

  it('revokes all sessions after password reset', async () => {
    mockedPrisma.passwordResetToken.findUnique.mockResolvedValue({
      id: 'reset-123',
      userId: mockUser.id,
      token: 'valid-token',
      expiresAt: new Date(Date.now() + 3600000),
      usedAt: null,
      user: mockUser,
    });
    mockedPrisma.$transaction.mockResolvedValue([{}, {}]);
    mockedPrisma.session.deleteMany.mockResolvedValue({ count: 2 });

    await authService.resetPassword('valid-token', 'NewSecure123');

    expect(mockedPrisma.session.deleteMany).toHaveBeenCalledWith({
      where: {
        userId: mockUser.id,
        id: undefined,
      },
    });
  });
});
