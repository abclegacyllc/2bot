/**
 * Gateway Routes
 *
 * REST API endpoints for gateway management (CRUD operations)
 *
 * Note: The context-based GET /api/gateways endpoint is deprecated.
 * Use /api/user/gateways for personal gateways or
 * /api/orgs/:orgId/gateways for organization gateways.
 *
 * @module server/routes/gateway
 */

import { gatewayRegistry, gatewayService } from "@/modules/gateway";
import type { GatewayListItem, SafeGateway } from "@/modules/gateway/gateway.types";
import {
    createGatewaySchema,
    updateGatewaySchema,
} from "@/modules/gateway/gateway.validation";
import { BadRequestError, NotFoundError, ValidationError } from "@/shared/errors";
import type { ApiResponse, PaginatedResponse } from "@/shared/types";
import { createServiceContext } from "@/shared/types/context";
import type { GatewayStatus } from "@prisma/client";
import { Router, type Request, type Response } from "express";
import { requireAuth } from "../middleware/auth";
import { deprecated } from "../middleware/deprecation";
import { asyncHandler } from "../middleware/error-handler";

export const gatewayRouter = Router();

/**
 * Helper to create ServiceContext from Express request
 * Phase 6.7: Context is now determined by URL, not token
 * This route is deprecated - use /api/user/gateways or /api/orgs/:orgId/gateways
 */
function getServiceContext(req: Request) {
  if (!req.user) {
    throw new BadRequestError("User not authenticated");
  }

  // Phase 6.7: Token no longer contains activeContext
  // For legacy routes, default to personal context
  return createServiceContext(
    {
      userId: req.tokenPayload?.userId ?? req.user.id,
      role: req.tokenPayload?.role ?? req.user.role,
      plan: req.tokenPayload?.plan ?? req.user.plan,
    },
    {
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      requestId: req.headers["x-request-id"] as string | undefined,
    },
    // Default to personal context for legacy routes
    { contextType: 'personal', effectivePlan: req.user.plan }
  );
}

/**
 * Convert Zod errors to ValidationError format
 */
function formatZodErrors(error: { issues: Array<{ path: readonly (string | number | symbol)[]; message: string }> }): Record<string, string[]> {
  const errors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const path = issue.path.map(p => String(p)).join(".") || "_root";
    if (!errors[path]) {
      errors[path] = [];
    }
    errors[path].push(issue.message);
  }
  return errors;
}

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
 * GET /api/gateways
 *
 * List all gateways for the current user/organization
 *
 * @deprecated Use /api/user/gateways for personal or /api/orgs/:orgId/gateways for organization
 *
 * @query {string} [type] - Filter by gateway type (TELEGRAM_BOT, AI, WEBHOOK)
 * @query {string} [status] - Filter by status (CONNECTED, DISCONNECTED, ERROR)
 * @query {number} [page] - Page number (default 1)
 * @query {number} [limit] - Max results (default 50)
 *
 * @returns {GatewayListItem[]} List of gateways (without credentials)
 */
gatewayRouter.get(
  "/",
  requireAuth,
  deprecated("/api/user/gateways or /api/orgs/:orgId/gateways", {
    message: "Use URL-based routes: /api/user/gateways for personal, /api/orgs/:orgId/gateways for organization",
  }),
  asyncHandler(async (req: Request, res: Response<PaginatedResponse<GatewayListItem>>) => {
    const ctx = getServiceContext(req);

    // Parse query params
    const type = req.query.type as string | undefined;
    const status = req.query.status as string | undefined;
    const page = Math.max(parseInt(req.query.page as string) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

    // Get gateways for user/org context
    const gateways = await gatewayService.findByUser(ctx);

    // Apply filters
    let filtered = gateways;
    if (type) {
      filtered = filtered.filter((g) => g.type === type);
    }
    if (status) {
      filtered = filtered.filter((g) => g.status === status);
    }

    // Apply pagination
    const total = filtered.length;
    const totalPages = Math.ceil(total / limit);
    const offset = (page - 1) * limit;
    const items = filtered.slice(offset, offset + limit);

    res.json({
      success: true,
      data: items,
      meta: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    });
  })
);

/**
 * POST /api/gateways
 *
 * Create a new gateway
 *
 * @body {string} name - Gateway name
 * @body {GatewayType} type - Gateway type (TELEGRAM_BOT, AI, WEBHOOK)
 * @body {object} credentials - Type-specific credentials
 * @body {object} [config] - Optional type-specific config
 *
 * @returns {SafeGateway} Created gateway (credentials masked)
 *
 * @throws {400} Validation error
 */
gatewayRouter.post(
  "/",
  requireAuth,
  asyncHandler(async (req: Request, res: Response<ApiResponse<SafeGateway>>) => {
    const ctx = getServiceContext(req);

    // Validate input
    const parseResult = createGatewaySchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError("Invalid gateway data", formatZodErrors(parseResult.error));
    }

    const gateway = await gatewayService.create(ctx, parseResult.data);

    res.status(201).json({
      success: true,
      data: gateway,
    });
  })
);

/**
 * GET /api/gateways/:id
 *
 * Get a specific gateway by ID
 *
 * @param {string} id - Gateway ID
 *
 * @returns {SafeGateway} Gateway details (credentials masked)
 *
 * @throws {404} Gateway not found
 * @throws {403} Access denied
 */
gatewayRouter.get(
  "/:id",
  requireAuth,
  asyncHandler(async (req: Request, res: Response<ApiResponse<SafeGateway>>) => {
    const ctx = getServiceContext(req);
    const id = getPathParam(req, "id");

    const gateway = await gatewayService.findByIdSafe(ctx, id);

    res.json({
      success: true,
      data: gateway,
    });
  })
);

/**
 * PUT /api/gateways/:id
 *
 * Update a gateway
 *
 * @param {string} id - Gateway ID
 * @body {string} [name] - New gateway name
 * @body {object} [credentials] - Updated credentials
 * @body {object} [config] - Updated config
 *
 * @returns {SafeGateway} Updated gateway (credentials masked)
 *
 * @throws {400} Validation error
 * @throws {404} Gateway not found
 * @throws {403} Access denied
 */
gatewayRouter.put(
  "/:id",
  requireAuth,
  asyncHandler(async (req: Request, res: Response<ApiResponse<SafeGateway>>) => {
    const ctx = getServiceContext(req);
    const id = getPathParam(req, "id");

    // Validate input
    const parseResult = updateGatewaySchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError("Invalid update data", formatZodErrors(parseResult.error));
    }

    const gateway = await gatewayService.update(ctx, id, parseResult.data);

    res.json({
      success: true,
      data: gateway,
    });
  })
);

/**
 * PATCH /api/gateways/:id/status
 *
 * Update gateway status
 *
 * @param {string} id - Gateway ID
 * @body {GatewayStatus} status - New status (CONNECTED, DISCONNECTED, ERROR)
 * @body {string} [errorMessage] - Error message if status is ERROR
 *
 * @returns {SafeGateway} Updated gateway
 *
 * @throws {400} Invalid status
 * @throws {404} Gateway not found
 * @throws {403} Access denied
 */
gatewayRouter.patch(
  "/:id/status",
  requireAuth,
  asyncHandler(async (req: Request, res: Response<ApiResponse<SafeGateway>>) => {
    const ctx = getServiceContext(req);
    const id = getPathParam(req, "id");
    const { status, errorMessage } = req.body as { status?: string; errorMessage?: string };

    // Validate status
    const validStatuses = ["CONNECTED", "DISCONNECTED", "ERROR"] as const;
    if (!status || !validStatuses.includes(status as typeof validStatuses[number])) {
      throw new BadRequestError(
        `Invalid status. Must be one of: ${validStatuses.join(", ")}`
      );
    }

    const gateway = await gatewayService.updateStatusWithAuth(
      ctx,
      id,
      status as GatewayStatus,
      status === "ERROR" ? errorMessage : undefined
    );

    res.json({
      success: true,
      data: gateway,
    });
  })
);

/**
 * Test gateway connection response type
 */
interface GatewayTestResult {
  success: boolean;
  gatewayId: string;
  gatewayType: string;
  latency?: number;
  error?: string;
  details?: {
    botUsername?: string;
    provider?: string;
    model?: string;
  };
}

/**
 * POST /api/gateways/:id/test
 *
 * Test gateway connection by validating credentials and checking health
 *
 * @param {string} id - Gateway ID
 *
 * @returns {GatewayTestResult} Test result with success/failure and details
 *
 * @throws {404} Gateway not found
 * @throws {403} Access denied
 * @throws {400} Provider not registered
 */
gatewayRouter.post(
  "/:id/test",
  requireAuth,
  asyncHandler(async (req: Request, res: Response<ApiResponse<GatewayTestResult>>) => {
    const ctx = getServiceContext(req);
    const id = getPathParam(req, "id");

    // Get gateway with ownership check
    const gateway = await gatewayService.findById(ctx, id);
    
    // Get decrypted credentials
    const credentials = gatewayService.getDecryptedCredentials(gateway);

    // Get provider from registry
    const provider = gatewayRegistry.get(gateway.type);
    if (!provider) {
      throw new NotFoundError(`Provider not registered for type: ${gateway.type}`);
    }

    // Run health check which validates credentials and tests connection
    const startTime = Date.now();
    const healthResult = await provider.checkHealth(id, credentials);
    const latency = Date.now() - startTime;

    // Build response with type-specific details
    const result: GatewayTestResult = {
      success: healthResult.healthy,
      gatewayId: id,
      gatewayType: gateway.type,
      latency: healthResult.latency ?? latency,
      error: healthResult.error,
    };

    // Add type-specific details
    if (gateway.type === "TELEGRAM_BOT" && healthResult.healthy) {
      // For Telegram bots, we could include bot info
      // The bot info is already cached in the provider after connect
      result.details = { botUsername: "Connected" };
    } else if (gateway.type === "AI" && healthResult.healthy) {
      result.details = {
        provider: (credentials as { provider?: string }).provider,
      };
    }

    // Update gateway status based on test result
    if (healthResult.healthy) {
      await gatewayService.updateStatus(id, "CONNECTED");
    } else {
      await gatewayService.updateStatus(id, "ERROR", healthResult.error);
    }

    res.json({
      success: true,
      data: result,
    });
  })
);

/**
 * POST /api/gateways/health-check
 *
 * Manually trigger health check for all user's gateways
 * Admin can check all gateways system-wide
 *
 * @returns {object} Health check results
 */
gatewayRouter.post(
  "/health-check",
  requireAuth,
  asyncHandler(async (req: Request, res: Response<ApiResponse<{
    total: number;
    tested: number;
    healthy: number;
    unhealthy: number;
  }>>) => {
    const { gatewayMonitor } = await import("@/modules/gateway/gateway-monitor");
    
    // Run health check
    const results = await gatewayMonitor.testAllGateways();
    
    // Summarize results
    const summary = {
      total: results.length,
      tested: results.length,
      healthy: results.filter(r => r.healthy).length,
      unhealthy: results.filter(r => !r.healthy).length,
    };

    res.json({
      success: true,
      data: summary,
    });
  })
);

/**
 * DELETE /api/gateways/:id
 *
 * Delete a gateway
 *
 * @param {string} id - Gateway ID
 *
 * @returns {object} Success message
 *
 * @throws {404} Gateway not found
 * @throws {403} Access denied
 */
gatewayRouter.delete(
  "/:id",
  requireAuth,
  asyncHandler(async (req: Request, res: Response<ApiResponse<{ deleted: boolean }>>)=> {
    const ctx = getServiceContext(req);
    const id = getPathParam(req, "id");

    await gatewayService.delete(ctx, id);

    res.json({
      success: true,
      data: { deleted: true },
    });
  })
);
