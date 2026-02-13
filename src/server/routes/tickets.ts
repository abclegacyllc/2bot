/**
 * Support Ticket Routes
 *
 * API endpoints for user-facing ticket operations.
 * All routes require authentication.
 * 
 * Routes:
 * - POST /tickets            - Create a ticket
 * - GET  /tickets            - List user's tickets
 * - GET  /tickets/:id        - Get ticket detail (own only)
 * - POST /tickets/:id/messages - Add message to ticket
 *
 * @module server/routes/tickets
 */

import {
    addTicketMessageSchema,
    createTicketSchema,
    ticketListSchema, ticketService
} from "@/modules/support";
import { BadRequestError } from "@/shared/errors";
import type { ApiResponse } from "@/shared/types";
import { Router, type Request, type Response } from "express";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../middleware/error-handler";

// Plans that can create support tickets (PRO and above)
const TICKET_ALLOWED_PLANS = ["PRO", "BUSINESS", "ENTERPRISE"];
// Org plans that can create support tickets (ORG_PRO and above)
const TICKET_ALLOWED_ORG_PLANS = ["ORG_PRO", "ORG_BUSINESS", "ORG_ENTERPRISE"];

export const ticketsRouter = Router();

// All ticket routes require authentication
ticketsRouter.use(requireAuth);

// ===========================================
// GET /tickets/access - Check if user can create tickets
// ===========================================
ticketsRouter.get(
  "/access",
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    if (!req.user) throw new BadRequestError("Not authenticated");
    const userPlan = req.user.plan;
    // Check personal plan or org context plan from query
    const orgPlan = req.query.orgPlan as string | undefined;
    const canCreate = TICKET_ALLOWED_PLANS.includes(userPlan) ||
      (orgPlan ? TICKET_ALLOWED_ORG_PLANS.includes(orgPlan) : false);

    res.json({
      success: true,
      data: {
        canCreateTickets: canCreate,
        supportEmail: canCreate ? undefined : "support@2bot.org",
        reason: canCreate ? undefined : "Ticket support is available on Pro plans and above. For assistance, please email support@2bot.org",
      },
    });
  })
);

// ===========================================
// POST /tickets - Create a new ticket
// ===========================================
ticketsRouter.post(
  "/",
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    if (!req.user) throw new BadRequestError("Not authenticated");
    const userPlan = req.user.plan;
    const orgPlan = req.body.orgPlan as string | undefined;
    const canCreate = TICKET_ALLOWED_PLANS.includes(userPlan) ||
      (orgPlan ? TICKET_ALLOWED_ORG_PLANS.includes(orgPlan) : false);

    if (!canCreate) {
      res.status(403).json({
        success: false,
        error: {
          code: "PLAN_UPGRADE_REQUIRED",
          message: "Ticket support is available on Pro plans and above. For assistance, please email support@2bot.org",
        },
      });
      return;
    }

    const data = createTicketSchema.parse(req.body);
    const ticket = await ticketService.createTicket(req.user.id, data);

    // TODO: Send email notification to admin/support team

    res.status(201).json({
      success: true,
      data: ticket,
    });
  })
);

// ===========================================
// GET /tickets - List user's own tickets
// ===========================================
ticketsRouter.get(
  "/",
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    if (!req.user) throw new BadRequestError("Not authenticated");
    const filters = ticketListSchema.parse(req.query);
    const result = await ticketService.getUserTickets(req.user.id, filters);

    res.json({
      success: true,
      data: result,
    });
  })
);

// ===========================================
// GET /tickets/:id - Get ticket detail (own only)
// ===========================================
ticketsRouter.get(
  "/:id",
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    if (!req.user) throw new BadRequestError("Not authenticated");
    const { id } = req.params;
    const ticket = await ticketService.getUserTicketById(
      req.user.id,
      id as string
    );

    res.json({
      success: true,
      data: ticket,
    });
  })
);

// ===========================================
// POST /tickets/:id/messages - Add message
// ===========================================
ticketsRouter.post(
  "/:id/messages",
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    if (!req.user) throw new BadRequestError("Not authenticated");
    const { id } = req.params;
    const { content } = addTicketMessageSchema.parse(req.body);
    const message = await ticketService.addUserMessage(
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
