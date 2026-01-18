/**
 * Auth Middleware
 *
 * Middleware for authenticating and authorizing requests.
 *
 * @module server/middleware/auth
 */

import { verifyToken } from "@/lib/jwt";
import { authService } from "@/modules/auth/auth.service";
import type { TokenPayload } from "@/modules/auth/auth.types";
import { UnauthorizedError } from "@/shared/errors";
import type { User } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";

/**
 * Extend Express Request to include user and token payload
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: User;
      sessionId?: string;
      tokenPayload?: TokenPayload;
    }
  }
}

/**
 * Extract Bearer token from Authorization header
 */
function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }
  return authHeader.slice(7);
}

/**
 * Require authentication middleware
 *
 * Use this middleware on routes that require a valid session.
 * Attaches the authenticated user to req.user.
 *
 * @throws {401} If no token provided or token is invalid
 *
 * @example
 * router.get('/profile', requireAuth, (req, res) => {
 *   res.json({ user: req.user });
 * });
 */
export async function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token = extractToken(req);

    if (!token) {
      throw new UnauthorizedError("Authentication required");
    }

    const user = await authService.validateSession(token);

    if (!user) {
      throw new UnauthorizedError("Invalid or expired session");
    }

    // Extract sessionId from token for logout purposes
    const payload = verifyToken(token);

    // Attach user, sessionId, and token payload to request
    req.user = user;
    req.sessionId = payload?.sessionId;
    req.tokenPayload = payload ?? undefined;

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Optional authentication middleware
 *
 * Use this middleware on routes where authentication is optional.
 * If a valid token is provided, attaches the user to req.user.
 * If no token or invalid token, continues without user.
 *
 * @example
 * router.get('/posts', optionalAuth, (req, res) => {
 *   if (req.user) {
 *     // User is logged in
 *   } else {
 *     // Anonymous user
 *   }
 * });
 */
export async function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token = extractToken(req);

    if (token) {
      const user = await authService.validateSession(token);
      if (user) {
        const { verifyToken } = await import("@/lib/jwt");
        const payload = verifyToken(token);
        req.user = user;
        req.sessionId = payload?.sessionId;
      }
    }

    next();
  } catch {
    // Silently continue without user on any error
    next();
  }
}

/**
 * Require specific plan middleware factory
 *
 * Use this middleware to restrict access based on user's plan.
 *
 * @param allowedPlans - Array of allowed plan types
 *
 * @example
 * router.get('/pro-feature', requireAuth, requirePlan(['PRO']), (req, res) => {
 *   // Only PRO users can access
 * });
 */
export function requirePlan(allowedPlans: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new UnauthorizedError("Authentication required"));
    }

    if (!allowedPlans.includes(req.user.plan)) {
      return next(new UnauthorizedError("Upgrade required to access this feature"));
    }

    next();
  };
}
