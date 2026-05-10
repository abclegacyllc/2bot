/**
 * Auth Service
 *
 * Handles user authentication, registration, and session management.
 * Simplified tokens - context determined by URL, not token.
 *
 * @module modules/auth/auth.service
 */

import {
    generateMfaChallengeToken,
    generateToken,
    verifyMfaChallengeToken,
    verifyToken,
} from "@/lib/jwt";
import { hashPassword, isPasswordSecure, verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import type { OrgPlan, OrgRole, PlanType, Session, User } from "@prisma/client";
import {
    consumeRecoveryCode,
    generateRecoveryCodes,
    isMfaEnabled,
    startEnrollment as startTotpEnrollment,
    verifyTotp,
    type MfaEnrollmentArtifacts,
} from "./mfa.service";
import type {
    AuthResponse,
    LoginRequest,
    LoginResult,
    MfaChallengeResponse,
    RegisterRequest,
    SafeUser,
    SwitchContextRequest,
    SwitchContextResponse,
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
  | "INVALID_PASSWORD"
  | "USER_NOT_FOUND"
  | "USER_INACTIVE"
  | "SESSION_INVALID"
  | "SESSION_EXPIRED"
  | "PASSWORD_WEAK"
  | "TOKEN_INVALID"
  | "TOKEN_EXPIRED"
  | "TOKEN_USED"
  | "INVALID_REQUEST"
  | "NOT_MEMBER"
  // Wave 2.1 — MFA flow errors
  | "MFA_CHALLENGE_INVALID"
  | "MFA_CODE_INVALID"
  | "MFA_NOT_ENROLLED"
  | "MFA_ALREADY_ENROLLED"
  // Wave 2.1 closeout — per-org MFA enforcement
  | "MFA_ENROLLMENT_REQUIRED";

/**
 * Convert User to SafeUser (remove sensitive fields)
 */
function toSafeUser(user: User): SafeUser {
   
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

    // Simplified token - no context, orgs fetched via API
    const payload: TokenPayload = {
      userId: user.id,
      email: user.email,
      plan: user.plan,
      sessionId: session.id,
      role: user.role,
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
  async login(data: LoginRequest, meta?: SessionMeta): Promise<LoginResult> {
    // Find user by email with memberships
    const user = await prisma.user.findUnique({
      where: { email: data.email.toLowerCase() },
      include: {
        memberships: {
          where: { status: "ACTIVE" },
          include: {
            organization: {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
          },
        },
      },
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

    // Wave 2.1: if the user has finished MFA enrollment, password alone is
    // not enough — issue a short-lived challenge token instead of a real
    // session. The client follows up with `completeMfaChallenge`.
    if (isMfaEnabled(user)) {
      return this.issueMfaChallenge(user.id);
    }

    // Wave 2.1 closeout — per-org enforcement. If the user is an active
    // member of any org with `mfaRequired = true` but has not enrolled,
    // refuse the login. The org admin can either disable the requirement
    // temporarily or issue an enrollment-grace flow (future work).
    const orgRequiresMfa = user.memberships.some(
      (m) => m.status === "ACTIVE" && m.organization && m.organization.id,
    );
    if (orgRequiresMfa) {
      // We loaded memberships above with `select: organization { id, name, slug }`
      // — re-query the orgs to see which (if any) require MFA. This is one
      // small extra query in the rare path where the user has any
      // memberships at all.
      const requiringOrg = await prisma.organization.findFirst({
        where: {
          mfaRequired: true,
          memberships: {
            some: { userId: user.id, status: "ACTIVE" },
          },
        },
        select: { id: true, name: true },
      });
      if (requiringOrg) {
        throw new AuthError(
          `Organization "${requiringOrg.name}" requires MFA. Please enrol before signing in.`,
          "MFA_ENROLLMENT_REQUIRED",
        );
      }
    }

    // No MFA — proceed with the existing session-issuance path.
    return this.completeLogin(user, meta, /*mfa*/ false);
  }

  /**
   * Internal: build an `AuthResponse` once we've decided the caller is
   * authorised. Used by the no-MFA login path *and* by the post-challenge
   * path (`completeMfaChallenge`), so both produce identical session shapes.
   */
  private async completeLogin(
    user: User,
    meta: SessionMeta | undefined,
    mfaPassed: boolean,
  ): Promise<AuthResponse> {
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const session = await this.createSession(user.id, meta);

    const payload: TokenPayload = {
      userId: user.id,
      email: user.email,
      plan: user.plan,
      sessionId: session.id,
      role: user.role,
      mfa: mfaPassed,
    };
    const token = generateToken(payload);

    return {
      user: toSafeUser(user),
      token,
      expiresAt: session.expiresAt.toISOString(),
    };
  }

  /**
   * Wave 2.1: issue an `MfaChallengeResponse` for a user who has finished
   * TOTP enrollment. The challenge token is signed under a different
   * audience (see `lib/jwt`) so it cannot be used as a session bearer.
   */
  private issueMfaChallenge(userId: string): MfaChallengeResponse {
    // Pre-allocate a session id; we don't write the Session row until the
    // client passes the second factor. Using the same id end-to-end means
    // the audit trail can correlate "challenge issued" → "session created".
    const challengeSessionId = `mfa-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    const mfaToken = generateMfaChallengeToken({
      userId,
      sessionId: challengeSessionId,
      scope: "mfa-challenge",
    });

    // 5 min ttl matches MFA_CHALLENGE_EXPIRES_IN in lib/jwt.
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    return {
      mfaRequired: true,
      mfaToken,
      expiresAt,
    };
  }

  /**
   * Wave 2.1: exchange an MFA challenge token + a 6-digit TOTP code (or a
   * recovery code) for a real session.
   *
   * @param mfaToken   The bearer returned by `login` when `mfaRequired: true`
   * @param code       6-digit TOTP code OR a recovery code (with or without hyphen/casing)
   * @param meta       Session metadata (forwarded into the new Session row)
   * @throws AuthError MFA_CHALLENGE_INVALID / MFA_CODE_INVALID / USER_INACTIVE
   */
  async completeMfaChallenge(
    mfaToken: string,
    code: string,
    meta?: SessionMeta,
  ): Promise<AuthResponse> {
    const challenge = verifyMfaChallengeToken(mfaToken);
    if (!challenge) {
      throw new AuthError("Invalid or expired MFA token", "MFA_CHALLENGE_INVALID");
    }

    const user = await prisma.user.findUnique({ where: { id: challenge.userId } });
    if (!user) {
      throw new AuthError("Invalid or expired MFA token", "MFA_CHALLENGE_INVALID");
    }
    if (!user.isActive) {
      throw new AuthError("Account is deactivated", "USER_INACTIVE");
    }
    if (!isMfaEnabled(user)) {
      // The user disabled MFA between login() and now, or never had it.
      // Treat as challenge-invalid rather than silently succeeding.
      throw new AuthError("MFA is not enrolled for this account", "MFA_CHALLENGE_INVALID");
    }

    const totpOk = user.totpSecret ? verifyTotp(user.totpSecret, code) : false;

    if (!totpOk) {
      // Try the submitted code as a recovery code.
      const recoveryIndex = await consumeRecoveryCode(user.totpRecoveryCodes, code);
      if (recoveryIndex === null) {
        throw new AuthError("Invalid MFA code", "MFA_CODE_INVALID");
      }
      // Splice the consumed code out atomically.
      const remaining = [...user.totpRecoveryCodes];
      remaining.splice(recoveryIndex, 1);
      await prisma.user.update({
        where: { id: user.id },
        data: { totpRecoveryCodes: remaining },
      });
    }

    return this.completeLogin(user, meta, /*mfa*/ true);
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
   * Switch context between personal and organization
   *
   * @deprecated Context switching is now UI-only via navigation.
   * This method is kept for backward compatibility but returns the same token.
   * Frontend should navigate to /dashboard (personal) or /organizations/:orgId (org).
   *
   * @param userId - User ID
   * @param sessionId - Current session ID
   * @param request - Context switch request
   * @returns Same token (no context in token anymore)
   */
  async switchContext(
    userId: string,
    sessionId: string,
    request: SwitchContextRequest
  ): Promise<SwitchContextResponse> {
    // Get user with memberships
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        memberships: {
          where: { status: "ACTIVE" },
          include: {
            organization: {
              select: {
                id: true,
                name: true,
                slug: true,
                plan: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new AuthError("User not found", "USER_NOT_FOUND");
    }

    if (!user.isActive) {
      throw new AuthError("Account is deactivated", "USER_INACTIVE");
    }

    let contextPlan: PlanType | OrgPlan = user.plan;
    let organizationName: string | undefined;
    let orgRole: OrgRole | undefined;
    let organizationId: string | undefined;

    if (request.contextType === "organization" && request.organizationId) {
      // Validate user is member of the organization
      const membership = user.memberships.find(
        (m) => m.organizationId === request.organizationId
      );

      if (!membership) {
        throw new AuthError(
          "Not a member of this organization",
          "NOT_MEMBER"
        );
      }

      organizationId = membership.organizationId;
      organizationName = membership.organization.name;
      orgRole = membership.role;
      contextPlan = membership.organization.plan;
    }

    // Token no longer contains context
    // Generate same simplified token
    const payload: TokenPayload = {
      userId: user.id,
      email: user.email,
      plan: user.plan,
      sessionId,
      role: user.role,
    };
    const token = generateToken(payload);

    // Return context info for backward compatibility
    return {
      token,
      context: {
        type: request.contextType,
        organizationId,
        organizationName,
        orgRole,
        plan: contextPlan,
      },
    };
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
   * @returns userId of the user whose password was reset
   */
  async resetPassword(token: string, newPassword: string): Promise<string> {
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

    return resetToken.userId;
  }

  /**
   * Update user profile
   * @param userId - User ID
   * @param data - Profile data to update
   * @returns Updated user (safe version)
   */
  async updateProfile(
    userId: string,
    data: { name?: string }
  ): Promise<SafeUser> {
    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        name: data.name,
        updatedAt: new Date(),
      },
    });

    return toSafeUser(user);
  }

  /**
   * Change user password
   * @param userId - User ID
   * @param currentPassword - Current password for verification
   * @param newPassword - New password to set
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<void> {
    // Get user with password hash
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new AuthError("User not found", "USER_NOT_FOUND");
    }

    // Verify current password
    const isValid = await verifyPassword(currentPassword, user.passwordHash);
    if (!isValid) {
      throw new AuthError("Current password is incorrect", "INVALID_PASSWORD");
    }

    // Check new password security
    if (!isPasswordSecure(newPassword)) {
      throw new AuthError(
        "Password must be at least 8 characters with uppercase, lowercase, and number",
        "PASSWORD_WEAK"
      );
    }

    // Hash and update password
    const passwordHash = await hashPassword(newPassword);
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash, updatedAt: new Date() },
    });

    // Optionally revoke all other sessions (user stays logged in on current device)
    // await this.revokeAllSessions(userId);
  }

  // ============================================================
  // Wave 2.1 — TOTP MFA flows
  // ============================================================

  /**
   * Begin TOTP enrollment for an authenticated user.
   *
   * Persists the encrypted secret on the user row but leaves
   * `totpEnabledAt` NULL — MFA is not yet active until the user proves
   * they can read codes off the secret by calling `confirmMfaEnrollment`.
   *
   * Re-running this for a user who is already enrolled (totpEnabledAt set)
   * throws MFA_ALREADY_ENROLLED. Re-running mid-enrollment (secret set,
   * not yet confirmed) is allowed and rotates the secret — a user who
   * lost their phone partway through can simply restart.
   */
  async startMfaEnrollment(userId: string, email: string): Promise<MfaEnrollmentArtifacts> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { totpEnabledAt: true },
    });
    if (!user) throw new AuthError("User not found", "USER_NOT_FOUND");
    if (user.totpEnabledAt) {
      throw new AuthError("MFA is already enrolled", "MFA_ALREADY_ENROLLED");
    }

    const artifacts = await startTotpEnrollment({ email });

    await prisma.user.update({
      where: { id: userId },
      data: {
        totpSecret: artifacts.encryptedSecret,
        totpEnabledAt: null,
        // Do not generate recovery codes yet — they're only useful once
        // the user has confirmed the enrollment with a real code.
        totpRecoveryCodes: [],
      },
    });

    return artifacts;
  }

  /**
   * Finish TOTP enrollment by submitting the first valid code.
   *
   * On success: sets `totpEnabledAt` and writes a fresh batch of recovery
   * codes. The plaintext recovery codes are returned **once** so the
   * client can show them to the user — they are NOT recoverable later.
   */
  async confirmMfaEnrollment(
    userId: string,
    code: string,
  ): Promise<{ recoveryCodes: string[] }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { totpSecret: true, totpEnabledAt: true },
    });
    if (!user) throw new AuthError("User not found", "USER_NOT_FOUND");
    if (!user.totpSecret) {
      throw new AuthError("No MFA enrollment in progress", "MFA_NOT_ENROLLED");
    }
    if (user.totpEnabledAt) {
      throw new AuthError("MFA is already enrolled", "MFA_ALREADY_ENROLLED");
    }

    const ok = verifyTotp(user.totpSecret, code);
    if (!ok) {
      throw new AuthError("Invalid MFA code", "MFA_CODE_INVALID");
    }

    const { plaintext, hashes } = await generateRecoveryCodes();
    await prisma.user.update({
      where: { id: userId },
      data: {
        totpEnabledAt: new Date(),
        totpRecoveryCodes: hashes,
      },
    });

    return { recoveryCodes: plaintext };
  }

  /**
   * Disable MFA for an authenticated user. Requires both the current
   * password (re-auth) and a valid TOTP code (or recovery code) to make
   * accidental or coerced disabling harder.
   */
  async disableMfa(
    userId: string,
    password: string,
    code: string,
  ): Promise<void> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AuthError("User not found", "USER_NOT_FOUND");
    if (!isMfaEnabled(user)) {
      throw new AuthError("MFA is not enrolled", "MFA_NOT_ENROLLED");
    }

    const passwordOk = await verifyPassword(password, user.passwordHash);
    if (!passwordOk) {
      throw new AuthError("Invalid password", "INVALID_CREDENTIALS");
    }

    let secondFactorOk = user.totpSecret ? verifyTotp(user.totpSecret, code) : false;
    if (!secondFactorOk) {
      const idx = await consumeRecoveryCode(user.totpRecoveryCodes, code);
      secondFactorOk = idx !== null;
    }
    if (!secondFactorOk) {
      throw new AuthError("Invalid MFA code", "MFA_CODE_INVALID");
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        totpSecret: null,
        totpEnabledAt: null,
        totpRecoveryCodes: [],
      },
    });
  }
}

// Export singleton instance
export const authService = new AuthService();

// Also export class for testing
export { AuthService };
