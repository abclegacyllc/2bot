/**
 * Resources Routes
 *
 * REST API endpoints for resource allocation management (3-pool system).
 * Renamed from quota.ts as part of legacy quota cleanup.
 *
 * Primary endpoints use /api/user/quota or /api/orgs/:orgId/quota pattern.
 * This router provides additional resource management endpoints.
 *
 * Endpoints:
 * - GET  /api/resources/status         - Get resource status (hierarchical, supports query params)
 * - GET  /api/resources/limits         - Get effective limits (DEPRECATED)
 * - GET  /api/resources/history        - Get usage history
 * - GET  /api/resources/realtime       - Get real-time usage
 * - PUT  /api/organizations/:id/allocations       - Set org allocations (Owner)
 * - GET  /api/departments/:id/allocations         - Get dept allocations
 * - PUT  /api/departments/:id/allocations         - Set dept allocations (Owner/Admin)
 * - GET  /api/departments/:id/members/:userId/allocations  - Get member allocations
 * - PUT  /api/departments/:id/members/:userId/allocations  - Set member allocations (Manager+)
 *
 * @module server/routes/resources
 */

import { Router, type Request, type Response } from 'express';

import { departmentService, organizationService } from '@/modules/organization';
import {
  allocationService,
  resourceService,
  setQuotasSchema,
  usageHistoryQuerySchema,
  usageTracker,
  type PeriodType
} from '@/modules/resource';
import { BadRequestError, ForbiddenError, NotFoundError, ValidationError } from '@/shared/errors';
import type { ApiResponse } from '@/shared/types';
import { createServiceContext } from '@/shared/types/context';

import { requireAuth } from '../middleware/auth';
import { deprecated } from '../middleware/deprecation';
import { asyncHandler } from '../middleware/error-handler';

export const resourcesRouter = Router();

// Legacy alias for backward compatibility
export const quotaRouter = resourcesRouter;

/**
 * Helper to create ServiceContext from Express request
 * Phase 6.7: Token no longer contains activeContext - defaults to personal context
 * This route is deprecated - use /api/user/quota or /api/orgs/:orgId/quota
 */
function getServiceContext(req: Request, orgId?: string, deptId?: string) {
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
  // If orgId is provided, use organization context
  const contextType = orgId ? 'organization' : 'personal';
  
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
    {
      contextType,
      organizationId: orgId,
      departmentId: deptId,
      effectivePlan: req.user.plan,
    }
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
 * GET /api/resources/status
 * Get resource status using hierarchical types
 * 
 * PRIMARY ENDPOINT for resource status. Returns one of:
 * - PersonalResourceStatus (default, no query params)
 * - OrgResourceStatus (when orgId provided)
 * - OrgDeptResourceStatus (when orgId + deptId provided)
 * - OrgMemberResourceStatus (when orgId + deptId + memberId provided)
 * 
 * Query params:
 *   - orgId: (optional) Organization ID for org context
 *   - deptId: (optional) Department ID for dept context (requires orgId)
 *   - memberId: (optional) User ID for member context (requires orgId + deptId)
 */
resourcesRouter.get(
  '/status',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { orgId, deptId, memberId } = req.query as { 
      orgId?: string; 
      deptId?: string; 
      memberId?: string; 
    };
    
    // Create context with org/dept info for proper usage tracking
    const ctx = getServiceContext(req, orgId, deptId);

    let status;

    if (memberId && deptId && orgId) {
      // Member context
      status = await resourceService.getMemberStatus(ctx, orgId, deptId, memberId);
    } else if (deptId && orgId) {
      // Department context
      status = await resourceService.getDeptStatus(ctx, orgId, deptId);
    } else if (orgId) {
      // Organization context
      status = await resourceService.getOrgStatus(ctx, orgId);
    } else {
      // Personal context (default)
      status = await resourceService.getPersonalStatus(ctx);
    }

    const response: ApiResponse<typeof status> = {
      success: true,
      data: status,
    };

    res.json(response);
  })
);

/**
 * GET /api/resources/limits
 * Get effective limits for the active context
 *
 * @deprecated Use /api/user/quota or /api/orgs/:orgId/quota for quota info including limits
 */
resourcesRouter.get(
  '/limits',
  requireAuth,
  deprecated('/api/user/quota or /api/orgs/:orgId/quota', {
    message: 'Use URL-based quota routes which include limits in the response',
  }),
  asyncHandler(async (req: Request, res: Response) => {
    const ctx = getServiceContext(req);
    // This deprecated endpoint defaults to personal context
    const status = await resourceService.getPersonalStatus(ctx);
    
    // Extract limits from the status for backward compatibility
    const limits = {
      gateways: status.automation.gateways.count.limit,
      plugins: status.automation.plugins.count.limit,
      workflows: status.automation.workflows.count.limit,
      workflowRuns: status.automation.workflows.metrics.runs.limit,
    };

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
resourcesRouter.get(
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

    const history = await usageTracker.getHistory(
      ctx,
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
resourcesRouter.get(
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
resourcesRouter.get(
  '/organizations/:id/quotas',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const ctx = getServiceContext(req);
    const organizationId = getPathParam(req, 'id');

    // Verify user is a member of the organization
    await organizationService.requireMembership(ctx.userId, organizationId);

    // Use resourceService to get org status (includes all quota info)
    const status = await resourceService.getOrgStatus(ctx, organizationId);

    const response: ApiResponse<typeof status> = {
      success: true,
      data: status,
    };

    res.json(response);
  })
);

/**
 * PUT /api/organizations/:id/quotas
 * Update organization quota settings (Owner only)
 */
resourcesRouter.put(
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

    // Note: Org-level quotas come from plan. This is for documentation.
    // In the new architecture, allocations go to departments, not org directly.
    
    // Return the current org status
    const status = await resourceService.getOrgStatus(ctx, organizationId);

    const response: ApiResponse<typeof status> = {
      success: true,
      data: status,
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
resourcesRouter.get(
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

    // Get department allocation
    const allocation = await allocationService.getDeptAllocation(departmentId);

    const response: ApiResponse<typeof allocation> = {
      success: true,
      data: allocation,
    };

    res.json(response);
  })
);

/**
 * PUT /api/departments/:id/quotas
 * Update department quota settings (Owner/Admin only)
 */
resourcesRouter.put(
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

    // Map all 3-pool allocation fields
    const allocationInput = {
      // Automation Pool
      maxGateways: parseResult.data.maxGateways,
      maxPlugins: parseResult.data.maxPlugins,
      maxWorkflows: parseResult.data.maxWorkflows,
      // Workspace Pool
      ramMb: parseResult.data.ramMb,
      cpuCores: parseResult.data.cpuCores,
      storageMb: parseResult.data.storageMb,
      // Budget Pool
      creditBudget: parseResult.data.creditBudget,
    };

    await allocationService.setDeptAllocation(ctx, departmentId, allocationInput);

    const allocation = await allocationService.getDeptAllocation(departmentId);

    const response: ApiResponse<typeof allocation> = {
      success: true,
      data: allocation,
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
resourcesRouter.get(
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

    // Get member allocation
    const allocation = await allocationService.getMemberAllocation(userId, departmentId);

    const response: ApiResponse<typeof allocation> = {
      success: true,
      data: allocation,
    };

    res.json(response);
  })
);

/**
 * PUT /api/departments/:id/members/:userId/quotas
 * Update employee quota settings (Manager+ only)
 */
resourcesRouter.put(
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

    // Map all 3-pool allocation fields for member
    // Note: maxPlugins is not typically allocated per-member
    const allocationInput = {
      // Automation Pool
      maxGateways: parseResult.data.maxGateways,
      maxWorkflows: parseResult.data.maxWorkflows,
      // Workspace Pool
      ramMb: parseResult.data.ramMb,
      cpuCores: parseResult.data.cpuCores,
      storageMb: parseResult.data.storageMb,
      // Budget Pool
      creditBudget: parseResult.data.creditBudget,
    };

    // Note: param order is (userId, deptId) in new service
    await allocationService.setMemberAllocation(ctx, userId, departmentId, allocationInput);

    const allocation = await allocationService.getMemberAllocation(userId, departmentId);

    const response: ApiResponse<typeof allocation> = {
      success: true,
      data: allocation,
    };

    res.json(response);
  })
);
