/**
 * Usage Tracking Middleware
 *
 * Tracks API calls for quota monitoring and usage analytics.
 * Should be placed after auth middleware to have access to user context.
 *
 * @module server/middleware/usage-tracking
 */

import { logger } from '@/lib/logger';
import { usageTracker } from '@/modules/quota';
import type { ServiceContext } from '@/shared/types/context';
import type { NextFunction, Request, Response } from 'express';

const log = logger.child({ module: 'usage-middleware' });

/**
 * Build ServiceContext from Express Request
 */
function buildServiceContext(req: Request): Partial<ServiceContext> | null {
  if (!req.user || !req.tokenPayload) {
    return null;
  }
  
  const { tokenPayload } = req;
  const activeContext = tokenPayload.activeContext;
  
  return {
    userId: req.user.id,
    userPlan: req.user.plan,
    contextType: activeContext?.type ?? 'personal',
    organizationId: activeContext?.organizationId,
    orgRole: activeContext?.orgRole,
    effectivePlan: activeContext?.plan ?? req.user.plan,
  };
}

/**
 * Track API calls middleware
 *
 * Tracks each authenticated API request for quota monitoring.
 * Only tracks requests that pass authentication.
 *
 * @example
 * // Apply after auth middleware
 * router.use(requireAuth, trackApiUsage);
 */
export function trackApiUsage(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const ctx = buildServiceContext(req);
  
  if (!ctx || !ctx.userId) {
    // No user context, skip tracking
    return next();
  }
  
  // Create minimal context for tracking
  const trackingCtx = {
    userId: ctx.userId,
    contextType: ctx.contextType ?? 'personal',
    organizationId: ctx.organizationId,
  } as ServiceContext;
  
  // Track the API call asynchronously (don't block the request)
  usageTracker.trackApiCall(trackingCtx).catch((err) => {
    log.error({ err, userId: ctx.userId, path: req.path }, 'Failed to track API call');
  });
  
  // Track errors on response finish
  res.on('finish', () => {
    if (res.statusCode >= 500) {
      usageTracker.trackError(trackingCtx, `HTTP_${res.statusCode}`).catch((err) => {
        log.error({ err, userId: ctx.userId }, 'Failed to track error');
      });
    }
  });
  
  next();
}

/**
 * Selective usage tracking middleware
 *
 * Only tracks API calls for certain methods (write operations)
 * to reduce tracking overhead.
 */
export function trackWriteOperations(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Only track write operations
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    return next();
  }
  
  return trackApiUsage(req, res, next);
}
