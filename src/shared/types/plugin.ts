/**
 * Shared Plugin Types for Frontend
 *
 * Extracted from inline page types to provide a single source of truth.
 * These types mirror the backend API response shapes.
 *
 * @module shared/types/plugin
 */

// ===========================================
// Plugin Catalog Types
// ===========================================

/**
 * Author type for plugins
 */
export type PluginAuthorType = "SYSTEM" | "USER" | "AI";

/**
 * Plugin category
 */
export type PluginCategory =
  | "general"
  | "analytics"
  | "messaging"
  | "automation"
  | "moderation"
  | "utilities";

/**
 * Plugin list item from catalog API
 */
export interface PluginListItem {
  id: string;
  slug: string;
  name: string;
  description: string;
  version: string;
  icon: string | null;
  category: string;
  tags: string[];
  requiredGateways: string[];
  isBuiltin: boolean;
  authorType: PluginAuthorType;
  isPublic: boolean;
}

/**
 * Installed plugin reference (for tracking install state in catalog)
 */
export interface InstalledPlugin {
  id: string;
  pluginId: string;
  enabled: boolean;
}

// ===========================================
// User Plugin (Installed) Types
// ===========================================

/**
 * User's installed plugin with details
 */
export interface UserPlugin {
  id: string;
  pluginId: string;
  pluginSlug: string;
  pluginName: string;
  pluginDescription: string;
  pluginIcon: string | null;
  pluginCategory: string;
  isEnabled: boolean;
  config: Record<string, unknown>;
  gatewayId: string | null;
  gatewayName: string | null;
  gatewayType: string | null;
  gatewayStatus: string | null;
  requiredGateways: string[];
  executionCount: number;
  lastExecutedAt: string | null;
  lastError: string | null;
  /** Storage quota for local KV store in MB (0 = unlimited) */
  storageQuotaMb: number;
  createdAt: string;
  updatedAt: string;
  /** Author type - custom plugins have authorType USER */
  authorType?: PluginAuthorType;
  /** Entry file path relative to workspace (e.g. plugins/my-bot.js or plugins/my-bot/index.js) */
  entryFile?: string | null;
}

// ===========================================
// Config Schema Types
// ===========================================

export interface ConfigSchemaProperty {
  type?: string;
  description?: string;
  default?: unknown;
  minimum?: number;
  maximum?: number;
  enum?: unknown[];
  title?: string;
  /** Custom UI component to render instead of default input (e.g. "ai-model-selector") */
  uiComponent?: string;
}

export interface ConfigSchema {
  type?: string;
  properties?: Record<string, ConfigSchemaProperty>;
  required?: string[];
}

// ===========================================
// Plugin Definition (Full Details)
// ===========================================

export interface PluginDefinition {
  id: string;
  slug: string;
  name: string;
  description: string;
  version: string;
  requiredGateways: string[];
  configSchema: ConfigSchema;
  icon: string | null;
  category: string;
  tags: string[];
  isBuiltin: boolean;
  isActive: boolean;
  authorId: string | null;
  authorType: PluginAuthorType;
  isPublic: boolean;
}

// ===========================================
// Template Types
// ===========================================

/**
 * Plugin template list item (without code)
 */
export interface PluginTemplateListItem {
  id: string;
  name: string;
  description: string;
  category: PluginCategory;
  requiredGateways: string[];
  tags: string[];
  difficulty: "beginner" | "intermediate" | "advanced";
  /** Whether this is a directory (multi-file) template */
  isDirectory?: boolean;
}

/**
 * Full plugin template (with code) — single-file
 */
export interface PluginTemplate {
  id: string;
  name: string;
  description: string;
  category: PluginCategory;
  requiredGateways: string[];
  tags: string[];
  difficulty: "beginner" | "intermediate" | "advanced";
  configSchema: ConfigSchema;
  code: string;
  isDirectory?: false;
}

/**
 * Full plugin template (with files) — directory
 */
export interface PluginDirectoryTemplate {
  id: string;
  name: string;
  description: string;
  category: PluginCategory;
  requiredGateways: string[];
  tags: string[];
  difficulty: "beginner" | "intermediate" | "advanced";
  configSchema: ConfigSchema;
  isDirectory: true;
  entry: string;
  files: Record<string, string>;
}

export type AnyPluginTemplate = PluginTemplate | PluginDirectoryTemplate;

// ===========================================
// Custom Plugin Request Types
// ===========================================

export interface CreateCustomPluginRequest {
  slug: string;
  name: string;
  description: string;
  /** Single-file plugin code (required unless files is provided) */
  code?: string;
  /** Multi-file (directory) plugin files — key is relative path, value is content */
  files?: Record<string, string>;
  /** Entry file for directory plugins (default: "index.js") */
  entry?: string;
  requiredGateways?: string[];
  configSchema?: ConfigSchema;
  config?: Record<string, unknown>;
  gatewayId?: string;
  category?: PluginCategory;
  tags?: string[];
}

export interface UpdateCustomPluginRequest {
  code?: string;
  name?: string;
  description?: string;
  configSchema?: ConfigSchema;
  category?: PluginCategory;
  tags?: string[];
}

export interface CreatePluginFromRepoRequest {
  gitUrl: string;
  branch?: string;
  gatewayId?: string;
}

export interface RegisterDirectoryAsPluginRequest {
  dirPath: string;
  gatewayId?: string;
}
