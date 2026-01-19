/**
 * Sentry Client Configuration
 *
 * Initializes Sentry for client-side error tracking.
 * This file runs on every page load in the browser.
 *
 * @module sentry.client.config
 */

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Only enable in production or when DSN is configured
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Environment for filtering in Sentry dashboard
  environment: process.env.NODE_ENV,

  // Performance Monitoring
  // Capture 10% of transactions for performance monitoring
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

  // Session Replay
  // This sets the sample rate at 10%. You may want to change it to 100%
  // while in development and then sample at a lower rate in production.
  replaysSessionSampleRate: 0.1,

  // If you're not already sampling the entire session, change the sample rate
  // to 100% when sampling sessions where errors occur.
  replaysOnErrorSampleRate: 1.0,

  // Debug mode for development (logs Sentry activity to console)
  debug: false,

  // Filter out common browser extension errors
  ignoreErrors: [
    // Random plugins/extensions
    "top.GLOBALS",
    // Facebook borance
    "fb_xd_fragment",
    // Ignore ResizeObserver errors (common in browsers)
    "ResizeObserver loop limit exceeded",
    "ResizeObserver loop completed with undelivered notifications",
    // Network errors that aren't actionable
    "Network request failed",
    "Failed to fetch",
    "Load failed",
  ],

  // Don't send errors from these URLs
  denyUrls: [
    // Chrome extensions
    /extensions\//i,
    /^chrome:\/\//i,
    /^chrome-extension:\/\//i,
    // Firefox extensions
    /^moz-extension:\/\//i,
    // Safari extensions
    /^safari-extension:\/\//i,
  ],

  // Integrations
  integrations: [
    Sentry.replayIntegration({
      // Mask all text content by default for privacy
      maskAllText: true,
      // Block all media (images, videos) by default
      blockAllMedia: true,
    }),
  ],
});
