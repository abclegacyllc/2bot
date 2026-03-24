/**
 * Marketplace Module
 *
 * Unified store for plugins (and future themes, widgets).
 * Reads plugin bundles from filesystem, enriches with DB stats.
 *
 * @module modules/marketplace
 */

export { marketplaceLoader } from "./marketplace-loader.service";
export { MarketplaceService, getMarketplaceService } from "./marketplace.service";
export type {
    MarketplaceCategory,
    MarketplaceItem,
    MarketplaceItemType,
    MarketplaceSearchOptions,
    MarketplaceSearchResult,
    PluginBundleCode,
    PluginCategory,
    PluginDifficulty,
    PluginLayout,
    PluginManifest
} from "./marketplace.types";
export { getReviewService } from "./review.service";

