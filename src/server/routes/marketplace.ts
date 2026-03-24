/**
 * Marketplace Routes
 *
 * REST API endpoints for the unified marketplace store.
 * Reads plugin bundles from the filesystem via MarketplaceLoader,
 * enriched with DB stats (install counts, ratings).
 *
 * Route structure:
 *   GET  /                     - Browse/search marketplace items
 *   GET  /featured             - Featured/popular items
 *   GET  /categories           - Category list with counts
 *   GET  /reviews/:pluginSlug  - Get reviews for a plugin
 *   GET  /reviews/:pluginSlug/summary - Rating summary
 *   POST /reviews/:pluginSlug  - Submit a review (auth required)
 *   PUT  /reviews/:reviewId    - Update a review (auth required)
 *   DELETE /reviews/:reviewId  - Delete a review (auth required)
 *   GET  /:slug                - Item detail by slug
 *
 * @module server/routes/marketplace
 */

import { Router, type Request, type Response } from "express";

import { prisma } from "@/lib/prisma";
import { getMarketplaceService, getReviewService } from "@/modules/marketplace";
import type {
    MarketplaceSearchOptions,
    PluginDifficulty,
} from "@/modules/marketplace/marketplace.types";
import type { ApiResponse, PaginatedResponse } from "@/shared/types";

import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../middleware/error-handler";

export const marketplaceRouter = Router();

function getService() {
  return getMarketplaceService(prisma);
}

function getReviews() {
  return getReviewService(prisma);
}

// ===========================================
// Public Routes (no auth required)
// ===========================================

/**
 * GET /marketplace
 * Browse/search marketplace items with filtering and pagination.
 *
 * Query params: type, category, search, tags, difficulty, sort, page, limit
 */
marketplaceRouter.get(
  "/",
  asyncHandler(async (req: Request, res: Response) => {
    const {
      type,
      category,
      search,
      tags,
      difficulty,
      sort,
      page,
      limit,
    } = req.query;

    const options: MarketplaceSearchOptions = {
      type: (type as string) === "plugin" || (type as string) === "theme" || (type as string) === "widget"
        ? (type as MarketplaceSearchOptions["type"])
        : "plugin",
      category: category as string | undefined,
      search: search as string | undefined,
      tags: tags ? (Array.isArray(tags) ? tags as string[] : [tags as string]) : undefined,
      difficulty: difficulty as PluginDifficulty | undefined,
      sort: (sort as MarketplaceSearchOptions["sort"]) ?? "popular",
      page: page ? parseInt(page as string, 10) : 1,
      limit: limit ? Math.min(parseInt(limit as string, 10), 50) : 20,
    };

    const result = await getService().searchItems(options);
    const totalPages = Math.ceil(result.total / result.limit);

    const response: PaginatedResponse<typeof result.items[number]> = {
      success: true,
      data: result.items,
      meta: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages,
        hasNext: result.page < totalPages,
        hasPrev: result.page > 1,
      },
    };

    res.json(response);
  })
);

/**
 * GET /marketplace/featured
 * Get featured/popular marketplace items.
 */
marketplaceRouter.get(
  "/featured",
  asyncHandler(async (_req: Request, res: Response) => {
    const items = await getService().getFeaturedItems(6);

    const response: ApiResponse<typeof items> = {
      success: true,
      data: items,
    };

    res.json(response);
  })
);

/**
 * GET /marketplace/categories
 * Get all categories with item counts.
 */
marketplaceRouter.get(
  "/categories",
  asyncHandler(async (_req: Request, res: Response) => {
    const categories = getService().getCategories();

    const response: ApiResponse<typeof categories> = {
      success: true,
      data: categories,
    };

    res.json(response);
  })
);

// ===========================================
// Review Routes
// ===========================================

/**
 * GET /marketplace/reviews/:pluginSlug
 * Get reviews for a plugin by slug.
 */
marketplaceRouter.get(
  "/reviews/:pluginSlug",
  asyncHandler(async (req: Request, res: Response) => {
    const pluginSlug = req.params.pluginSlug as string;
    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
    const limit = req.query.limit ? Math.min(parseInt(req.query.limit as string, 10), 50) : 10;

    // Resolve slug → plugin ID
    const plugin = await prisma.plugin.findUnique({
      where: { slug: pluginSlug },
      select: { id: true },
    });
    if (!plugin) {
      res.status(404).json({ success: false, error: "Plugin not found" });
      return;
    }

    const result = await getReviews().getPluginReviews(plugin.id, page, limit);

    res.json({
      success: true,
      data: result.reviews,
      meta: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / result.limit),
        hasNext: result.page * result.limit < result.total,
        hasPrev: result.page > 1,
      },
    });
  })
);

/**
 * GET /marketplace/reviews/:pluginSlug/summary
 * Get rating summary (distribution + average) for a plugin.
 */
marketplaceRouter.get(
  "/reviews/:pluginSlug/summary",
  asyncHandler(async (req: Request, res: Response) => {
    const pluginSlug = req.params.pluginSlug as string;

    const plugin = await prisma.plugin.findUnique({
      where: { slug: pluginSlug },
      select: { id: true },
    });
    if (!plugin) {
      res.status(404).json({ success: false, error: "Plugin not found" });
      return;
    }

    const summary = await getReviews().getReviewSummary(plugin.id);

    res.json({ success: true, data: summary });
  })
);

/**
 * GET /marketplace/reviews/:pluginSlug/mine
 * Get the current user's review for a plugin (auth required).
 */
marketplaceRouter.get(
  "/reviews/:pluginSlug/mine",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const pluginSlug = req.params.pluginSlug as string;
    const userId = (req as unknown as { user: { userId: string } }).user.userId;

    const plugin = await prisma.plugin.findUnique({
      where: { slug: pluginSlug },
      select: { id: true },
    });
    if (!plugin) {
      res.status(404).json({ success: false, error: "Plugin not found" });
      return;
    }

    const review = await getReviews().getUserReview(userId, plugin.id);

    res.json({ success: true, data: review });
  })
);

/**
 * POST /marketplace/reviews/:pluginSlug
 * Submit or update a review for a plugin (auth required).
 */
marketplaceRouter.post(
  "/reviews/:pluginSlug",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const pluginSlug = req.params.pluginSlug as string;
    const userId = (req as unknown as { user: { userId: string } }).user.userId;
    const { rating, title, content } = req.body;

    if (!rating || typeof rating !== "number") {
      res.status(400).json({ success: false, error: "Rating is required (1-5)" });
      return;
    }

    const plugin = await prisma.plugin.findUnique({
      where: { slug: pluginSlug },
      select: { id: true },
    });
    if (!plugin) {
      res.status(404).json({ success: false, error: "Plugin not found" });
      return;
    }

    const review = await getReviews().submitReview({
      userId,
      pluginId: plugin.id,
      rating,
      title,
      content,
    });

    res.status(201).json({ success: true, data: review });
  })
);

/**
 * PUT /marketplace/reviews/:reviewId
 * Update own review (auth required).
 */
marketplaceRouter.put(
  "/reviews/:reviewId",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const reviewId = req.params.reviewId as string;
    const userId = (req as unknown as { user: { userId: string } }).user.userId;
    const { rating, title, content } = req.body;

    const updated = await getReviews().updateReview(reviewId, userId, {
      rating,
      title,
      content,
    });

    res.json({ success: true, data: updated });
  })
);

/**
 * DELETE /marketplace/reviews/:reviewId
 * Delete own review (auth required).
 */
marketplaceRouter.delete(
  "/reviews/:reviewId",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const reviewId = req.params.reviewId as string;
    const userId = (req as unknown as { user: { userId: string } }).user.userId;

    await getReviews().deleteReview(reviewId, userId);

    res.json({ success: true });
  })
);

/**
 * GET /marketplace/:slug
 * Get a specific marketplace item by slug.
 */
marketplaceRouter.get(
  "/:slug",
  asyncHandler(async (req: Request, res: Response) => {
    const slug = req.params.slug as string;
    if (!slug) {
      res.status(400).json({ success: false, error: "Missing slug parameter" });
      return;
    }

    const item = await getService().getItemBySlug(slug);
    if (!item) {
      res.status(404).json({ success: false, error: "Item not found" });
      return;
    }

    const response: ApiResponse<typeof item> = {
      success: true,
      data: item,
    };

    res.json(response);
  })
);
