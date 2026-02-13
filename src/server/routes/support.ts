/**
 * Support Routes
 *
 * AI-powered support chat endpoint and admin support management.
 * 
 * User routes (require auth):
 * - POST /support/chat          - AI support chat (uses 2bot-ai internally)
 * - GET  /support/quick-issues  - Get quick issue templates
 * 
 * Admin routes (require support:* permissions):
 * - GET    /support/admin/stats                  - Support stats
 * - GET    /support/admin/ai-costs               - AI support cost tracking
 * - GET    /support/admin/tickets                - All tickets with filters
 * - GET    /support/admin/tickets/:id            - Ticket detail (includes internal notes)
 * - PUT    /support/admin/tickets/:id/status     - Update ticket status
 * - POST   /support/admin/tickets/:id/assign     - Assign ticket
 * - POST   /support/admin/tickets/:id/resolve    - Resolve ticket
 * - POST   /support/admin/tickets/:id/reply      - Reply to ticket (visible to user)
 * - POST   /support/admin/tickets/:id/internal   - Internal note (hidden from user)
 * - POST   /support/admin/tickets/:id/link-article - Link KB article
 * - GET    /support/admin/kb                     - All KB articles (admin)
 * - POST   /support/admin/kb                     - Create KB article
 * - GET    /support/admin/kb/:id                 - Get KB article by ID
 * - PUT    /support/admin/kb/:id                 - Update KB article
 * - DELETE /support/admin/kb/:id                 - Delete KB article
 * - POST   /support/admin/kb/:id/publish         - Publish article
 * - POST   /support/admin/kb/:id/unpublish       - Unpublish article
 *
 * @module server/routes/support
 */

import { prisma } from "@/lib/prisma";
import {
    addInternalNoteSchema,
    addTicketMessageSchema,
    assignTicketSchema,
    createKBArticleSchema,
    kbListSchema,
    kbService,
    resolveTicketSchema,
    supportAICostService,
    supportAIService,
    supportChatSchema,
    ticketListSchema,
    ticketService,
    updateKBArticleSchema,
    updateTicketStatusSchema,
} from "@/modules/support";
import type { ApiResponse } from "@/shared/types";
import { Router, type Request, type Response } from "express";
import { BadRequestError } from "@/shared/errors";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../middleware/error-handler";
import { requirePermission } from "../middleware/role";

export const supportRouter = Router();

// ===========================================
// USER ROUTES (require auth)
// ===========================================

/**
 * POST /support/chat - AI-powered support chat
 * Uses 2bot-ai-provider internally (not user credits — platform-funded)
 */
supportRouter.post(
  "/chat",
  requireAuth,
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const input = supportChatSchema.parse(req.body);
    
    if (!req.user) throw new BadRequestError("Not authenticated");
    // Determine if user can create tickets based on plan
    const userPlan = req.user.plan;
    const TICKET_PLANS = ["PRO", "BUSINESS", "ENTERPRISE"];
    const TICKET_ORG_PLANS = ["ORG_PRO", "ORG_BUSINESS", "ORG_ENTERPRISE"];
    const orgPlan = req.body.orgPlan as string | undefined;
    const canCreateTickets = TICKET_PLANS.includes(userPlan) ||
      (orgPlan ? TICKET_ORG_PLANS.includes(orgPlan) : false);
    
    const result = await supportAIService.processSupportChat({
      ...input,
      userId: req.user.id,
      canCreateTickets,
    });

    res.json({
      success: true,
      data: result,
    });
  })
);

/**
 * GET /support/quick-issues - List active quick issue templates
 */
supportRouter.get(
  "/quick-issues",
  requireAuth,
  asyncHandler(async (_req: Request, res: Response<ApiResponse>) => {
    const quickIssues = await prisma.quickIssue.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
    });

    res.json({
      success: true,
      data: { quickIssues },
    });
  })
);

// ===========================================
// ADMIN ROUTES (require support permissions)
// ===========================================

const adminSupport = Router();
adminSupport.use(requireAuth);

// --- Stats ---

adminSupport.get(
  "/stats",
  requirePermission("support:tickets:read"),
  asyncHandler(async (_req: Request, res: Response<ApiResponse>) => {
    const stats = await ticketService.getSupportStats();
    const kbStats = await kbService.getAllArticles({ limit: 0 });

    res.json({
      success: true,
      data: {
        tickets: stats,
        articles: { total: kbStats.total },
      },
    });
  })
);

// --- AI Cost Stats ---

adminSupport.get(
  "/ai-costs",
  requirePermission("support:tickets:read"),
  asyncHandler(async (_req: Request, res: Response<ApiResponse>) => {
    const costSummary = await supportAICostService.getSupportAICostSummary();

    res.json({
      success: true,
      data: costSummary,
    });
  })
);

// --- Ticket Management ---

adminSupport.get(
  "/tickets",
  requirePermission("support:tickets:read"),
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const filters = ticketListSchema.parse(req.query);
    const result = await ticketService.getAllTickets(filters);

    res.json({
      success: true,
      data: result,
    });
  })
);

adminSupport.get(
  "/tickets/:id",
  requirePermission("support:tickets:read"),
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const { id } = req.params;
    const ticket = await ticketService.getTicketById(id as string);

    res.json({
      success: true,
      data: ticket,
    });
  })
);

adminSupport.put(
  "/tickets/:id/status",
  requirePermission("support:tickets:write"),
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const { id } = req.params;
    const { status } = updateTicketStatusSchema.parse(req.body);
    const ticket = await ticketService.updateTicketStatus(id as string, status);

    res.json({
      success: true,
      data: ticket,
    });
  })
);

adminSupport.post(
  "/tickets/:id/assign",
  requirePermission("support:tickets:assign"),
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const { id } = req.params;
    const { assigneeId } = assignTicketSchema.parse(req.body);
    const ticket = await ticketService.assignTicket(id as string, assigneeId);

    res.json({
      success: true,
      data: ticket,
    });
  })
);

adminSupport.post(
  "/tickets/:id/resolve",
  requirePermission("support:tickets:write"),
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const { id } = req.params;
    const { resolution } = resolveTicketSchema.parse(req.body);
    const ticket = await ticketService.resolveTicket(id as string, resolution);

    // TODO: Send email notification to user

    res.json({
      success: true,
      data: ticket,
    });
  })
);

adminSupport.post(
  "/tickets/:id/reply",
  requirePermission("support:tickets:write"),
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    if (!req.user) throw new BadRequestError("Not authenticated");
    const { id } = req.params;
    const { content } = addTicketMessageSchema.parse(req.body);
    const message = await ticketService.addSupportReply(
      req.user.id,
      id as string,
      content
    );

    // TODO: Send email notification to user

    res.status(201).json({
      success: true,
      data: message,
    });
  })
);

adminSupport.post(
  "/tickets/:id/internal",
  requirePermission("support:tickets:write"),
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    if (!req.user) throw new BadRequestError("Not authenticated");
    const { id } = req.params;
    const { content } = addInternalNoteSchema.parse(req.body);
    const message = await ticketService.addInternalNote(
      req.user.id,
      id as string,
      content
    );

    res.status(201).json({
      success: true,
      data: message,
    });
  })
);

adminSupport.post(
  "/tickets/:id/link-article",
  requirePermission("support:tickets:write"),
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const { id } = req.params;
    const { articleId } = req.body;
    const ticket = await ticketService.linkArticle(id as string, articleId);

    res.json({
      success: true,
      data: ticket,
    });
  })
);

// --- KB Management ---

adminSupport.get(
  "/kb",
  requirePermission("support:kb:read"),
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const filters = kbListSchema.parse(req.query);
    const result = await kbService.getAllArticles(filters);

    res.json({
      success: true,
      data: result,
    });
  })
);

adminSupport.post(
  "/kb",
  requirePermission("support:kb:write"),
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    if (!req.user) throw new BadRequestError("Not authenticated");
    const data = createKBArticleSchema.parse(req.body);
    const article = await kbService.createArticle(req.user.id, data);

    res.status(201).json({
      success: true,
      data: article,
    });
  })
);

adminSupport.get(
  "/kb/:id",
  requirePermission("support:kb:read"),
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const { id } = req.params;
    const article = await kbService.getArticleById(id as string);

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

adminSupport.put(
  "/kb/:id",
  requirePermission("support:kb:write"),
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const { id } = req.params;
    const data = updateKBArticleSchema.parse(req.body);
    const article = await kbService.updateArticle(id as string, data);

    res.json({
      success: true,
      data: article,
    });
  })
);

adminSupport.delete(
  "/kb/:id",
  requirePermission("support:kb:write"),
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const { id } = req.params;
    await kbService.deleteArticle(id as string);

    res.json({
      success: true,
      data: { message: "Article deleted" },
    });
  })
);

adminSupport.post(
  "/kb/:id/publish",
  requirePermission("support:kb:write"),
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const { id } = req.params;
    const article = await kbService.publishArticle(id as string);

    res.json({
      success: true,
      data: article,
    });
  })
);

adminSupport.post(
  "/kb/:id/unpublish",
  requirePermission("support:kb:write"),
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const { id } = req.params;
    const article = await kbService.unpublishArticle(id as string);

    res.json({
      success: true,
      data: article,
    });
  })
);

// Mount admin sub-router
supportRouter.use("/admin", adminSupport);
