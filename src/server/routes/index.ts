import { APP_CONFIG } from "@/shared/constants";
import {
    BadRequestError,
    ForbiddenError,
    NotFoundError,
    RateLimitError,
    UnauthorizedError,
    ValidationError,
} from "@/shared/errors";
import type { ApiResponse } from "@/shared/types";
import { Router, type Request, type Response } from "express";
import { adminGuard } from "../middleware/admin-guard";
import { asyncHandler, notFoundHandler } from "../middleware/error-handler";
import { twoBotAIRouter } from "./2bot-ai";
import { adminRouter } from "./admin";
// ai-usage routes removed — dead code (replaced by /credits/* routes)
import { alertRouter } from "./alerts";
import { authRouter } from "./auth";
import { billingRouter } from "./billing";
import { creditsRouter } from "./credits";
import { cursorRouter } from "./cursor";
import { gatewayRouter } from "./gateway";
import { healthRouter } from "./health";
import { invitesRouter } from "./invites";
import { kbRouter } from "./kb";
import { marketplaceRouter } from "./marketplace";
import { organizationRouter } from "./organization";
import { orgsRouter } from "./orgs";
import { pluginRouter } from "./plugin";
import { quotaRouter, resourcesRouter } from "./resources";
import { supportRouter } from "./support";
import { ticketsRouter } from "./tickets";
import { usageRouter } from "./usage";
import { userRouter } from "./user";
import { webhookRouter } from "./webhook";
import { workflowRouter } from "./workflow";
import { workspaceRouter } from "./workspace";

/**
 * Route mode detection:
 * 
 * Production (api.2bot.org / port 3002):
 *   - All user-facing routes
 *   - NO admin routes (admin uses dev-api.2bot.org)
 * 
 * Development (dev-api.2bot.org / port 3006):
 *   - All user-facing routes (same as production)
 *   - Admin routes mounted under /admin prefix
 *   - Used by BOTH dev.2bot.org and admin.2bot.org
 */
const isDevMode = process.env.NODE_ENV !== 'production';

export const router = Router();

// ===========================================
// ALWAYS AVAILABLE ROUTES
// ===========================================

/**
 * Health check routes
 */
router.use("/health", healthRouter);

/**
 * Auth routes (needed for login on all modes)
 */
router.use("/auth", authRouter);

// ===========================================
// USER-FACING ROUTES (always mounted)
// ===========================================

/**
 * User routes (Phase 6.7) - Personal resources
 */
router.use("/user", userRouter);

/**
 * Organization routes (Phase 6.7) - Org resources by ID
 */
router.use("/orgs", orgsRouter);

/**
 * Invites routes (Public)
 */
router.use("/invites", invitesRouter);

/**
 * Organization routes (Phase 4) - Legacy
 */
router.use("/organizations", organizationRouter);

/**
 * Gateway routes (Phase 2)
 */
router.use("/gateways", gatewayRouter);

/**
 * Webhook routes (Phase 2)
 */
router.use("/webhooks", webhookRouter);

/**
 * Plugin routes (Phase 3)
 */
router.use("/plugins", pluginRouter);

/**
 * Marketplace routes (Phase 12)
 */
router.use("/marketplace", marketplaceRouter);

/**
 * Resources routes (Phase B)
 */
router.use("/resources", resourcesRouter);

/**
 * Legacy quota routes
 * @deprecated Use /api/resources instead
 */
router.use("/quota", quotaRouter);

/**
 * Usage routes (Phase 6.8)
 */
router.use("/usage", usageRouter);

/**
 * Alert routes (Phase 4)
 */
router.use("/alerts", alertRouter);

/**
 * Billing routes (Phase 5)
 */
router.use("/billing", billingRouter);

/**
 * 2Bot AI routes
 */
router.use("/2bot-ai", twoBotAIRouter);

/**
 * Credits routes
 */
router.use("/credits", creditsRouter);

/**
 * Cursor routes (AI cursor actions)
 */
router.use("/cursor", cursorRouter);

// NOTE: AI Usage routes removed — all 4 endpoints were dead code
// (replaced by /credits/* routes). File deleted 2026-02-15.

/**
 * Knowledge Base routes (public - no auth required for reading)
 */
router.use("/kb", kbRouter);

/**
 * Ticket routes (user-facing - auth required)
 */
router.use("/tickets", ticketsRouter);

/**
 * Support routes (AI chat + admin management)
 */
router.use("/support", supportRouter);

/**
 * Workflow routes (Phase C)
 */
router.use("/workflows", workflowRouter);

/**
 * Workspace routes (Phase 13)
 */
router.use("/workspace", workspaceRouter);

// ===========================================
// ADMIN ROUTES (dev mode only, under /admin prefix)
// ===========================================

if (isDevMode) {
  /**
   * Admin routes mounted at /admin prefix (dev-api.2bot.org only)
   * Protected by adminGuard: only requests from admin.2bot.org allowed.
   * 
   * Paths: /admin/stats, /admin/users, /admin/organizations,
   *        /admin/gateways, /admin/audit-logs, /admin/credits/*, /admin/ai-usage
   */
  router.use("/admin", adminGuard, adminRouter);
}

/**
 * API info endpoint
 */
router.get("/", (_req: Request, res: Response<ApiResponse<{ name: string; version: string; apiVersion: string; mode: string }>>) => {
  res.json({
    success: true,
    data: {
      name: APP_CONFIG.name,
      version: APP_CONFIG.version,
      apiVersion: APP_CONFIG.apiVersion,
      mode: isDevMode ? 'development' : 'production',
    },
  });
});

/**
 * Error test endpoints (development only)
 */
if (process.env.NODE_ENV !== "production") {
  router.get(
    "/test-error/:type",
    asyncHandler(async (req: Request, _res: Response) => {
      const { type } = req.params;

      switch (type) {
        case "bad-request":
          throw new BadRequestError("This is a bad request test");
        case "unauthorized":
          throw new UnauthorizedError("Authentication required");
        case "forbidden":
          throw new ForbiddenError("You do not have permission");
        case "not-found":
          throw new NotFoundError("Resource not found");
        case "validation":
          throw new ValidationError("Validation failed", {
            email: ["Email is required", "Email must be valid"],
            password: ["Password must be at least 8 characters"],
          });
        case "rate-limit":
          throw new RateLimitError("Too many requests", 60);
        case "internal":
          throw new Error("Unexpected internal error");
        default:
          throw new BadRequestError(`Unknown error type: ${type}`);
      }
    })
  );
}

// Mount module routes here
// router.use("/users", userRoutes);    // Phase 1

// 404 handler for unmatched API routes
router.use(notFoundHandler);
