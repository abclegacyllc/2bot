/**
 * Organizations Routes (Org Resources)
 *
 * URL-based API pattern for organization resources (GitHub-style)
 * All routes at /api/orgs/:orgId/* return the specified organization's resources.
 * Uses /api/orgs/ (plural) to match GitHub API convention.
 *
 * @module server/routes/orgs
 */

import { gatewayService } from "@/modules/gateway";
import type { GatewayListItem } from "@/modules/gateway/gateway.types";
import {
    departmentService,
    organizationService,
    type MemberWithUser,
    type SafeDepartment,
} from "@/modules/organization";
import { pluginService } from "@/modules/plugin";
import type { SafeUserPlugin } from "@/modules/plugin/plugin.types";
import { quotaService } from "@/modules/quota";
import type { QuotaStatus } from "@/modules/quota/quota.types";
import { BadRequestError } from "@/shared/errors";
import type { ApiResponse } from "@/shared/types";
import { createServiceContext, type ServiceContext } from "@/shared/types/context";
import { Router, type Request, type Response } from "express";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../middleware/error-handler";
import { requireOrgMember } from "../middleware/org-auth";

export const orgsRouter = Router();

// All routes require authentication
orgsRouter.use(requireAuth);

/**
 * Extract and validate path parameter as string
 */
function getPathParam(req: Request, name: string): string {
  const value = req.params[name];
  if (typeof value !== "string" || !value) {
    throw new BadRequestError(`Missing path parameter: ${name}`);
  }
  return value;
}

/**
 * Helper to create organization ServiceContext from Express request
 * Creates context with explicit organizationId from URL param
 */
function getOrgContext(req: Request, orgId: string): ServiceContext {
  if (!req.user) {
    throw new BadRequestError("User not authenticated");
  }

  // Get org membership role if available (set by requireOrgMember middleware)
  const memberRole = req.orgMembership?.role;

  return createServiceContext(
    {
      userId: req.user.id,
      role: req.user.role,
      plan: req.user.plan,
      activeContext: {
        type: 'organization',
        organizationId: orgId,
        orgRole: memberRole,
        // Plan could be fetched from org, but for now use user's plan
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
// Gateway Routes
// ===========================================

/**
 * GET /api/orgs/:orgId/gateways
 *
 * List organization's gateways
 *
 * @param {string} orgId - Organization ID from URL
 * @returns {GatewayListItem[]} Organization's gateways
 */
orgsRouter.get(
  "/:orgId/gateways",
  requireOrgMember,
  asyncHandler(async (req: Request, res: Response<ApiResponse<GatewayListItem[]>>) => {
    const orgId = getPathParam(req, "orgId");
    const ctx = getOrgContext(req, orgId);

    const gateways = await gatewayService.findByUser(ctx);

    res.json({
      success: true,
      data: gateways,
    });
  })
);

// ===========================================
// Plugin Routes
// ===========================================

/**
 * GET /api/orgs/:orgId/plugins
 *
 * List organization's installed plugins
 *
 * @param {string} orgId - Organization ID from URL
 * @returns {SafeUserPlugin[]} Organization's plugins
 */
orgsRouter.get(
  "/:orgId/plugins",
  requireOrgMember,
  asyncHandler(async (req: Request, res: Response<ApiResponse<SafeUserPlugin[]>>) => {
    const orgId = getPathParam(req, "orgId");
    const ctx = getOrgContext(req, orgId);

    const plugins = await pluginService.getUserPlugins(ctx);

    res.json({
      success: true,
      data: plugins,
    });
  })
);

// ===========================================
// Quota Routes
// ===========================================

/**
 * GET /api/orgs/:orgId/quota
 *
 * Get organization's quota status
 *
 * @param {string} orgId - Organization ID from URL
 * @returns {QuotaStatus} Current quota usage and limits
 */
orgsRouter.get(
  "/:orgId/quota",
  requireOrgMember,
  asyncHandler(async (req: Request, res: Response<ApiResponse<QuotaStatus>>) => {
    const orgId = getPathParam(req, "orgId");
    const ctx = getOrgContext(req, orgId);

    const quota = await quotaService.getQuotaStatus(ctx);

    res.json({
      success: true,
      data: quota,
    });
  })
);

// ===========================================
// Department Routes
// ===========================================

/**
 * GET /api/orgs/:orgId/departments
 *
 * List organization's departments
 *
 * @param {string} orgId - Organization ID from URL
 * @returns {SafeDepartment[]} Organization's departments
 */
orgsRouter.get(
  "/:orgId/departments",
  requireOrgMember,
  asyncHandler(async (req: Request, res: Response<ApiResponse<SafeDepartment[]>>) => {
    const orgId = getPathParam(req, "orgId");
    const ctx = getOrgContext(req, orgId);

    const activeOnly = req.query.activeOnly === "true";
    const departments = await departmentService.getOrgDepartments(ctx, orgId, {
      activeOnly,
    });

    res.json({
      success: true,
      data: departments,
    });
  })
);

/**
 * GET /api/orgs/:orgId/departments/:deptId
 *
 * Get department details
 *
 * @param {string} orgId - Organization ID from URL
 * @param {string} deptId - Department ID from URL
 * @returns {SafeDepartment} Department details
 */
orgsRouter.get(
  "/:orgId/departments/:deptId",
  requireOrgMember,
  asyncHandler(async (req: Request, res: Response<ApiResponse<SafeDepartment>>) => {
    const orgId = getPathParam(req, "orgId");
    const deptId = getPathParam(req, "deptId");
    const ctx = getOrgContext(req, orgId);

    const department = await departmentService.getById(ctx, deptId);

    res.json({
      success: true,
      data: department,
    });
  })
);

// ===========================================
// Member Routes
// ===========================================

/**
 * GET /api/orgs/:orgId/members
 *
 * List organization members
 *
 * @param {string} orgId - Organization ID from URL
 * @returns {MemberWithUser[]} Organization members with user info
 */
orgsRouter.get(
  "/:orgId/members",
  requireOrgMember,
  asyncHandler(async (req: Request, res: Response<ApiResponse<MemberWithUser[]>>) => {
    const orgId = getPathParam(req, "orgId");
    const ctx = getOrgContext(req, orgId);

    const members = await organizationService.getMembers(ctx, orgId);

    res.json({
      success: true,
      data: members,
    });
  })
);
