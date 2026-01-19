/**
 * Sentry Server Configuration
 *
 * Initializes Sentry for server-side error tracking.
 * This runs on the Next.js server (API routes, SSR, etc.)
 *
 * @module sentry.server.config
 */

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Only enable in production or when DSN is configured
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Environment for filtering in Sentry dashboard
  environment: process.env.NODE_ENV,

  // Performance Monitoring
  // Capture 10% of transactions for performance monitoring in production
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

  // Debug mode (logs Sentry activity to console)
  debug: false,

  // Filter out common errors that aren't actionable
  ignoreErrors: [
    // Network errors
    "ECONNREFUSED",
    "ENOTFOUND",
    "ETIMEDOUT",
    // Prisma connection errors during shutdown
    "PrismaClientInitializationError",
  ],
});
