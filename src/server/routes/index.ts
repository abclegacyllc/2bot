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
import { authRouter } from "./auth";
import { healthRouter } from "./health";

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
// router.use("/gateways", gatewayRoutes); // Phase 2
// router.use("/plugins", pluginRoutes);   // Phase 3

// 404 handler for unmatched API routes
router.use(notFoundHandler);
