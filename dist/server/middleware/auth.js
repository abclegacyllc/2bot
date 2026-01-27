"use strict";
/**
 * Auth Middleware
 *
 * Middleware for authenticating and authorizing requests.
 *
 * Phase 6.7: Simplified authentication
 * - Token only contains user identity (userId, email, plan, role, sessionId)
 * - Context (personal vs org) is determined by URL path, not token
 * - /api/user/* routes → personal resources
 * - /api/orgs/:orgId/* routes → org resources (membership checked by org-auth middleware)
 *
 * @module server/middleware/auth
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
exports.requireAuth = requireAuth;
exports.optionalAuth = optionalAuth;
exports.requirePlan = requirePlan;
const jwt_1 = require("@/lib/jwt");
const auth_service_1 = require("@/modules/auth/auth.service");
const errors_1 = require("@/shared/errors");
/**
 * Extract Bearer token from Authorization header
 */
function extractToken(req) {
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
async function requireAuth(req, _res, next) {
    try {
        const token = extractToken(req);
        if (!token) {
            throw new errors_1.UnauthorizedError("Authentication required");
        }
        const user = await auth_service_1.authService.validateSession(token);
        if (!user) {
            throw new errors_1.UnauthorizedError("Invalid or expired session");
        }
        // Extract sessionId from token for logout purposes
        const payload = (0, jwt_1.verifyToken)(token);
        // Attach user, sessionId, and token payload to request
        req.user = user;
        req.sessionId = payload?.sessionId;
        req.tokenPayload = payload ?? undefined;
        next();
    }
    catch (error) {
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
async function optionalAuth(req, _res, next) {
    try {
        const token = extractToken(req);
        if (token) {
            const user = await auth_service_1.authService.validateSession(token);
            if (user) {
                const { verifyToken } = await Promise.resolve().then(() => __importStar(require("@/lib/jwt")));
                const payload = verifyToken(token);
                req.user = user;
                req.sessionId = payload?.sessionId;
            }
        }
        next();
    }
    catch {
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
function requirePlan(allowedPlans) {
    return (req, _res, next) => {
        if (!req.user) {
            return next(new errors_1.UnauthorizedError("Authentication required"));
        }
        if (!allowedPlans.includes(req.user.plan)) {
            return next(new errors_1.UnauthorizedError("Upgrade required to access this feature"));
        }
        next();
    };
}
//# sourceMappingURL=auth.js.map