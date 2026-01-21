/**
 * Quota Routes
 *
 * REST API endpoints for resource quota management.
 *
 * Note: Context-based routes (/api/quota/status) are deprecated.
 * Use URL-based routes: /api/user/quota or /api/orgs/:orgId/quota
 *
 * Endpoints:
 * - GET  /api/quota/status         - Get current quota status (DEPRECATED)
 * - GET  /api/quota/limits         - Get effective limits (DEPRECATED)
 * - GET  /api/quota/history        - Get usage history
 * - PUT  /api/organizations/:id/quotas       - Set org quotas (Owner)
 * - GET  /api/departments/:id/quotas         - Get dept quotas
 * - PUT  /api/departments/:id/quotas         - Set dept quotas (Owner/Admin)
 * - GET  /api/departments/:id/members/:userId/quotas  - Get employee quotas
 * - PUT  /api/departments/:id/members/:userId/quotas  - Set employee quotas (Manager+)
 *
 * @module server/routes/quota
 */

import { Router, type Request, type Response } from 'express';

import { departmentService, organizationService } from '@/modules/organization';
import { quotaService, usageTracker, type PeriodType, type QuotaOwner } from '@/modules/quota';
import { setQuotasSchema, usageHistoryQuerySchema } from '@/modules/quota/quota.validation';
import { BadRequestError, ForbiddenError, NotFoundError, ValidationError } from '@/shared/errors';
import type { ApiResponse } from '@/shared/types';
import { createServiceContext } from '@/shared/types/context';

import { requireAuth } from '../middleware/auth';
import { deprecated } from '../middleware/deprecation';
import { asyncHandler } from '../middleware/error-handler';

export const quotaRouter = Router();

/**
 * Helper to create ServiceContext from Express request
 * Phase 6.7: Token no longer contains activeContext - defaults to personal context
 * This route is deprecated - use /api/user/quota or /api/orgs/:orgId/quota
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

  // Phase 6.7: Token simplified - context determined by URL, not token
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
    // Default to personal context for legacy routes
    { contextType: 'personal', effectivePlan: req.user.plan }
  );
}

/**
 * Convert Zod errors to ValidationError format
 */
function formatZodErrors(
  error: { issues: Array<{ path: readonly (string | number | symbol)[]; message: string }> }
): Record<string, string[]> {
  const errors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const path = issue.path.map((p) => String(p)).join('.') || '_root';
    if (!errors[path]) {
      errors[path] = [];
    }
    errors[path].push(issue.message);
  }
  return errors;
}

/**
 * Extract and validate path parameter as string
 */
function getPathParam(req: Request, name: string): string {
  const value = req.params[name];
  if (typeof value !== 'string' || !value) {
    throw new BadRequestError(`Missing path parameter: ${name}`);
  }
  return value;
}

// ===========================================
// Current User Quota Endpoints
// ===========================================

/**
 * GET /api/quota/status
 * Get current quota status for the active context
 *
 * @deprecated Use /api/user/quota for personal or /api/orgs/:orgId/quota for organization
 */
quotaRouter.get(
  '/status',
  requireAuth,
  deprecated('/api/user/quota or /api/orgs/:orgId/quota', {
    message: 'Use URL-based routes: /api/user/quota for personal, /api/orgs/:orgId/quota for organization',
  }),
  asyncHandler(async (req: Request, res: Response) => {
    const ctx = getServiceContext(req);
    const status = await quotaService.getQuotaStatus(ctx);

    const response: ApiResponse<typeof status> = {
      success: true,
      data: status,
    };

    res.json(response);
  })
);

/**
 * GET /api/quota/limits
 * Get effective limits for the active context
 *
 * @deprecated Use /api/user/quota or /api/orgs/:orgId/quota for quota info including limits
 */
quotaRouter.get(
  '/limits',
  requireAuth,
  deprecated('/api/user/quota or /api/orgs/:orgId/quota', {
    message: 'Use URL-based quota routes which include limits in the response',
  }),
  asyncHandler(async (req: Request, res: Response) => {
    const ctx = getServiceContext(req);
    const limits = await quotaService.getEffectiveLimits(ctx);

    const response: ApiResponse<typeof limits> = {
      success: true,
      data: limits,
    };

    res.json(response);
  })
);

/**
 * GET /api/quota/history
 * Get usage history for the active context
 */
quotaRouter.get(
  '/history',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const ctx = getServiceContext(req);

    const queryResult = usageHistoryQuerySchema.safeParse(req.query);
    if (!queryResult.success) {
      throw new ValidationError(
        'Invalid query parameters',
        formatZodErrors(queryResult.error)
      );
    }

    const { periodType, startDate, endDate } = queryResult.data;

    // Default to last 30 days
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate
      ? new Date(startDate)
      : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

    const owner: QuotaOwner =
      ctx.contextType === 'organization' && ctx.organizationId
        ? { type: 'organization', organizationId: ctx.organizationId }
        : { type: 'user', userId: ctx.userId };

    const history = await quotaService.getUsageHistory(
      owner,
      periodType as PeriodType,
      start,
      end
    );

    const response: ApiResponse<typeof history> = {
      success: true,
      data: history,
    };

    res.json(response);
  })
);

/**
 * GET /api/quota/realtime
 * Get real-time usage from Redis for the active context
 */
quotaRouter.get(
  '/realtime',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const ctx = getServiceContext(req);
    const usage = await usageTracker.getRealTimeUsage(ctx);

    const response: ApiResponse<typeof usage> = {
      success: true,
      data: usage,
    };

    res.json(response);
  })
);

// ===========================================
// Organization Quota Endpoints
// ===========================================

/**
 * GET /api/organizations/:id/quotas
 * Get organization quota settings
 */
quotaRouter.get(
  '/organizations/:id/quotas',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const ctx = getServiceContext(req);
    const organizationId = getPathParam(req, 'id');

    // Verify user is a member of the organization
    await organizationService.requireMembership(ctx.userId, organizationId);

    const quotas = await quotaService.getQuotas({
      type: 'organization',
      organizationId,
    });

    const response: ApiResponse<typeof quotas> = {
      success: true,
      data: quotas,
    };

    res.json(response);
  })
);

/**
 * PUT /api/organizations/:id/quotas
 * Update organization quota settings (Owner only)
 */
quotaRouter.put(
  '/organizations/:id/quotas',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const ctx = getServiceContext(req);
    const organizationId = getPathParam(req, 'id');

    // Verify user is owner
    const membership = await organizationService.requireMembership(
      ctx.userId,
      organizationId,
      'ORG_OWNER'
    );

    if (membership.role !== 'ORG_OWNER') {
      throw new ForbiddenError('Only owners can modify organization quotas');
    }

    const parseResult = setQuotasSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError(
        'Invalid quota data',
        formatZodErrors(parseResult.error)
      );
    }

    await quotaService.setOrganizationQuotas(ctx, organizationId, parseResult.data);

    const quotas = await quotaService.getQuotas({
      type: 'organization',
      organizationId,
    });

    const response: ApiResponse<typeof quotas> = {
      success: true,
      data: quotas,
    };

    res.json(response);
  })
);

// ===========================================
// Department Quota Endpoints
// ===========================================

/**
 * GET /api/departments/:id/quotas
 * Get department quota settings
 */
quotaRouter.get(
  '/departments/:id/quotas',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const ctx = getServiceContext(req);
    const departmentId = getPathParam(req, 'id');

    // Verify department exists and user has access
    const dept = await departmentService.getById(ctx, departmentId);
    if (!dept) {
      throw new NotFoundError('Department not found');
    }

    const quotas = await quotaService.getQuotas({
      type: 'department',
      departmentId,
    });

    const response: ApiResponse<typeof quotas> = {
      success: true,
      data: quotas,
    };

    res.json(response);
  })
);

/**
 * PUT /api/departments/:id/quotas
 * Update department quota settings (Owner/Admin only)
 */
quotaRouter.put(
  '/departments/:id/quotas',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const ctx = getServiceContext(req);
    const departmentId = getPathParam(req, 'id');

    // Verify department exists
    const dept = await departmentService.getById(ctx, departmentId);
    if (!dept) {
      throw new NotFoundError('Department not found');
    }

    // Verify user is owner or admin
    const membership = await organizationService.requireMembership(
      ctx.userId,
      dept.organizationId,
      'ORG_ADMIN'
    );

    if (!['ORG_OWNER', 'ORG_ADMIN'].includes(membership.role)) {
      throw new ForbiddenError('Only owners and admins can modify department quotas');
    }

    const parseResult = setQuotasSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError(
        'Invalid quota data',
        formatZodErrors(parseResult.error)
      );
    }

    await quotaService.setDepartmentQuotas(ctx, departmentId, parseResult.data);

    const quotas = await quotaService.getQuotas({
      type: 'department',
      departmentId,
    });

    const response: ApiResponse<typeof quotas> = {
      success: true,
      data: quotas,
    };

    res.json(response);
  })
);

// ===========================================
// Employee Quota Endpoints
// ===========================================

/**
 * GET /api/departments/:id/members/:userId/quotas
 * Get employee quota settings
 */
quotaRouter.get(
  '/departments/:id/members/:userId/quotas',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const ctx = getServiceContext(req);
    const departmentId = getPathParam(req, 'id');
    const userId = getPathParam(req, 'userId');

    // Verify department exists and user has access
    const dept = await departmentService.getById(ctx, departmentId);
    if (!dept) {
      throw new NotFoundError('Department not found');
    }

    // Verify target user is a department member
    const members = await departmentService.getMembers(ctx, departmentId);
    const isMember = members.some((m) => m.user.id === userId);
    if (!isMember) {
      throw new NotFoundError('User is not a member of this department');
    }

    const quotas = await quotaService.getQuotas({
      type: 'user',
      userId,
    });

    const response: ApiResponse<typeof quotas> = {
      success: true,
      data: quotas,
    };

    res.json(response);
  })
);

/**
 * PUT /api/departments/:id/members/:userId/quotas
 * Update employee quota settings (Manager+ only)
 */
quotaRouter.put(
  '/departments/:id/members/:userId/quotas',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const ctx = getServiceContext(req);
    const departmentId = getPathParam(req, 'id');
    const userId = getPathParam(req, 'userId');

    // Verify department exists
    const dept = await departmentService.getById(ctx, departmentId);
    if (!dept) {
      throw new NotFoundError('Department not found');
    }

    // Verify user is org owner/admin or dept manager
    const membership = await organizationService.requireMembership(
      ctx.userId,
      dept.organizationId
    );

    const isOrgLevel = ['ORG_OWNER', 'ORG_ADMIN'].includes(membership.role);
    const isDeptManager = await departmentService.isManager(ctx.userId, departmentId);

    if (!isOrgLevel && !isDeptManager) {
      throw new ForbiddenError(
        'Only org owners, admins, or department managers can modify employee quotas'
      );
    }

    // Verify target user is a department member
    const members = await departmentService.getMembers(ctx, departmentId);
    const isMember = members.some((m) => m.user.id === userId);
    if (!isMember) {
      throw new NotFoundError('User is not a member of this department');
    }

    const parseResult = setQuotasSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError(
        'Invalid quota data',
        formatZodErrors(parseResult.error)
      );
    }

    // Create a context for the target department
    const deptCtx = {
      ...ctx,
      departmentId,
    };

    await quotaService.setEmployeeQuotas(deptCtx, userId, parseResult.data);

    const quotas = await quotaService.getQuotas({
      type: 'user',
      userId,
    });

    const response: ApiResponse<typeof quotas> = {
      success: true,
      data: quotas,
    };

    res.json(response);
  })
);
