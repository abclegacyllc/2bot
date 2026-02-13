/**
 * Knowledge Base Service
 * 
 * Manages KB articles: CRUD, search, feedback, view tracking.
 * Public articles are accessible without auth.
 * Admin/support users can create, edit, publish articles.
 * 
 * @module modules/support/kb.service
 */

import { prisma } from "@/lib/prisma";
import { NotFoundError } from "@/shared/errors";
import type {
    CreateKBArticleInput,
    KBArticleResponse,
    UpdateKBArticleInput,
} from "./kb.types";

// ===========================================
// Helper: Generate URL-safe slug
// ===========================================
function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100);
}

// ===========================================
// Public Methods (no auth required)
// ===========================================

/**
 * Get published articles with optional filters
 */
export async function getPublishedArticles(filters?: {
  category?: string;
  limit?: number;
  offset?: number;
}): Promise<{ articles: KBArticleResponse[]; total: number }> {
  const where = {
    isPublished: true,
    ...(filters?.category && { category: filters.category }),
  };

  const [articles, total] = await Promise.all([
    prisma.kBArticle.findMany({
      where,
      orderBy: { viewCount: "desc" },
      take: filters?.limit ?? 20,
      skip: filters?.offset ?? 0,
      include: {
        author: { select: { id: true, name: true } },
      },
    }),
    prisma.kBArticle.count({ where }),
  ]);

  return { articles, total };
}

/**
 * Get a single published article by slug
 */
export async function getArticleBySlug(slug: string): Promise<KBArticleResponse | null> {
  return prisma.kBArticle.findFirst({
    where: { slug, isPublished: true },
    include: {
      author: { select: { id: true, name: true } },
    },
  });
}

/**
 * Search published articles by title, content, tags
 */
export async function searchArticles(query: string, options?: {
  category?: string;
  limit?: number;
}): Promise<KBArticleResponse[]> {
  const searchTerm = query.toLowerCase();
  
  return prisma.kBArticle.findMany({
    where: {
      isPublished: true,
      ...(options?.category && { category: options.category }),
      OR: [
        { title: { contains: searchTerm, mode: "insensitive" } },
        { content: { contains: searchTerm, mode: "insensitive" } },
        { tags: { has: searchTerm } },
        { excerpt: { contains: searchTerm, mode: "insensitive" } },
      ],
    },
    orderBy: { viewCount: "desc" },
    take: options?.limit ?? 10,
    include: {
      author: { select: { id: true, name: true } },
    },
  });
}

/**
 * Increment view count for an article
 */
export async function incrementViewCount(id: string): Promise<void> {
  await prisma.kBArticle.update({
    where: { id },
    data: { viewCount: { increment: 1 } },
  });
}

/**
 * Record helpful/not helpful feedback
 */
export async function recordFeedback(id: string, helpful: boolean): Promise<void> {
  await prisma.kBArticle.update({
    where: { id },
    data: helpful
      ? { helpfulCount: { increment: 1 } }
      : { notHelpfulCount: { increment: 1 } },
  });
}

// ===========================================
// Admin/Support Methods (require auth + role)
// ===========================================

/**
 * Get all articles (including unpublished) for admin
 */
export async function getAllArticles(filters?: {
  category?: string;
  isPublished?: boolean;
  limit?: number;
  offset?: number;
}): Promise<{ articles: KBArticleResponse[]; total: number }> {
  const where = {
    ...(filters?.category && { category: filters.category }),
    ...(filters?.isPublished !== undefined && { isPublished: filters.isPublished }),
  };

  const [articles, total] = await Promise.all([
    prisma.kBArticle.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: filters?.limit ?? 20,
      skip: filters?.offset ?? 0,
      include: {
        author: { select: { id: true, name: true } },
      },
    }),
    prisma.kBArticle.count({ where }),
  ]);

  return { articles, total };
}

/**
 * Get a single article by ID (admin - any status)
 */
export async function getArticleById(id: string): Promise<KBArticleResponse | null> {
  return prisma.kBArticle.findUnique({
    where: { id },
    include: {
      author: { select: { id: true, name: true } },
    },
  });
}

/**
 * Create a new KB article
 */
export async function createArticle(
  authorId: string,
  data: CreateKBArticleInput
): Promise<KBArticleResponse> {
  let slug = generateSlug(data.title);

  // Ensure slug uniqueness
  const existing = await prisma.kBArticle.findUnique({ where: { slug } });
  if (existing) {
    slug = `${slug}-${Date.now().toString(36)}`;
  }

  return prisma.kBArticle.create({
    data: {
      ...data,
      slug,
      authorId,
      publishedAt: data.isPublished ? new Date() : null,
    },
    include: {
      author: { select: { id: true, name: true } },
    },
  });
}

/**
 * Update an existing KB article
 */
export async function updateArticle(
  id: string,
  data: UpdateKBArticleInput
): Promise<KBArticleResponse> {
  const article = await prisma.kBArticle.findUnique({ where: { id } });
  if (!article) throw new NotFoundError("Article not found");

  // If title changes, update slug
  let slug = article.slug;
  if (data.title && data.title !== article.title) {
    slug = generateSlug(data.title);
    const existing = await prisma.kBArticle.findFirst({
      where: { slug, id: { not: id } },
    });
    if (existing) {
      slug = `${slug}-${Date.now().toString(36)}`;
    }
  }

  return prisma.kBArticle.update({
    where: { id },
    data: {
      ...data,
      slug,
    },
    include: {
      author: { select: { id: true, name: true } },
    },
  });
}

/**
 * Delete a KB article
 */
export async function deleteArticle(id: string): Promise<void> {
  const article = await prisma.kBArticle.findUnique({ where: { id } });
  if (!article) throw new NotFoundError("Article not found");

  await prisma.kBArticle.delete({ where: { id } });
}

/**
 * Publish an article
 */
export async function publishArticle(id: string): Promise<KBArticleResponse> {
  const article = await prisma.kBArticle.findUnique({ where: { id } });
  if (!article) throw new NotFoundError("Article not found");

  return prisma.kBArticle.update({
    where: { id },
    data: {
      isPublished: true,
      publishedAt: new Date(),
    },
    include: {
      author: { select: { id: true, name: true } },
    },
  });
}

/**
 * Unpublish an article
 */
export async function unpublishArticle(id: string): Promise<KBArticleResponse> {
  const article = await prisma.kBArticle.findUnique({ where: { id } });
  if (!article) throw new NotFoundError("Article not found");

  return prisma.kBArticle.update({
    where: { id },
    data: {
      isPublished: false,
    },
    include: {
      author: { select: { id: true, name: true } },
    },
  });
}

/**
 * Get articles by content for AI context building
 * Returns full content for injection into AI system prompts
 */
export async function getArticlesForAIContext(query: string, limit = 3): Promise<Array<{
  title: string;
  content: string;
  slug: string;
  category: string;
}>> {
  const searchTerm = query.toLowerCase();

  const articles = await prisma.kBArticle.findMany({
    where: {
      isPublished: true,
      OR: [
        { title: { contains: searchTerm, mode: "insensitive" } },
        { content: { contains: searchTerm, mode: "insensitive" } },
        { tags: { has: searchTerm } },
      ],
    },
    select: {
      title: true,
      content: true,
      slug: true,
      category: true,
    },
    orderBy: { viewCount: "desc" },
    take: limit,
  });

  return articles;
}
