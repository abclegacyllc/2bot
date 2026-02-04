/**
 * Usage Tracking Middleware
 *
 * Tracks API calls for quota monitoring and usage analytics.
 * Should be placed after auth middleware to have access to user context.
 * 
 * Phase 6.7: Context is determined by URL path, not token.
 * - /api/user/* → personal context
 * - /api/orgs/:orgId/* → organization context
 *
 * @module server/middleware/usage-tracking
 */

import { logger } from '@/lib/logger';
import { usageTracker } from '@/modules/resource';
import type { ServiceContext } from '@/shared/types/context';
import type { NextFunction, Request, Response } from 'express';

const log = logger.child({ module: 'usage-middleware' });

/**
 * Build ServiceContext from Express Request
 * Phase 6.7: Context determined by URL path, not token
 */
function buildServiceContext(req: Request): Partial<ServiceContext> | null {
  if (!req.user || !req.tokenPayload) {
    return null;
  }
  
  // Phase 6.7: Determine context from URL path
  const isOrgRoute = req.path.startsWith('/api/orgs/');
  let contextType: 'personal' | 'organization' = 'personal';
  let organizationId: string | undefined;
  
  if (isOrgRoute) {
    // Extract orgId from path: /api/orgs/:orgId/...
    const pathParts = req.path.split('/');
    organizationId = pathParts[3]; // /api/orgs/[orgId]
    contextType = 'organization';
  }
  
  return {
    userId: req.user.id,
    userPlan: req.user.plan,
    contextType,
    organizationId,
    effectivePlan: req.user.plan, // For org routes, this may need to be fetched from org
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
