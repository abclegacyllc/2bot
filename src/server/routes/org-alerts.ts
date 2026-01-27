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

import { Router, type Request, type Response } from "express";

import type { AlertSeverity, AlertType } from "@/modules/alerts";
import { alertService, type AlertConfigInput } from "@/modules/alerts";
import { BadRequestError } from "@/shared/errors";
import type { ApiResponse } from "@/shared/types";
import { createServiceContext, type ServiceContext } from "@/shared/types/context";

import { asyncHandler } from "../middleware/error-handler";
import { requireOrgAdmin, requireOrgMember } from "../middleware/org-auth";

// Use mergeParams to access :orgId from parent router
export const orgAlertsRouter = Router({ mergeParams: true });

/**
 * Helper to extract and validate orgId from params
 */
function getOrgId(req: Request): string {
  const orgId = req.params.orgId;
  if (typeof orgId !== "string" || !orgId) {
    throw new BadRequestError("Missing organization ID in URL");
  }
  return orgId;
}

/**
 * Helper to create organization ServiceContext from Express request
 */
function getOrgContext(req: Request, orgId: string): ServiceContext {
  if (!req.user) {
    throw new BadRequestError("User not authenticated");
  }

  // Get org membership role (set by requireOrgMember middleware)
  const memberRole = req.orgMembership?.role;

  return createServiceContext(
    {
      userId: req.user.id,
      role: req.user.role,
      plan: req.user.plan,
      activeContext: {
        type: "organization",
        organizationId: orgId,
        orgRole: memberRole,
        plan: req.user.plan,
      },
    },
    {
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"] as string | undefined,
      requestId: req.headers["x-request-id"] as string | undefined,
    }
  );
}

// ===========================================
// Alert Configuration
// ===========================================

/**
 * GET /api/orgs/:orgId/alerts/config
 * Get alert configuration for the organization
 */
orgAlertsRouter.get(
  "/config",
  requireOrgMember,
  asyncHandler(async (req: Request, res: Response) => {
    const orgId = getOrgId(req);

    const config = await alertService.getAlertConfig(orgId);

    const response: ApiResponse<typeof config> = {
      success: true,
      data: config,
    };

    res.json(response);
  })
);

/**
 * PUT /api/orgs/:orgId/alerts/config
 * Update alert configuration for the organization
 * Requires ORG_ADMIN or ORG_OWNER role
 */
orgAlertsRouter.put(
  "/config",
  requireOrgAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    const orgId = getOrgId(req);
    const ctx = getOrgContext(req, orgId);

    const input: AlertConfigInput = req.body;
    const config = await alertService.updateAlertConfig(ctx, orgId, input);

    const response: ApiResponse<typeof config> = {
      success: true,
      data: config,
    };

    res.json(response);
  })
);

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
orgAlertsRouter.get(
  "/history",
  requireOrgMember,
  asyncHandler(async (req: Request, res: Response) => {
    const orgId = getOrgId(req);
    const { limit, offset, type, severity, acknowledged } = req.query;

    const history = await alertService.getAlertHistory(orgId, {
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
      type: type ? (type as AlertType) : undefined,
      severity: severity ? (severity as AlertSeverity) : undefined,
      acknowledged:
        acknowledged === "true"
          ? true
          : acknowledged === "false"
            ? false
            : undefined,
    });

    const response: ApiResponse<typeof history> = {
      success: true,
      data: history,
    };

    res.json(response);
  })
);

// ===========================================
// Alert Acknowledgement
// ===========================================

/**
 * POST /api/orgs/:orgId/alerts/:alertId/acknowledge
 * Acknowledge an alert
 */
orgAlertsRouter.post(
  "/:alertId/acknowledge",
  requireOrgMember,
  asyncHandler(async (req: Request, res: Response) => {
    const alertId = req.params.alertId;

    if (!alertId || typeof alertId !== "string") {
      throw new BadRequestError("Alert ID required");
    }

    await alertService.acknowledgeAlert(alertId, req.user!.id);

    const response: ApiResponse<{ acknowledged: boolean }> = {
      success: true,
      data: { acknowledged: true },
    };

    res.json(response);
  })
);

// ===========================================
// Alert Statistics
// ===========================================

/**
 * GET /api/orgs/:orgId/alerts/stats
 * Get alert statistics for the organization
 */
orgAlertsRouter.get(
  "/stats",
  requireOrgMember,
  asyncHandler(async (req: Request, res: Response) => {
    const orgId = getOrgId(req);

    const stats = await alertService.getAlertStats(orgId);

    const response: ApiResponse<typeof stats> = {
      success: true,
      data: stats,
    };

    res.json(response);
  })
);
