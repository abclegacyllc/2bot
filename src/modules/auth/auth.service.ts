/**
 * Auth Service
 *
 * Handles user authentication, registration, and session management.
 *
 * @module modules/auth/auth.service
 */

import { generateToken, verifyToken } from "@/lib/jwt";
import { hashPassword, isPasswordSecure, verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import type { Session, User } from "@prisma/client";
import type {
    AuthResponse,
    LoginRequest,
    RegisterRequest,
    SafeUser,
    TokenPayload,
} from "./auth.types";

/**
 * Session metadata for tracking
 */
export interface SessionMeta {
  userAgent?: string;
  ipAddress?: string;
}

/**
 * Auth error types
 */
export class AuthError extends Error {
  constructor(
    message: string,
    public code: AuthErrorCode
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export type AuthErrorCode =
  | "USER_EXISTS"
  | "INVALID_CREDENTIALS"
  | "USER_NOT_FOUND"
  | "USER_INACTIVE"
  | "SESSION_INVALID"
  | "SESSION_EXPIRED"
  | "PASSWORD_WEAK"
  | "TOKEN_INVALID"
  | "TOKEN_EXPIRED"
  | "TOKEN_USED";

/**
 * Convert User to SafeUser (remove sensitive fields)
 */
function toSafeUser(user: User): SafeUser {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { passwordHash, ...safeUser } = user;
  return safeUser;
}

/**
 * Calculate session expiration (7 days from now)
 */
function getSessionExpiration(): Date {
  const expiration = new Date();
  expiration.setDate(expiration.getDate() + 7);
  return expiration;
}

/**
 * Auth Service Class
 */
class AuthService {
  /**
   * Register a new user
   *
   * @param data - Registration data (email, password, name?)
   * @param meta - Session metadata (userAgent, ipAddress)
   * @returns Auth response with user and token
   * @throws AuthError if email exists or password is weak
   */
  async register(
    data: RegisterRequest,
    meta?: SessionMeta
  ): Promise<AuthResponse> {
    // Check password security
    if (!isPasswordSecure(data.password)) {
      throw new AuthError(
        "Password must be at least 8 characters with uppercase, lowercase, and number",
        "PASSWORD_WEAK"
      );
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: data.email.toLowerCase() },
    });

    if (existingUser) {
      throw new AuthError("User with this email already exists", "USER_EXISTS");
    }

    // Hash password
    const passwordHash = await hashPassword(data.password);

    // Create user
    const user = await prisma.user.create({
      data: {
        email: data.email.toLowerCase(),
        passwordHash,
        name: data.name || null,
      },
    });

    // Create session
    const session = await this.createSession(user.id, meta);

    // Generate token
    const payload: TokenPayload = {
      userId: user.id,
      email: user.email,
      plan: user.plan,
      sessionId: session.id,
    };
    const token = generateToken(payload);

    return {
      user: toSafeUser(user),
      token,
      expiresAt: session.expiresAt.toISOString(),
    };
  }

  /**
   * Login with email and password
   *
   * @param data - Login credentials (email, password)
   * @param meta - Session metadata (userAgent, ipAddress)
   * @returns Auth response with user and token
   * @throws AuthError if credentials invalid or user inactive
   */
  async login(data: LoginRequest, meta?: SessionMeta): Promise<AuthResponse> {
    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email: data.email.toLowerCase() },
    });

    if (!user) {
      throw new AuthError("Invalid email or password", "INVALID_CREDENTIALS");
    }

    // Check if user is active
    if (!user.isActive) {
      throw new AuthError("Account is deactivated", "USER_INACTIVE");
    }

    // Verify password
    const isValidPassword = await verifyPassword(data.password, user.passwordHash);

    if (!isValidPassword) {
      throw new AuthError("Invalid email or password", "INVALID_CREDENTIALS");
    }

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // Create session
    const session = await this.createSession(user.id, meta);

    // Generate token
    const payload: TokenPayload = {
      userId: user.id,
      email: user.email,
      plan: user.plan,
      sessionId: session.id,
    };
    const token = generateToken(payload);

    return {
      user: toSafeUser(user),
      token,
      expiresAt: session.expiresAt.toISOString(),
    };
  }

  /**
   * Logout - invalidate session
   *
   * @param sessionId - Session ID to invalidate
   */
  async logout(sessionId: string): Promise<void> {
    await prisma.session.delete({
      where: { id: sessionId },
    }).catch(() => {
      // Session may already be deleted - ignore
    });
  }

  /**
   * Validate a session token
   *
   * @param token - JWT token to validate
   * @returns User if valid, null if invalid
   */
  async validateSession(token: string): Promise<User | null> {
    // Verify JWT
    const payload = verifyToken(token);
    if (!payload) {
      return null;
    }

    // Check session exists and not expired
    const session = await prisma.session.findUnique({
      where: { id: payload.sessionId },
      include: { user: true },
    });

    if (!session) {
      return null;
    }

    // Check if session expired
    if (session.expiresAt < new Date()) {
      // Clean up expired session
      await this.logout(session.id);
      return null;
    }

    // Check if user is active
    if (!session.user.isActive) {
      return null;
    }

    return session.user;
  }

  /**
   * Get user by ID (safe - no password)
   *
   * @param userId - User ID
   * @returns SafeUser or null
   */
  async getUserById(userId: string): Promise<SafeUser | null> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) return null;
    return toSafeUser(user);
  }

  /**
   * Create a new session for a user
   *
   * @param userId - User ID
   * @param meta - Session metadata
   * @returns Created session
   */
  async createSession(userId: string, meta?: SessionMeta): Promise<Session> {
    const expiresAt = getSessionExpiration();

    // Generate a unique session token using crypto
    const crypto = await import("crypto");
    const token = crypto.randomBytes(32).toString("hex");

    const session = await prisma.session.create({
      data: {
        userId,
        token,
        expiresAt,
        userAgent: meta?.userAgent || null,
        ipAddress: meta?.ipAddress || null,
      },
    });

    return session;
  }

  /**
   * Get all active sessions for a user
   *
   * @param userId - User ID
   * @returns List of active sessions
   */
  async getUserSessions(userId: string): Promise<Session[]> {
    return prisma.session.findMany({
      where: {
        userId,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Revoke all sessions for a user (except current)
   *
   * @param userId - User ID
   * @param exceptSessionId - Session ID to keep (optional)
   */
  async revokeAllSessions(
    userId: string,
    exceptSessionId?: string
  ): Promise<void> {
    await prisma.session.deleteMany({
      where: {
        userId,
        id: exceptSessionId ? { not: exceptSessionId } : undefined,
      },
    });
  }

  /**
   * Clean up expired sessions (for cron job)
   */
  async cleanupExpiredSessions(): Promise<number> {
    const result = await prisma.session.deleteMany({
      where: {
        expiresAt: { lt: new Date() },
      },
    });
    return result.count;
  }

  /**
   * Request password reset - generates token
   *
   * For security, always returns success even if email not found.
   * Token expires in 1 hour.
   *
   * @param email - User email
   * @returns Reset token (or null if user not found)
   */
  async requestPasswordReset(email: string): Promise<string | null> {
    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    // For security, don't reveal if email exists
    if (!user) {
      return null;
    }

    // Invalidate any existing reset tokens for this user
    await prisma.passwordResetToken.deleteMany({
      where: { userId: user.id },
    });

    // Generate secure random token
    const crypto = await import("crypto");
    const token = crypto.randomBytes(32).toString("hex");

    // Token expires in 1 hour
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1);

    // Store token in database
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        token,
        expiresAt,
      },
    });

    return token;
  }

  /**
   * Reset password with token
   *
   * @param token - Reset token from email
   * @param newPassword - New password
   * @throws AuthError if token invalid, expired, or already used
   */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    // Check password security
    if (!isPasswordSecure(newPassword)) {
      throw new AuthError(
        "Password must be at least 8 characters with uppercase, lowercase, and number",
        "PASSWORD_WEAK"
      );
    }

    // Find the reset token
    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { token },
      include: { user: true },
    });

    // Check if token exists
    if (!resetToken) {
      throw new AuthError("Invalid or expired reset token", "TOKEN_INVALID");
    }

    // Check if token already used
    if (resetToken.usedAt) {
      throw new AuthError("Reset token has already been used", "TOKEN_USED");
    }

    // Check if token expired
    if (resetToken.expiresAt < new Date()) {
      throw new AuthError("Reset token has expired", "TOKEN_EXPIRED");
    }

    // Hash the new password
    const passwordHash = await hashPassword(newPassword);

    // Update password and mark token as used in a transaction
    await prisma.$transaction([
      prisma.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash },
      }),
      prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() },
      }),
    ]);

    // Invalidate all existing sessions for security
    await this.revokeAllSessions(resetToken.userId);
  }
}

// Export singleton instance
export const authService = new AuthService();

// Also export class for testing
export { AuthService };
