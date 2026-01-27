"use strict";
// Server Middleware Index
Object.defineProperty(exports, "__esModule", { value: true });
exports.trackWriteOperations = exports.trackApiUsage = exports.requireSuperAdmin = exports.requireRole = exports.requirePermission = exports.requireOrgOwner = exports.requireOrgContext = exports.requireOrgAdmin = exports.requireDeveloper = exports.requireAnyPermission = exports.requireAllPermissions = exports.requireAdmin = exports.requestLogger = exports.pinoHttpMiddleware = exports.rateLimitMiddleware = exports.createRateLimiter = exports.requireOrgOwnerUrl = exports.requireOrgMember = exports.requireOrgAdminUrl = exports.notFoundHandler = exports.errorHandler = exports.asyncHandler = exports.getMigrationInfo = exports.deprecated = exports.ENDPOINT_MIGRATIONS = exports.corsOptions = void 0;
// CORS configuration
var cors_1 = require("./cors");
Object.defineProperty(exports, "corsOptions", { enumerable: true, get: function () { return cors_1.corsOptions; } });
// Deprecation middleware for endpoint migration (Phase 6.7)
var deprecation_1 = require("./deprecation");
Object.defineProperty(exports, "ENDPOINT_MIGRATIONS", { enumerable: true, get: function () { return deprecation_1.ENDPOINT_MIGRATIONS; } });
Object.defineProperty(exports, "deprecated", { enumerable: true, get: function () { return deprecation_1.deprecated; } });
Object.defineProperty(exports, "getMigrationInfo", { enumerable: true, get: function () { return deprecation_1.getMigrationInfo; } });
// Error handling
var error_handler_1 = require("./error-handler");
Object.defineProperty(exports, "asyncHandler", { enumerable: true, get: function () { return error_handler_1.asyncHandler; } });
Object.defineProperty(exports, "errorHandler", { enumerable: true, get: function () { return error_handler_1.errorHandler; } });
Object.defineProperty(exports, "notFoundHandler", { enumerable: true, get: function () { return error_handler_1.notFoundHandler; } });
// URL-based org auth (Phase 6.7) - validates membership from URL params
var org_auth_1 = require("./org-auth");
Object.defineProperty(exports, "requireOrgAdminUrl", { enumerable: true, get: function () { return org_auth_1.requireOrgAdmin; } });
Object.defineProperty(exports, "requireOrgMember", { enumerable: true, get: function () { return org_auth_1.requireOrgMember; } });
Object.defineProperty(exports, "requireOrgOwnerUrl", { enumerable: true, get: function () { return org_auth_1.requireOrgOwner; } });
// Rate limiting
var rate_limit_1 = require("./rate-limit");
Object.defineProperty(exports, "createRateLimiter", { enumerable: true, get: function () { return rate_limit_1.createRateLimiter; } });
Object.defineProperty(exports, "rateLimitMiddleware", { enumerable: true, get: function () { return rate_limit_1.rateLimitMiddleware; } });
// Request logging
var request_logger_1 = require("./request-logger");
Object.defineProperty(exports, "pinoHttpMiddleware", { enumerable: true, get: function () { return request_logger_1.pinoHttpMiddleware; } });
Object.defineProperty(exports, "requestLogger", { enumerable: true, get: function () { return request_logger_1.requestLogger; } });
// Legacy context-based role checks (Phase 4) - validates from JWT context
var role_1 = require("./role");
Object.defineProperty(exports, "requireAdmin", { enumerable: true, get: function () { return role_1.requireAdmin; } });
Object.defineProperty(exports, "requireAllPermissions", { enumerable: true, get: function () { return role_1.requireAllPermissions; } });
Object.defineProperty(exports, "requireAnyPermission", { enumerable: true, get: function () { return role_1.requireAnyPermission; } });
Object.defineProperty(exports, "requireDeveloper", { enumerable: true, get: function () { return role_1.requireDeveloper; } });
Object.defineProperty(exports, "requireOrgAdmin", { enumerable: true, get: function () { return role_1.requireOrgAdmin; } });
Object.defineProperty(exports, "requireOrgContext", { enumerable: true, get: function () { return role_1.requireOrgContext; } });
Object.defineProperty(exports, "requireOrgOwner", { enumerable: true, get: function () { return role_1.requireOrgOwner; } });
Object.defineProperty(exports, "requirePermission", { enumerable: true, get: function () { return role_1.requirePermission; } });
Object.defineProperty(exports, "requireRole", { enumerable: true, get: function () { return role_1.requireRole; } });
Object.defineProperty(exports, "requireSuperAdmin", { enumerable: true, get: function () { return role_1.requireSuperAdmin; } });
// Usage tracking
var usage_tracking_1 = require("./usage-tracking");
Object.defineProperty(exports, "trackApiUsage", { enumerable: true, get: function () { return usage_tracking_1.trackApiUsage; } });
Object.defineProperty(exports, "trackWriteOperations", { enumerable: true, get: function () { return usage_tracking_1.trackWriteOperations; } });
//# sourceMappingURL=index.js.map