/**
 * Usage Routes
 *
 * REST API endpoints for dashboard usage data.
 *
 * Endpoints:
 * - GET  /api/usage - Get comprehensive usage data for dashboard
 *
 * @module server/routes/usage
 */

import { Router, type Request, type Response } from 'express';

import { quotaService, usageTracker, ExecutionTrackerService } from '@/modules/quota';
import { gatewayService } from '@/modules/gateway';
import { BadRequestError } from '@/shared/errors';
import type { ApiResponse } from '@/shared/types';
import { createServiceContext } from '@/shared/types/context';
import { PLAN_LIMITS, type PlanType } from '@/shared/constants/plans';

import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/error-handler';

export const usageRouter = Router();

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

  return createServiceContext(
    {
      userId: req.tokenPayload?.userId ?? req.user.id,
      role: req.tokenPayload?.role ?? req.user.role,
      plan: req.tokenPayload?.plan ?? req.user.plan,
    },
    {
      ipAddress: req.ip,
      userAgent,
      requestId,
    },
    { contextType: 'personal', effectivePlan: req.user.plan }
  );
}

/**
 * GET /api/usage
 * Get comprehensive usage data for the dashboard
 */
usageRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const ctx = getServiceContext(req);
    const userId = ctx.userId;
    const plan = req.user?.plan as PlanType || 'FREE';

    // Get plan limits
    const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.FREE;

    // Get real-time usage data
    const [quotaStatus, realtimeUsage, executionCount] = await Promise.all([
      quotaService.getQuotaStatus(ctx),
      usageTracker.getRealTimeUsage(ctx),
      ExecutionTrackerService.getExecutionCount(ctx),
    ]);

    // Calculate reset date (first of next month)
    const now = new Date();
    const resetsAt = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    // Get gateway count from quota status
    const gatewayCount = quotaStatus.gateways?.used || 0;

    // Build daily history (last 14 days)
    const dailyHistory = await getDailyHistory(userId, 14);

    // Build response
    const usage = {
      executions: {
        current: executionCount.current,
        limit: limits.executionsPerMonth,
        resetsAt: resetsAt.toISOString(),
      },
      gateways: {
        current: gatewayCount,
        limit: limits.gateways === -1 ? null : limits.gateways,
      },
      plugins: {
        current: quotaStatus.plugins?.used || 0,
        limit: limits.plugins === -1 ? null : limits.plugins,
      },
      workflows: {
        current: quotaStatus.workflows?.used || 0,
        limit: limits.workflows === -1 ? null : limits.workflows,
      },
      dailyHistory,
      plan: {
        name: formatPlanName(plan),
        type: plan,
      },
    };

    const response: ApiResponse<typeof usage> = {
      success: true,
      data: usage,
    };

    // Mark realtimeUsage as used to avoid unused variable warning
    void realtimeUsage;

    res.json(response);
  })
);

/**
 * Get daily execution history for a user
 */
async function getDailyHistory(
  userId: string,
  days: number
): Promise<Array<{ date: string; executions: number }>> {
  const history: Array<{ date: string; executions: number }> = [];
  const now = new Date();

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0] || '';

    // Try to get daily count from usage tracker
    const dayCount = await usageTracker.getDailyCount(userId, dateStr);
    
    history.push({
      date: dateStr,
      executions: dayCount,
    });
  }

  return history;
}

/**
 * Format plan name for display
 */
function formatPlanName(plan: string): string {
  const names: Record<string, string> = {
    FREE: 'Free',
    STARTER: 'Starter',
    PRO: 'Pro',
    BUSINESS: 'Business',
    ENTERPRISE: 'Enterprise',
  };
  return names[plan] || plan;
}
