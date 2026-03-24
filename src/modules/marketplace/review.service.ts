/**
 * Review Service
 *
 * Handles plugin reviews: create, update, delete, list, and aggregate ratings.
 * Automatically updates Plugin.avgRating and Plugin.reviewCount on changes.
 *
 * @module modules/marketplace/review.service
 */

import type { PrismaClient } from "@prisma/client";

// ===========================================
// Types
// ===========================================

export interface CreateReviewInput {
  userId: string;
  pluginId: string;
  rating: number; // 1-5
  title?: string;
  content?: string;
}

export interface UpdateReviewInput {
  rating?: number;
  title?: string;
  content?: string;
}

export interface ReviewWithUser {
  id: string;
  userId: string;
  pluginId: string;
  rating: number;
  title: string | null;
  content: string | null;
  isPublic: boolean;
  verifiedInstall: boolean;
  createdAt: Date;
  updatedAt: Date;
  user: {
    id: string;
    name: string | null;
  };
}

export interface ReviewSummary {
  avgRating: number;
  reviewCount: number;
  distribution: Record<number, number>; // { 1: count, 2: count, ... 5: count }
}

// ===========================================
// Service
// ===========================================

class ReviewService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Create or update a review for a plugin.
   * Each user can only have one review per plugin (upsert).
   */
  async submitReview(input: CreateReviewInput): Promise<ReviewWithUser> {
    const { userId, pluginId, rating, title, content } = input;

    if (rating < 1 || rating > 5 || !Number.isInteger(rating)) {
      throw new Error("Rating must be an integer between 1 and 5");
    }

    // Check plugin exists
    const plugin = await this.prisma.plugin.findUnique({
      where: { id: pluginId },
      select: { id: true },
    });
    if (!plugin) throw new Error("Plugin not found");

    // Check if user has installed this plugin (verified install)
    const hasInstalled = await this.prisma.userPlugin.findFirst({
      where: { userId, pluginId },
      select: { id: true },
    });

    const review = await this.prisma.pluginReview.upsert({
      where: { userId_pluginId: { userId, pluginId } },
      create: {
        userId,
        pluginId,
        rating,
        title: title?.slice(0, 200),
        content: content?.slice(0, 5000),
        verifiedInstall: !!hasInstalled,
      },
      update: {
        rating,
        title: title?.slice(0, 200),
        content: content?.slice(0, 5000),
      },
      include: {
        user: { select: { id: true, name: true } },
      },
    });

    // Recalculate aggregate ratings for the plugin
    await this.recalculatePluginRating(pluginId);

    return review;
  }

  /**
   * Update an existing review (only by the review owner).
   */
  async updateReview(
    reviewId: string,
    userId: string,
    input: UpdateReviewInput
  ): Promise<ReviewWithUser> {
    const review = await this.prisma.pluginReview.findUnique({
      where: { id: reviewId },
      select: { userId: true, pluginId: true },
    });

    if (!review) throw new Error("Review not found");
    if (review.userId !== userId) throw new Error("Unauthorized");

    if (input.rating !== undefined) {
      if (input.rating < 1 || input.rating > 5 || !Number.isInteger(input.rating)) {
        throw new Error("Rating must be an integer between 1 and 5");
      }
    }

    const updated = await this.prisma.pluginReview.update({
      where: { id: reviewId },
      data: {
        ...(input.rating !== undefined && { rating: input.rating }),
        ...(input.title !== undefined && { title: input.title?.slice(0, 200) }),
        ...(input.content !== undefined && { content: input.content?.slice(0, 5000) }),
      },
      include: {
        user: { select: { id: true, name: true } },
      },
    });

    if (input.rating !== undefined) {
      await this.recalculatePluginRating(review.pluginId);
    }

    return updated;
  }

  /**
   * Delete a review (only by the review owner).
   */
  async deleteReview(reviewId: string, userId: string): Promise<void> {
    const review = await this.prisma.pluginReview.findUnique({
      where: { id: reviewId },
      select: { userId: true, pluginId: true },
    });

    if (!review) throw new Error("Review not found");
    if (review.userId !== userId) throw new Error("Unauthorized");

    await this.prisma.pluginReview.delete({ where: { id: reviewId } });
    await this.recalculatePluginRating(review.pluginId);
  }

  /**
   * Get reviews for a plugin with pagination.
   */
  async getPluginReviews(
    pluginId: string,
    page = 1,
    limit = 10
  ): Promise<{ reviews: ReviewWithUser[]; total: number; page: number; limit: number }> {
    const [reviews, total] = await Promise.all([
      this.prisma.pluginReview.findMany({
        where: { pluginId, isPublic: true },
        include: {
          user: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.pluginReview.count({
        where: { pluginId, isPublic: true },
      }),
    ]);

    return { reviews, total, page, limit };
  }

  /**
   * Get a user's review for a specific plugin (if exists).
   */
  async getUserReview(userId: string, pluginId: string): Promise<ReviewWithUser | null> {
    return this.prisma.pluginReview.findUnique({
      where: { userId_pluginId: { userId, pluginId } },
      include: {
        user: { select: { id: true, name: true } },
      },
    });
  }

  /**
   * Get rating summary for a plugin (distribution + average).
   */
  async getReviewSummary(pluginId: string): Promise<ReviewSummary> {
    const reviews = await this.prisma.pluginReview.groupBy({
      by: ["rating"],
      where: { pluginId, isPublic: true },
      _count: { rating: true },
    });

    const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let totalRating = 0;
    let totalCount = 0;

    for (const r of reviews) {
      distribution[r.rating] = r._count.rating;
      totalRating += r.rating * r._count.rating;
      totalCount += r._count.rating;
    }

    return {
      avgRating: totalCount > 0 ? Math.round((totalRating / totalCount) * 10) / 10 : 0,
      reviewCount: totalCount,
      distribution,
    };
  }

  /**
   * Recalculate and update the Plugin's avgRating and reviewCount.
   */
  private async recalculatePluginRating(pluginId: string): Promise<void> {
    const agg = await this.prisma.pluginReview.aggregate({
      where: { pluginId, isPublic: true },
      _avg: { rating: true },
      _count: { rating: true },
    });

    await this.prisma.plugin.update({
      where: { id: pluginId },
      data: {
        avgRating: Math.round((agg._avg.rating ?? 0) * 10) / 10,
        reviewCount: agg._count.rating,
      },
    });
  }
}

// ===========================================
// Singleton
// ===========================================

let _instance: ReviewService | null = null;

export function getReviewService(prisma: PrismaClient): ReviewService {
  if (!_instance) {
    _instance = new ReviewService(prisma);
  }
  return _instance;
}
