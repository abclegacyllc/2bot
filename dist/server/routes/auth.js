"use strict";
/**
 * Auth Routes
 *
 * Authentication endpoints: register, login, logout, me
 *
 * @module server/routes/auth
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRouter = void 0;
const audit_1 = require("@/lib/audit");
const email_1 = require("@/lib/email");
const auth_service_1 = require("@/modules/auth/auth.service");
const auth_validation_1 = require("@/modules/auth/auth.validation");
const errors_1 = require("@/shared/errors");
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const error_handler_1 = require("../middleware/error-handler");
exports.authRouter = (0, express_1.Router)();
/**
 * Extract session metadata from request
 */
function getSessionMeta(req) {
    return {
        userAgent: req.headers["user-agent"] || undefined,
        ipAddress: req.ip || req.socket.remoteAddress || undefined,
    };
}
/**
 * POST /api/auth/register
 *
 * Register a new user account
 *
 * @body {string} email - User email
 * @body {string} password - User password (min 8 chars)
 * @body {string} [name] - Optional display name
 *
 * @returns {AuthResponse} User data and JWT token
 *
 * @throws {400} Validation error
 * @throws {409} Email already exists
 */
exports.authRouter.post("/register", (0, error_handler_1.asyncHandler)(async (req, res) => {
    // Validate input
    const validation = (0, auth_validation_1.validateSchema)(auth_validation_1.registerSchema, req.body);
    if (!validation.success) {
        throw new errors_1.ValidationError("Invalid registration data", validation.errors);
    }
    try {
        const result = await auth_service_1.authService.register(validation.data, getSessionMeta(req));
        // Audit: User registered
        void audit_1.auditActions.userRegistered(result.user.id, result.user.email, req.ip, req.headers["user-agent"]);
        res.status(201).json({
            success: true,
            data: result,
        });
    }
    catch (error) {
        if (error instanceof auth_service_1.AuthError) {
            if (error.code === "USER_EXISTS") {
                throw new errors_1.ConflictError("User with this email already exists");
            }
            if (error.code === "PASSWORD_WEAK") {
                throw new errors_1.ValidationError(error.message);
            }
        }
        throw error;
    }
}));
/**
 * POST /api/auth/login
 *
 * Authenticate user with email and password
 *
 * @body {string} email - User email
 * @body {string} password - User password
 *
 * @returns {AuthResponse} User data and JWT token
 *
 * @throws {400} Validation error
 * @throws {401} Invalid credentials or inactive account
 */
exports.authRouter.post("/login", (0, error_handler_1.asyncHandler)(async (req, res) => {
    // Validate input
    const validation = (0, auth_validation_1.validateSchema)(auth_validation_1.loginSchema, req.body);
    if (!validation.success) {
        throw new errors_1.ValidationError("Invalid login data", validation.errors);
    }
    try {
        const result = await auth_service_1.authService.login(validation.data, getSessionMeta(req));
        // Audit: Login success
        void audit_1.auditActions.loginSuccess({
            userId: result.user.id,
            ipAddress: req.ip,
            userAgent: req.headers["user-agent"],
        });
        res.json({
            success: true,
            data: result,
        });
    }
    catch (error) {
        if (error instanceof auth_service_1.AuthError) {
            if (error.code === "INVALID_CREDENTIALS") {
                // Audit: Login failed
                void audit_1.auditActions.loginFailed(validation.data.email, req.ip, req.headers["user-agent"], "Invalid credentials");
                throw new errors_1.UnauthorizedError("Invalid email or password");
            }
            if (error.code === "USER_INACTIVE") {
                // Audit: Login failed - inactive account
                void audit_1.auditActions.loginFailed(validation.data.email, req.ip, req.headers["user-agent"], "Account inactive");
                throw new errors_1.UnauthorizedError("Account is deactivated");
            }
        }
        throw error;
    }
}));
/**
 * POST /api/auth/logout
 *
 * Logout current user (invalidate session)
 *
 * @header {string} Authorization - Bearer token
 *
 * @returns {object} Success message
 *
 * @throws {401} Not authenticated
 */
exports.authRouter.post("/logout", auth_1.requireAuth, (0, error_handler_1.asyncHandler)(async (req, res) => {
    // sessionId is attached by requireAuth middleware
    if (req.sessionId) {
        await auth_service_1.authService.logout(req.sessionId);
    }
    // Audit: Logout
    void audit_1.auditActions.logout({
        userId: req.user?.id,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
    });
    res.json({
        success: true,
        data: { message: "Logged out successfully" },
    });
}));
/**
 * GET /api/auth/me
 *
 * Get current authenticated user
 *
 * @header {string} Authorization - Bearer token
 *
 * @returns {SafeUser} Current user data
 *
 * @throws {401} Not authenticated
 */
exports.authRouter.get("/me", auth_1.requireAuth, (0, error_handler_1.asyncHandler)(async (req, res) => {
    // User is attached by requireAuth middleware
    const user = req.user;
    // Return safe user (without password)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash, ...safeUser } = user;
    res.json({
        success: true,
        data: safeUser,
    });
}));
/**
 * POST /api/auth/switch-context
 *
 * Switch between personal and organization context
 *
 * @header {string} Authorization - Bearer token
 * @body {string} contextType - 'personal' or 'organization'
 * @body {string} [organizationId] - Required if contextType is 'organization'
 *
 * @returns {SwitchContextResponse} New token with updated context
 *
 * @throws {400} Validation error
 * @throws {401} Not authenticated
 * @throws {403} Not a member of the organization
 */
exports.authRouter.post("/switch-context", auth_1.requireAuth, (0, error_handler_1.asyncHandler)(async (req, res) => {
    // Validate input
    const validation = (0, auth_validation_1.validateSchema)(auth_validation_1.switchContextSchema, req.body);
    if (!validation.success) {
        throw new errors_1.ValidationError("Invalid context switch data", validation.errors);
    }
    // These are guaranteed by requireAuth
    const userId = req.user?.id;
    const sessionId = req.sessionId;
    if (!userId || !sessionId) {
        throw new errors_1.UnauthorizedError("Not authenticated");
    }
    try {
        const result = await auth_service_1.authService.switchContext(userId, sessionId, validation.data);
        // Audit: Context switched
        void audit_1.auditActions.contextSwitched?.({
            userId,
            contextType: validation.data.contextType,
            organizationId: validation.data.organizationId,
            ipAddress: req.ip,
            userAgent: req.headers["user-agent"],
        });
        res.json({
            success: true,
            data: result,
        });
    }
    catch (error) {
        if (error instanceof auth_service_1.AuthError) {
            if (error.code === "NOT_MEMBER") {
                throw new errors_1.UnauthorizedError("You are not a member of this organization");
            }
            if (error.code === "USER_NOT_FOUND" || error.code === "USER_INACTIVE") {
                throw new errors_1.UnauthorizedError(error.message);
            }
            if (error.code === "INVALID_REQUEST") {
                throw new errors_1.BadRequestError(error.message);
            }
        }
        throw error;
    }
}));
/**
 * POST /api/auth/forgot-password
 *
 * Request a password reset email
 *
 * @body {string} email - User email
 *
 * @returns {object} Success message (always returns success for security)
 */
exports.authRouter.post("/forgot-password", (0, error_handler_1.asyncHandler)(async (req, res) => {
    // Validate input
    const validation = (0, auth_validation_1.validateSchema)(auth_validation_1.forgotPasswordSchema, req.body);
    if (!validation.success) {
        throw new errors_1.ValidationError("Invalid email", validation.errors);
    }
    // Generate reset token (returns null if user not found, but we don't reveal that)
    const token = await auth_service_1.authService.requestPasswordReset(validation.data.email);
    // Send password reset email if token was generated
    if (token) {
        await (0, email_1.sendPasswordResetEmail)(validation.data.email, token);
        // Audit: Password reset requested
        void audit_1.auditActions.passwordResetRequested(validation.data.email, req.ip, req.headers["user-agent"]);
    }
    // Always return success for security (don't reveal if email exists)
    res.json({
        success: true,
        data: { message: "If an account exists with this email, a password reset link has been sent." },
    });
}));
/**
 * POST /api/auth/reset-password
 *
 * Reset password using token from email
 *
 * @body {string} token - Reset token from email
 * @body {string} password - New password
 *
 * @returns {object} Success message
 *
 * @throws {400} Invalid token, expired, or already used
 * @throws {400} Weak password
 */
exports.authRouter.post("/reset-password", (0, error_handler_1.asyncHandler)(async (req, res) => {
    // Validate input
    const validation = (0, auth_validation_1.validateSchema)(auth_validation_1.resetPasswordSchema, req.body);
    if (!validation.success) {
        throw new errors_1.ValidationError("Invalid reset password data", validation.errors);
    }
    try {
        const userId = await auth_service_1.authService.resetPassword(validation.data.token, validation.data.password);
        // Audit: Password reset completed
        void audit_1.auditActions.passwordResetCompleted(userId, req.ip, req.headers["user-agent"]);
        res.json({
            success: true,
            data: { message: "Password has been reset successfully. Please login with your new password." },
        });
    }
    catch (error) {
        if (error instanceof auth_service_1.AuthError) {
            if (error.code === "TOKEN_INVALID" || error.code === "TOKEN_EXPIRED" || error.code === "TOKEN_USED") {
                throw new errors_1.BadRequestError(error.message);
            }
            if (error.code === "PASSWORD_WEAK") {
                throw new errors_1.ValidationError(error.message);
            }
        }
        throw error;
    }
}));
//# sourceMappingURL=auth.js.map