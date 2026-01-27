"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.quotaRouter = void 0;
const express_1 = require("express");
const organization_1 = require("@/modules/organization");
const quota_1 = require("@/modules/quota");
const quota_validation_1 = require("@/modules/quota/quota.validation");
const errors_1 = require("@/shared/errors");
const context_1 = require("@/shared/types/context");
const auth_1 = require("../middleware/auth");
const deprecation_1 = require("../middleware/deprecation");
const error_handler_1 = require("../middleware/error-handler");
exports.quotaRouter = (0, express_1.Router)();
/**
 * Helper to create ServiceContext from Express request
 * Phase 6.7: Token no longer contains activeContext - defaults to personal context
 * This route is deprecated - use /api/user/quota or /api/orgs/:orgId/quota
 */
function getServiceContext(req) {
    if (!req.user) {
        throw new errors_1.BadRequestError('User not authenticated');
    }
    const userAgent = Array.isArray(req.headers['user-agent'])
        ? req.headers['user-agent'][0]
        : req.headers['user-agent'];
    const requestId = Array.isArray(req.headers['x-request-id'])
        ? req.headers['x-request-id'][0]
        : req.headers['x-request-id'];
    // Phase 6.7: Token simplified - context determined by URL, not token
    return (0, context_1.createServiceContext)({
        userId: req.tokenPayload?.userId ?? req.user.id,
        role: req.tokenPayload?.role ?? req.user.role,
        plan: req.tokenPayload?.plan ?? req.user.plan,
    }, {
        ipAddress: req.ip,
        userAgent,
        requestId,
    }, 
    // Default to personal context for legacy routes
    { contextType: 'personal', effectivePlan: req.user.plan });
}
/**
 * Convert Zod errors to ValidationError format
 */
function formatZodErrors(error) {
    const errors = {};
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
function getPathParam(req, name) {
    const value = req.params[name];
    if (typeof value !== 'string' || !value) {
        throw new errors_1.BadRequestError(`Missing path parameter: ${name}`);
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
exports.quotaRouter.get('/status', auth_1.requireAuth, (0, deprecation_1.deprecated)('/api/user/quota or /api/orgs/:orgId/quota', {
    message: 'Use URL-based routes: /api/user/quota for personal, /api/orgs/:orgId/quota for organization',
}), (0, error_handler_1.asyncHandler)(async (req, res) => {
    const ctx = getServiceContext(req);
    const status = await quota_1.quotaService.getQuotaStatus(ctx);
    const response = {
        success: true,
        data: status,
    };
    res.json(response);
}));
/**
 * GET /api/quota/limits
 * Get effective limits for the active context
 *
 * @deprecated Use /api/user/quota or /api/orgs/:orgId/quota for quota info including limits
 */
exports.quotaRouter.get('/limits', auth_1.requireAuth, (0, deprecation_1.deprecated)('/api/user/quota or /api/orgs/:orgId/quota', {
    message: 'Use URL-based quota routes which include limits in the response',
}), (0, error_handler_1.asyncHandler)(async (req, res) => {
    const ctx = getServiceContext(req);
    const limits = await quota_1.quotaService.getEffectiveLimits(ctx);
    const response = {
        success: true,
        data: limits,
    };
    res.json(response);
}));
/**
 * GET /api/quota/history
 * Get usage history for the active context
 */
exports.quotaRouter.get('/history', auth_1.requireAuth, (0, error_handler_1.asyncHandler)(async (req, res) => {
    const ctx = getServiceContext(req);
    const queryResult = quota_validation_1.usageHistoryQuerySchema.safeParse(req.query);
    if (!queryResult.success) {
        throw new errors_1.ValidationError('Invalid query parameters', formatZodErrors(queryResult.error));
    }
    const { periodType, startDate, endDate } = queryResult.data;
    // Default to last 30 days
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate
        ? new Date(startDate)
        : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
    const owner = ctx.contextType === 'organization' && ctx.organizationId
        ? { type: 'organization', organizationId: ctx.organizationId }
        : { type: 'user', userId: ctx.userId };
    const history = await quota_1.quotaService.getUsageHistory(owner, periodType, start, end);
    const response = {
        success: true,
        data: history,
    };
    res.json(response);
}));
/**
 * GET /api/quota/realtime
 * Get real-time usage from Redis for the active context
 */
exports.quotaRouter.get('/realtime', auth_1.requireAuth, (0, error_handler_1.asyncHandler)(async (req, res) => {
    const ctx = getServiceContext(req);
    const usage = await quota_1.usageTracker.getRealTimeUsage(ctx);
    const response = {
        success: true,
        data: usage,
    };
    res.json(response);
}));
// ===========================================
// Organization Quota Endpoints
// ===========================================
/**
 * GET /api/organizations/:id/quotas
 * Get organization quota settings
 */
exports.quotaRouter.get('/organizations/:id/quotas', auth_1.requireAuth, (0, error_handler_1.asyncHandler)(async (req, res) => {
    const ctx = getServiceContext(req);
    const organizationId = getPathParam(req, 'id');
    // Verify user is a member of the organization
    await organization_1.organizationService.requireMembership(ctx.userId, organizationId);
    const quotas = await quota_1.quotaService.getQuotas({
        type: 'organization',
        organizationId,
    });
    const response = {
        success: true,
        data: quotas,
    };
    res.json(response);
}));
/**
 * PUT /api/organizations/:id/quotas
 * Update organization quota settings (Owner only)
 */
exports.quotaRouter.put('/organizations/:id/quotas', auth_1.requireAuth, (0, error_handler_1.asyncHandler)(async (req, res) => {
    const ctx = getServiceContext(req);
    const organizationId = getPathParam(req, 'id');
    // Verify user is owner
    const membership = await organization_1.organizationService.requireMembership(ctx.userId, organizationId, 'ORG_OWNER');
    if (membership.role !== 'ORG_OWNER') {
        throw new errors_1.ForbiddenError('Only owners can modify organization quotas');
    }
    const parseResult = quota_validation_1.setQuotasSchema.safeParse(req.body);
    if (!parseResult.success) {
        throw new errors_1.ValidationError('Invalid quota data', formatZodErrors(parseResult.error));
    }
    await quota_1.quotaService.setOrganizationQuotas(ctx, organizationId, parseResult.data);
    const quotas = await quota_1.quotaService.getQuotas({
        type: 'organization',
        organizationId,
    });
    const response = {
        success: true,
        data: quotas,
    };
    res.json(response);
}));
// ===========================================
// Department Quota Endpoints
// ===========================================
/**
 * GET /api/departments/:id/quotas
 * Get department quota settings
 */
exports.quotaRouter.get('/departments/:id/quotas', auth_1.requireAuth, (0, error_handler_1.asyncHandler)(async (req, res) => {
    const ctx = getServiceContext(req);
    const departmentId = getPathParam(req, 'id');
    // Verify department exists and user has access
    const dept = await organization_1.departmentService.getById(ctx, departmentId);
    if (!dept) {
        throw new errors_1.NotFoundError('Department not found');
    }
    const quotas = await quota_1.quotaService.getQuotas({
        type: 'department',
        departmentId,
    });
    const response = {
        success: true,
        data: quotas,
    };
    res.json(response);
}));
/**
 * PUT /api/departments/:id/quotas
 * Update department quota settings (Owner/Admin only)
 */
exports.quotaRouter.put('/departments/:id/quotas', auth_1.requireAuth, (0, error_handler_1.asyncHandler)(async (req, res) => {
    const ctx = getServiceContext(req);
    const departmentId = getPathParam(req, 'id');
    // Verify department exists
    const dept = await organization_1.departmentService.getById(ctx, departmentId);
    if (!dept) {
        throw new errors_1.NotFoundError('Department not found');
    }
    // Verify user is owner or admin
    const membership = await organization_1.organizationService.requireMembership(ctx.userId, dept.organizationId, 'ORG_ADMIN');
    if (!['ORG_OWNER', 'ORG_ADMIN'].includes(membership.role)) {
        throw new errors_1.ForbiddenError('Only owners and admins can modify department quotas');
    }
    const parseResult = quota_validation_1.setQuotasSchema.safeParse(req.body);
    if (!parseResult.success) {
        throw new errors_1.ValidationError('Invalid quota data', formatZodErrors(parseResult.error));
    }
    await quota_1.quotaService.setDepartmentQuotas(ctx, departmentId, parseResult.data);
    const quotas = await quota_1.quotaService.getQuotas({
        type: 'department',
        departmentId,
    });
    const response = {
        success: true,
        data: quotas,
    };
    res.json(response);
}));
// ===========================================
// Employee Quota Endpoints
// ===========================================
/**
 * GET /api/departments/:id/members/:userId/quotas
 * Get employee quota settings
 */
exports.quotaRouter.get('/departments/:id/members/:userId/quotas', auth_1.requireAuth, (0, error_handler_1.asyncHandler)(async (req, res) => {
    const ctx = getServiceContext(req);
    const departmentId = getPathParam(req, 'id');
    const userId = getPathParam(req, 'userId');
    // Verify department exists and user has access
    const dept = await organization_1.departmentService.getById(ctx, departmentId);
    if (!dept) {
        throw new errors_1.NotFoundError('Department not found');
    }
    // Verify target user is a department member
    const members = await organization_1.departmentService.getMembers(ctx, departmentId);
    const isMember = members.some((m) => m.user.id === userId);
    if (!isMember) {
        throw new errors_1.NotFoundError('User is not a member of this department');
    }
    const quotas = await quota_1.quotaService.getQuotas({
        type: 'user',
        userId,
    });
    const response = {
        success: true,
        data: quotas,
    };
    res.json(response);
}));
/**
 * PUT /api/departments/:id/members/:userId/quotas
 * Update employee quota settings (Manager+ only)
 */
exports.quotaRouter.put('/departments/:id/members/:userId/quotas', auth_1.requireAuth, (0, error_handler_1.asyncHandler)(async (req, res) => {
    const ctx = getServiceContext(req);
    const departmentId = getPathParam(req, 'id');
    const userId = getPathParam(req, 'userId');
    // Verify department exists
    const dept = await organization_1.departmentService.getById(ctx, departmentId);
    if (!dept) {
        throw new errors_1.NotFoundError('Department not found');
    }
    // Verify user is org owner/admin or dept manager
    const membership = await organization_1.organizationService.requireMembership(ctx.userId, dept.organizationId);
    const isOrgLevel = ['ORG_OWNER', 'ORG_ADMIN'].includes(membership.role);
    const isDeptManager = await organization_1.departmentService.isManager(ctx.userId, departmentId);
    if (!isOrgLevel && !isDeptManager) {
        throw new errors_1.ForbiddenError('Only org owners, admins, or department managers can modify employee quotas');
    }
    // Verify target user is a department member
    const members = await organization_1.departmentService.getMembers(ctx, departmentId);
    const isMember = members.some((m) => m.user.id === userId);
    if (!isMember) {
        throw new errors_1.NotFoundError('User is not a member of this department');
    }
    const parseResult = quota_validation_1.setQuotasSchema.safeParse(req.body);
    if (!parseResult.success) {
        throw new errors_1.ValidationError('Invalid quota data', formatZodErrors(parseResult.error));
    }
    // Create a context for the target department
    const deptCtx = {
        ...ctx,
        departmentId,
    };
    await quota_1.quotaService.setEmployeeQuotas(deptCtx, userId, parseResult.data);
    const quotas = await quota_1.quotaService.getQuotas({
        type: 'user',
        userId,
    });
    const response = {
        success: true,
        data: quotas,
    };
    res.json(response);
}));
//# sourceMappingURL=quota.js.map