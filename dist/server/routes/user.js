"use strict";
/**
 * User Routes (Personal Resources)
 *
 * URL-based API pattern for personal resources (GitHub-style)
 * All routes at /api/user/* return the authenticated user's personal resources
 *
 * @module server/routes/user
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.userRouter = void 0;
const gateway_1 = require("@/modules/gateway");
const organization_1 = require("@/modules/organization");
const plugin_1 = require("@/modules/plugin");
const plugin_validation_1 = require("@/modules/plugin/plugin.validation");
const quota_1 = require("@/modules/quota");
const errors_1 = require("@/shared/errors");
const context_1 = require("@/shared/types/context");
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const error_handler_1 = require("../middleware/error-handler");
exports.userRouter = (0, express_1.Router)();
// All routes require authentication
exports.userRouter.use(auth_1.requireAuth);
/**
 * Format Zod validation errors into a simple object
 */
function formatZodErrors(error) {
    const errors = {};
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
function getPersonalContext(req) {
    if (!req.user) {
        throw new errors_1.BadRequestError("User not authenticated");
    }
    return (0, context_1.createServiceContext)({
        userId: req.user.id,
        role: req.user.role,
        plan: req.user.plan,
        activeContext: {
            type: 'personal',
            plan: req.user.plan,
        },
    }, {
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        requestId: req.headers["x-request-id"],
    });
}
/**
 * GET /api/user/gateways
 *
 * List user's personal gateways (organizationId IS NULL)
 *
 * @returns {GatewayListItem[]} User's personal gateways
 */
exports.userRouter.get("/gateways", (0, error_handler_1.asyncHandler)(async (req, res) => {
    const ctx = getPersonalContext(req);
    // findByUser with personal context returns personal gateways only
    const gateways = await gateway_1.gatewayService.findByUser(ctx);
    res.json({
        success: true,
        data: gateways,
    });
}));
/**
 * GET /api/user/plugins
 *
 * List user's installed plugins (personal workspace)
 *
 * @returns {SafeUserPlugin[]} User's installed plugins
 */
exports.userRouter.get("/plugins", (0, error_handler_1.asyncHandler)(async (req, res) => {
    const ctx = getPersonalContext(req);
    const plugins = await plugin_1.pluginService.getUserPlugins(ctx);
    res.json({
        success: true,
        data: plugins,
    });
}));
/**
 * GET /api/user/plugins/:id
 *
 * Get a specific user plugin by ID
 *
 * @param {string} id - UserPlugin ID
 * @returns {SafeUserPlugin} User plugin details
 */
exports.userRouter.get("/plugins/:id", (0, error_handler_1.asyncHandler)(async (req, res) => {
    const ctx = getPersonalContext(req);
    const id = req.params.id;
    if (!id) {
        throw new errors_1.BadRequestError("Plugin ID is required");
    }
    const userPlugin = await plugin_1.pluginService.getUserPluginById(ctx, id);
    res.json({
        success: true,
        data: userPlugin,
    });
}));
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
exports.userRouter.post("/plugins/install", (0, error_handler_1.asyncHandler)(async (req, res) => {
    const ctx = getPersonalContext(req);
    const parseResult = plugin_validation_1.installPluginSchema.safeParse(req.body);
    if (!parseResult.success) {
        throw new errors_1.ValidationError("Invalid install data", formatZodErrors(parseResult.error));
    }
    const userPlugin = await plugin_1.pluginService.installPlugin(ctx, parseResult.data);
    res.status(201).json({
        success: true,
        data: userPlugin,
    });
}));
/**
 * DELETE /api/user/plugins/:id
 *
 * Uninstall a plugin
 *
 * @param {string} id - UserPlugin ID
 */
exports.userRouter.delete("/plugins/:id", (0, error_handler_1.asyncHandler)(async (req, res) => {
    const ctx = getPersonalContext(req);
    const id = req.params.id;
    if (!id) {
        throw new errors_1.BadRequestError("Plugin ID is required");
    }
    await plugin_1.pluginService.uninstallPlugin(ctx, id);
    res.json({
        success: true,
        data: null,
    });
}));
/**
 * PUT /api/user/plugins/:id/config
 *
 * Update plugin configuration
 *
 * @param {string} id - UserPlugin ID
 * @body {object} config - New plugin configuration
 * @returns {SafeUserPlugin} Updated plugin
 */
exports.userRouter.put("/plugins/:id/config", (0, error_handler_1.asyncHandler)(async (req, res) => {
    const ctx = getPersonalContext(req);
    const id = req.params.id;
    if (!id) {
        throw new errors_1.BadRequestError("Plugin ID is required");
    }
    const parseResult = plugin_validation_1.updatePluginConfigSchema.safeParse(req.body);
    if (!parseResult.success) {
        throw new errors_1.ValidationError("Invalid config data", formatZodErrors(parseResult.error));
    }
    const userPlugin = await plugin_1.pluginService.updatePluginConfig(ctx, id, parseResult.data);
    res.json({
        success: true,
        data: userPlugin,
    });
}));
/**
 * POST /api/user/plugins/:id/toggle
 *
 * Enable or disable a plugin
 *
 * @param {string} id - UserPlugin ID
 * @body {boolean} enabled - Enable or disable the plugin
 * @returns {SafeUserPlugin} Updated plugin
 */
exports.userRouter.post("/plugins/:id/toggle", (0, error_handler_1.asyncHandler)(async (req, res) => {
    const ctx = getPersonalContext(req);
    const id = req.params.id;
    if (!id) {
        throw new errors_1.BadRequestError("Plugin ID is required");
    }
    const parseResult = plugin_validation_1.togglePluginSchema.safeParse(req.body);
    if (!parseResult.success) {
        throw new errors_1.ValidationError("Invalid toggle data", formatZodErrors(parseResult.error));
    }
    const userPlugin = await plugin_1.pluginService.togglePlugin(ctx, id, parseResult.data.enabled);
    res.json({
        success: true,
        data: userPlugin,
    });
}));
/**
 * GET /api/user/quota
 *
 * Get user's personal quota status
 *
 * @returns {QuotaStatus} Current quota usage and limits
 */
exports.userRouter.get("/quota", (0, error_handler_1.asyncHandler)(async (req, res) => {
    const ctx = getPersonalContext(req);
    const quota = await quota_1.quotaService.getQuotaStatus(ctx);
    res.json({
        success: true,
        data: quota,
    });
}));
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
exports.userRouter.get("/quota/realtime", (0, error_handler_1.asyncHandler)(async (req, res) => {
    const ctx = getPersonalContext(req);
    // Set SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // Disable nginx buffering
    // Send initial quota immediately
    try {
        const initialQuota = await quota_1.quotaService.getQuotaStatus(ctx);
        res.write(`data: ${JSON.stringify(initialQuota)}\n\n`);
    }
    catch (error) {
        res.write(`data: ${JSON.stringify({ error: "Failed to fetch quota" })}\n\n`);
    }
    // Set up interval for updates (every 5 seconds)
    const interval = setInterval(async () => {
        try {
            const quota = await quota_1.quotaService.getQuotaStatus(ctx);
            res.write(`data: ${JSON.stringify(quota)}\n\n`);
        }
        catch {
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
}));
/**
 * GET /api/user/organizations
 *
 * List organizations the user is a member of
 * Replaces availableOrgs from JWT token payload
 *
 * @returns {OrgWithRole[]} Organizations with user's role in each
 */
exports.userRouter.get("/organizations", (0, error_handler_1.asyncHandler)(async (req, res) => {
    const userId = req.user.id;
    const orgs = await organization_1.organizationService.getUserOrganizations(userId);
    res.json({
        success: true,
        data: orgs,
    });
}));
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
exports.userRouter.get("/invites", (0, error_handler_1.asyncHandler)(async (req, res) => {
    const userId = req.user.id;
    const invites = await organization_1.organizationService.getUserPendingInvites(userId);
    res.json({
        success: true,
        data: invites,
    });
}));
/**
 * POST /api/user/invites/:id/accept
 *
 * Accept a pending membership invite
 *
 * @param {string} id - Membership ID
 */
exports.userRouter.post("/invites/:id/accept", (0, error_handler_1.asyncHandler)(async (req, res) => {
    const ctx = getPersonalContext(req);
    const membershipId = req.params.id;
    if (!membershipId || typeof membershipId !== 'string') {
        throw new errors_1.BadRequestError("Membership ID is required");
    }
    const result = await organization_1.organizationService.acceptInvite(ctx, membershipId);
    res.json({
        success: true,
        data: { organizationId: result.organizationId },
    });
}));
/**
 * POST /api/user/invites/:id/decline
 *
 * Decline a pending membership invite
 *
 * @param {string} id - Membership ID
 */
exports.userRouter.post("/invites/:id/decline", (0, error_handler_1.asyncHandler)(async (req, res) => {
    const ctx = getPersonalContext(req);
    const membershipId = req.params.id;
    if (!membershipId || typeof membershipId !== 'string') {
        throw new errors_1.BadRequestError("Membership ID is required");
    }
    await organization_1.organizationService.declineInvite(ctx, membershipId);
    res.json({
        success: true,
        data: null,
    });
}));
//# sourceMappingURL=user.js.map