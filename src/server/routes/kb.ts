/**
 * Knowledge Base Routes (Public)
 *
 * Public API endpoints for KB articles.
 * No auth required for reading published articles.
 * 
 * Routes:
 * - GET  /kb/articles          - List published articles
 * - GET  /kb/articles/:slug    - Get article by slug
 * - GET  /kb/search            - Search articles
 * - POST /kb/articles/:id/view - Increment view count
 * - POST /kb/articles/:id/feedback - Record helpful/not helpful
 *
 * @module server/routes/kb
 */

import {
    kbFeedbackSchema,
    kbListSchema,
    kbSearchSchema, kbService
} from "@/modules/support";
import type { ApiResponse } from "@/shared/types";
import { Router, type Request, type Response } from "express";
import { asyncHandler } from "../middleware/error-handler";

export const kbRouter = Router();

// ===========================================
// GET /kb/articles - List published articles
// ===========================================
kbRouter.get(
  "/articles",
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const filters = kbListSchema.parse(req.query);
    const result = await kbService.getPublishedArticles(filters);

    res.json({
      success: true,
      data: result,
    });
  })
);

// ===========================================
// GET /kb/search - Search published articles
// ===========================================
kbRouter.get(
  "/search",
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const { q, category, limit } = kbSearchSchema.parse(req.query);
    const articles = await kbService.searchArticles(q, { category, limit });

    res.json({
      success: true,
      data: { articles },
    });
  })
);

// ===========================================
// GET /kb/articles/:slug - Get article by slug
// ===========================================
kbRouter.get(
  "/articles/:slug",
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const { slug } = req.params;
    const article = await kbService.getArticleBySlug(slug as string);

    if (!article) {
      res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Article not found" },
      });
      return;
    }

    res.json({
      success: true,
      data: article,
    });
  })
);

// ===========================================
// POST /kb/articles/:id/view - Increment view count
// ===========================================
kbRouter.post(
  "/articles/:id/view",
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const { id } = req.params;
    await kbService.incrementViewCount(id as string);

    res.json({
      success: true,
      data: { message: "View recorded" },
    });
  })
);

// ===========================================
// POST /kb/articles/:id/feedback - Record feedback
// ===========================================
kbRouter.post(
  "/articles/:id/feedback",
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const { id } = req.params;
    const { helpful } = kbFeedbackSchema.parse(req.body);
    await kbService.recordFeedback(id as string, helpful);

    res.json({
      success: true,
      data: { message: "Feedback recorded" },
    });
  })
);
