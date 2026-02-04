/**
 * Rate Limit Configurations
 *
 * Phase 0: Per-IP general protection only
 * Phase 1: Auth endpoint overrides (login brute-force)
 * Phase 1+: Per-User limits after auth exists
 *
 * @module shared/constants/rate-limits
 */

export interface RateLimitConfig {
  /** Number of requests allowed in the time window */
  points: number;
  /** Time window in seconds */
  duration: number;
  /** Block duration in seconds after limit exceeded (optional) */
  blockDuration?: number;
}

/**
 * General API rate limits (per IP)
 * Keys are endpoint patterns: METHOD:path
 */
export const IP_RATE_LIMITS: Record<string, RateLimitConfig> = {
  // Default for all endpoints
  default: {
    points: 100,       // 100 requests
    duration: 60,      // per minute
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

  // ==========================================
  // 2Bot AI Endpoints - Cost Protection
  // ==========================================

  // Text generation: 30 requests per minute (expensive API calls)
  'POST:/api/2bot-ai/text-generation': {
    points: 30,
    duration: 60,
    blockDuration: 60,
  },

  // Image generation: 5 requests per minute (very expensive)
  'POST:/api/2bot-ai/image-generation': {
    points: 5,
    duration: 60,
    blockDuration: 120, // 2 minute block - images are costly
  },

  // Speech synthesis: 10 requests per minute
  'POST:/api/2bot-ai/speech-synthesis': {
    points: 10,
    duration: 60,
    blockDuration: 60,
  },

  // Speech recognition: 10 requests per minute
  'POST:/api/2bot-ai/speech-recognition': {
    points: 10,
    duration: 60,
    blockDuration: 60,
  },

  // Text embeddings: 50 requests per minute (cheaper but still costs)
  'POST:/api/2bot-ai/text-embedding': {
    points: 50,
    duration: 60,
    blockDuration: 30,
  },

  // Model discovery: 20 requests per minute (not expensive but still limit)
  'GET:/api/2bot-ai/models': {
    points: 20,
    duration: 60,
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
export function addEndpointRateLimit(endpoint: string, config: RateLimitConfig): void {
  IP_RATE_LIMITS[endpoint] = config;
}

/**
 * Get rate limit config for an endpoint
 * Falls back to default if no specific config exists
 */
export function getRateLimitConfig(method: string, path: string): RateLimitConfig {
  const endpointKey = `${method}:${path}`;
  return IP_RATE_LIMITS[endpointKey] ?? IP_RATE_LIMITS.default!;
}
