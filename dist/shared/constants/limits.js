"use strict";
// Resource Limits and Rate Limiting Configuration
Object.defineProperty(exports, "__esModule", { value: true });
exports.WEBHOOK_LIMITS = exports.PAGINATION = exports.SESSION_LIMITS = exports.UPLOAD_LIMITS = exports.RATE_LIMITS = void 0;
/**
 * API Rate Limits (requests per window)
 */
exports.RATE_LIMITS = {
    // Per-user limits
    user: {
        requests: 100,
        windowMs: 60 * 1000, // 1 minute
    },
    // Auth endpoints (stricter)
    auth: {
        requests: 10,
        windowMs: 60 * 1000, // 1 minute
    },
    // AI/Gateway endpoints
    gateway: {
        requests: 50,
        windowMs: 60 * 1000, // 1 minute
    },
    // Webhook endpoints
    webhook: {
        requests: 1000,
        windowMs: 60 * 1000, // 1 minute
    },
};
/**
 * File Upload Limits
 */
exports.UPLOAD_LIMITS = {
    maxFileSize: 10 * 1024 * 1024, // 10MB
    maxFiles: 5,
    allowedTypes: ["image/jpeg", "image/png", "image/gif", "application/pdf"],
};
/**
 * Session/Token Limits
 */
exports.SESSION_LIMITS = {
    accessTokenExpiry: "15m",
    refreshTokenExpiry: "7d",
    maxSessions: 5, // Max concurrent sessions per user
};
/**
 * Pagination Defaults
 */
exports.PAGINATION = {
    defaultLimit: 20,
    maxLimit: 100,
    defaultPage: 1,
};
/**
 * Webhook Configuration
 */
exports.WEBHOOK_LIMITS = {
    maxRetries: 3,
    timeoutMs: 30000, // 30 seconds
    retryDelayMs: [1000, 5000, 30000], // Exponential backoff
};
//# sourceMappingURL=limits.js.map