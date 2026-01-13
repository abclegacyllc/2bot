/**
 * Auth Routes
 *
 * Authentication endpoints: register, login, logout, me
 *
 * @module server/routes/auth
 */

import { sendPasswordResetEmail } from "@/lib/email";
import { AuthError, authService } from "@/modules/auth/auth.service";
import type { AuthResponse, ForgotPasswordRequest, LoginRequest, RegisterRequest, ResetPasswordRequest, SafeUser } from "@/modules/auth/auth.types";
import { forgotPasswordSchema, loginSchema, registerSchema, resetPasswordSchema, validateSchema } from "@/modules/auth/auth.validation";
import { BadRequestError, ConflictError, UnauthorizedError, ValidationError } from "@/shared/errors";
import type { ApiResponse } from "@/shared/types";
import { Router, type Request, type Response } from "express";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../middleware/error-handler";

export const authRouter = Router();

/**
 * Extract session metadata from request
 */
function getSessionMeta(req: Request) {
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
authRouter.post(
  "/register",
  asyncHandler(async (req: Request, res: Response<ApiResponse<AuthResponse>>) => {
    // Validate input
    const validation = validateSchema<RegisterRequest>(registerSchema, req.body);
    if (!validation.success) {
      throw new ValidationError("Invalid registration data", validation.errors);
    }

    try {
      const result = await authService.register(validation.data, getSessionMeta(req));

      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (error) {
      if (error instanceof AuthError) {
        if (error.code === "USER_EXISTS") {
          throw new ConflictError("User with this email already exists");
        }
        if (error.code === "PASSWORD_WEAK") {
          throw new ValidationError(error.message);
        }
      }
      throw error;
    }
  })
);

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
authRouter.post(
  "/login",
  asyncHandler(async (req: Request, res: Response<ApiResponse<AuthResponse>>) => {
    // Validate input
    const validation = validateSchema<LoginRequest>(loginSchema, req.body);
    if (!validation.success) {
      throw new ValidationError("Invalid login data", validation.errors);
    }

    try {
      const result = await authService.login(validation.data, getSessionMeta(req));

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      if (error instanceof AuthError) {
        if (error.code === "INVALID_CREDENTIALS") {
          throw new UnauthorizedError("Invalid email or password");
        }
        if (error.code === "USER_INACTIVE") {
          throw new UnauthorizedError("Account is deactivated");
        }
      }
      throw error;
    }
  })
);

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
authRouter.post(
  "/logout",
  requireAuth,
  asyncHandler(async (req: Request, res: Response<ApiResponse<{ message: string }>>) => {
    // sessionId is attached by requireAuth middleware
    if (req.sessionId) {
      await authService.logout(req.sessionId);
    }

    res.json({
      success: true,
      data: { message: "Logged out successfully" },
    });
  })
);

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
authRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req: Request, res: Response<ApiResponse<SafeUser>>) => {
    // User is attached by requireAuth middleware
    const user = req.user!;

    // Return safe user (without password)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash, ...safeUser } = user;

    res.json({
      success: true,
      data: safeUser,
    });
  })
);

/**
 * POST /api/auth/forgot-password
 *
 * Request a password reset email
 *
 * @body {string} email - User email
 *
 * @returns {object} Success message (always returns success for security)
 */
authRouter.post(
  "/forgot-password",
  asyncHandler(async (req: Request, res: Response<ApiResponse<{ message: string }>>) => {
    // Validate input
    const validation = validateSchema<ForgotPasswordRequest>(forgotPasswordSchema, req.body);
    if (!validation.success) {
      throw new ValidationError("Invalid email", validation.errors);
    }

    // Generate reset token (returns null if user not found, but we don't reveal that)
    const token = await authService.requestPasswordReset(validation.data.email);

    // Send password reset email if token was generated
    if (token) {
      await sendPasswordResetEmail(validation.data.email, token);
    }

    // Always return success for security (don't reveal if email exists)
    res.json({
      success: true,
      data: { message: "If an account exists with this email, a password reset link has been sent." },
    });
  })
);

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
authRouter.post(
  "/reset-password",
  asyncHandler(async (req: Request, res: Response<ApiResponse<{ message: string }>>) => {
    // Validate input
    const validation = validateSchema<ResetPasswordRequest>(resetPasswordSchema, req.body);
    if (!validation.success) {
      throw new ValidationError("Invalid reset password data", validation.errors);
    }

    try {
      await authService.resetPassword(validation.data.token, validation.data.password);

      res.json({
        success: true,
        data: { message: "Password has been reset successfully. Please login with your new password." },
      });
    } catch (error) {
      if (error instanceof AuthError) {
        if (error.code === "TOKEN_INVALID" || error.code === "TOKEN_EXPIRED" || error.code === "TOKEN_USED") {
          throw new BadRequestError(error.message);
        }
        if (error.code === "PASSWORD_WEAK") {
          throw new ValidationError(error.message);
        }
      }
      throw error;
    }
  })
);
