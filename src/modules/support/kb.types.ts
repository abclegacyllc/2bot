/**
 * Knowledge Base Types
 * 
 * Types and validation schemas for KB articles.
 * 
 * @module modules/support/kb.types
 */

import { z } from "zod";

// ===========================================
// KB Article Categories
// ===========================================
export const KB_CATEGORIES = [
  "getting_started",
  "gateways",
  "plugins",
  "billing",
  "troubleshooting",
] as const;

export type KBCategory = (typeof KB_CATEGORIES)[number];

// ===========================================
// Validation Schemas
// ===========================================

export const createKBArticleSchema = z.object({
  title: z.string().min(3).max(200),
  content: z.string().min(10),
  excerpt: z.string().max(500).optional(),
  category: z.enum(KB_CATEGORIES),
  tags: z.array(z.string().max(50)).max(10).default([]),
  isPublished: z.boolean().default(false),
});

export const updateKBArticleSchema = createKBArticleSchema.partial();

export const kbSearchSchema = z.object({
  q: z.string().min(1).max(200),
  category: z.enum(KB_CATEGORIES).optional(),
  limit: z.coerce.number().min(1).max(50).default(10),
});

export const kbFeedbackSchema = z.object({
  helpful: z.boolean(),
});

export const kbListSchema = z.object({
  category: z.enum(KB_CATEGORIES).optional(),
  limit: z.coerce.number().min(1).max(50).default(20),
  offset: z.coerce.number().min(0).default(0),
});

// ===========================================
// Response Types
// ===========================================

export interface KBArticleResponse {
  id: string;
  slug: string;
  title: string;
  content: string;
  excerpt: string | null;
  category: string;
  tags: string[];
  viewCount: number;
  helpfulCount: number;
  notHelpfulCount: number;
  isPublished: boolean;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  author?: {
    id: string;
    name: string | null;
  };
}

export type CreateKBArticleInput = z.infer<typeof createKBArticleSchema>;
export type UpdateKBArticleInput = z.infer<typeof updateKBArticleSchema>;
