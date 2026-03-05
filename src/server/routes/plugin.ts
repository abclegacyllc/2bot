/**
 * Plugin Routes
 *
 * REST API endpoints for plugin catalog, templates, and user plugin management.
 * All plugin-related routes live under /api/plugins/*.
 *
 * Route structure:
 *   GET  /                          - Plugin catalog (public)
 *   GET  /templates                 - Template list (public)
 *   GET  /templates/:id             - Template detail (public)
 *   GET  /installed                 - User's installed plugins (auth)
 *   GET  /installed/health          - Plugin health status (auth)
 *   GET  /installed/storage-stats   - KV storage stats (auth)
 *   GET  /installed/:id             - Specific user plugin (auth)
 *   POST /install                   - Install a plugin (auth)
 *   DELETE /installed/:id           - Uninstall a plugin (auth)
 *   PUT  /installed/:id/config      - Update plugin config (auth)
 *   POST /installed/:id/toggle      - Enable/disable plugin (auth)
 *   GET  /installed/:id/analytics   - Analytics data (auth)
 *   GET  /custom/:id                - Custom plugin detail (auth)
 *   POST /custom                    - Create custom plugin (auth)
 *   PUT  /custom/:id                - Update custom plugin (auth)
 *   DELETE /custom/:id              - Delete custom plugin (auth)
 *   POST /from-repo                 - Create plugin from repo (auth)
 *   POST /register-dir              - Register directory plugin (auth)
 *   GET  /:slug                     - Plugin by slug (public, MUST BE LAST)
 *
 * @module server/routes/plugin
 */

import type { GatewayType } from "@prisma/client";
import { Router, type Request, type Response } from "express";

import { redis } from "@/lib/redis";
import { pluginService } from "@/modules/plugin";
import { createAnalyticsStorage, type AnalyticsSummary } from "@/modules/plugin/handlers/analytics";
import {
    getAnyTemplateById,
    getTemplateList,
    type AnyPluginTemplate,
    type PluginTemplateListItem,
} from "@/modules/plugin/plugin-templates";
import type {
    CreateCustomPluginRequest,
    PluginDefinition,
    PluginListItem,
    SafeUserPlugin,
    UpdateCustomPluginRequest,
} from "@/modules/plugin/plugin.types";
import {
    createCustomPluginSchema,
    createPluginFromRepoSchema,
    installPluginSchema,
    pluginListQuerySchema,
    registerDirectoryAsPluginSchema,
    togglePluginSchema,
    updateCustomPluginSchema,
    updatePluginConfigSchema,
} from "@/modules/plugin/plugin.validation";
import { BadRequestError, ValidationError } from "@/shared/errors";
import type { ApiResponse, PaginatedResponse } from "@/shared/types";
import { createServiceContext, type ServiceContext } from "@/shared/types/context";

import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../middleware/error-handler";

export const pluginRouter = Router();

/**
 * Helper to create personal ServiceContext from Express request.
 * Always creates a personal context (user's own workspace).
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
 * Convert Zod errors to ValidationError format
 */
function formatZodErrors(
  error: { issues: Array<{ path: readonly (string | number | symbol)[]; message: string }> }
): Record<string, string[]> {
  const errors: Record<string, string[]> = {};
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
function getPathParam(req: Request, name: string): string {
  const value = req.params[name];
  if (typeof value !== "string" || !value) {
    throw new BadRequestError(`Missing path parameter: ${name}`);
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
pluginRouter.get(
  "/",
  asyncHandler(async (req: Request, res: Response<PaginatedResponse<PluginListItem>>) => {
    // Parse and validate query params
    const queryResult = pluginListQuerySchema.safeParse(req.query);
    if (!queryResult.success) {
      throw new ValidationError("Invalid query parameters", formatZodErrors(queryResult.error));
    }

    const { category, gateway, search, tags, page = 1, limit = 50 } = queryResult.data;

    // Get plugins (include user's custom plugins if authenticated)
    const userId = req.user?.id;
    const plugins = await pluginService.getAvailablePlugins({
      category,
      gateway: gateway as GatewayType | undefined,
      search,
      tags,
      userId,
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
  })
);

// ===========================================
// Plugin Templates (Public - no auth required)
// ===========================================

/**
 * GET /api/plugins/templates
 *
 * List all available plugin templates (without code)
 *
 * @query {string} [category] - Filter by category
 * @query {string} [difficulty] - Filter by difficulty (beginner, intermediate, advanced)
 *
 * @returns {PluginTemplateListItem[]} List of templates
 */
pluginRouter.get(
  "/templates",
  asyncHandler(async (req: Request, res: Response<ApiResponse<PluginTemplateListItem[]>>) => {
    let templates = getTemplateList();

    const category = req.query.category as string | undefined;
    if (category) {
      templates = templates.filter((t) => t.category === category);
    }

    const difficulty = req.query.difficulty as string | undefined;
    if (difficulty) {
      templates = templates.filter((t) => t.difficulty === difficulty);
    }

    res.json({
      success: true,
      data: templates,
    });
  })
);

/**
 * GET /api/plugins/templates/:id
 *
 * Get a specific template by ID (includes code or files)
 *
 * @param {string} id - Template ID
 *
 * @returns {PluginTemplate | PluginDirectoryTemplate} Full template
 *
 * @throws {404} Template not found
 */
pluginRouter.get(
  "/templates/:id",
  asyncHandler(async (req: Request, res: Response<ApiResponse<AnyPluginTemplate>>) => {
    const id = getPathParam(req, "id");

    const template = getAnyTemplateById(id);
    if (!template) {
      throw new BadRequestError(`Template not found: ${id}`);
    }

    res.json({
      success: true,
      data: template,
    });
  })
);

// ===========================================
// User Plugin Management (Auth required)
// ===========================================

/**
 * GET /api/plugins/installed
 *
 * List user's installed plugins (personal workspace)
 *
 * @returns {SafeUserPlugin[]} User's installed plugins
 */
pluginRouter.get(
  "/installed",
  requireAuth,
  asyncHandler(async (req: Request, res: Response<ApiResponse<SafeUserPlugin[]>>) => {
    const ctx = getPersonalContext(req);
    const plugins = await pluginService.getUserPlugins(ctx);
    res.json({ success: true, data: plugins });
  })
);

/**
 * GET /api/plugins/health
 *
 * Get health status for all enabled plugins in the user's workspace.
 */
pluginRouter.get(
  "/health",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const ctx = getPersonalContext(req);
    const health = await pluginService.getPluginHealth(ctx);
    res.json({ success: true, data: health });
  })
);

/**
 * GET /api/plugins/storage-stats
 *
 * Get per-plugin KV storage usage from the running container.
 */
pluginRouter.get(
  "/storage-stats",
  requireAuth,
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const ctx = getPersonalContext(req);
    const stats = await pluginService.getStorageStats(ctx);
    res.json({ success: true, data: stats });
  })
);

/**
 * POST /api/plugins/install
 *
 * Install a plugin for the current user
 *
 * @body {string} slug - Slug of the plugin to install
 * @body {object} [config] - Plugin configuration
 * @body {string} [gatewayId] - Gateway to bind the plugin to
 * @returns {SafeUserPlugin} Installed plugin
 */
pluginRouter.post(
  "/install",
  requireAuth,
  asyncHandler(async (req: Request, res: Response<ApiResponse<SafeUserPlugin>>) => {
    const ctx = getPersonalContext(req);
    const parseResult = installPluginSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError("Invalid install data", formatZodErrors(parseResult.error));
    }
    const userPlugin = await pluginService.installPlugin(ctx, parseResult.data);
    res.status(201).json({ success: true, data: userPlugin });
  })
);

// ===========================================
// Custom Plugin CRUD (Auth required)
// ===========================================

/**
 * GET /api/plugins/custom/:id
 *
 * Get a custom plugin's full details including code.
 *
 * @param {string} id - Plugin ID (the catalog Plugin record)
 * @returns {PluginDefinition & { code: string }} Full plugin data with code
 */
pluginRouter.get(
  "/custom/:id",
  requireAuth,
  asyncHandler(async (req: Request, res: Response<ApiResponse<PluginDefinition & { code: string }>>) => {
    const ctx = getPersonalContext(req);
    const id = getPathParam(req, "id");
    const plugin = await pluginService.getCustomPlugin(ctx, id);
    res.json({ success: true, data: plugin });
  })
);

/**
 * POST /api/plugins/custom
 *
 * Create a custom (user-authored) plugin
 */
pluginRouter.post(
  "/custom",
  requireAuth,
  asyncHandler(async (req: Request, res: Response<ApiResponse<SafeUserPlugin>>) => {
    const ctx = getPersonalContext(req);
    const parseResult = createCustomPluginSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError("Invalid custom plugin data", formatZodErrors(parseResult.error));
    }
    const userPlugin = await pluginService.createCustomPlugin(ctx, parseResult.data as CreateCustomPluginRequest);
    res.status(201).json({ success: true, data: userPlugin });
  })
);

/**
 * PUT /api/plugins/custom/:id
 *
 * Update a custom plugin (code, name, description, etc.)
 *
 * @param {string} id - Plugin ID (the catalog Plugin record, not UserPlugin)
 */
pluginRouter.put(
  "/custom/:id",
  requireAuth,
  asyncHandler(async (req: Request, res: Response<ApiResponse<PluginDefinition>>) => {
    const ctx = getPersonalContext(req);
    const id = getPathParam(req, "id");
    const parseResult = updateCustomPluginSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError("Invalid update data", formatZodErrors(parseResult.error));
    }
    const plugin = await pluginService.updateCustomPlugin(ctx, id, parseResult.data as UpdateCustomPluginRequest);
    res.json({ success: true, data: plugin });
  })
);

/**
 * DELETE /api/plugins/custom/:id
 *
 * Delete a custom plugin (removes catalog entry + all installations)
 *
 * @param {string} id - Plugin ID (the catalog Plugin record, not UserPlugin)
 */
pluginRouter.delete(
  "/custom/:id",
  requireAuth,
  asyncHandler(async (req: Request, res: Response<ApiResponse<null>>) => {
    const ctx = getPersonalContext(req);
    const id = getPathParam(req, "id");
    await pluginService.deleteCustomPlugin(ctx, id);
    res.json({ success: true, data: null });
  })
);

/**
 * POST /api/plugins/from-repo
 *
 * Create a plugin by cloning a Git repository into the workspace
 */
pluginRouter.post(
  "/from-repo",
  requireAuth,
  asyncHandler(async (req: Request, res: Response<ApiResponse<SafeUserPlugin>>) => {
    const ctx = getPersonalContext(req);
    const parseResult = createPluginFromRepoSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError("Invalid repo plugin data", formatZodErrors(parseResult.error));
    }
    const userPlugin = await pluginService.createPluginFromRepo(ctx, parseResult.data);
    res.status(201).json({ success: true, data: userPlugin });
  })
);

/**
 * POST /api/plugins/register-dir
 *
 * Register an existing workspace directory as a plugin.
 */
pluginRouter.post(
  "/register-dir",
  requireAuth,
  asyncHandler(async (req: Request, res: Response<ApiResponse<SafeUserPlugin>>) => {
    const ctx = getPersonalContext(req);
    const parseResult = registerDirectoryAsPluginSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError("Invalid register directory data", formatZodErrors(parseResult.error));
    }
    const userPlugin = await pluginService.registerDirectoryAsPlugin(ctx, parseResult.data);
    res.status(201).json({ success: true, data: userPlugin });
  })
);

// ===========================================
// Installed Plugin Instance Operations (Auth required)
// ===========================================

/**
 * GET /api/plugins/installed/:id
 *
 * Get a specific user plugin by ID
 *
 * @param {string} id - UserPlugin ID
 * @returns {SafeUserPlugin} User plugin details
 */
pluginRouter.get(
  "/installed/:id",
  requireAuth,
  asyncHandler(async (req: Request, res: Response<ApiResponse<SafeUserPlugin>>) => {
    const ctx = getPersonalContext(req);
    const id = getPathParam(req, "id");
    const userPlugin = await pluginService.getUserPluginById(ctx, id);
    res.json({ success: true, data: userPlugin });
  })
);

/**
 * DELETE /api/plugins/installed/:id
 *
 * Uninstall a plugin
 *
 * @param {string} id - UserPlugin ID
 */
pluginRouter.delete(
  "/installed/:id",
  requireAuth,
  asyncHandler(async (req: Request, res: Response<ApiResponse<null>>) => {
    const ctx = getPersonalContext(req);
    const id = getPathParam(req, "id");
    await pluginService.uninstallPlugin(ctx, id);
    res.json({ success: true, data: null });
  })
);

/**
 * PUT /api/plugins/installed/:id/config
 *
 * Update plugin configuration
 *
 * @param {string} id - UserPlugin ID
 * @body {object} config - New plugin configuration
 * @returns {SafeUserPlugin} Updated plugin
 */
pluginRouter.put(
  "/installed/:id/config",
  requireAuth,
  asyncHandler(async (req: Request, res: Response<ApiResponse<SafeUserPlugin>>) => {
    const ctx = getPersonalContext(req);
    const id = getPathParam(req, "id");
    const parseResult = updatePluginConfigSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError("Invalid config data", formatZodErrors(parseResult.error));
    }
    const userPlugin = await pluginService.updatePluginConfig(ctx, id, parseResult.data);
    res.json({ success: true, data: userPlugin });
  })
);

/**
 * POST /api/plugins/installed/:id/toggle
 *
 * Enable or disable a plugin
 *
 * @param {string} id - UserPlugin ID
 * @body {boolean} enabled - Enable or disable the plugin
 * @returns {SafeUserPlugin} Updated plugin
 */
pluginRouter.post(
  "/installed/:id/toggle",
  requireAuth,
  asyncHandler(async (req: Request, res: Response<ApiResponse<SafeUserPlugin>>) => {
    const ctx = getPersonalContext(req);
    const id = getPathParam(req, "id");
    const parseResult = togglePluginSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError("Invalid toggle data", formatZodErrors(parseResult.error));
    }
    const userPlugin = await pluginService.togglePlugin(ctx, id, parseResult.data.enabled);
    res.json({ success: true, data: userPlugin });
  })
);

// ===========================================
// Analytics Plugin Data (Auth required)
// ===========================================

/**
 * GET /api/plugins/installed/:id/analytics
 *
 * Get analytics data for an analytics plugin installation
 *
 * @param {string} id - UserPlugin ID (must be analytics plugin)
 * @returns {AnalyticsSummary} Analytics summary data
 */
pluginRouter.get(
  "/installed/:id/analytics",
  requireAuth,
  asyncHandler(async (req: Request, res: Response<ApiResponse<AnalyticsSummary>>) => {
    const ctx = getPersonalContext(req);
    const id = getPathParam(req, "id");

    const userPlugin = await pluginService.getUserPluginById(ctx, id);

    if (userPlugin.pluginSlug !== "analytics") {
      throw new BadRequestError("This endpoint is only for analytics plugins");
    }

    // Get analytics data — try container-based plugin storage first,
    // fall back to legacy server-side analytics storage
    const pluginPrefix = `plugin:${userPlugin.id}:`;
    const totalMessages = await redis.get(`${pluginPrefix}stats:totalMessages`);

    let summary: AnalyticsSummary;

    if (totalMessages !== null) {
      // Container-based format — read from plugin SDK storage
      const dailyKeys: string[] = [];
      const hourlyKeys: string[] = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        dailyKeys.push(`${pluginPrefix}stats:daily:${d.toISOString().slice(0, 10)}`);
      }
      for (let i = 0; i < 24; i++) {
        const d = new Date();
        d.setHours(d.getHours() - i);
        hourlyKeys.push(`${pluginPrefix}stats:hourly:${d.toISOString().slice(0, 13)}`);
      }

      const allTimeKeys = [...dailyKeys, ...hourlyKeys];
      const allTimeValues = allTimeKeys.length > 0 ? await redis.mget(...allTimeKeys) : [];
      const dailyValues = allTimeValues.slice(0, dailyKeys.length);
      const hourlyValues = allTimeValues.slice(dailyKeys.length);
      const todayMessages = dailyValues[0] || "0";

      const scanKeys = async (pattern: string, maxResults = 100): Promise<string[]> => {
        const results: string[] = [];
        let cursor = "0";
        do {
          const [nextCursor, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
          cursor = nextCursor;
          results.push(...keys);
          if (results.length >= maxResults) break;
        } while (cursor !== "0");
        return results.slice(0, maxResults);
      };

      const [userKeys, chatKeys] = await Promise.all([
        scanKeys(`${pluginPrefix}userIndex:*`),
        scanKeys(`${pluginPrefix}chatIndex:*`),
      ]);

      const dailyStats = dailyKeys.map((key, i) => ({
        date: key.replace(`${pluginPrefix}stats:daily:`, ""),
        messagesReceived: parseInt(dailyValues[i] || "0", 10),
        messagesSent: 0,
        uniqueUsers: 0,
        userIds: [],
      }));

      const hourlyStats = hourlyKeys.map((key, i) => ({
        hour: key.replace(`${pluginPrefix}stats:hourly:`, ""),
        messages: parseInt(hourlyValues[i] || "0", 10),
      }));

      const topUserDataKeys = userKeys.slice(0, 10).map((k) => {
        const uid = k.replace(`${pluginPrefix}userIndex:`, "");
        return `${pluginPrefix}user:${uid}`;
      });
      const topChatDataKeys = chatKeys.slice(0, 10).map((k) => {
        const cid = k.replace(`${pluginPrefix}chatIndex:`, "");
        return `${pluginPrefix}chat:${cid}`;
      });
      const [topUserDataValues, topChatDataValues] = await Promise.all([
        topUserDataKeys.length > 0 ? redis.mget(...topUserDataKeys) : Promise.resolve([]),
        topChatDataKeys.length > 0 ? redis.mget(...topChatDataKeys) : Promise.resolve([]),
      ]);

      const topUsers: Array<{ telegramUserId: number; username: string; firstName: string; messageCount: number }> = [];
      for (let i = 0; i < topUserDataKeys.length; i++) {
        const uid = userKeys[i]?.replace(`${pluginPrefix}userIndex:`, "") ?? "";
        const raw = topUserDataValues[i];
        if (raw) {
          try {
            const user = JSON.parse(raw);
            topUsers.push({
              telegramUserId: parseInt(uid, 10),
              username: user.username,
              firstName: user.username || "Unknown",
              messageCount: user.messageCount || 0,
            });
          } catch { /* ignore parse errors */ }
        }
      }
      topUsers.sort((a, b) => b.messageCount - a.messageCount);

      const topChats: Array<{ chatId: number; chatType: string; chatTitle: string; messageCount: number }> = [];
      for (let i = 0; i < topChatDataKeys.length; i++) {
        const cid = chatKeys[i]?.replace(`${pluginPrefix}chatIndex:`, "") ?? "";
        const raw = topChatDataValues[i];
        if (raw) {
          try {
            const chat = JSON.parse(raw);
            topChats.push({
              chatId: parseInt(cid, 10),
              chatType: "private",
              chatTitle: chat.title,
              messageCount: chat.messageCount || 0,
            });
          } catch { /* ignore parse errors */ }
        }
      }
      topChats.sort((a, b) => b.messageCount - a.messageCount);

      summary = {
        userPluginId: userPlugin.id,
        totals: {
          messagesReceived: parseInt(totalMessages, 10),
          messagesSent: 0,
          uniqueUsers: userKeys.length,
          uniqueChats: chatKeys.length,
        },
        today: {
          messages: parseInt(todayMessages, 10),
          uniqueUsers: 0,
        },
        dailyStats,
        hourlyStats,
        topUsers,
        topChats,
      };
    } else {
      // Legacy server-side format
      const storage = createAnalyticsStorage(
        userPlugin.id,
        userPlugin.config as Record<string, unknown>
      );
      summary = await storage.getSummary();
    }

    res.json({ success: true, data: summary });
  })
);

// ===========================================
// Plugin By Slug (Public - MUST BE LAST)
// ===========================================

/**
 * GET /api/plugins/:slug
 *
 * Get a specific plugin by slug.
 * This route uses a catch-all param so it MUST be registered
 * after all literal path routes above.
 *
 * @param {string} slug - Plugin slug (unique identifier)
 * @returns {PluginDefinition} Full plugin definition
 */
pluginRouter.get(
  "/:slug",
  asyncHandler(async (req: Request, res: Response<ApiResponse<PluginDefinition>>) => {
    const slug = getPathParam(req, "slug");
    const plugin = await pluginService.getPluginBySlug(slug);
    res.json({ success: true, data: plugin });
  })
);
