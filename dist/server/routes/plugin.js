"use strict";
/**
 * Plugin Routes
 *
 * REST API endpoints for plugin catalog and user plugin management
 *
 * Note: Context-based routes (/api/plugins/user/plugins) are deprecated.
 * Use URL-based routes: /api/user/plugins or /api/orgs/:orgId/plugins
 *
 * @module server/routes/plugin
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.pluginRouter = void 0;
const express_1 = require("express");
const plugin_1 = require("@/modules/plugin");
const analytics_1 = require("@/modules/plugin/handlers/analytics");
const plugin_validation_1 = require("@/modules/plugin/plugin.validation");
const errors_1 = require("@/shared/errors");
const context_1 = require("@/shared/types/context");
const auth_1 = require("../middleware/auth");
const deprecation_1 = require("../middleware/deprecation");
const error_handler_1 = require("../middleware/error-handler");
exports.pluginRouter = (0, express_1.Router)();
/**
 * Helper to create ServiceContext from Express request
 * Phase 6.7: Token no longer contains activeContext - defaults to personal context
 * This route is deprecated - use /api/user/plugins or /api/orgs/:orgId/plugins
 */
function getServiceContext(req) {
    if (!req.user) {
        throw new errors_1.BadRequestError("User not authenticated");
    }
    // Phase 6.7: Token simplified - context determined by URL, not token
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
        const path = issue.path.map((p) => String(p)).join(".") || "_root";
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
// ===========================================
// Plugin Catalog (Public - no auth required)
// ===========================================
/**
 * GET /api/plugins
 *
 * List all available plugins in the catalog
 *
 * @query {string} [category] - Filter by category
 * @query {string} [gateway] - Filter by required gateway type
 * @query {string} [search] - Search by name, description, or slug
 * @query {string} [tags] - Filter by tags (comma-separated)
 * @query {number} [page] - Page number (default 1)
 * @query {number} [limit] - Max results (default 50, max 100)
 *
 * @returns {PluginListItem[]} List of available plugins
 */
exports.pluginRouter.get("/", (0, error_handler_1.asyncHandler)(async (req, res) => {
    // Parse and validate query params
    const queryResult = plugin_validation_1.pluginListQuerySchema.safeParse(req.query);
    if (!queryResult.success) {
        throw new errors_1.ValidationError("Invalid query parameters", formatZodErrors(queryResult.error));
    }
    const { category, gateway, search, tags, page = 1, limit = 50 } = queryResult.data;
    // Get plugins
    const plugins = await plugin_1.pluginService.getAvailablePlugins({
        category,
        gateway: gateway,
        search,
        tags,
    });
    // Apply pagination
    const total = plugins.length;
    const totalPages = Math.ceil(total / limit);
    const offset = (page - 1) * limit;
    const items = plugins.slice(offset, offset + limit);
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
 * GET /api/plugins/:slug
 *
 * Get a specific plugin by slug
 *
 * @param {string} slug - Plugin slug (unique identifier)
 *
 * @returns {PluginDefinition} Full plugin definition
 *
 * @throws {404} Plugin not found
 */
exports.pluginRouter.get("/:slug", (0, error_handler_1.asyncHandler)(async (req, res) => {
    const slug = getPathParam(req, "slug");
    const plugin = await plugin_1.pluginService.getPluginBySlug(slug);
    res.json({
        success: true,
        data: plugin,
    });
}));
// ===========================================
// User Plugin Management (Auth required)
// ===========================================
/**
 * GET /api/user/plugins
 *
 * List user's installed plugins
 *
 * @deprecated Use /api/user/plugins for personal or /api/orgs/:orgId/plugins for organization
 *
 * @query {boolean} [enabled] - Filter by enabled status
 * @query {string} [pluginId] - Filter by plugin ID
 * @query {number} [page] - Page number (default 1)
 * @query {number} [limit] - Max results (default 50)
 *
 * @returns {SafeUserPlugin[]} List of user's installed plugins
 */
exports.pluginRouter.get("/user/plugins", auth_1.requireAuth, (0, deprecation_1.deprecated)("/api/user/plugins or /api/orgs/:orgId/plugins", {
    message: "Use URL-based routes: /api/user/plugins for personal, /api/orgs/:orgId/plugins for organization",
}), (0, error_handler_1.asyncHandler)(async (req, res) => {
    const ctx = getServiceContext(req);
    // Parse and validate query params
    const queryResult = plugin_validation_1.userPluginsQuerySchema.safeParse(req.query);
    if (!queryResult.success) {
        throw new errors_1.ValidationError("Invalid query parameters", formatZodErrors(queryResult.error));
    }
    const { enabled, pluginId, page = 1, limit = 50 } = queryResult.data;
    // Get user plugins
    const userPlugins = await plugin_1.pluginService.getUserPlugins(ctx, {
        enabled,
        pluginId,
    });
    // Apply pagination
    const total = userPlugins.length;
    const totalPages = Math.ceil(total / limit);
    const offset = (page - 1) * limit;
    const items = userPlugins.slice(offset, offset + limit);
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
 * GET /api/user/plugins/:id
 *
 * Get a specific user plugin by ID
 *
 * @param {string} id - UserPlugin ID
 *
 * @returns {SafeUserPlugin} User plugin details
 *
 * @throws {404} Plugin installation not found
 * @throws {403} Access denied
 */
exports.pluginRouter.get("/user/plugins/:id", auth_1.requireAuth, (0, error_handler_1.asyncHandler)(async (req, res) => {
    const ctx = getServiceContext(req);
    const id = getPathParam(req, "id");
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
 * @body {string} pluginId - ID of the plugin to install
 * @body {object} [config] - Plugin configuration
 * @body {string} [gatewayId] - Gateway to bind the plugin to
 *
 * @returns {SafeUserPlugin} Installed plugin
 *
 * @throws {400} Validation error or plugin already installed
 * @throws {403} Plugin limit reached
 * @throws {404} Plugin or gateway not found
 */
exports.pluginRouter.post("/user/plugins/install", auth_1.requireAuth, (0, error_handler_1.asyncHandler)(async (req, res) => {
    const ctx = getServiceContext(req);
    // Validate input
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
 *
 * @throws {404} Plugin installation not found
 * @throws {403} Access denied
 */
exports.pluginRouter.delete("/user/plugins/:id", auth_1.requireAuth, (0, error_handler_1.asyncHandler)(async (req, res) => {
    const ctx = getServiceContext(req);
    const id = getPathParam(req, "id");
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
 * @body {string} [gatewayId] - Gateway binding (null to unbind)
 *
 * @returns {SafeUserPlugin} Updated plugin
 *
 * @throws {400} Validation error
 * @throws {404} Plugin installation or gateway not found
 * @throws {403} Access denied
 */
exports.pluginRouter.put("/user/plugins/:id/config", auth_1.requireAuth, (0, error_handler_1.asyncHandler)(async (req, res) => {
    const ctx = getServiceContext(req);
    const id = getPathParam(req, "id");
    // Validate input
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
 *
 * @returns {SafeUserPlugin} Updated plugin
 *
 * @throws {400} Validation error
 * @throws {404} Plugin installation not found
 * @throws {403} Access denied
 */
exports.pluginRouter.post("/user/plugins/:id/toggle", auth_1.requireAuth, (0, error_handler_1.asyncHandler)(async (req, res) => {
    const ctx = getServiceContext(req);
    const id = getPathParam(req, "id");
    // Validate input
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
// ===========================================
// Analytics Plugin Data (Auth required)
// ===========================================
/**
 * GET /api/user/plugins/:id/analytics
 *
 * Get analytics data for an analytics plugin installation
 *
 * @param {string} id - UserPlugin ID (must be analytics plugin)
 *
 * @returns {AnalyticsSummary} Analytics summary data
 *
 * @throws {400} Not an analytics plugin
 * @throws {404} Plugin installation not found
 * @throws {403} Access denied
 */
exports.pluginRouter.get("/user/plugins/:id/analytics", auth_1.requireAuth, (0, error_handler_1.asyncHandler)(async (req, res) => {
    const ctx = getServiceContext(req);
    const id = getPathParam(req, "id");
    // Get user plugin to verify access and plugin type
    const userPlugin = await plugin_1.pluginService.getUserPluginById(ctx, id);
    // Verify this is an analytics plugin
    if (userPlugin.pluginSlug !== "analytics") {
        throw new errors_1.BadRequestError("This endpoint is only for analytics plugins");
    }
    // Get analytics data
    const storage = (0, analytics_1.createAnalyticsStorage)(userPlugin.id, userPlugin.config);
    const summary = await storage.getSummary();
    res.json({
        success: true,
        data: summary,
    });
}));
//# sourceMappingURL=plugin.js.map