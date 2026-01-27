"use strict";
/**
 * Auth Service
 *
 * Handles user authentication, registration, and session management.
 * Phase 6.7: Simplified tokens - context determined by URL, not token.
 *
 * @module modules/auth/auth.service
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = exports.authService = exports.AuthError = void 0;
const jwt_1 = require("@/lib/jwt");
const password_1 = require("@/lib/password");
const prisma_1 = require("@/lib/prisma");
/**
 * Auth error types
 */
class AuthError extends Error {
    code;
    constructor(message, code) {
        super(message);
        this.code = code;
        this.name = "AuthError";
    }
}
exports.AuthError = AuthError;
/**
 * Convert User to SafeUser (remove sensitive fields)
 */
function toSafeUser(user) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash, ...safeUser } = user;
    return safeUser;
}
/**
 * Calculate session expiration (7 days from now)
 */
function getSessionExpiration() {
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
    async register(data, meta) {
        // Check password security
        if (!(0, password_1.isPasswordSecure)(data.password)) {
            throw new AuthError("Password must be at least 8 characters with uppercase, lowercase, and number", "PASSWORD_WEAK");
        }
        // Check if user already exists
        const existingUser = await prisma_1.prisma.user.findUnique({
            where: { email: data.email.toLowerCase() },
        });
        if (existingUser) {
            throw new AuthError("User with this email already exists", "USER_EXISTS");
        }
        // Hash password
        const passwordHash = await (0, password_1.hashPassword)(data.password);
        // Create user
        const user = await prisma_1.prisma.user.create({
            data: {
                email: data.email.toLowerCase(),
                passwordHash,
                name: data.name || null,
            },
        });
        // Create session
        const session = await this.createSession(user.id, meta);
        // Phase 6.7: Simplified token - no context, orgs fetched via API
        const payload = {
            userId: user.id,
            email: user.email,
            plan: user.plan,
            sessionId: session.id,
            role: user.role,
        };
        const token = (0, jwt_1.generateToken)(payload);
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
    async login(data, meta) {
        // Find user by email with memberships
        const user = await prisma_1.prisma.user.findUnique({
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
        const isValidPassword = await (0, password_1.verifyPassword)(data.password, user.passwordHash);
        if (!isValidPassword) {
            throw new AuthError("Invalid email or password", "INVALID_CREDENTIALS");
        }
        // Update last login
        await prisma_1.prisma.user.update({
            where: { id: user.id },
            data: { lastLoginAt: new Date() },
        });
        // Create session
        const session = await this.createSession(user.id, meta);
        // Phase 6.7: Simplified token - context determined by URL
        // Organizations are fetched via /api/user/organizations
        const payload = {
            userId: user.id,
            email: user.email,
            plan: user.plan,
            sessionId: session.id,
            role: user.role,
        };
        const token = (0, jwt_1.generateToken)(payload);
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
    async logout(sessionId) {
        await prisma_1.prisma.session.delete({
            where: { id: sessionId },
        }).catch(() => {
            // Session may already be deleted - ignore
        });
    }
    /**
     * Switch context between personal and organization
     *
     * @deprecated Phase 6.7: Context switching is now UI-only via navigation.
     * This method is kept for backward compatibility but returns the same token.
     * Frontend should navigate to /dashboard (personal) or /dashboard/organizations/:orgId (org).
     *
     * @param userId - User ID
     * @param sessionId - Current session ID
     * @param request - Context switch request
     * @returns Same token (no context in token anymore)
     */
    async switchContext(userId, sessionId, request) {
        // Get user with memberships
        const user = await prisma_1.prisma.user.findUnique({
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
        let contextPlan = user.plan;
        let organizationName;
        let orgRole;
        let organizationId;
        if (request.contextType === "organization" && request.organizationId) {
            // Validate user is member of the organization
            const membership = user.memberships.find((m) => m.organizationId === request.organizationId);
            if (!membership) {
                throw new AuthError("Not a member of this organization", "NOT_MEMBER");
            }
            organizationId = membership.organizationId;
            organizationName = membership.organization.name;
            orgRole = membership.role;
            contextPlan = membership.organization.plan;
        }
        // Phase 6.7: Token no longer contains context
        // Generate same simplified token
        const payload = {
            userId: user.id,
            email: user.email,
            plan: user.plan,
            sessionId,
            role: user.role,
        };
        const token = (0, jwt_1.generateToken)(payload);
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
    async validateSession(token) {
        // Verify JWT
        const payload = (0, jwt_1.verifyToken)(token);
        if (!payload) {
            return null;
        }
        // Check session exists and not expired
        const session = await prisma_1.prisma.session.findUnique({
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
    async getUserById(userId) {
        const user = await prisma_1.prisma.user.findUnique({
            where: { id: userId },
        });
        if (!user)
            return null;
        return toSafeUser(user);
    }
    /**
     * Create a new session for a user
     *
     * @param userId - User ID
     * @param meta - Session metadata
     * @returns Created session
     */
    async createSession(userId, meta) {
        const expiresAt = getSessionExpiration();
        // Generate a unique session token using crypto
        const crypto = await Promise.resolve().then(() => __importStar(require("crypto")));
        const token = crypto.randomBytes(32).toString("hex");
        const session = await prisma_1.prisma.session.create({
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
    async getUserSessions(userId) {
        return prisma_1.prisma.session.findMany({
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
    async revokeAllSessions(userId, exceptSessionId) {
        await prisma_1.prisma.session.deleteMany({
            where: {
                userId,
                id: exceptSessionId ? { not: exceptSessionId } : undefined,
            },
        });
    }
    /**
     * Clean up expired sessions (for cron job)
     */
    async cleanupExpiredSessions() {
        const result = await prisma_1.prisma.session.deleteMany({
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
    async requestPasswordReset(email) {
        // Find user by email
        const user = await prisma_1.prisma.user.findUnique({
            where: { email: email.toLowerCase() },
        });
        // For security, don't reveal if email exists
        if (!user) {
            return null;
        }
        // Invalidate any existing reset tokens for this user
        await prisma_1.prisma.passwordResetToken.deleteMany({
            where: { userId: user.id },
        });
        // Generate secure random token
        const crypto = await Promise.resolve().then(() => __importStar(require("crypto")));
        const token = crypto.randomBytes(32).toString("hex");
        // Token expires in 1 hour
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 1);
        // Store token in database
        await prisma_1.prisma.passwordResetToken.create({
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
    async resetPassword(token, newPassword) {
        // Check password security
        if (!(0, password_1.isPasswordSecure)(newPassword)) {
            throw new AuthError("Password must be at least 8 characters with uppercase, lowercase, and number", "PASSWORD_WEAK");
        }
        // Find the reset token
        const resetToken = await prisma_1.prisma.passwordResetToken.findUnique({
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
        const passwordHash = await (0, password_1.hashPassword)(newPassword);
        // Update password and mark token as used in a transaction
        await prisma_1.prisma.$transaction([
            prisma_1.prisma.user.update({
                where: { id: resetToken.userId },
                data: { passwordHash },
            }),
            prisma_1.prisma.passwordResetToken.update({
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
    async updateProfile(userId, data) {
        const user = await prisma_1.prisma.user.update({
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
    async changePassword(userId, currentPassword, newPassword) {
        // Get user with password hash
        const user = await prisma_1.prisma.user.findUnique({
            where: { id: userId },
        });
        if (!user) {
            throw new AuthError("User not found", "USER_NOT_FOUND");
        }
        // Verify current password
        const isValid = await (0, password_1.verifyPassword)(currentPassword, user.passwordHash);
        if (!isValid) {
            throw new AuthError("Current password is incorrect", "INVALID_PASSWORD");
        }
        // Check new password security
        if (!(0, password_1.isPasswordSecure)(newPassword)) {
            throw new AuthError("Password must be at least 8 characters with uppercase, lowercase, and number", "PASSWORD_WEAK");
        }
        // Hash and update password
        const passwordHash = await (0, password_1.hashPassword)(newPassword);
        await prisma_1.prisma.user.update({
            where: { id: userId },
            data: { passwordHash, updatedAt: new Date() },
        });
        // Optionally revoke all other sessions (user stays logged in on current device)
        // await this.revokeAllSessions(userId);
    }
}
exports.AuthService = AuthService;
// Export singleton instance
exports.authService = new AuthService();
//# sourceMappingURL=auth.service.js.map