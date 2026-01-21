// Server Middleware Index

// CORS configuration
export { corsOptions } from "./cors";

// Deprecation middleware for endpoint migration (Phase 6.7)
export { ENDPOINT_MIGRATIONS, deprecated, getMigrationInfo } from "./deprecation";

// Error handling
export { asyncHandler, errorHandler, notFoundHandler } from "./error-handler";

// URL-based org auth (Phase 6.7) - validates membership from URL params
export {
    requireOrgAdmin as requireOrgAdminUrl,
    requireOrgMember,
    requireOrgOwner as requireOrgOwnerUrl
} from "./org-auth";

// Rate limiting
export { createRateLimiter, rateLimitMiddleware } from "./rate-limit";

// Request logging
export { pinoHttpMiddleware, requestLogger } from "./request-logger";

// Legacy context-based role checks (Phase 4) - validates from JWT context
export {
    requireAdmin,
    requireAllPermissions,
    requireAnyPermission,
    requireDeveloper,
    requireOrgAdmin,
    requireOrgContext,
    requireOrgOwner,
    requirePermission,
    requireRole,
    requireSuperAdmin
} from "./role";

// Usage tracking
export { trackApiUsage, trackWriteOperations } from "./usage-tracking";
