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
import type { OrgWithRole, PendingInvite } from "@/modules/organization";
import { organizationService } from "@/modules/organization";
import { pluginService } from "@/modules/plugin";
import type { SafeUserPlugin } from "@/modules/plugin/plugin.types";
import {
    installPluginSchema,
    togglePluginSchema,
    updatePluginConfigSchema,
} from "@/modules/plugin/plugin.validation";
import { quotaService } from "@/modules/quota";
import type { QuotaStatus } from "@/modules/quota/quota.types";
import { BadRequestError, ValidationError } from "@/shared/errors";
import type { ApiResponse } from "@/shared/types";
import { createServiceContext, type ServiceContext } from "@/shared/types/context";
import { Router, type Request, type Response } from "express";
import type { ZodError } from "zod";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../middleware/error-handler";

export const userRouter = Router();

// All routes require authentication
userRouter.use(requireAuth);

/**
 * Format Zod validation errors into a simple object
 */
function formatZodErrors(error: ZodError): Record<string, string[]> {
  const errors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const path = issue.path.join(".") || "general";
    if (!errors[path]) {
      errors[path] = [];
    }
    errors[path].push(issue.message);
  }
  return errors;
}

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
 * GET /api/user/plugins/:id
 *
 * Get a specific user plugin by ID
 *
 * @param {string} id - UserPlugin ID
 * @returns {SafeUserPlugin} User plugin details
 */
userRouter.get(
  "/plugins/:id",
  asyncHandler(async (req: Request, res: Response<ApiResponse<SafeUserPlugin>>) => {
    const ctx = getPersonalContext(req);
    const id = req.params.id as string;

    if (!id) {
      throw new BadRequestError("Plugin ID is required");
    }

    const userPlugin = await pluginService.getUserPluginById(ctx, id);

    res.json({
      success: true,
      data: userPlugin,
    });
  })
);

/**
 * POST /api/user/plugins/install
 *
 * Install a plugin for the current user
 *
 * @body {string} slug - Slug of the plugin to install
 * @body {object} [config] - Plugin configuration
 * @body {string} [gatewayId] - Gateway to bind the plugin to
 * @returns {SafeUserPlugin} Installed plugin
 */
userRouter.post(
  "/plugins/install",
  asyncHandler(async (req: Request, res: Response<ApiResponse<SafeUserPlugin>>) => {
    const ctx = getPersonalContext(req);

    const parseResult = installPluginSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError("Invalid install data", formatZodErrors(parseResult.error));
    }

    const userPlugin = await pluginService.installPlugin(ctx, parseResult.data);

    res.status(201).json({
      success: true,
      data: userPlugin,
    });
  })
);

/**
 * DELETE /api/user/plugins/:id
 *
 * Uninstall a plugin
 *
 * @param {string} id - UserPlugin ID
 */
userRouter.delete(
  "/plugins/:id",
  asyncHandler(async (req: Request, res: Response<ApiResponse<null>>) => {
    const ctx = getPersonalContext(req);
    const id = req.params.id as string;

    if (!id) {
      throw new BadRequestError("Plugin ID is required");
    }

    await pluginService.uninstallPlugin(ctx, id);

    res.json({
      success: true,
      data: null,
    });
  })
);

/**
 * PUT /api/user/plugins/:id/config
 *
 * Update plugin configuration
 *
 * @param {string} id - UserPlugin ID
 * @body {object} config - New plugin configuration
 * @returns {SafeUserPlugin} Updated plugin
 */
userRouter.put(
  "/plugins/:id/config",
  asyncHandler(async (req: Request, res: Response<ApiResponse<SafeUserPlugin>>) => {
    const ctx = getPersonalContext(req);
    const id = req.params.id as string;

    if (!id) {
      throw new BadRequestError("Plugin ID is required");
    }

    const parseResult = updatePluginConfigSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError("Invalid config data", formatZodErrors(parseResult.error));
    }

    const userPlugin = await pluginService.updatePluginConfig(ctx, id, parseResult.data);

    res.json({
      success: true,
      data: userPlugin,
    });
  })
);

/**
 * POST /api/user/plugins/:id/toggle
 *
 * Enable or disable a plugin
 *
 * @param {string} id - UserPlugin ID
 * @body {boolean} enabled - Enable or disable the plugin
 * @returns {SafeUserPlugin} Updated plugin
 */
userRouter.post(
  "/plugins/:id/toggle",
  asyncHandler(async (req: Request, res: Response<ApiResponse<SafeUserPlugin>>) => {
    const ctx = getPersonalContext(req);
    const id = req.params.id as string;

    if (!id) {
      throw new BadRequestError("Plugin ID is required");
    }

    const parseResult = togglePluginSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError("Invalid toggle data", formatZodErrors(parseResult.error));
    }

    const userPlugin = await pluginService.togglePlugin(ctx, id, parseResult.data.enabled);

    res.json({
      success: true,
      data: userPlugin,
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
 * GET /api/user/quota/realtime
 *
 * Server-Sent Events (SSE) endpoint for real-time quota updates.
 * Sends initial quota immediately, then updates every 5 seconds.
 *
 * Phase 6.9: New endpoint to replace deprecated /api/quota/realtime
 *
 * Usage:
 * ```javascript
 * const eventSource = new EventSource('/api/user/quota/realtime');
 * eventSource.onmessage = (e) => {
 *   const quota = JSON.parse(e.data);
 *   console.log('Quota update:', quota);
 * };
 * ```
 */
userRouter.get(
  "/quota/realtime",
  asyncHandler(async (req: Request, res: Response) => {
    const ctx = getPersonalContext(req);

    // Set SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // Disable nginx buffering

    // Send initial quota immediately
    try {
      const initialQuota = await quotaService.getQuotaStatus(ctx);
      res.write(`data: ${JSON.stringify(initialQuota)}\n\n`);
    } catch (error) {
      res.write(`data: ${JSON.stringify({ error: "Failed to fetch quota" })}\n\n`);
    }

    // Set up interval for updates (every 5 seconds)
    const interval = setInterval(async () => {
      try {
        const quota = await quotaService.getQuotaStatus(ctx);
        res.write(`data: ${JSON.stringify(quota)}\n\n`);
      } catch {
        // Silently handle errors during streaming
        // Connection may be closed, will be cleaned up below
      }
    }, 5000);

    // Cleanup on client disconnect
    req.on("close", () => {
      clearInterval(interval);
    });

    // Also cleanup if the response ends
    res.on("close", () => {
      clearInterval(interval);
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

// ===========================================
// User Invites (Pending Membership Invites)
// ===========================================

/**
 * GET /api/user/invites
 *
 * List user's pending organization invites (Membership with status INVITED)
 *
 * @returns {PendingInvite[]} Pending invites for the user
 */
userRouter.get(
  "/invites",
  asyncHandler(async (req: Request, res: Response<ApiResponse<PendingInvite[]>>) => {
    const userId = req.user!.id;

    const invites = await organizationService.getUserPendingInvites(userId);

    res.json({
      success: true,
      data: invites,
    });
  })
);

/**
 * POST /api/user/invites/:id/accept
 *
 * Accept a pending membership invite
 *
 * @param {string} id - Membership ID
 */
userRouter.post(
  "/invites/:id/accept",
  asyncHandler(async (req: Request, res: Response<ApiResponse<{ organizationId: string }>>) => {
    const ctx = getPersonalContext(req);
    const membershipId = req.params.id as string;

    if (!membershipId || typeof membershipId !== 'string') {
      throw new BadRequestError("Membership ID is required");
    }

    const result = await organizationService.acceptInvite(ctx, membershipId);

    res.json({
      success: true,
      data: { organizationId: result.organizationId },
    });
  })
);

/**
 * POST /api/user/invites/:id/decline
 *
 * Decline a pending membership invite
 *
 * @param {string} id - Membership ID
 */
userRouter.post(
  "/invites/:id/decline",
  asyncHandler(async (req: Request, res: Response<ApiResponse<null>>) => {
    const ctx = getPersonalContext(req);
    const membershipId = req.params.id as string;

    if (!membershipId || typeof membershipId !== 'string') {
      throw new BadRequestError("Membership ID is required");
    }

    await organizationService.declineInvite(ctx, membershipId);

    res.json({
      success: true,
      data: null,
    });
  })
);
