"use strict";
/**
 * Rate Limit Configurations
 *
 * Phase 0: Per-IP general protection only
 * Phase 1: Auth endpoint overrides (login brute-force)
 * Phase 1+: Per-User limits after auth exists
 *
 * @module shared/constants/rate-limits
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.IP_RATE_LIMITS = void 0;
exports.addEndpointRateLimit = addEndpointRateLimit;
exports.getRateLimitConfig = getRateLimitConfig;
/**
 * General API rate limits (per IP)
 * Keys are endpoint patterns: METHOD:path
 */
exports.IP_RATE_LIMITS = {
    // Default for all endpoints
    default: {
        points: 100, // 100 requests
        duration: 60, // per minute
        blockDuration: 60, // block for 1 minute if exceeded
    },
    // Health endpoints (allow more - for monitoring)
    'GET:/api/health': {
        points: 300,
        duration: 60,
    },
    'GET:/api/health/ready': {
        points: 300,
        duration: 60,
    },
    'GET:/api/health/live': {
        points: 300,
        duration: 60,
    },
    // ==========================================
    // Auth Endpoints - Brute Force Protection
    // ==========================================
    // Login: 5 attempts per minute, block for 5 minutes
    'POST:/api/auth/login': {
        points: 5,
        duration: 60,
        blockDuration: 300,
    },
    // Register: 3 attempts per hour, block for 1 hour
    'POST:/api/auth/register': {
        points: 3,
        duration: 3600,
        blockDuration: 3600,
    },
    // Forgot password: 3 attempts per hour, block for 1 hour
    'POST:/api/auth/forgot-password': {
        points: 3,
        duration: 3600,
        blockDuration: 3600,
    },
    // Reset password: 5 attempts per hour, block for 1 hour
    'POST:/api/auth/reset-password': {
        points: 5,
        duration: 3600,
        blockDuration: 3600,
    },
};
/**
 * Add endpoint-specific rate limits
 * Used by Phase 1+ to add auth endpoint limits
 *
 * @example
 * addEndpointRateLimit('POST:/api/auth/login', {
 *   points: 5,
 *   duration: 60,
 *   blockDuration: 300,
 * });
 */
function addEndpointRateLimit(endpoint, config) {
    exports.IP_RATE_LIMITS[endpoint] = config;
}
/**
 * Get rate limit config for an endpoint
 * Falls back to default if no specific config exists
 */
function getRateLimitConfig(method, path) {
    const endpointKey = `${method}:${path}`;
    return exports.IP_RATE_LIMITS[endpointKey] ?? exports.IP_RATE_LIMITS.default;
}
//# sourceMappingURL=rate-limits.js.map