/**
 * User Routes (Personal Resources)
 *
 * URL-based API pattern for personal resources (GitHub-style)
 * All routes at /api/user/* return the authenticated user's personal resources
 *
 * @module server/routes/user
 */

import { gatewayService } from "@/modules/gateway";
import type { GatewayListItem } from "@/modules/gateway/gateway.types";
import type { OrgWithRole } from "@/modules/organization";
import { organizationService } from "@/modules/organization";
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

export const userRouter = Router();

// All routes require authentication
userRouter.use(requireAuth);

/**
 * Helper to create personal ServiceContext from Express request
 * Always creates a personal context (organizationId = null)
 */
function getPersonalContext(req: Request): ServiceContext {
  if (!req.user) {
    throw new BadRequestError("User not authenticated");
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
      userAgent: req.headers["user-agent"] as string | undefined,
      requestId: req.headers["x-request-id"] as string | undefined,
    }
  );
}

/**
 * GET /api/user/gateways
 *
 * List user's personal gateways (organizationId IS NULL)
 *
 * @returns {GatewayListItem[]} User's personal gateways
 */
userRouter.get(
  "/gateways",
  asyncHandler(async (req: Request, res: Response<ApiResponse<GatewayListItem[]>>) => {
    const ctx = getPersonalContext(req);

    // findByUser with personal context returns personal gateways only
    const gateways = await gatewayService.findByUser(ctx);

    res.json({
      success: true,
      data: gateways,
    });
  })
);

/**
 * GET /api/user/plugins
 *
 * List user's installed plugins (personal workspace)
 *
 * @returns {SafeUserPlugin[]} User's installed plugins
 */
userRouter.get(
  "/plugins",
  asyncHandler(async (req: Request, res: Response<ApiResponse<SafeUserPlugin[]>>) => {
    const ctx = getPersonalContext(req);

    const plugins = await pluginService.getUserPlugins(ctx);

    res.json({
      success: true,
      data: plugins,
    });
  })
);

/**
 * GET /api/user/quota
 *
 * Get user's personal quota status
 *
 * @returns {QuotaStatus} Current quota usage and limits
 */
userRouter.get(
  "/quota",
  asyncHandler(async (req: Request, res: Response<ApiResponse<QuotaStatus>>) => {
    const ctx = getPersonalContext(req);

    const quota = await quotaService.getQuotaStatus(ctx);

    res.json({
      success: true,
      data: quota,
    });
  })
);

/**
 * GET /api/user/organizations
 *
 * List organizations the user is a member of
 * Replaces availableOrgs from JWT token payload
 *
 * @returns {OrgWithRole[]} Organizations with user's role in each
 */
userRouter.get(
  "/organizations",
  asyncHandler(async (req: Request, res: Response<ApiResponse<OrgWithRole[]>>) => {
    const userId = req.user!.id;

    const orgs = await organizationService.getUserOrganizations(userId);

    res.json({
      success: true,
      data: orgs,
    });
  })
);
