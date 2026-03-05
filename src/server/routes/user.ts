/**
 * User Routes (Personal Resources)
 *
 * URL-based API pattern for personal resources (GitHub-style)
 * All routes at /api/user/* return the authenticated user's personal resources.
 *
 * Plugin routes have been moved to /api/plugins/* (see plugin.ts).
 *
 * @module server/routes/user
 */

import { prisma } from "@/lib/prisma";
import { gatewayService } from "@/modules/gateway";
import type { GatewayListItem } from "@/modules/gateway/gateway.types";
import type { OrgWithRole, PendingInvite } from "@/modules/organization";
import { organizationService } from "@/modules/organization";
import { resourceService, type PersonalResourceStatus } from "@/modules/resource";
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

// ===========================================
// Quota
// ===========================================

/**
 * GET /api/user/quota
 *
 * Get user's personal resource status
 *
 * @returns {PersonalResourceStatus} Current resource usage and limits
 */
userRouter.get(
  "/quota",
  asyncHandler(async (req: Request, res: Response<ApiResponse<PersonalResourceStatus>>) => {
    const ctx = getPersonalContext(req);

    const status = await resourceService.getResourceStatus(ctx);

    res.json({
      success: true,
      data: status as PersonalResourceStatus,
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

    // Send initial resource status immediately
    try {
      const initialStatus = await resourceService.getResourceStatus(ctx);
      res.write(`data: ${JSON.stringify(initialStatus)}\n\n`);
    } catch (_error) {
      res.write(`data: ${JSON.stringify({ error: "Failed to fetch resource status" })}\n\n`);
    }

    // Set up interval for updates (every 5 seconds)
    const interval = setInterval(async () => {
      try {
        const status = await resourceService.getResourceStatus(ctx);
        res.write(`data: ${JSON.stringify(status)}\n\n`);
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
    if (!req.user) throw new BadRequestError("Not authenticated");
    const userId = req.user.id;

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
    if (!req.user) throw new BadRequestError("Not authenticated");
    const userId = req.user.id;

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

// ===========================================
// PUT /api/user/preferences
// ===========================================

const VALID_ROUTING_PREFERENCES = ['quality', 'balanced', 'cost'] as const;

/**
 * PUT /api/user/preferences
 *
 * Update user preferences (AI routing preference, etc.)
 *
 * @body {string} [aiRoutingPreference] - quality | balanced | cost
 * @returns Updated preference values
 */
userRouter.put(
  "/preferences",
  asyncHandler(async (req: Request, res: Response<ApiResponse<{ aiRoutingPreference: string }>>) => {
    if (!req.user) throw new BadRequestError("Not authenticated");
    const userId = req.user.id;
    const { aiRoutingPreference } = req.body as { aiRoutingPreference?: string };

    if (aiRoutingPreference !== undefined) {
      if (!VALID_ROUTING_PREFERENCES.includes(aiRoutingPreference as typeof VALID_ROUTING_PREFERENCES[number])) {
        throw new BadRequestError(
          `Invalid aiRoutingPreference: "${aiRoutingPreference}". Must be one of: ${VALID_ROUTING_PREFERENCES.join(', ')}`
        );
      }
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(aiRoutingPreference !== undefined && { aiRoutingPreference }),
      },
      select: {
        aiRoutingPreference: true,
      },
    });

    res.json({
      success: true,
      data: { aiRoutingPreference: updated.aiRoutingPreference },
    });
  })
);
