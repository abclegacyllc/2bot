/**
 * Support AI Types
 * 
 * Types for the support AI service that provides
 * AI-powered help using KB articles as context.
 * 
 * Backend uses 2bot-ai-provider internally but exposes
 * a separate support-specific API.
 * 
 * @module modules/support/support-ai.types
 */

import { z } from "zod";

// ===========================================
// Validation Schemas
// ===========================================

export const supportChatSchema = z.object({
  message: z.string().min(1).max(2000),
  conversationHistory: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string(),
  })).max(50).default([]),
  userId: z.string().optional(), // Injected by route handler, not from client
});

// ===========================================
// Response Types
// ===========================================

export interface SupportChatResponse {
  reply: string;
  relatedArticles: Array<{
    slug: string;
    title: string;
    excerpt: string | null;
  }>;
  suggestTicket: boolean; // AI recommends creating a ticket
  canCreateTickets: boolean; // User's plan allows ticket creation
  supportEmail: string; // Fallback email for free users
}

export interface SupportAIContext {
  kbArticles: Array<{
    title: string;
    content: string;
    slug: string;
    category: string;
  }>;
  platformInfo: {
    name: string;
    features: string[];
  };
}

export type SupportChatInput = z.infer<typeof supportChatSchema>;
