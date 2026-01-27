/**
 * Invites Routes (Public-facing)
 *
 * These routes handle /api/invites/* which are called directly from the frontend
 * and from nginx in production (where /api/* goes to Express).
 *
 * @module server/routes/invites
 */

import { Router, type Request, type Response } from "express";

import { organizationService } from "@/modules/organization";
import { createServiceContext } from "@/shared/types/context";

import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../middleware/error-handler";

export const invitesRouter = Router();

/**
 * Helper to get path parameter safely
 */
function getPathParam(req: Request, param: string): string {
  const value = req.params[param];
  if (!value || typeof value !== "string") {
    throw new Error(`Missing path parameter: ${param}`);
  }
  return value;
}

/**
 * GET /api/invites/:token
 *
 * Get pending invite details by token (public - no auth required)
 * Used to display invite info before user registers/accepts
 *
 * @param {string} token - Invite token
 */
invitesRouter.get(
  "/:token",
  asyncHandler(async (req: Request, res: Response) => {
    const token = getPathParam(req, "token");

    const invite = await organizationService.getInviteByToken(token);

    if (!invite) {
      res.status(404).json({
        success: false,
        error: "Invitation not found or has expired",
      });
      return;
    }

    res.json({
      success: true,
      data: invite,
    });
  })
);

/**
 * POST /api/invites/:token/accept
 *
 * Accept a pending invite after user has registered/logged in
 *
 * @param {string} token - Invite token
 */
invitesRouter.post(
  "/:token/accept",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const token = getPathParam(req, "token");

    if (!req.user) {
      res.status(401).json({
        success: false,
        error: "Authentication required",
      });
      return;
    }

    const ctx = createServiceContext(
      {
        userId: req.user.id,
        role: req.user.role,
        plan: req.user.plan,
      },
      {
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        requestId: req.headers["x-request-id"] as string | undefined,
      },
      { contextType: "personal", effectivePlan: req.user.plan }
    );

    const membership = await organizationService.acceptPendingInvite(ctx, token);

    res.json({
      success: true,
      data: membership,
    });
  })
);

/**
 * POST /api/invites/:token/decline
 *
 * Decline a pending invite (public - no auth required)
 * Allows users to decline without creating an account
 *
 * @param {string} token - Invite token
 * @body {string} [email] - Email for verification (optional)
 */
invitesRouter.post(
  "/:token/decline",
  asyncHandler(async (req: Request, res: Response) => {
    const token = getPathParam(req, "token");
    const email = req.body?.email;

    const result = await organizationService.declinePendingInvite(token, email);

    res.json({
      success: true,
      data: result,
    });
  })
);
