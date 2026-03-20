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
import { gatewayChatService } from "@/modules/gateway/gateway-chats.service";
import { gatewayMetricService } from "@/modules/gateway/gateway-metrics.service";
import type { GatewayListItem, SafeGateway } from "@/modules/gateway/gateway.types";
import {
    createGatewaySchema,
    updateGatewaySchema,
} from "@/modules/gateway/gateway.validation";
import { BadRequestError, NotFoundError, ValidationError } from "@/shared/errors";
import type { ApiResponse, PaginatedResponse } from "@/shared/types";
import { createServiceContext } from "@/shared/types/context";
import type { Gateway, GatewayStatus } from "@prisma/client";
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
 * Ensure the in-memory provider is connected, reconnecting from DB credentials
 * if the server restarted and lost its connection state.
 *
 * The Telegram Bot API is stateless (polling/webhooks) so re-connecting only
 * re-creates the in-memory map entry — it does NOT interrupt any live webhook.
 */
async function ensureConnected(
  provider: ReturnType<typeof gatewayRegistry.get>,
  gatewayId: string,
  gateway: Gateway
): Promise<void> {
  if (provider.isConnected(gatewayId)) return;

  // Gateway was previously connected (DB says so) — reconnect silently
  if (gateway.status === "CONNECTED") {
    const credentials = gatewayService.getDecryptedCredentials(gateway);
    await provider.connect(
      gatewayId,
      credentials,
      (gateway.config as Record<string, unknown>) ?? {}
    );
    return;
  }

  // Truly not connected — bubble a clear error to the client
  throw new BadRequestError("Gateway is not connected. Connect it first.");
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
 * @query {string} [type] - Filter by gateway type (TELEGRAM_BOT, DISCORD_BOT, SLACK_BOT, WHATSAPP_BOT)
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
 * @body {GatewayType} type - Gateway type (TELEGRAM_BOT, DISCORD_BOT, SLACK_BOT, WHATSAPP_BOT)
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
 * Provider-specific info response
 */
interface GatewayProviderInfo {
  gatewayId: string;
  gatewayType: string;
  gatewayName: string;
  status: string;
  /** Metadata persisted in DB (available even if provider is not connected) */
  metadata: Record<string, unknown>;
  /** Live info fetched from the provider API (null if unavailable) */
  live: Record<string, unknown> | null;
}

/**
 * GET /api/gateways/:id/info
 *
 * Get provider-specific info for a gateway.
 * Returns persisted metadata + optionally live data from the provider API.
 *
 * Query params:
 *   ?live=true  - Also fetch live info from the provider (default: false)
 *
 * @param {string} id - Gateway ID
 *
 * @returns {GatewayProviderInfo} Provider-specific information
 *
 * @throws {404} Gateway not found
 * @throws {403} Access denied
 */
gatewayRouter.get(
  "/:id/info",
  requireAuth,
  asyncHandler(async (req: Request, res: Response<ApiResponse<GatewayProviderInfo>>) => {
    const ctx = getServiceContext(req);
    const id = getPathParam(req, "id");
    const fetchLive = req.query.live === "true";

    // Get gateway with ownership check
    const gateway = await gatewayService.findById(ctx, id);

    // Build base response from persisted metadata
    const result: GatewayProviderInfo = {
      gatewayId: id,
      gatewayType: gateway.type,
      gatewayName: gateway.name,
      status: gateway.status,
      metadata: (gateway.metadata ?? {}) as Record<string, unknown>,
      live: null,
    };

    // Optionally fetch live info from the provider
    if (fetchLive) {
      try {
        const provider = gatewayRegistry.get(gateway.type);
        const credentials = gatewayService.getDecryptedCredentials(gateway);

        // Ensure connected so the provider can make API calls
        if (!provider.isConnected(gateway.id)) {
          await provider.connect(
            gateway.id,
            credentials,
            (gateway.config as Record<string, unknown>) ?? {}
          );
        }

        result.live = await provider.getProviderInfo(gateway.id, credentials);
      } catch (err) {
        // Live fetch failed — still return persisted metadata
        result.live = { error: (err as Error).message };
      }
    }

    res.json({
      success: true,
      data: result,
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

// ─── Chat Tracking Endpoints (Phase 7) ───────────────────────────

/**
 * GET /api/gateways/:id/chats
 *
 * Get the list of Telegram chats this bot is active in,
 * along with summary statistics.
 *
 * Query params:
 *   - page (default 1)
 *   - limit (default 50, max 100)
 *   - activeOnly (default true)
 *
 * @param {string} id - Gateway ID
 * @returns {object} Chats list + stats
 */
gatewayRouter.get(
  "/:id/chats",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const ctx = getServiceContext(req);
    const id = getPathParam(req, "id");

    // Ownership check
    const gateway = await gatewayService.findById(ctx, id);
    if (gateway.type !== "TELEGRAM_BOT") {
      throw new BadRequestError("Chat tracking is only available for Telegram Bot gateways");
    }

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const activeOnly = req.query.activeOnly !== "false";

    const [chatData, stats] = await Promise.all([
      gatewayChatService.getAllChats(id, { page, limit, activeOnly }),
      gatewayChatService.getChatStats(id),
    ]);

    res.json({
      success: true,
      data: {
        chats: chatData.chats,
        pagination: chatData.pagination,
        stats,
      },
    });
  })
);

// ─── Gateway Metrics Endpoints (Phase 8) ─────────────────────────

/**
 * GET /api/gateways/:id/metrics
 *
 * Retrieve action execution metrics for a gateway.
 *
 * Query params:
 *   - days (default 7, max 90) — number of days of history
 *   - action (optional) — filter to a specific action
 *
 * @param {string} id - Gateway ID
 * @returns {object} Metrics rows + summary
 */
gatewayRouter.get(
  "/:id/metrics",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const ctx = getServiceContext(req);
    const id = getPathParam(req, "id");

    // Ownership check
    await gatewayService.findById(ctx, id);

    const days = Math.min(90, Math.max(1, Number(req.query.days) || 7));
    const action = typeof req.query.action === "string" ? req.query.action : undefined;

    const [metrics, summary] = await Promise.all([
      gatewayMetricService.getMetrics(id, { days, action }),
      gatewayMetricService.getDashboardStats(id),
    ]);

    res.json({
      success: true,
      data: {
        metrics,
        summary,
      },
    });
  })
);

// ─── Telegram-Specific Endpoints ─────────────────────────────────

/**
 * GET /api/gateways/:id/telegram/profile
 *
 * Fetch the full Telegram bot profile in a single call:
 * identity (getMe), display name, description, short description, commands.
 *
 * @param {string} id - Gateway ID (must be TELEGRAM_BOT type)
 * @returns {object} Combined bot profile
 */
gatewayRouter.get(
  "/:id/telegram/profile",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const ctx = getServiceContext(req);
    const id = getPathParam(req, "id");

    const gateway = await gatewayService.findById(ctx, id);
    if (gateway.type !== "TELEGRAM_BOT") {
      throw new BadRequestError("This endpoint is only available for Telegram Bot gateways");
    }

    const provider = gatewayRegistry.get(gateway.type);
    await ensureConnected(provider, id, gateway);

    // Fetch all profile parts in parallel
    const [meResult, nameResult, descResult, shortDescResult, commandsResult] =
      await Promise.allSettled([
        provider.execute(id, "getMe", {}),
        provider.execute(id, "getMyName", {}),
        provider.execute(id, "getMyDescription", {}),
        provider.execute(id, "getMyShortDescription", {}),
        provider.execute(id, "getMyCommands", {}),
      ]);

    const profile = {
      identity: meResult.status === "fulfilled" ? meResult.value : null,
      name: nameResult.status === "fulfilled"
        ? (nameResult.value as Record<string, unknown>).name ?? null
        : null,
      description: descResult.status === "fulfilled"
        ? (descResult.value as Record<string, unknown>).description ?? null
        : null,
      shortDescription: shortDescResult.status === "fulfilled"
        ? (shortDescResult.value as Record<string, unknown>).short_description ?? null
        : null,
      commands: commandsResult.status === "fulfilled" ? commandsResult.value : [],
    };

    res.json({ success: true, data: profile });
  })
);

/**
 * PUT /api/gateways/:id/telegram/profile
 *
 * Update one or more Telegram bot profile fields.
 * Accepts partial body — only provided fields are updated.
 *
 * @param {string} id - Gateway ID (must be TELEGRAM_BOT type)
 * @body {string} [name] - Bot display name (0-64 chars)
 * @body {string} [description] - Bot description (0-512 chars)
 * @body {string} [shortDescription] - Short description (0-120 chars)
 * @body {Array}  [commands] - Array of {command, description}
 *
 * @returns {object} Result of each update
 */
gatewayRouter.put(
  "/:id/telegram/profile",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const ctx = getServiceContext(req);
    const id = getPathParam(req, "id");

    const gateway = await gatewayService.findById(ctx, id);
    if (gateway.type !== "TELEGRAM_BOT") {
      throw new BadRequestError("This endpoint is only available for Telegram Bot gateways");
    }

    const provider = gatewayRegistry.get(gateway.type);
    await ensureConnected(provider, id, gateway);

    const { name, description, shortDescription, commands } = req.body as {
      name?: string;
      description?: string;
      shortDescription?: string;
      commands?: Array<{ command: string; description: string }>;
    };

    if (
      name === undefined &&
      description === undefined &&
      shortDescription === undefined &&
      commands === undefined
    ) {
      throw new ValidationError("At least one profile field must be provided");
    }

    const credentials = gatewayService.getDecryptedCredentials(gateway);

    const results: Record<string, { success: boolean; error?: string }> = {};

    // Execute only the updates that were requested, in parallel
    const updates: Array<{ key: string; promise: Promise<unknown> }> = [];

    if (name !== undefined) {
      updates.push({
        key: "name",
        promise: provider.execute(id, "setMyName", { name }),
      });
    }
    if (description !== undefined) {
      updates.push({
        key: "description",
        promise: provider.execute(id, "setMyDescription", { description }),
      });
    }
    if (shortDescription !== undefined) {
      updates.push({
        key: "shortDescription",
        promise: provider.execute(id, "setMyShortDescription", {
          short_description: shortDescription,
        }),
      });
    }
    if (commands !== undefined) {
      updates.push({
        key: "commands",
        promise: provider.execute(id, "setMyCommands", { commands }),
      });
    }

    const settled = await Promise.allSettled(updates.map((u) => u.promise));

    for (let i = 0; i < updates.length; i++) {
      const update = updates[i]!;
      const result = settled[i]!;
      results[update.key] =
        result.status === "fulfilled"
          ? { success: true }
          : { success: false, error: (result as PromiseRejectedResult).reason?.message ?? "Unknown error" };
    }

    // Refresh metadata after profile update
    try {
      const freshMeta = await provider.getProviderInfo(id, credentials);
      await gatewayService.updateMetadata(id, freshMeta);
    } catch {
      // Non-fatal — metadata will refresh on next connect
    }

    res.json({ success: true, data: { results } });
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
