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
import { asyncHandler, notFoundHandler } from "../middleware/error-handler";
import { adminRouter } from "./admin";
import { alertRouter } from "./alerts";
import { authRouter } from "./auth";
import { billingRouter } from "./billing";
import { gatewayRouter } from "./gateway";
import { healthRouter } from "./health";
import { invitesRouter } from "./invites";
import { organizationRouter } from "./organization";
import { orgsRouter } from "./orgs";
import { pluginRouter } from "./plugin";
import { quotaRouter } from "./quota";
import { usageRouter } from "./usage";
import { userRouter } from "./user";
import { webhookRouter } from "./webhook";

export const router = Router();

/**
 * Health check routes
 */
router.use("/health", healthRouter);

/**
 * Auth routes
 */
router.use("/auth", authRouter);

/**
 * User routes (Phase 6.7) - Personal resources
 * /api/user/* for authenticated user's personal resources
 * Follows GitHub API pattern where /user/* = personal, /orgs/:id/* = organization
 */
router.use("/user", userRouter);

/**
 * Organization routes (Phase 6.7) - Org resources by ID
 * /api/orgs/:orgId/* for organization-specific resources
 * Uses plural "orgs" to match GitHub API convention
 */
router.use("/orgs", orgsRouter);

/**
 * Invites routes (Public)
 * /api/invites/:token for public invite access
 * Used directly by nginx in production
 */
router.use("/invites", invitesRouter);

/**
 * Organization routes (Phase 4) - Legacy
 * Organizations, members, invites, departments
 * Note: Consider migrating to /api/orgs/:orgId/* pattern
 */
router.use("/organizations", organizationRouter);

/**
 * Gateway routes (Phase 2)
 */
router.use("/gateways", gatewayRouter);

/**
 * Webhook routes (Phase 2)
 * Note: No auth required - webhook auth is via gatewayId + optional secret
 */
router.use("/webhooks", webhookRouter);

/**
 * Plugin routes (Phase 3)
 * /api/plugins - Public catalog
 * /api/plugins/user/* - User plugin management (auth required)
 */
router.use("/plugins", pluginRouter);

/**
 * Quota routes (Phase 4)
 * Resource quota status, limits, and management
 */
router.use("/quota", quotaRouter);

/**
 * Usage routes (Phase 6.8)
 * Dashboard usage data and history
 */
router.use("/usage", usageRouter);

/**
 * Alert routes (Phase 4)
 * Alert configuration, history, and acknowledgements
 */
router.use("/alerts", alertRouter);

/**
 * Billing routes (Phase 5)
 * Checkout, portal, subscription status
 */
router.use("/billing", billingRouter);

/**
 * Admin routes (Phase 6)
 * Platform administration and monitoring
 */
router.use("/admin", adminRouter);

/**
 * API info endpoint
 */
router.get("/", (_req: Request, res: Response<ApiResponse<{ name: string; version: string; apiVersion: string }>>) => {
  res.json({
    success: true,
    data: {
      name: APP_CONFIG.name,
      version: APP_CONFIG.version,
      apiVersion: APP_CONFIG.apiVersion,
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
