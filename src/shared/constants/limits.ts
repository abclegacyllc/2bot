// Resource Limits and Rate Limiting Configuration

/**
 * API Rate Limits (requests per window)
 */
export const RATE_LIMITS = {
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
} as const;

/**
 * File Upload Limits
 */
export const UPLOAD_LIMITS = {
  maxFileSize: 10 * 1024 * 1024, // 10MB
  maxFiles: 5,
  allowedTypes: ["image/jpeg", "image/png", "image/gif", "application/pdf"],
} as const;

/**
 * Session/Token Limits
 */
export const SESSION_LIMITS = {
  accessTokenExpiry: "15m",
  refreshTokenExpiry: "7d",
  maxSessions: 5, // Max concurrent sessions per user
} as const;

/**
 * Pagination Defaults
 */
export const PAGINATION = {
  defaultLimit: 20,
  maxLimit: 100,
  defaultPage: 1,
} as const;

/**
 * Webhook Configuration
 */
export const WEBHOOK_LIMITS = {
  maxRetries: 3,
  timeoutMs: 30000, // 30 seconds
  retryDelayMs: [1000, 5000, 30000], // Exponential backoff
} as const;

export type RateLimitType = keyof typeof RATE_LIMITS;
