/**
 * Support Ticket Types
 * 
 * Types and validation schemas for support tickets.
 * 
 * @module modules/support/ticket.types
 */

import { z } from "zod";

// ===========================================
// Ticket Constants
// ===========================================

export const TICKET_TYPES = [
  "bug",
  "question",
  "billing",
  "feature_request",
  "other",
] as const;

export const TICKET_CATEGORIES = [
  "gateway",
  "plugin",
  "billing",
  "account",
  "other",
] as const;

export const TICKET_SEVERITIES = [
  "low",
  "medium",
  "high",
  "critical",
] as const;

export const TICKET_STATUSES = [
  "open",
  "in_progress",
  "waiting_user",
  "resolved",
  "closed",
] as const;

export type TicketType = (typeof TICKET_TYPES)[number];
export type TicketCategory = (typeof TICKET_CATEGORIES)[number];
export type TicketSeverity = (typeof TICKET_SEVERITIES)[number];
export type TicketStatus = (typeof TICKET_STATUSES)[number];

// ===========================================
// Validation Schemas
// ===========================================

export const createTicketSchema = z.object({
  type: z.enum(TICKET_TYPES),
  category: z.enum(TICKET_CATEGORIES),
  severity: z.enum(TICKET_SEVERITIES).default("medium"),
  title: z.string().min(5).max(200),
  description: z.string().min(10).max(5000),
  contextData: z.record(z.string(), z.unknown()).optional(),
  aiChatHistory: z.array(z.record(z.string(), z.unknown())).optional(),
});

export const addTicketMessageSchema = z.object({
  content: z.string().min(1).max(5000),
});

export const updateTicketStatusSchema = z.object({
  status: z.enum(TICKET_STATUSES),
});

export const assignTicketSchema = z.object({
  assigneeId: z.string().cuid(),
});

export const resolveTicketSchema = z.object({
  resolution: z.string().min(1).max(5000),
});

export const addInternalNoteSchema = z.object({
  content: z.string().min(1).max(5000),
});

export const ticketListSchema = z.object({
  status: z.enum(TICKET_STATUSES).optional(),
  type: z.enum(TICKET_TYPES).optional(),
  assignedToId: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
  search: z.string().max(200).optional(),
});

// ===========================================
// Response Types
// ===========================================

export interface TicketResponse {
  id: string;
  ticketNumber: string;
  type: string;
  category: string;
  severity: string;
  title: string;
  description: string;
  status: string;
  priority: number;
  contextData: Record<string, unknown>;
  aiChatHistory: Record<string, unknown>[];
  resolution: string | null;
  resolvedAt: Date | null;
  firstResponseAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  user: {
    id: string;
    email: string;
    name: string | null;
  };
  assignedTo: {
    id: string;
    email: string;
    name: string | null;
  } | null;
  messages?: TicketMessageResponse[];
  _count?: {
    messages: number;
  };
}

export interface TicketMessageResponse {
  id: string;
  content: string;
  isInternal: boolean;
  createdAt: Date;
  sender: {
    id: string;
    email: string;
    name: string | null;
    role: string;
  };
}

export type CreateTicketInput = z.infer<typeof createTicketSchema>;
export type AddTicketMessageInput = z.infer<typeof addTicketMessageSchema>;
