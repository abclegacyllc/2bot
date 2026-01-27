"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.alertRouter = void 0;
const express_1 = require("express");
const alerts_1 = require("@/modules/alerts");
const errors_1 = require("@/shared/errors");
const context_1 = require("@/shared/types/context");
const auth_1 = require("../middleware/auth");
const error_handler_1 = require("../middleware/error-handler");
exports.alertRouter = (0, express_1.Router)();
/**
 * Helper to create ServiceContext from Express request
 * Phase 6.7: Token no longer contains activeContext - defaults to personal context
 * This route is deprecated - use /api/user/alerts or /api/orgs/:orgId/alerts
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
 * GET /api/alerts/config
 * Get alert configuration for the current organization
 */
exports.alertRouter.get('/config', auth_1.requireAuth, (0, error_handler_1.asyncHandler)(async (req, res) => {
    const ctx = getServiceContext(req);
    if (!ctx.organizationId) {
        throw new errors_1.ForbiddenError('Alert config requires organization context');
    }
    const config = await alerts_1.alertService.getAlertConfig(ctx.organizationId);
    const response = {
        success: true,
        data: config,
    };
    res.json(response);
}));
/**
 * PUT /api/alerts/config
 * Update alert configuration for the current organization
 */
exports.alertRouter.put('/config', auth_1.requireAuth, (0, error_handler_1.asyncHandler)(async (req, res) => {
    const ctx = getServiceContext(req);
    if (!ctx.organizationId) {
        throw new errors_1.ForbiddenError('Alert config requires organization context');
    }
    // Only owners/admins can update alert config
    if (ctx.orgRole !== 'ORG_OWNER' && ctx.orgRole !== 'ORG_ADMIN') {
        throw new errors_1.ForbiddenError('Only owners and admins can update alert settings');
    }
    const input = req.body;
    const config = await alerts_1.alertService.updateAlertConfig(ctx, ctx.organizationId, input);
    const response = {
        success: true,
        data: config,
    };
    res.json(response);
}));
/**
 * GET /api/alerts/history
 * Get alert history for the current organization
 */
exports.alertRouter.get('/history', auth_1.requireAuth, (0, error_handler_1.asyncHandler)(async (req, res) => {
    const ctx = getServiceContext(req);
    if (!ctx.organizationId) {
        throw new errors_1.ForbiddenError('Alert history requires organization context');
    }
    const { limit, offset, type, severity, acknowledged } = req.query;
    const history = await alerts_1.alertService.getAlertHistory(ctx.organizationId, {
        limit: limit ? parseInt(limit) : undefined,
        offset: offset ? parseInt(offset) : undefined,
        type: type ? type : undefined,
        severity: severity ? severity : undefined,
        acknowledged: acknowledged === 'true' ? true : acknowledged === 'false' ? false : undefined,
    });
    const response = {
        success: true,
        data: history,
    };
    res.json(response);
}));
/**
 * POST /api/alerts/:id/acknowledge
 * Acknowledge an alert
 */
exports.alertRouter.post('/:id/acknowledge', auth_1.requireAuth, (0, error_handler_1.asyncHandler)(async (req, res) => {
    const ctx = getServiceContext(req);
    const alertId = req.params.id;
    if (!alertId || typeof alertId !== 'string') {
        throw new errors_1.BadRequestError('Alert ID required');
    }
    await alerts_1.alertService.acknowledgeAlert(alertId, ctx.userId);
    const response = {
        success: true,
        data: { acknowledged: true },
    };
    res.json(response);
}));
/**
 * GET /api/alerts/stats
 * Get alert statistics for the current organization
 */
exports.alertRouter.get('/stats', auth_1.requireAuth, (0, error_handler_1.asyncHandler)(async (req, res) => {
    const ctx = getServiceContext(req);
    if (!ctx.organizationId) {
        throw new errors_1.ForbiddenError('Alert stats requires organization context');
    }
    const stats = await alerts_1.alertService.getAlertStats(ctx.organizationId);
    const response = {
        success: true,
        data: stats,
    };
    res.json(response);
}));
//# sourceMappingURL=alerts.js.map