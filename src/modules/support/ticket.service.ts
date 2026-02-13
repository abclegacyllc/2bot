/**
 * Support Ticket Service
 * 
 * Manages ticket lifecycle: create, reply, assign, resolve.
 * Users see their own tickets. Support/Admin see all.
 * 
 * @module modules/support/ticket.service
 */

import { prisma } from "@/lib/prisma";
import { ForbiddenError, NotFoundError } from "@/shared/errors";
import type { Prisma } from "@prisma/client";
import type {
  CreateTicketInput,
  TicketMessageResponse,
  TicketResponse,
} from "./ticket.types";

// ===========================================
// Helpers
// ===========================================

/**
 * Generate next ticket number: #2B-YYYYMMDD-NNNN
 * Format: 2B prefix + date + daily sequence number
 * Example: #2B-20260211-0001 (first ticket on Feb 11, 2026)
 */
async function generateTicketNumber(): Promise<string> {
  const now = new Date();
  const dateStr = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("");

  const prefix = `#2B-${dateStr}-`;

  // Find the last ticket created today to get the next sequence number
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

  const lastTicketToday = await prisma.supportTicket.findFirst({
    where: {
      createdAt: { gte: startOfDay, lt: endOfDay },
    },
    orderBy: { createdAt: "desc" },
    select: { ticketNumber: true },
  });

  if (!lastTicketToday) return `${prefix}0001`;

  // Extract sequence from last ticket (handles both old TICKET-NNNN and new #2B-YYYYMMDD-NNNN)
  const parts = lastTicketToday.ticketNumber.split("-");
  const lastSeq = parseInt(parts[parts.length - 1] || "0", 10);
  return `${prefix}${String(lastSeq + 1).padStart(4, "0")}`;
}

/** Standard select for user info in ticket responses */
const userSelect = { id: true, email: true, name: true };
const senderSelect = { id: true, email: true, name: true, role: true };

// ===========================================
// User Methods (own tickets only)
// ===========================================

/**
 * Create a new support ticket
 */
export async function createTicket(
  userId: string,
  data: CreateTicketInput
): Promise<TicketResponse> {
  const ticketNumber = await generateTicketNumber();

  return prisma.supportTicket.create({
    data: {
      ticketNumber,
      userId,
      type: data.type,
      category: data.category,
      severity: data.severity,
      title: data.title,
      description: data.description,
      contextData: (data.contextData ?? {}) as Prisma.InputJsonValue,
      aiChatHistory: (data.aiChatHistory ?? []) as Prisma.InputJsonValue,
    },
    include: {
      user: { select: userSelect },
      assignedTo: { select: userSelect },
      _count: { select: { messages: true } },
    },
  }) as unknown as TicketResponse;
}

/**
 * Get a user's own tickets
 */
export async function getUserTickets(
  userId: string,
  filters?: { status?: string; limit?: number; offset?: number }
): Promise<{ tickets: TicketResponse[]; total: number }> {
  const where = {
    userId,
    ...(filters?.status && { status: filters.status }),
  };

  const [tickets, total] = await Promise.all([
    prisma.supportTicket.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: filters?.limit ?? 20,
      skip: filters?.offset ?? 0,
      include: {
        user: { select: userSelect },
        assignedTo: { select: userSelect },
        _count: { select: { messages: true } },
      },
    }),
    prisma.supportTicket.count({ where }),
  ]);

  return { tickets: tickets as unknown as TicketResponse[], total };
}

/**
 * Get a single ticket (user must own it)
 */
export async function getUserTicketById(
  userId: string,
  ticketId: string
): Promise<TicketResponse> {
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    include: {
      user: { select: userSelect },
      assignedTo: { select: userSelect },
      messages: {
        where: { isInternal: false }, // Users don't see internal notes
        orderBy: { createdAt: "asc" },
        include: { sender: { select: senderSelect } },
      },
    },
  });

  if (!ticket) throw new NotFoundError("Ticket not found");
  if (ticket.userId !== userId) throw new ForbiddenError("Access denied");

  return ticket as unknown as TicketResponse;
}

/**
 * Add a message to a ticket (user side)
 */
export async function addUserMessage(
  userId: string,
  ticketId: string,
  content: string
): Promise<TicketMessageResponse> {
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    select: { userId: true, status: true },
  });

  if (!ticket) throw new NotFoundError("Ticket not found");
  if (ticket.userId !== userId) throw new ForbiddenError("Access denied");

  // Reopen if ticket was waiting for user
  if (ticket.status === "waiting_user") {
    await prisma.supportTicket.update({
      where: { id: ticketId },
      data: { status: "in_progress" },
    });
  }

  return prisma.ticketMessage.create({
    data: {
      ticketId,
      senderId: userId,
      content,
      isInternal: false,
    },
    include: { sender: { select: senderSelect } },
  }) as unknown as TicketMessageResponse;
}

// ===========================================
// Support/Admin Methods (all tickets)
// ===========================================

/**
 * Get all tickets with filters (support/admin)
 */
export async function getAllTickets(filters?: {
  status?: string;
  type?: string;
  assignedToId?: string;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ tickets: TicketResponse[]; total: number }> {
  const where: Record<string, unknown> = {};

  if (filters?.status) where.status = filters.status;
  if (filters?.type) where.type = filters.type;
  if (filters?.assignedToId) where.assignedToId = filters.assignedToId;
  if (filters?.search) {
    where.OR = [
      { title: { contains: filters.search, mode: "insensitive" } },
      { ticketNumber: { contains: filters.search, mode: "insensitive" } },
      { user: { email: { contains: filters.search, mode: "insensitive" } } },
    ];
  }

  const [tickets, total] = await Promise.all([
    prisma.supportTicket.findMany({
      where,
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      take: filters?.limit ?? 20,
      skip: filters?.offset ?? 0,
      include: {
        user: { select: userSelect },
        assignedTo: { select: userSelect },
        _count: { select: { messages: true } },
      },
    }),
    prisma.supportTicket.count({ where }),
  ]);

  return { tickets: tickets as unknown as TicketResponse[], total };
}

/**
 * Get a ticket by ID (support/admin — includes internal notes)
 */
export async function getTicketById(ticketId: string): Promise<TicketResponse> {
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    include: {
      user: { select: userSelect },
      assignedTo: { select: userSelect },
      messages: {
        orderBy: { createdAt: "asc" },
        include: { sender: { select: senderSelect } },
      },
    },
  });

  if (!ticket) throw new NotFoundError("Ticket not found");
  return ticket as unknown as TicketResponse;
}

/**
 * Assign a ticket to a support agent
 */
export async function assignTicket(
  ticketId: string,
  assigneeId: string
): Promise<TicketResponse> {
  const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw new NotFoundError("Ticket not found");

  return prisma.supportTicket.update({
    where: { id: ticketId },
    data: { assignedToId: assigneeId },
    include: {
      user: { select: userSelect },
      assignedTo: { select: userSelect },
    },
  }) as unknown as TicketResponse;
}

/**
 * Update ticket status
 */
export async function updateTicketStatus(
  ticketId: string,
  status: string
): Promise<TicketResponse> {
  const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw new NotFoundError("Ticket not found");

  return prisma.supportTicket.update({
    where: { id: ticketId },
    data: {
      status,
      ...(status === "resolved" && { resolvedAt: new Date() }),
    },
    include: {
      user: { select: userSelect },
      assignedTo: { select: userSelect },
    },
  }) as unknown as TicketResponse;
}

/**
 * Resolve a ticket with resolution text
 */
export async function resolveTicket(
  ticketId: string,
  resolution: string
): Promise<TicketResponse> {
  const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw new NotFoundError("Ticket not found");

  return prisma.supportTicket.update({
    where: { id: ticketId },
    data: {
      status: "resolved",
      resolution,
      resolvedAt: new Date(),
    },
    include: {
      user: { select: userSelect },
      assignedTo: { select: userSelect },
    },
  }) as unknown as TicketResponse;
}

/**
 * Add a reply to a ticket (support side - visible to user)
 */
export async function addSupportReply(
  senderId: string,
  ticketId: string,
  content: string
): Promise<TicketMessageResponse> {
  const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw new NotFoundError("Ticket not found");

  // Track first response time
  const updateData: Record<string, unknown> = { status: "waiting_user" };
  if (!ticket.firstResponseAt) {
    updateData.firstResponseAt = new Date();
  }

  await prisma.supportTicket.update({
    where: { id: ticketId },
    data: updateData,
  });

  return prisma.ticketMessage.create({
    data: {
      ticketId,
      senderId,
      content,
      isInternal: false,
    },
    include: { sender: { select: senderSelect } },
  }) as unknown as TicketMessageResponse;
}

/**
 * Add an internal note (support only — hidden from user)
 */
export async function addInternalNote(
  senderId: string,
  ticketId: string,
  content: string
): Promise<TicketMessageResponse> {
  const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw new NotFoundError("Ticket not found");

  return prisma.ticketMessage.create({
    data: {
      ticketId,
      senderId,
      content,
      isInternal: true,
    },
    include: { sender: { select: senderSelect } },
  }) as unknown as TicketMessageResponse;
}

/**
 * Link a KB article to a ticket
 */
export async function linkArticle(
  ticketId: string,
  articleId: string
): Promise<TicketResponse> {
  const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw new NotFoundError("Ticket not found");

  return prisma.supportTicket.update({
    where: { id: ticketId },
    data: { relatedArticleId: articleId },
    include: {
      user: { select: userSelect },
      assignedTo: { select: userSelect },
    },
  }) as unknown as TicketResponse;
}

/**
 * Get support stats (for admin dashboard)
 */
export async function getSupportStats(): Promise<{
  open: number;
  inProgress: number;
  waitingUser: number;
  resolved: number;
  total: number;
}> {
  const [open, inProgress, waitingUser, resolved, total] = await Promise.all([
    prisma.supportTicket.count({ where: { status: "open" } }),
    prisma.supportTicket.count({ where: { status: "in_progress" } }),
    prisma.supportTicket.count({ where: { status: "waiting_user" } }),
    prisma.supportTicket.count({ where: { status: "resolved" } }),
    prisma.supportTicket.count(),
  ]);

  return { open, inProgress, waitingUser, resolved, total };
}
