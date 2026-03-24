/**
 * Plugin Templates
 *
 * Backward-compatible interface over the marketplace filesystem bundles.
 * Templates were previously stored as inline code strings (~1,500 lines).
 * Now they are read from `marketplace/plugins/{slug}/{version}/` on disk.
 *
 * This module preserves the same type interfaces and accessor functions
 * so existing consumers (routes, services, cursor) continue to work unchanged.
 *
 * @module modules/plugin/plugin-templates
 */

import type { GatewayType } from "@prisma/client";

import { marketplaceLoader } from "@/modules/marketplace/marketplace-loader.service";

import type { JSONSchema, PluginCategory } from "./plugin.types";

// ===========================================
// Template Definition (unchanged interfaces)
// ===========================================

export interface PluginTemplate {
  /** Unique template identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Short description of what the template does */
  description: string;
  /** Plugin category */
  category: PluginCategory;
  /** Required gateway types */
  requiredGateways: GatewayType[];
  /** Tags for filtering */
  tags: string[];
  /** Difficulty level */
  difficulty: "beginner" | "intermediate" | "advanced";
  /** Default config schema for this template */
  configSchema: JSONSchema;
  /** The JavaScript source code (single-file templates) */
  code: string;
  /** Whether this is a directory (multi-file) template */
  isDirectory?: false;
}

/**
 * A directory (multi-file) plugin template.
 * Instead of a single `code` string, provides a `files` map.
 */
export interface PluginDirectoryTemplate {
  /** Unique template identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Short description of what the template does */
  description: string;
  /** Plugin category */
  category: PluginCategory;
  /** Required gateway types */
  requiredGateways: GatewayType[];
  /** Tags for filtering */
  tags: string[];
  /** Difficulty level */
  difficulty: "beginner" | "intermediate" | "advanced";
  /** Default config schema for this template */
  configSchema: JSONSchema;
  /** This is a directory template */
  isDirectory: true;
  /** Entry file relative to the plugin directory (default: "index.js") */
  entry: string;
  /** Files to scaffold — key is relative path within the plugin dir, value is content */
  files: Record<string, string>;
}

/** Union type for both single-file and directory templates */
export type AnyPluginTemplate = PluginTemplate | PluginDirectoryTemplate;

/**
 * Template list item (without full code) for catalog listings
 */
export interface PluginTemplateListItem {
  id: string;
  name: string;
  description: string;
  category: PluginCategory;
  requiredGateways: GatewayType[];
  tags: string[];
  difficulty: "beginner" | "intermediate" | "advanced";
  /** Whether this is a directory (multi-file) template */
  isDirectory?: boolean;
}

// ===========================================
// Filesystem-backed template registry
// ===========================================

/**
 * Build PLUGIN_TEMPLATES and PLUGIN_DIRECTORY_TEMPLATES from marketplace manifests.
 * Lazy-loaded on first access.
 */
function loadTemplatesFromMarketplace(): {
  single: PluginTemplate[];
  directory: PluginDirectoryTemplate[];
} {
  const manifests = marketplaceLoader.getAllManifests();
  const single: PluginTemplate[] = [];
  const directory: PluginDirectoryTemplate[] = [];

  for (const [slug, { manifest }] of manifests) {
    const bundle = marketplaceLoader.getBundleCode(slug);
    if (!bundle) continue;

    if (manifest.layout === "directory" && bundle.files) {
      directory.push({
        id: slug,
        name: manifest.name,
        description: manifest.description,
        category: manifest.category as PluginCategory,
        requiredGateways: manifest.requiredGateways,
        tags: manifest.tags,
        difficulty: manifest.difficulty,
        configSchema: manifest.configSchema as JSONSchema,
        isDirectory: true,
        entry: bundle.entryFile,
        files: bundle.files,
      });
    } else if (bundle.code) {
      single.push({
        id: slug,
        name: manifest.name,
        description: manifest.description,
        category: manifest.category as PluginCategory,
        requiredGateways: manifest.requiredGateways,
        tags: manifest.tags,
        difficulty: manifest.difficulty,
        configSchema: manifest.configSchema as JSONSchema,
        code: bundle.code,
      });
    }
  }

  return { single, directory };
}

let _loaded: { single: PluginTemplate[]; directory: PluginDirectoryTemplate[] } | null = null;

function ensureLoaded() {
  if (!_loaded) {
    _loaded = loadTemplatesFromMarketplace();
  }
  return _loaded;
}

/** All single-file templates (lazy-loaded from filesystem) */
export function getPluginTemplates(): PluginTemplate[] {
  return ensureLoaded().single;
}

/** All directory templates (lazy-loaded from filesystem) */
export function getPluginDirectoryTemplates(): PluginDirectoryTemplate[] {
  return ensureLoaded().directory;
}

// Legacy exports for backward compat — consumers can still import these
// but they are now getter-backed
export const PLUGIN_TEMPLATES: PluginTemplate[] = new Proxy([] as PluginTemplate[], {
  get(target, prop) {
    const arr = getPluginTemplates();
    if (prop === "find") return arr.find.bind(arr);
    if (prop === "filter") return arr.filter.bind(arr);
    if (prop === "map") return arr.map.bind(arr);
    if (prop === "length") return arr.length;
    if (prop === Symbol.iterator) return arr[Symbol.iterator].bind(arr);
    if (typeof prop === "string" && /^\d+$/.test(prop)) return arr[Number(prop)];
    return Reflect.get(target, prop);
  },
});

export const PLUGIN_DIRECTORY_TEMPLATES: PluginDirectoryTemplate[] = new Proxy(
  [] as PluginDirectoryTemplate[],
  {
    get(target, prop) {
      const arr = getPluginDirectoryTemplates();
      if (prop === "find") return arr.find.bind(arr);
      if (prop === "filter") return arr.filter.bind(arr);
      if (prop === "map") return arr.map.bind(arr);
      if (prop === "length") return arr.length;
      if (prop === Symbol.iterator) return arr[Symbol.iterator].bind(arr);
      if (typeof prop === "string" && /^\d+$/.test(prop)) return arr[Number(prop)];
      return Reflect.get(target, prop);
    },
  }
);

// ===========================================
// Template Accessors (same signatures as before)
// ===========================================

/**
 * Get all templates (without code/files) for listing — includes both single-file and directory templates
 */
export function getTemplateList(): PluginTemplateListItem[] {
  const templates = ensureLoaded();

  const singleFile: PluginTemplateListItem[] = templates.single.map(
    ({ id, name, description, category, requiredGateways, tags, difficulty }) => ({
      id,
      name,
      description,
      category,
      requiredGateways,
      tags,
      difficulty,
    })
  );

  const dirs: PluginTemplateListItem[] = templates.directory.map(
    ({ id, name, description, category, requiredGateways, tags, difficulty }) => ({
      id,
      name,
      description,
      category,
      requiredGateways,
      tags,
      difficulty,
      isDirectory: true,
    })
  );

  return [...singleFile, ...dirs];
}

/**
 * Get a single-file template by ID (with code)
 */
export function getTemplateById(id: string): PluginTemplate | undefined {
  return getPluginTemplates().find((t) => t.id === id);
}

/**
 * Get a directory template by ID (with files)
 */
export function getDirectoryTemplateById(id: string): PluginDirectoryTemplate | undefined {
  return getPluginDirectoryTemplates().find((t) => t.id === id);
}

/**
 * Get any template by ID (single-file or directory)
 */
export function getAnyTemplateById(id: string): AnyPluginTemplate | undefined {
  return getTemplateById(id) ?? getDirectoryTemplateById(id);
}

/**
 * Get templates filtered by category
 */
export function getTemplatesByCategory(category: PluginCategory): PluginTemplate[] {
  return getPluginTemplates().filter((t) => t.category === category);
}

/**
 * Get templates filtered by difficulty
 */
export function getTemplatesByDifficulty(
  difficulty: "beginner" | "intermediate" | "advanced"
): PluginTemplate[] {
  return getPluginTemplates().filter((t) => t.difficulty === difficulty);
}
