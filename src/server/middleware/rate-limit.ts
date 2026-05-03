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

import type { NextFunction, Request, Response } from 'express';
import { RateLimiterMemory, RateLimiterRedis, RateLimiterRes } from 'rate-limiter-flexible';

import { loggers } from '@/lib/logger';
import { rateLimitRejectionsTotal } from '@/lib/metrics';
import { redis } from '@/lib/redis';
import { IP_RATE_LIMITS, type RateLimitConfig } from '@/shared/constants/rate-limits';
import { RateLimitError } from '@/shared/errors';

const rateLimitLogger = loggers.server;

// Store rate limiters by endpoint key
const limiters = new Map<string, RateLimiterRedis>();
// In-memory fallback limiters — used while the circuit breaker is open.
// Per-replica only (not shared across cluster), so attackers could still get
// N× the limit on N replicas, but it's far better than failing-open entirely.
const fallbackLimiters = new Map<string, RateLimiterMemory>();

// ===========================================
// Circuit breaker for Redis outages
// ===========================================
//
// State machine:
//   closed  → all good, hit Redis
//   open    → Redis unhealthy, use in-memory fallback. After OPEN_DURATION
//             elapses, transition to half-open.
//   half-open → next request hits Redis; success → closed, failure → open again.
//
// The breaker trips on TRIP_THRESHOLD consecutive Redis errors. Trip clears
// when Redis succeeds. The OPEN_DURATION cap prevents a permanently-open
// breaker if Redis stays down forever — admins should be alerted via logs.
type BreakerState = "closed" | "open" | "half-open";
const BREAKER_TRIP_THRESHOLD = parseInt(process.env.RATE_LIMIT_TRIP_THRESHOLD || "5", 10);
const BREAKER_OPEN_DURATION_MS = parseInt(process.env.RATE_LIMIT_OPEN_MS || "60000", 10); // 60s
const BREAKER_HARD_FAIL_MS = parseInt(process.env.RATE_LIMIT_HARD_FAIL_MS || "300000", 10); // 5min

let breakerState: BreakerState = "closed";
let consecutiveFailures = 0;
let breakerOpenedAt = 0;

function tripBreaker(): void {
  if (breakerState !== "open") {
    breakerOpenedAt = Date.now();
    breakerState = "open";
    rateLimitLogger.error(
      { failures: consecutiveFailures, openMs: BREAKER_OPEN_DURATION_MS },
      "Rate limit Redis circuit breaker OPEN — falling back to in-memory limiters",
    );
  }
}

function recordRedisSuccess(): void {
  if (consecutiveFailures > 0 || breakerState !== "closed") {
    rateLimitLogger.info({ wasState: breakerState }, "Rate limit Redis recovered — breaker CLOSED");
  }
  consecutiveFailures = 0;
  breakerState = "closed";
}

function recordRedisFailure(): void {
  consecutiveFailures++;
  if (consecutiveFailures >= BREAKER_TRIP_THRESHOLD && breakerState === "closed") {
    tripBreaker();
  }
}

/** True if the breaker is open and we should NOT consult Redis right now. */
function shouldUseFallback(): boolean {
  if (breakerState === "closed") return false;
  if (breakerState === "open") {
    if (Date.now() - breakerOpenedAt >= BREAKER_OPEN_DURATION_MS) {
      breakerState = "half-open";
      return false; // try Redis again
    }
    return true;
  }
  // half-open
  return false;
}

/** True if the breaker has been open longer than the hard-fail window. */
function isHardFailing(): boolean {
  return breakerState === "open" && Date.now() - breakerOpenedAt >= BREAKER_HARD_FAIL_MS;
}

function getFallbackLimiter(key: string, config: RateLimitConfig): RateLimiterMemory {
  const existing = fallbackLimiters.get(key);
  if (existing) return existing;
  const limiter = new RateLimiterMemory({
    points: config.points,
    duration: config.duration,
    blockDuration: config.blockDuration,
  });
  fallbackLimiters.set(key, limiter);
  return limiter;
}

/**
 * Get or create a rate limiter for the given config
 */
function getLimiter(key: string, config: RateLimitConfig): RateLimiterRedis {
  const existing = limiters.get(key);
  if (existing) {
    return existing;
  }
  const limiter = new RateLimiterRedis({
    storeClient: redis,
    keyPrefix: `ratelimit:${key}`,
    points: config.points,
    duration: config.duration,
    blockDuration: config.blockDuration,
  });
  limiters.set(key, limiter);
  return limiter;
}

/**
 * Get client IP from request (handles proxies)
 */
function getClientIP(req: Request): string {
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
function setRateLimitHeaders(
  res: Response,
  result: RateLimiterRes,
  config: RateLimitConfig
): void {
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
export function rateLimitMiddleware() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const clientIP = getClientIP(req);
    const endpointKey = `${req.method}:${req.path}`;

    // Get config for this endpoint, or use default
    const defaultConfig = IP_RATE_LIMITS.default;
    if (!defaultConfig) {
      throw new Error('Default rate limit config is missing');
    }
    const config = IP_RATE_LIMITS[endpointKey] ?? defaultConfig;
    const limiterKey = IP_RATE_LIMITS[endpointKey] ? endpointKey : 'default';

    try {
      // Circuit breaker: if Redis is unhealthy, use in-memory fallback.
      // Hard-fail mode: after the breaker has been open longer than
      // BREAKER_HARD_FAIL_MS, return 503 so the client can back off, rather
      // than letting attackers exploit a long Redis outage indefinitely.
      if (shouldUseFallback()) {
        if (isHardFailing()) {
          rateLimitLogger.warn(
            { ip: clientIP, openedAt: breakerOpenedAt },
            "Rate limit hard-fail: Redis unavailable too long — returning 503",
          );
          res.setHeader("Retry-After", 30);
          return next(new RateLimitError(
            "Rate limiter temporarily unavailable. Please retry shortly.",
            30,
          ));
        }
        const fallback = getFallbackLimiter(limiterKey, config);
        const result = await fallback.consume(clientIP);
        setRateLimitHeaders(res, result, config);
        return next();
      }

      const limiter = getLimiter(limiterKey, config);
      const result = await limiter.consume(clientIP);
      recordRedisSuccess();

      setRateLimitHeaders(res, result, config);
      return next();
    } catch (error) {
      if (error instanceof RateLimiterRes) {
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
        rateLimitRejectionsTotal.inc({ route: endpointKey, scope: 'redis' });

        return next(new RateLimitError(
          `Too many requests. Try again in ${retryAfter} seconds.`,
          retryAfter
        ));
      } else {
        // Redis error — record breaker failure, fall back to in-memory limiter
        // for THIS request rather than failing open entirely.
        recordRedisFailure();
        rateLimitLogger.warn(
          { err: error, breakerState, consecutiveFailures },
          "Rate limiter Redis error — using in-memory fallback for this request",
        );
        try {
          const fallback = getFallbackLimiter(limiterKey, config);
          const result = await fallback.consume(clientIP);
          setRateLimitHeaders(res, result, config);
          return next();
        } catch (fallbackErr) {
          if (fallbackErr instanceof RateLimiterRes) {
            const retryAfter = Math.ceil(fallbackErr.msBeforeNext / 1000);
            res.setHeader("Retry-After", retryAfter);
            rateLimitRejectionsTotal.inc({ route: endpointKey, scope: 'fallback' });
            return next(new RateLimitError(
              `Too many requests. Try again in ${retryAfter} seconds.`,
              retryAfter,
            ));
          }
          // Truly unexpected — log and allow (last-resort fail-open)
          rateLimitLogger.error({ err: fallbackErr }, "Rate limit fallback failed");
          return next();
        }
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
export function createRateLimiter(
  config: RateLimitConfig & { keyPrefix: string }
): RateLimiterRedis {
  return new RateLimiterRedis({
    storeClient: redis,
    keyPrefix: config.keyPrefix,
    points: config.points,
    duration: config.duration,
    blockDuration: config.blockDuration,
  });
}
