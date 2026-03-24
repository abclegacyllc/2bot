/**
 * Marketplace Loader Service
 *
 * Reads plugin bundles from the filesystem (`marketplace/plugins/`).
 * Replaces the role of plugin-templates.ts for fetching plugin code.
 *
 * Bundles are stored as:
 *   marketplace/plugins/{slug}/{version}/plugin.json  — manifest
 *   marketplace/plugins/{slug}/{version}/code.js      — single-file code
 *   marketplace/plugins/{slug}/{version}/index.js     — directory entry (multi-file)
 *
 * @module modules/marketplace/marketplace-loader.service
 */

import fs from "fs";
import path from "path";

import type {
    MarketplaceCategory,
    MarketplaceItem,
    PluginBundleCode,
    PluginManifest,
} from "./marketplace.types";

// ===========================================
// Constants
// ===========================================

/** Root directory for marketplace bundles (relative to project root) */
const MARKETPLACE_ROOT = path.resolve(process.cwd(), "marketplace");
const PLUGINS_DIR = path.join(MARKETPLACE_ROOT, "plugins");

// ===========================================
// Cached manifests
// ===========================================

let cachedManifests: Map<string, { manifest: PluginManifest; bundlePath: string }> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60_000; // 1 minute cache

// ===========================================
// Public API
// ===========================================

/**
 * Get all available plugin manifests from the filesystem.
 * Results are cached for 1 minute.
 */
export function getAllManifests(): Map<string, { manifest: PluginManifest; bundlePath: string }> {
  const now = Date.now();
  if (cachedManifests && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedManifests;
  }

  const manifests = new Map<string, { manifest: PluginManifest; bundlePath: string }>();

  if (!fs.existsSync(PLUGINS_DIR)) {
    console.warn("[marketplace-loader] Plugins directory not found:", PLUGINS_DIR);
    return manifests;
  }

  const slugDirs = fs.readdirSync(PLUGINS_DIR, { withFileTypes: true });

  for (const slugDir of slugDirs) {
    if (!slugDir.isDirectory()) continue;

    const slug = slugDir.name;
    const slugPath = path.join(PLUGINS_DIR, slug);

    // Find the latest version (highest semver directory)
    const versions = fs
      .readdirSync(slugPath, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort()
      .reverse();

    if (versions.length === 0) continue;

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const latestVersion = versions[0]!;
    const bundleDir = path.join(slugPath, latestVersion);
    const manifestPath = path.join(bundleDir, "plugin.json");

    if (!fs.existsSync(manifestPath)) {
      console.warn(`[marketplace-loader] Missing plugin.json for ${slug}/${latestVersion}`);
      continue;
    }

    try {
      const raw = fs.readFileSync(manifestPath, "utf-8");
      const manifest = JSON.parse(raw) as PluginManifest;
      const bundlePath = `plugins/${slug}/${latestVersion}`;
      manifests.set(slug, { manifest, bundlePath });
    } catch (err) {
      console.error(`[marketplace-loader] Failed to parse manifest for ${slug}:`, err);
    }
  }

  cachedManifests = manifests;
  cacheTimestamp = now;
  return manifests;
}

/**
 * Get a single plugin manifest by slug.
 */
export function getManifestBySlug(slug: string): PluginManifest | undefined {
  return getAllManifests().get(slug)?.manifest;
}

/**
 * Get the bundle path for a plugin slug (e.g. "plugins/ai-chat-bot/1.0.0").
 */
export function getBundlePath(slug: string): string | undefined {
  return getAllManifests().get(slug)?.bundlePath;
}

/**
 * Load the code for a plugin bundle.
 * - Single-file plugins: returns { code, entryFile, layout: "single" }
 * - Directory plugins: returns { files, entryFile, layout: "directory" }
 */
export function getBundleCode(slug: string): PluginBundleCode | undefined {
  const entry = getAllManifests().get(slug);
  if (!entry) return undefined;

  const { manifest, bundlePath } = entry;
  const bundleDir = path.join(MARKETPLACE_ROOT, bundlePath);

  if (manifest.layout === "directory") {
    // Read all listed files
    const filesList = manifest.files ?? [];
    const files: Record<string, string> = {};

    for (const relPath of filesList) {
      const filePath = path.join(bundleDir, relPath);
      if (fs.existsSync(filePath)) {
        files[relPath] = fs.readFileSync(filePath, "utf-8");
      } else {
        console.warn(`[marketplace-loader] Missing file ${relPath} in bundle ${slug}`);
      }
    }

    return {
      files,
      entryFile: manifest.entryFile,
      layout: "directory",
    };
  }

  // Single-file: read the entry file (code.js)
  const codeFilePath = path.join(bundleDir, manifest.entryFile);
  if (!fs.existsSync(codeFilePath)) {
    console.warn(`[marketplace-loader] Missing code file for ${slug}: ${codeFilePath}`);
    return undefined;
  }

  return {
    code: fs.readFileSync(codeFilePath, "utf-8"),
    entryFile: manifest.entryFile,
    layout: "single",
  };
}

/**
 * Convert all manifests to MarketplaceItem format for API responses.
 * Optionally enriched with DB stats (install counts, ratings).
 */
export function getAllMarketplaceItems(
  dbStats?: Map<string, { installCount: number; avgRating: number; reviewCount: number; isFeatured: boolean }>
): MarketplaceItem[] {
  const manifests = getAllManifests();
  const items: MarketplaceItem[] = [];

  for (const [slug, { manifest, bundlePath }] of manifests) {
    const stats = dbStats?.get(slug);
    items.push({
      slug,
      name: manifest.name,
      type: "plugin",
      version: manifest.version,
      description: manifest.description,
      category: manifest.category,
      tags: manifest.tags,
      icon: manifest.icon,
      author: manifest.author,
      difficulty: manifest.difficulty,
      requiredGateways: manifest.requiredGateways,
      layout: manifest.layout,
      isBuiltin: manifest.isBuiltin,
      bundlePath,
      installCount: stats?.installCount ?? 0,
      avgRating: stats?.avgRating ?? 0,
      reviewCount: stats?.reviewCount ?? 0,
      isFeatured: stats?.isFeatured ?? false,
    });
  }

  return items;
}

/**
 * Get category counts from available manifests.
 */
export function getCategories(): MarketplaceCategory[] {
  const manifests = getAllManifests();
  const counts = new Map<string, number>();

  for (const [, { manifest }] of manifests) {
    const cat = manifest.category;
    counts.set(cat, (counts.get(cat) ?? 0) + 1);
  }

  const categoryNames: Record<string, string> = {
    general: "General",
    analytics: "Analytics",
    messaging: "Messaging",
    automation: "Automation",
    moderation: "Moderation",
    utilities: "Utilities",
  };

  return Array.from(counts.entries()).map(([slug, count]) => ({
    slug,
    name: categoryNames[slug] ?? slug,
    count,
  }));
}

/**
 * Invalidate the cached manifests (e.g. after admin uploads a new plugin).
 */
export function invalidateCache(): void {
  cachedManifests = null;
  cacheTimestamp = 0;
}

// ===========================================
// Singleton Export
// ===========================================

export const marketplaceLoader = {
  getAllManifests,
  getManifestBySlug,
  getBundlePath,
  getBundleCode,
  getAllMarketplaceItems,
  getCategories,
  invalidateCache,
};
