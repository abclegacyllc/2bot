/**
 * Marketplace Types
 *
 * Unified type definitions for the Marketplace module.
 * Supports plugins now, with extensibility for themes and widgets.
 *
 * @module modules/marketplace/marketplace.types
 */

import type { GatewayType } from "@prisma/client";

// ===========================================
// Item Types
// ===========================================

/** Marketplace item types — plugins now, themes/widgets later */
export type MarketplaceItemType = "plugin" | "theme" | "widget";

/** Plugin-specific categories */
export type PluginCategory =
  | "general"
  | "analytics"
  | "messaging"
  | "automation"
  | "moderation"
  | "utilities";

/** Difficulty levels for templates */
export type PluginDifficulty = "beginner" | "intermediate" | "advanced";

/** Layout type for plugin bundles */
export type PluginLayout = "single" | "directory";

// ===========================================
// Plugin Manifest (plugin.json)
// ===========================================

/**
 * Schema for the plugin.json manifest file stored on disk.
 * This is the source of truth for plugin metadata in the marketplace.
 */
export interface PluginManifest {
  slug: string;
  name: string;
  version: string;
  description: string;
  category: PluginCategory;
  requiredGateways: GatewayType[];
  tags: string[];
  difficulty: PluginDifficulty;
  configSchema: Record<string, unknown>;
  entryFile: string;
  layout: PluginLayout;
  icon: string;
  author: string;
  isBuiltin: boolean;
  eventTypes?: string[];
  eventRole?: string;
  /** For directory layouts: list of files in the bundle */
  files?: string[];
}

// ===========================================
// Marketplace Catalog Items
// ===========================================

/** A marketplace item as returned by browse/search APIs */
export interface MarketplaceItem {
  slug: string;
  name: string;
  type: MarketplaceItemType;
  version: string;
  description: string;
  category: string;
  tags: string[];
  icon: string;
  author: string;
  difficulty: PluginDifficulty;
  requiredGateways: GatewayType[];
  layout: PluginLayout;
  isBuiltin: boolean;
  /** Relative path to the bundle directory (e.g. "plugins/ai-chat-bot/1.0.0") */
  bundlePath: string;
  // Popularity (from DB if available, otherwise defaults)
  installCount: number;
  avgRating: number;
  reviewCount: number;
  isFeatured: boolean;
}

/** Options for searching/filtering marketplace items */
export interface MarketplaceSearchOptions {
  type?: MarketplaceItemType;
  category?: string;
  search?: string;
  tags?: string[];
  difficulty?: PluginDifficulty;
  sort?: "popular" | "newest" | "name" | "rating";
  page?: number;
  limit?: number;
}

/** Paginated result for marketplace listings */
export interface MarketplaceSearchResult {
  items: MarketplaceItem[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

/** Category with counts for filtering UI */
export interface MarketplaceCategory {
  slug: string;
  name: string;
  count: number;
}

// ===========================================
// Bundle Code Access
// ===========================================

/** Result of loading code from a plugin bundle */
export interface PluginBundleCode {
  /** For single-file plugins: the full code as a string */
  code?: string;
  /** For directory plugins: map of relative path → file content */
  files?: Record<string, string>;
  /** Entry file relative to the plugin root */
  entryFile: string;
  /** Layout type */
  layout: PluginLayout;
}
