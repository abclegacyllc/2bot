/**
 * Alert Routes
 *
 * REST API endpoints for alert management.
 *
 * Endpoints:
 * - GET  /api/alerts/config         - Get alert configuration
 * - PUT  /api/alerts/config         - Update alert configuration
 * - GET  /api/alerts/history        - Get alert history
 * - POST /api/alerts/:id/acknowledge - Acknowledge an alert
 * - GET  /api/alerts/stats          - Get alert statistics
 *
 * @module server/routes/alerts
 */

import { Router, type Request, type Response } from 'express';

import type { AlertSeverity, AlertType } from '@/modules/alerts';
import { alertService, type AlertConfigInput } from '@/modules/alerts';
import { BadRequestError, ForbiddenError } from '@/shared/errors';
import type { ApiResponse } from '@/shared/types';
import { createServiceContext } from '@/shared/types/context';

import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/error-handler';

export const alertRouter = Router();

/**
 * Helper to create ServiceContext from Express request
 */
function getServiceContext(req: Request) {
  if (!req.user) {
    throw new BadRequestError('User not authenticated');
  }

  const userAgent = Array.isArray(req.headers['user-agent'])
    ? req.headers['user-agent'][0]
    : req.headers['user-agent'];
  const requestId = Array.isArray(req.headers['x-request-id'])
    ? req.headers['x-request-id'][0]
    : req.headers['x-request-id'];

  if (req.tokenPayload) {
    return createServiceContext(
      {
        userId: req.tokenPayload.userId,
        role: req.tokenPayload.role,
        plan: req.tokenPayload.plan,
        activeContext: req.tokenPayload.activeContext,
      },
      {
        ipAddress: req.ip,
        userAgent,
        requestId,
      }
    );
  }

  return createServiceContext(
    {
      userId: req.user.id,
      role: req.user.role,
      plan: req.user.plan,
      activeContext: {
        type: 'personal',
        plan: req.user.plan,
      },
    },
    {
      ipAddress: req.ip,
      userAgent,
      requestId,
    }
  );
}

/**
 * GET /api/alerts/config
 * Get alert configuration for the current organization
 */
alertRouter.get(
  '/config',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const ctx = getServiceContext(req);

    if (!ctx.organizationId) {
      throw new ForbiddenError('Alert config requires organization context');
    }

    const config = await alertService.getAlertConfig(ctx.organizationId);

    const response: ApiResponse<typeof config> = {
      success: true,
      data: config,
    };

    res.json(response);
  })
);

/**
 * PUT /api/alerts/config
 * Update alert configuration for the current organization
 */
alertRouter.put(
  '/config',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const ctx = getServiceContext(req);

    if (!ctx.organizationId) {
      throw new ForbiddenError('Alert config requires organization context');
    }

    // Only owners/admins can update alert config
    if (ctx.orgRole !== 'ORG_OWNER' && ctx.orgRole !== 'ORG_ADMIN') {
      throw new ForbiddenError('Only owners and admins can update alert settings');
    }

    const input: AlertConfigInput = req.body;
    const config = await alertService.updateAlertConfig(ctx, ctx.organizationId, input);

    const response: ApiResponse<typeof config> = {
      success: true,
      data: config,
    };

    res.json(response);
  })
);

/**
 * GET /api/alerts/history
 * Get alert history for the current organization
 */
alertRouter.get(
  '/history',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const ctx = getServiceContext(req);

    if (!ctx.organizationId) {
      throw new ForbiddenError('Alert history requires organization context');
    }

    const { limit, offset, type, severity, acknowledged } = req.query;

    const history = await alertService.getAlertHistory(ctx.organizationId, {
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
      type: type ? (type as AlertType) : undefined,
      severity: severity ? (severity as AlertSeverity) : undefined,
      acknowledged: acknowledged === 'true' ? true : acknowledged === 'false' ? false : undefined,
    });

    const response: ApiResponse<typeof history> = {
      success: true,
      data: history,
    };

    res.json(response);
  })
);

/**
 * POST /api/alerts/:id/acknowledge
 * Acknowledge an alert
 */
alertRouter.post(
  '/:id/acknowledge',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const ctx = getServiceContext(req);
    const alertId = req.params.id;

    if (!alertId || typeof alertId !== 'string') {
      throw new BadRequestError('Alert ID required');
    }

    await alertService.acknowledgeAlert(alertId, ctx.userId);

    const response: ApiResponse<{ acknowledged: boolean }> = {
      success: true,
      data: { acknowledged: true },
    };

    res.json(response);
  })
);

/**
 * GET /api/alerts/stats
 * Get alert statistics for the current organization
 */
alertRouter.get(
  '/stats',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const ctx = getServiceContext(req);

    if (!ctx.organizationId) {
      throw new ForbiddenError('Alert stats requires organization context');
    }

    const stats = await alertService.getAlertStats(ctx.organizationId);

    const response: ApiResponse<typeof stats> = {
      success: true,
      data: stats,
    };

    res.json(response);
  })
);
