"use strict";
/**
 * Rate Limiting Middleware
 *
 * Redis-based sliding window rate limiting for API protection.
 * - Per-IP rate limits (general DoS protection)
 * - Endpoint-specific overrides (auth brute-force protection)
 * - Standard rate limit headers
 * - Fails open on Redis errors (logs but allows request)
 *
 * @module server/middleware/rate-limit
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.rateLimitMiddleware = rateLimitMiddleware;
exports.createRateLimiter = createRateLimiter;
const rate_limiter_flexible_1 = require("rate-limiter-flexible");
const logger_1 = require("@/lib/logger");
const redis_1 = require("@/lib/redis");
const rate_limits_1 = require("@/shared/constants/rate-limits");
const errors_1 = require("@/shared/errors");
const rateLimitLogger = logger_1.loggers.server;
// Store rate limiters by endpoint key
const limiters = new Map();
/**
 * Get or create a rate limiter for the given config
 */
function getLimiter(key, config) {
    if (!limiters.has(key)) {
        limiters.set(key, new rate_limiter_flexible_1.RateLimiterRedis({
            storeClient: redis_1.redis,
            keyPrefix: `ratelimit:${key}`,
            points: config.points,
            duration: config.duration,
            blockDuration: config.blockDuration,
        }));
    }
    return limiters.get(key);
}
/**
 * Get client IP from request (handles proxies)
 */
function getClientIP(req) {
    // Trust X-Forwarded-For if behind proxy (Cloudflare, nginx, etc.)
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
        const ips = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
        return ips?.trim() ?? 'unknown';
    }
    return req.ip || req.socket.remoteAddress || 'unknown';
}
/**
 * Set standard rate limit headers
 */
function setRateLimitHeaders(res, result, config) {
    res.setHeader('X-RateLimit-Limit', config.points);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, result.remainingPoints));
    res.setHeader('X-RateLimit-Reset', Math.ceil(Date.now() / 1000 + result.msBeforeNext / 1000));
}
/**
 * Rate limiting middleware
 * Applies per-IP rate limits based on endpoint configuration
 *
 * @example
 * // Apply to all routes
 * app.use(rateLimitMiddleware());
 *
 * // Or apply to specific routes
 * app.use('/api', rateLimitMiddleware());
 */
function rateLimitMiddleware() {
    return async (req, res, next) => {
        const clientIP = getClientIP(req);
        const endpointKey = `${req.method}:${req.path}`;
        // Get config for this endpoint, or use default
        const config = rate_limits_1.IP_RATE_LIMITS[endpointKey] ?? rate_limits_1.IP_RATE_LIMITS.default;
        const limiterKey = rate_limits_1.IP_RATE_LIMITS[endpointKey] ? endpointKey : 'default';
        try {
            const limiter = getLimiter(limiterKey, config);
            const result = await limiter.consume(clientIP);
            setRateLimitHeaders(res, result, config);
            return next();
        }
        catch (error) {
            if (error instanceof rate_limiter_flexible_1.RateLimiterRes) {
                // Rate limit exceeded
                const retryAfter = Math.ceil(error.msBeforeNext / 1000);
                res.setHeader('Retry-After', retryAfter);
                res.setHeader('X-RateLimit-Limit', config.points);
                res.setHeader('X-RateLimit-Remaining', 0);
                res.setHeader('X-RateLimit-Reset', Math.ceil(Date.now() / 1000 + retryAfter));
                rateLimitLogger.warn({
                    type: 'rate_limit_exceeded',
                    ip: clientIP,
                    endpoint: endpointKey,
                    retryAfter,
                });
                return next(new errors_1.RateLimitError(`Too many requests. Try again in ${retryAfter} seconds.`, retryAfter));
            }
            else {
                // Redis error - fail open (allow request but log)
                rateLimitLogger.error({ err: error }, 'Rate limiter error, failing open');
                return next();
            }
        }
    };
}
/**
 * Create a custom rate limiter for specific use cases
 * (e.g., per-user limiting after auth)
 *
 * @example
 * const userLimiter = createRateLimiter({
 *   keyPrefix: 'user-api',
 *   points: 1000,
 *   duration: 3600,
 * });
 *
 * // In route handler:
 * await userLimiter.consume(userId);
 */
function createRateLimiter(config) {
    return new rate_limiter_flexible_1.RateLimiterRedis({
        storeClient: redis_1.redis,
        keyPrefix: config.keyPrefix,
        points: config.points,
        duration: config.duration,
        blockDuration: config.blockDuration,
    });
}
//# sourceMappingURL=rate-limit.js.map