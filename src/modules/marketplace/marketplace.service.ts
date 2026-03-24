/**
 * Marketplace Service
 *
 * High-level service for browsing, searching, and managing marketplace items.
 * Combines filesystem-based manifests (MarketplaceLoader) with DB stats.
 *
 * @module modules/marketplace/marketplace.service
 */

import type { PrismaClient } from "@prisma/client";

import { marketplaceLoader } from "./marketplace-loader.service";
import type {
    MarketplaceCategory,
    MarketplaceItem,
    MarketplaceSearchOptions,
    MarketplaceSearchResult,
    PluginBundleCode,
} from "./marketplace.types";

// ===========================================
// Service
// ===========================================

class MarketplaceService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Browse/search marketplace items with filtering and pagination.
   */
  async searchItems(options: MarketplaceSearchOptions = {}): Promise<MarketplaceSearchResult> {
    const {
      type = "plugin",
      category,
      search,
      tags,
      difficulty,
      sort = "popular",
      page = 1,
      limit = 20,
    } = options;

    // Get DB stats for enrichment
    const dbStats = await this.getPluginStats();

    // Get all items from filesystem manifests, enriched with DB stats
    let items = marketplaceLoader.getAllMarketplaceItems(dbStats);

    // Filter by type
    if (type) {
      items = items.filter((item) => item.type === type);
    }

    // Filter by category
    if (category) {
      items = items.filter((item) => item.category === category);
    }

    // Filter by search text
    if (search) {
      const q = search.toLowerCase();
      items = items.filter(
        (item) =>
          item.name.toLowerCase().includes(q) ||
          item.description.toLowerCase().includes(q) ||
          item.tags.some((t) => t.toLowerCase().includes(q))
      );
    }

    // Filter by tags
    if (tags && tags.length > 0) {
      items = items.filter((item) => tags.some((t) => item.tags.includes(t)));
    }

    // Filter by difficulty
    if (difficulty) {
      items = items.filter((item) => item.difficulty === difficulty);
    }

    // Sort
    switch (sort) {
      case "popular":
        items.sort((a, b) => b.installCount - a.installCount);
        break;
      case "rating":
        items.sort((a, b) => b.avgRating - a.avgRating);
        break;
      case "name":
        items.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "newest":
      default:
        // Keep filesystem order (alphabetical by slug)
        break;
    }

    // Paginate
    const total = items.length;
    const start = (page - 1) * limit;
    const paged = items.slice(start, start + limit);

    return {
      items: paged,
      total,
      page,
      limit,
      hasMore: start + limit < total,
    };
  }

  /**
   * Get a single marketplace item by slug.
   */
  async getItemBySlug(slug: string): Promise<MarketplaceItem | undefined> {
    const dbStats = await this.getPluginStats();
    const items = marketplaceLoader.getAllMarketplaceItems(dbStats);
    return items.find((item) => item.slug === slug);
  }

  /**
   * Get the code bundle for a plugin (for deployment to containers).
   */
  getBundleCode(slug: string): PluginBundleCode | undefined {
    return marketplaceLoader.getBundleCode(slug);
  }

  /**
   * Get featured/popular items.
   */
  async getFeaturedItems(limit = 6): Promise<MarketplaceItem[]> {
    const result = await this.searchItems({ sort: "popular", limit });
    return result.items;
  }

  /**
   * Get all categories with counts.
   */
  getCategories(): MarketplaceCategory[] {
    return marketplaceLoader.getCategories();
  }

  /**
   * Invalidate cached manifests (call after admin uploads new plugin).
   */
  invalidateCache(): void {
    marketplaceLoader.invalidateCache();
  }

  // ===========================================
  // Private Helpers
  // ===========================================

  /**
   * Fetch install counts and ratings from DB for all active plugins.
   */
  private async getPluginStats(): Promise<
    Map<string, { installCount: number; avgRating: number; reviewCount: number; isFeatured: boolean }>
  > {
    const stats = new Map<
      string,
      { installCount: number; avgRating: number; reviewCount: number; isFeatured: boolean }
    >();

    try {
      const plugins = await this.prisma.plugin.findMany({
        where: { isActive: true },
        select: {
          slug: true,
          installCount: true,
          avgRating: true,
          reviewCount: true,
          isFeatured: true,
        },
      });

      for (const p of plugins) {
        stats.set(p.slug, {
          installCount: p.installCount,
          avgRating: p.avgRating,
          reviewCount: p.reviewCount,
          isFeatured: p.isFeatured,
        });
      }
    } catch {
      // DB might not have all plugins yet — that's fine
    }

    return stats;
  }
}

// ===========================================
// Singleton
// ===========================================

let _instance: MarketplaceService | null = null;

export function getMarketplaceService(prisma: PrismaClient): MarketplaceService {
  if (!_instance) {
    _instance = new MarketplaceService(prisma);
  }
  return _instance;
}

export { MarketplaceService };
