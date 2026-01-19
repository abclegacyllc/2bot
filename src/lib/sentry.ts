/**
 * Sentry Utilities
 *
 * Helper functions for Sentry error tracking:
 * - Set user context
 * - Capture errors with context
 * - Add breadcrumbs
 *
 * @module lib/sentry
 */

import * as Sentry from "@sentry/nextjs";

/**
 * Set the current user context in Sentry.
 * Call this after user login to attach user info to all errors.
 */
export function setSentryUser(user: {
  id: string;
  email?: string;
  name?: string;
  plan?: string;
}) {
  Sentry.setUser({
    id: user.id,
    email: user.email,
    username: user.name,
  });

  // Add plan as a tag for filtering
  if (user.plan) {
    Sentry.setTag("user.plan", user.plan);
  }
}

/**
 * Clear the user context (call on logout).
 */
export function clearSentryUser() {
  Sentry.setUser(null);
}

/**
 * Set the organization context.
 * Call this when user switches to org context.
 */
export function setSentryOrganization(org: {
  id: string;
  name: string;
  plan?: string;
}) {
  Sentry.setTag("organization.id", org.id);
  Sentry.setTag("organization.name", org.name);
  if (org.plan) {
    Sentry.setTag("organization.plan", org.plan);
  }
}

/**
 * Clear organization context.
 */
export function clearSentryOrganization() {
  Sentry.setTag("organization.id", undefined);
  Sentry.setTag("organization.name", undefined);
  Sentry.setTag("organization.plan", undefined);
}

/**
 * Capture an error with additional context.
 */
export function captureError(
  error: Error | unknown,
  context?: {
    tags?: Record<string, string>;
    extra?: Record<string, unknown>;
    level?: Sentry.SeverityLevel;
  }
) {
  Sentry.withScope((scope) => {
    if (context?.tags) {
      Object.entries(context.tags).forEach(([key, value]) => {
        scope.setTag(key, value);
      });
    }

    if (context?.extra) {
      Object.entries(context.extra).forEach(([key, value]) => {
        scope.setExtra(key, value);
      });
    }

    if (context?.level) {
      scope.setLevel(context.level);
    }

    Sentry.captureException(error);
  });
}

/**
 * Add a breadcrumb for debugging.
 * Breadcrumbs help trace the user's path before an error.
 */
export function addBreadcrumb(
  message: string,
  category: string,
  data?: Record<string, unknown>,
  level: Sentry.SeverityLevel = "info"
) {
  Sentry.addBreadcrumb({
    message,
    category,
    data,
    level,
    timestamp: Date.now() / 1000,
  });
}

/**
 * Capture a message (non-error event).
 */
export function captureMessage(
  message: string,
  level: Sentry.SeverityLevel = "info"
) {
  Sentry.captureMessage(message, level);
}

/**
 * Start a transaction for performance monitoring.
 * Returns a function to finish the transaction.
 */
export function startTransaction(
  name: string,
  op: string
): () => void {
  const transaction = Sentry.startInactiveSpan({
    name,
    op,
  });

  return () => {
    transaction?.end();
  };
}
