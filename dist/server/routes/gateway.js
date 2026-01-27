"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.gatewayRouter = void 0;
const gateway_1 = require("@/modules/gateway");
const gateway_validation_1 = require("@/modules/gateway/gateway.validation");
const errors_1 = require("@/shared/errors");
const context_1 = require("@/shared/types/context");
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const deprecation_1 = require("../middleware/deprecation");
const error_handler_1 = require("../middleware/error-handler");
exports.gatewayRouter = (0, express_1.Router)();
/**
 * Helper to create ServiceContext from Express request
 * Phase 6.7: Context is now determined by URL, not token
 * This route is deprecated - use /api/user/gateways or /api/orgs/:orgId/gateways
 */
function getServiceContext(req) {
    if (!req.user) {
        throw new errors_1.BadRequestError("User not authenticated");
    }
    // Phase 6.7: Token no longer contains activeContext
    // For legacy routes, default to personal context
    return (0, context_1.createServiceContext)({
        userId: req.tokenPayload?.userId ?? req.user.id,
        role: req.tokenPayload?.role ?? req.user.role,
        plan: req.tokenPayload?.plan ?? req.user.plan,
    }, {
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        requestId: req.headers["x-request-id"],
    }, 
    // Default to personal context for legacy routes
    { contextType: 'personal', effectivePlan: req.user.plan });
}
/**
 * Convert Zod errors to ValidationError format
 */
function formatZodErrors(error) {
    const errors = {};
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
function getPathParam(req, name) {
    const value = req.params[name];
    if (typeof value !== "string" || !value) {
        throw new errors_1.BadRequestError(`Missing path parameter: ${name}`);
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
exports.gatewayRouter.get("/", auth_1.requireAuth, (0, deprecation_1.deprecated)("/api/user/gateways or /api/orgs/:orgId/gateways", {
    message: "Use URL-based routes: /api/user/gateways for personal, /api/orgs/:orgId/gateways for organization",
}), (0, error_handler_1.asyncHandler)(async (req, res) => {
    const ctx = getServiceContext(req);
    // Parse query params
    const type = req.query.type;
    const status = req.query.status;
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    // Get gateways for user/org context
    const gateways = await gateway_1.gatewayService.findByUser(ctx);
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
}));
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
exports.gatewayRouter.post("/", auth_1.requireAuth, (0, error_handler_1.asyncHandler)(async (req, res) => {
    const ctx = getServiceContext(req);
    // Validate input
    const parseResult = gateway_validation_1.createGatewaySchema.safeParse(req.body);
    if (!parseResult.success) {
        throw new errors_1.ValidationError("Invalid gateway data", formatZodErrors(parseResult.error));
    }
    const gateway = await gateway_1.gatewayService.create(ctx, parseResult.data);
    res.status(201).json({
        success: true,
        data: gateway,
    });
}));
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
exports.gatewayRouter.get("/:id", auth_1.requireAuth, (0, error_handler_1.asyncHandler)(async (req, res) => {
    const ctx = getServiceContext(req);
    const id = getPathParam(req, "id");
    const gateway = await gateway_1.gatewayService.findByIdSafe(ctx, id);
    res.json({
        success: true,
        data: gateway,
    });
}));
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
exports.gatewayRouter.put("/:id", auth_1.requireAuth, (0, error_handler_1.asyncHandler)(async (req, res) => {
    const ctx = getServiceContext(req);
    const id = getPathParam(req, "id");
    // Validate input
    const parseResult = gateway_validation_1.updateGatewaySchema.safeParse(req.body);
    if (!parseResult.success) {
        throw new errors_1.ValidationError("Invalid update data", formatZodErrors(parseResult.error));
    }
    const gateway = await gateway_1.gatewayService.update(ctx, id, parseResult.data);
    res.json({
        success: true,
        data: gateway,
    });
}));
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
exports.gatewayRouter.patch("/:id/status", auth_1.requireAuth, (0, error_handler_1.asyncHandler)(async (req, res) => {
    const ctx = getServiceContext(req);
    const id = getPathParam(req, "id");
    const { status, errorMessage } = req.body;
    // Validate status
    const validStatuses = ["CONNECTED", "DISCONNECTED", "ERROR"];
    if (!status || !validStatuses.includes(status)) {
        throw new errors_1.BadRequestError(`Invalid status. Must be one of: ${validStatuses.join(", ")}`);
    }
    const gateway = await gateway_1.gatewayService.updateStatusWithAuth(ctx, id, status, status === "ERROR" ? errorMessage : undefined);
    res.json({
        success: true,
        data: gateway,
    });
}));
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
exports.gatewayRouter.post("/:id/test", auth_1.requireAuth, (0, error_handler_1.asyncHandler)(async (req, res) => {
    const ctx = getServiceContext(req);
    const id = getPathParam(req, "id");
    // Get gateway with ownership check
    const gateway = await gateway_1.gatewayService.findById(ctx, id);
    // Get decrypted credentials
    const credentials = gateway_1.gatewayService.getDecryptedCredentials(gateway);
    // Get provider from registry
    const provider = gateway_1.gatewayRegistry.get(gateway.type);
    if (!provider) {
        throw new errors_1.NotFoundError(`Provider not registered for type: ${gateway.type}`);
    }
    // Run health check which validates credentials and tests connection
    const startTime = Date.now();
    const healthResult = await provider.checkHealth(id, credentials);
    const latency = Date.now() - startTime;
    // Build response with type-specific details
    const result = {
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
    else if (gateway.type === "AI" && healthResult.healthy) {
        result.details = {
            provider: credentials.provider,
        };
    }
    // Update gateway status based on test result
    if (healthResult.healthy) {
        await gateway_1.gatewayService.updateStatus(id, "CONNECTED");
    }
    else {
        await gateway_1.gatewayService.updateStatus(id, "ERROR", healthResult.error);
    }
    res.json({
        success: true,
        data: result,
    });
}));
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
exports.gatewayRouter.delete("/:id", auth_1.requireAuth, (0, error_handler_1.asyncHandler)(async (req, res) => {
    const ctx = getServiceContext(req);
    const id = getPathParam(req, "id");
    await gateway_1.gatewayService.delete(ctx, id);
    res.json({
        success: true,
        data: { deleted: true },
    });
}));
//# sourceMappingURL=gateway.js.map