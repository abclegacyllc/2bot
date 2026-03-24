/**
 * Admin Marketplace Routes
 *
 * CRUD endpoints for managing marketplace items (plugins, themes, widgets).
 * Requires ADMIN or SUPER_ADMIN role.
 *
 * Route structure:
 *   GET    /admin/marketplace/stats                - Marketplace statistics
 *   GET    /admin/marketplace/items                - List all marketplace items
 *   GET    /admin/marketplace/items/:slug          - Get item detail
 *   POST   /admin/marketplace/items                - Create/upload new item
 *   PUT    /admin/marketplace/items/:slug          - Update item metadata
 *   DELETE /admin/marketplace/items/:slug          - Delist (soft-delete) item
 *   POST   /admin/marketplace/items/:slug/feature  - Toggle featured status
 *   POST   /admin/marketplace/items/:slug/publish  - Toggle published status
 *
 * @module server/routes/admin-marketplace
 */

import * as fs from "fs";
import * as path from "path";

import { prisma } from "@/lib/prisma";
import { marketplaceLoader } from "@/modules/marketplace/marketplace-loader.service";
import type { PluginManifest } from "@/modules/marketplace/marketplace.types";
import { BadRequestError } from "@/shared/errors";
import type { ApiResponse } from "@/shared/types";
import type { Request, Response } from "express";
import { Router } from "express";
import { asyncHandler } from "../middleware/error-handler";
import { requirePermission } from "../middleware/role";

export const adminMarketplaceRouter = Router();

// ===========================================
// READ ROUTES
// ===========================================

/**
 * GET /admin/marketplace/stats
 * Marketplace overview statistics.
 */
adminMarketplaceRouter.get(
  "/stats",
  requirePermission("admin:marketplace:read"),
  asyncHandler(async (_req: Request, res: Response<ApiResponse>) => {
    const [totalPlugins, activePlugins, totalInstalls, featuredCount] =
      await Promise.all([
        prisma.plugin.count({ where: { isBuiltin: true } }),
        prisma.plugin.count({ where: { isBuiltin: true, isActive: true } }),
        prisma.userPlugin.count(),
        prisma.plugin.count({
          where: { isBuiltin: true, isActive: true, isFeatured: true },
        }),
      ]);

    res.json({
      success: true,
      data: {
        totalPlugins,
        activePlugins,
        totalInstalls,
        featuredCount,
        categories: marketplaceLoader.getCategories(),
      },
    });
  }),
);

/**
 * GET /admin/marketplace/items
 * List all marketplace items with admin-level detail.
 */
adminMarketplaceRouter.get(
  "/items",
  requirePermission("admin:marketplace:read"),
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(
      100,
      Math.max(1, parseInt(req.query.limit as string, 10) || 20),
    );
    const search = (req.query.search as string) || "";
    const category = req.query.category as string | undefined;

    // Get all manifests from filesystem
    const manifestMap = marketplaceLoader.getAllManifests();

    // Get DB records for install counts and status
    const dbPlugins = await prisma.plugin.findMany({
      where: { isBuiltin: true },
      include: { _count: { select: { userPlugins: true } } },
    });

    const dbBySlug = new Map(dbPlugins.map((p) => [p.slug, p]));

    // Merge manifests with DB data
    let items = Array.from(manifestMap.values()).map(({ manifest, bundlePath }) => {
      const db = dbBySlug.get(manifest.slug);
      return {
        slug: manifest.slug,
        name: manifest.name,
        version: manifest.version,
        description: manifest.description,
        category: manifest.category,
        difficulty: manifest.difficulty,
        icon: manifest.icon,
        tags: manifest.tags || [],
        layout: manifest.layout,
        requiredGateways: manifest.requiredGateways || [],
        bundlePath,
        isActive: db?.isActive ?? false,
        isFeatured: db?.isFeatured ?? false,
        isSeeded: !!db,
        dbId: db?.id || null,
        installCount: db?._count.userPlugins ?? 0,
        createdAt: db?.createdAt || null,
        updatedAt: db?.updatedAt || null,
      };
    });

    // Apply filters
    if (search) {
      const lower = search.toLowerCase();
      items = items.filter(
        (i) =>
          i.name.toLowerCase().includes(lower) ||
          i.slug.toLowerCase().includes(lower) ||
          i.description.toLowerCase().includes(lower),
      );
    }
    if (category) {
      items = items.filter((i) => i.category === category);
    }

    const total = items.length;
    const totalPages = Math.ceil(total / limit);
    const paged = items.slice((page - 1) * limit, page * limit);

    res.json({
      success: true,
      data: {
        items: paged,
        pagination: { page, limit, total, totalPages },
      },
    });
  }),
);

/**
 * GET /admin/marketplace/items/:slug
 * Get detailed admin view of a single marketplace item.
 */
adminMarketplaceRouter.get(
  "/items/:slug",
  requirePermission("admin:marketplace:read"),
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const slug = req.params.slug as string;

    const manifest = marketplaceLoader.getManifestBySlug(slug);
    if (!manifest) {
      res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Item not found" } });
      return;
    }

    const dbPlugin = await prisma.plugin.findFirst({
      where: { slug, isBuiltin: true },
      include: { _count: { select: { userPlugins: true } } },
    });

    res.json({
      success: true,
      data: {
        manifest,
        dbRecord: dbPlugin
          ? {
              id: dbPlugin.id,
              isActive: dbPlugin.isActive,
              isFeatured: dbPlugin.isFeatured,
              bundlePath: dbPlugin.bundlePath,
              installCount: dbPlugin._count.userPlugins,
              createdAt: dbPlugin.createdAt,
              updatedAt: dbPlugin.updatedAt,
            }
          : null,
      },
    });
  }),
);

// ===========================================
// WRITE ROUTES
// ===========================================

/**
 * POST /admin/marketplace/items
 * Create a new marketplace item from uploaded manifest + code.
 * Writes files to marketplace/plugins/{slug}/{version}/ directory.
 */
adminMarketplaceRouter.post(
  "/items",
  requirePermission("admin:marketplace:write"),
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const { manifest, code, files } = req.body as {
      manifest: Partial<PluginManifest> & { slug: string };
      code?: string;
      files?: Record<string, string>;
    };

    if (!manifest) {
      throw new BadRequestError("manifest is required");
    }

    const slug = manifest.slug;
    const version = manifest.version || "1.0.0";
    if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
      throw new BadRequestError(
        "Invalid slug — must be lowercase alphanumeric with hyphens",
      );
    }

    // Determine layout
    const layout = files ? "directory" : "single";
    if (layout === "single" && !code) {
      throw new BadRequestError(
        "Single-file plugins require a 'code' field with the source code",
      );
    }

    // Write bundle to filesystem
    const bundleDir = path.join(
      process.cwd(),
      "marketplace",
      "plugins",
      slug,
      version,
    );
    fs.mkdirSync(bundleDir, { recursive: true });

    // Build complete manifest
    const fullManifest = {
      slug,
      name: manifest.name || slug,
      version,
      description: manifest.description || "",
      category: manifest.category || "general",
      requiredGateways: manifest.requiredGateways || [],
      tags: manifest.tags || [],
      difficulty: manifest.difficulty || "beginner",
      configSchema: manifest.configSchema || {},
      entryFile: layout === "single" ? "code.js" : (manifest.entryFile || "index.js"),
      layout,
      icon: manifest.icon || "puzzle",
      author: manifest.author || "2bot",
      isBuiltin: true,
      eventTypes: manifest.eventTypes || [],
      eventRole: manifest.eventRole || "responder",
    };

    // Write plugin.json manifest
    fs.writeFileSync(
      path.join(bundleDir, "plugin.json"),
      JSON.stringify(fullManifest, null, 2),
    );

    // Write code file(s)
    if (layout === "single" && code) {
      fs.writeFileSync(path.join(bundleDir, "code.js"), code);
    } else if (files) {
      for (const [filePath, content] of Object.entries(files)) {
        // Prevent directory traversal
        const normalizedPath = path.normalize(filePath);
        if (normalizedPath.startsWith("..") || path.isAbsolute(normalizedPath)) {
          throw new BadRequestError(`Invalid file path: ${filePath}`);
        }
        const targetPath = path.join(bundleDir, normalizedPath);
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        fs.writeFileSync(targetPath, content);
      }
    }

    // Create/update DB record
    const bundlePath = `plugins/${slug}/${version}`;
    const dbPlugin = await prisma.plugin.upsert({
      where: { slug },
      update: {
        name: fullManifest.name,
        description: fullManifest.description,
        category: fullManifest.category,
        bundlePath,
        isActive: true,
      },
      create: {
        slug,
        name: fullManifest.name,
        description: fullManifest.description,
        category: fullManifest.category,
        isBuiltin: true,
        isActive: true,
        bundlePath,
      },
    });

    // Invalidate loader cache
    marketplaceLoader.invalidateCache();

    res.status(201).json({
      success: true,
      data: {
        slug,
        version,
        bundlePath,
        dbId: dbPlugin.id,
      },
    });
  }),
);

/**
 * PUT /admin/marketplace/items/:slug
 * Update marketplace item metadata (manifest fields + DB flags).
 */
adminMarketplaceRouter.put(
  "/items/:slug",
  requirePermission("admin:marketplace:write"),
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const slug = req.params.slug as string;
    const updates = req.body as {
      name?: string;
      description?: string;
      category?: string;
      tags?: string[];
      icon?: string;
      difficulty?: string;
      isFeatured?: boolean;
      isActive?: boolean;
    };

    const dbPlugin = await prisma.plugin.findFirst({
      where: { slug, isBuiltin: true },
    });

    if (!dbPlugin) {
      res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Plugin not found in DB" } });
      return;
    }

    const dbUpdates: Record<string, unknown> = {};
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.description !== undefined)
      dbUpdates.description = updates.description;
    if (updates.category !== undefined) dbUpdates.category = updates.category;
    if (updates.isFeatured !== undefined)
      dbUpdates.isFeatured = updates.isFeatured;
    if (updates.isActive !== undefined) dbUpdates.isActive = updates.isActive;

    const updated = await prisma.plugin.update({
      where: { id: dbPlugin.id },
      data: dbUpdates,
    });

    // Also update the manifest file on disk if metadata changed
    const bPath = marketplaceLoader.getBundlePath(slug);
    if (bPath) {
      const manifestPath = path.join(
        process.cwd(),
        "marketplace",
        bPath,
        "plugin.json",
      );
      if (fs.existsSync(manifestPath)) {
        const existing = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
        if (updates.name !== undefined) existing.name = updates.name;
        if (updates.description !== undefined)
          existing.description = updates.description;
        if (updates.category !== undefined)
          existing.category = updates.category;
        if (updates.tags !== undefined) existing.tags = updates.tags;
        if (updates.icon !== undefined) existing.icon = updates.icon;
        if (updates.difficulty !== undefined)
          existing.difficulty = updates.difficulty;
        fs.writeFileSync(manifestPath, JSON.stringify(existing, null, 2));
      }
    }

    marketplaceLoader.invalidateCache();

    res.json({
      success: true,
      data: {
        slug: updated.slug,
        name: updated.name,
        isActive: updated.isActive,
        isFeatured: updated.isFeatured,
      },
    });
  }),
);

/**
 * POST /admin/marketplace/items/:slug/feature
 * Toggle featured status for a marketplace item.
 */
adminMarketplaceRouter.post(
  "/items/:slug/feature",
  requirePermission("marketplace:feature"),
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const slug = req.params.slug as string;

    const dbPlugin = await prisma.plugin.findFirst({
      where: { slug, isBuiltin: true },
    });

    if (!dbPlugin) {
      res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Plugin not found" } });
      return;
    }

    const updated = await prisma.plugin.update({
      where: { id: dbPlugin.id },
      data: { isFeatured: !dbPlugin.isFeatured },
    });

    res.json({
      success: true,
      data: {
        slug: updated.slug,
        isFeatured: updated.isFeatured,
      },
    });
  }),
);

/**
 * POST /admin/marketplace/items/:slug/publish
 * Toggle published (active) status for a marketplace item.
 */
adminMarketplaceRouter.post(
  "/items/:slug/publish",
  requirePermission("admin:marketplace:write"),
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const slug = req.params.slug as string;

    const dbPlugin = await prisma.plugin.findFirst({
      where: { slug, isBuiltin: true },
    });

    if (!dbPlugin) {
      res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Plugin not found" } });
      return;
    }

    const updated = await prisma.plugin.update({
      where: { id: dbPlugin.id },
      data: { isActive: !dbPlugin.isActive },
    });

    res.json({
      success: true,
      data: {
        slug: updated.slug,
        isActive: updated.isActive,
      },
    });
  }),
);

/**
 * DELETE /admin/marketplace/items/:slug
 * Delist a marketplace item (soft-delete: sets isActive=false).
 * Does NOT remove filesystem files.
 */
adminMarketplaceRouter.delete(
  "/items/:slug",
  requirePermission("admin:marketplace:delete"),
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const slug = req.params.slug as string;

    const dbPlugin = await prisma.plugin.findFirst({
      where: { slug, isBuiltin: true },
    });

    if (!dbPlugin) {
      res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Plugin not found" } });
      return;
    }

    await prisma.plugin.update({
      where: { id: dbPlugin.id },
      data: { isActive: false },
    });

    res.json({ success: true, data: { slug, delisted: true } });
  }),
);
