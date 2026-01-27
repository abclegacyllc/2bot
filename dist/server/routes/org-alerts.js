"use strict";
/**
 * Organization Alerts Routes
 *
 * URL-based routes for organization alert management.
 * Mounted at /api/orgs/:orgId/alerts/*
 *
 * Phase 6.9: New URL-based routes to replace deprecated /api/alerts/*
 *
 * Endpoints:
 * - GET  /api/orgs/:orgId/alerts/config         - Get alert configuration
 * - PUT  /api/orgs/:orgId/alerts/config         - Update alert configuration
 * - GET  /api/orgs/:orgId/alerts/history        - Get alert history
 * - POST /api/orgs/:orgId/alerts/:alertId/acknowledge - Acknowledge an alert
 * - GET  /api/orgs/:orgId/alerts/stats          - Get alert statistics
 *
 * @module server/routes/org-alerts
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.orgAlertsRouter = void 0;
const express_1 = require("express");
const alerts_1 = require("@/modules/alerts");
const errors_1 = require("@/shared/errors");
const context_1 = require("@/shared/types/context");
const error_handler_1 = require("../middleware/error-handler");
const org_auth_1 = require("../middleware/org-auth");
// Use mergeParams to access :orgId from parent router
exports.orgAlertsRouter = (0, express_1.Router)({ mergeParams: true });
/**
 * Helper to extract and validate orgId from params
 */
function getOrgId(req) {
    const orgId = req.params.orgId;
    if (typeof orgId !== "string" || !orgId) {
        throw new errors_1.BadRequestError("Missing organization ID in URL");
    }
    return orgId;
}
/**
 * Helper to create organization ServiceContext from Express request
 */
function getOrgContext(req, orgId) {
    if (!req.user) {
        throw new errors_1.BadRequestError("User not authenticated");
    }
    // Get org membership role (set by requireOrgMember middleware)
    const memberRole = req.orgMembership?.role;
    return (0, context_1.createServiceContext)({
        userId: req.user.id,
        role: req.user.role,
        plan: req.user.plan,
        activeContext: {
            type: "organization",
            organizationId: orgId,
            orgRole: memberRole,
            plan: req.user.plan,
        },
    }, {
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        requestId: req.headers["x-request-id"],
    });
}
// ===========================================
// Alert Configuration
// ===========================================
/**
 * GET /api/orgs/:orgId/alerts/config
 * Get alert configuration for the organization
 */
exports.orgAlertsRouter.get("/config", org_auth_1.requireOrgMember, (0, error_handler_1.asyncHandler)(async (req, res) => {
    const orgId = getOrgId(req);
    const config = await alerts_1.alertService.getAlertConfig(orgId);
    const response = {
        success: true,
        data: config,
    };
    res.json(response);
}));
/**
 * PUT /api/orgs/:orgId/alerts/config
 * Update alert configuration for the organization
 * Requires ORG_ADMIN or ORG_OWNER role
 */
exports.orgAlertsRouter.put("/config", org_auth_1.requireOrgAdmin, (0, error_handler_1.asyncHandler)(async (req, res) => {
    const orgId = getOrgId(req);
    const ctx = getOrgContext(req, orgId);
    const input = req.body;
    const config = await alerts_1.alertService.updateAlertConfig(ctx, orgId, input);
    const response = {
        success: true,
        data: config,
    };
    res.json(response);
}));
// ===========================================
// Alert History
// ===========================================
/**
 * GET /api/orgs/:orgId/alerts/history
 * Get alert history for the organization
 *
 * Query params:
 * - limit: number (default 50)
 * - offset: number (default 0)
 * - type: AlertType
 * - severity: AlertSeverity
 * - acknowledged: boolean
 */
exports.orgAlertsRouter.get("/history", org_auth_1.requireOrgMember, (0, error_handler_1.asyncHandler)(async (req, res) => {
    const orgId = getOrgId(req);
    const { limit, offset, type, severity, acknowledged } = req.query;
    const history = await alerts_1.alertService.getAlertHistory(orgId, {
        limit: limit ? parseInt(limit) : undefined,
        offset: offset ? parseInt(offset) : undefined,
        type: type ? type : undefined,
        severity: severity ? severity : undefined,
        acknowledged: acknowledged === "true"
            ? true
            : acknowledged === "false"
                ? false
                : undefined,
    });
    const response = {
        success: true,
        data: history,
    };
    res.json(response);
}));
// ===========================================
// Alert Acknowledgement
// ===========================================
/**
 * POST /api/orgs/:orgId/alerts/:alertId/acknowledge
 * Acknowledge an alert
 */
exports.orgAlertsRouter.post("/:alertId/acknowledge", org_auth_1.requireOrgMember, (0, error_handler_1.asyncHandler)(async (req, res) => {
    const alertId = req.params.alertId;
    if (!alertId || typeof alertId !== "string") {
        throw new errors_1.BadRequestError("Alert ID required");
    }
    await alerts_1.alertService.acknowledgeAlert(alertId, req.user.id);
    const response = {
        success: true,
        data: { acknowledged: true },
    };
    res.json(response);
}));
// ===========================================
// Alert Statistics
// ===========================================
/**
 * GET /api/orgs/:orgId/alerts/stats
 * Get alert statistics for the organization
 */
exports.orgAlertsRouter.get("/stats", org_auth_1.requireOrgMember, (0, error_handler_1.asyncHandler)(async (req, res) => {
    const orgId = getOrgId(req);
    const stats = await alerts_1.alertService.getAlertStats(orgId);
    const response = {
        success: true,
        data: stats,
    };
    res.json(response);
}));
//# sourceMappingURL=org-alerts.js.map