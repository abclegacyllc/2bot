/**
 * Plugin Types
 *
 * Type definitions for the plugin system including plugin definitions,
 * execution context, events, and request/response DTOs.
 *
 * @module modules/plugin/plugin.types
 */

import type { GatewayType, Plugin, PluginAuthorType, UserPlugin } from "@prisma/client";

// Re-export Prisma types
export type { Plugin, PluginAuthorType, UserPlugin } from "@prisma/client";

// ===========================================
// Plugin Path Utilities
// ===========================================

/**
 * Extract plugin slug from a workspace file path.
 *
 *   "plugins/echo.js"            → "echo"
 *   "plugins/my-bot/index.ts"    → "my-bot"
 *   "plugins/my-bot/"            → "my-bot"
 *   "plugins/cool.mjs"           → "cool"
 */
export function pluginSlugFromPath(filePath: string): string {
  return filePath
    .replace(/^bots\/[^/]+\/plugins\//, '')  // Strip bot-dir prefix: bots/{gwId}/plugins/
    .replace(/^plugins\//, '')                // Strip flat prefix: plugins/
    .replace(/\.(js|ts|mjs|cjs|jsx|tsx)$/, '')
    .replace(/\/index$/, '')
    .replace(/\/$/, '');
}

// ===========================================
// JSON Schema Type (simplified)
// ===========================================

/**
 * JSON Schema type for plugin configuration validation
 * Full JSON Schema spec is complex - this is a simplified version
 */
export interface JSONSchema {
  type?: "string" | "number" | "boolean" | "object" | "array" | "null";
  properties?: Record<string, JSONSchema>;
  items?: JSONSchema;
  required?: string[];
  default?: unknown;
  description?: string;
  enum?: unknown[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: string;
  title?: string;
  /** Custom UI component to render instead of default input (e.g. "ai-model-selector") */
  uiComponent?: string;
}

// ===========================================
// Plugin Definition Types
// ===========================================

/**
 * Plugin definition with typed schemas
 */
export interface PluginDefinition {
  id: string;
  slug: string;
  name: string;
  description: string;
  version: string;
  requiredGateways: GatewayType[];
  configSchema: JSONSchema;
  icon?: string | null;
  category: PluginCategory;
  tags: string[];
  isBuiltin: boolean;
  isActive: boolean;
  authorId?: string | null;
  authorType: PluginAuthorType;
  isPublic: boolean;
  
  // For workflow integration (Phase 5+)
  inputSchema?: JSONSchema | null;
  outputSchema?: JSONSchema | null;

  // Event routing & conflict detection
  eventTypes: string[];
  eventRole: string;
  conflictsWith: string[];
}

/**
 * Plugin categories
 */
export type PluginCategory = 
  | "general"
  | "analytics"
  | "messaging"
  | "automation"
  | "moderation"
  | "utilities";

/**
 * Convert Prisma Plugin to PluginDefinition
 */
export function toPluginDefinition(plugin: Plugin): PluginDefinition {
  return {
    id: plugin.id,
    slug: plugin.slug,
    name: plugin.name,
    description: plugin.description,
    version: plugin.version,
    requiredGateways: plugin.requiredGateways,
    configSchema: plugin.configSchema as JSONSchema,
    icon: plugin.icon,
    category: plugin.category as PluginCategory,
    tags: plugin.tags,
    isBuiltin: plugin.isBuiltin,
    isActive: plugin.isActive,
    authorId: plugin.authorId,
    authorType: plugin.authorType,
    isPublic: plugin.isPublic,
    inputSchema: plugin.inputSchema as JSONSchema | null,
    outputSchema: plugin.outputSchema as JSONSchema | null,
    eventTypes: plugin.eventTypes ?? [],
    eventRole: plugin.eventRole ?? "responder",
    conflictsWith: plugin.conflictsWith ?? [],
  };
}

// ===========================================
// User Plugin Types
// ===========================================

/**
 * User plugin with plugin info included
 */
export interface UserPluginWithPlugin extends UserPlugin {
  plugin: Plugin;
  gateway?: { id: string; name: string; type: GatewayType; status: string } | null;
}

/**
 * Safe user plugin for API responses (with plugin details)
 */
export interface SafeUserPlugin {
  id: string;
  pluginId: string;
  pluginSlug: string;
  pluginName: string;
  pluginDescription: string;
  pluginIcon: string | null;
  pluginCategory: string;
  config: Record<string, unknown>;
  gatewayId: string | null;
  gatewayName: string | null;
  gatewayType: string | null;
  gatewayStatus: string | null;
  requiredGateways: string[];
  isEnabled: boolean;
  executionCount: number;
  lastExecutedAt: Date | null;
  lastError: string | null;
  storageQuotaMb: number;
  createdAt: Date;
  updatedAt: Date;
  authorType: PluginAuthorType;
  /** Entry file path relative to workspace (e.g. plugins/my-bot.js or plugins/my-bot/index.js) */
  entryFile: string | null;
}

/**
 * Convert UserPlugin with Plugin to SafeUserPlugin
 */
export function toSafeUserPlugin(userPlugin: UserPluginWithPlugin): SafeUserPlugin {
  return {
    id: userPlugin.id,
    pluginId: userPlugin.pluginId,
    pluginSlug: userPlugin.plugin.slug,
    pluginName: userPlugin.plugin.name,
    pluginDescription: userPlugin.plugin.description,
    pluginIcon: userPlugin.plugin.icon,
    pluginCategory: userPlugin.plugin.category,
    config: userPlugin.config as Record<string, unknown>,
    gatewayId: userPlugin.gatewayId,
    gatewayName: userPlugin.gateway?.name ?? null,
    gatewayType: userPlugin.gateway?.type ?? null,
    gatewayStatus: userPlugin.gateway?.status ?? null,
    requiredGateways: userPlugin.plugin.requiredGateways as string[],
    isEnabled: userPlugin.isEnabled,
    executionCount: userPlugin.executionCount,
    lastExecutedAt: userPlugin.lastExecutedAt,
    lastError: userPlugin.lastError,
    storageQuotaMb: userPlugin.storageQuotaMb,
    createdAt: userPlugin.createdAt,
    updatedAt: userPlugin.updatedAt,
    authorType: userPlugin.plugin.authorType,
    entryFile: userPlugin.entryFile ?? null,
  };
}

// ===========================================
// Conflict Resolution
// ===========================================

/**
 * Auto-resolution applied during plugin conflict resolution at install time.
 */
export interface ConflictResolution {
  type: "role_change" | "event_filter";
  /** Slug of the plugin that was changed */
  plugin: string;
  /** Previous value */
  from: string;
  /** New value */
  to: string;
  /** Human-readable reason */
  reason: string;
}

// ===========================================
// Request DTOs
// ===========================================

/**
 * Install plugin request
 * Can use either pluginId or slug to identify the plugin
 */
export interface InstallPluginRequest {
  pluginId?: string;
  slug?: string;
  config?: Record<string, unknown>;
  gatewayId?: string;
}

/**
 * Update plugin config request
 */
export interface UpdatePluginConfigRequest {
  config: Record<string, unknown>;
  gatewayId?: string | null;
  /** Storage quota for local KV store in MB (0 = unlimited, default 50) */
  storageQuotaMb?: number;
}

/**
 * Toggle plugin request
 */
export interface TogglePluginRequest {
  enabled: boolean;
}

// ===========================================
// Execution Types
// ===========================================

/**
 * Plugin execution trigger types
 */
export type PluginTrigger = 
  | "standalone"      // Manual execution
  | "workflow_step"   // Part of a workflow
  | "schedule"        // Scheduled execution
  | "event";          // Event-driven (telegram message, etc.)

/**
 * Plugin execution context
 * Passed to plugin handlers during execution
 */
export interface PluginExecutionContext {
  /** How the plugin was triggered */
  trigger: PluginTrigger;
  
  /** User plugin instance ID */
  userPluginId: string;
  
  /** The plugin definition */
  plugin: PluginDefinition;
  
  /** User's configuration for this plugin */
  config: Record<string, unknown>;
  
  /** Gateway ID if plugin is bound to one */
  gatewayId?: string;
  
  /** Workflow info (if triggered by workflow) */
  workflowId?: string;
  workflowRunId?: string;
  stepIndex?: number;
  
  /** Output from previous workflow step (if any) */
  previousStepOutput?: unknown;
  
  /** Variables available to the plugin */
  variables: Record<string, unknown>;
  
  /** User ID for context */
  userId: string;
  
  /** Organization ID if applicable */
  organizationId?: string;
}

/**
 * Plugin execution result
 * Returned by plugin handlers after execution
 */
export interface PluginExecutionResult {
  /** Whether execution succeeded */
  success: boolean;
  
  /** Output data (passed to next workflow step if applicable) */
  output?: unknown;
  
  /** Error message if failed */
  error?: string;
  
  /** Execution metrics */
  metrics: {
    /** Execution duration in milliseconds */
    durationMs: number;
    /** AI tokens used (if any) */
    tokensUsed?: number;
    /** External API calls made */
    apiCalls?: number;
  };
}

// ===========================================
// Plugin Event Types
// ===========================================

/**
 * Telegram message event data
 */
export interface TelegramMessageEvent {
  messageId: number;
  chatId: number;
  chatType: "private" | "group" | "supergroup" | "channel";
  userId?: number;
  username?: string;
  text?: string;
  date: number;
  replyToMessageId?: number;
}

/**
 * Telegram callback query event data
 */
export interface TelegramCallbackEvent {
  callbackId: string;
  chatId: number;
  userId: number;
  messageId?: number;
  data?: string;
}

/**
 * Schedule trigger event data
 */
export interface ScheduleTriggerEvent {
  scheduleId: string;
  scheduledAt: Date;
  executedAt: Date;
  cron?: string;
}

/**
 * Plugin events - discriminated union
 */
export type PluginEvent =
  | { type: "telegram.message"; data: TelegramMessageEvent }
  | { type: "telegram.callback"; data: TelegramCallbackEvent }
  | { type: "telegram.edited_message"; data: TelegramMessageEvent }
  | { type: "schedule.trigger"; data: ScheduleTriggerEvent };

/**
 * Get event type name
 */
export type PluginEventType = PluginEvent["type"];

// ===========================================
// Plugin List Item (for API responses)
// NOTE: Matching frontend type at @/shared/types/plugin — keep in sync.
// Backend uses Prisma GatewayType enum; frontend uses plain strings.
// ===========================================

/**
 * Plugin list item for catalog
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
  requiredGateways: GatewayType[];
  isBuiltin: boolean;
  authorType: PluginAuthorType;
  isPublic: boolean;
}

// ===========================================
// Custom Plugin Request Types
// ===========================================

/**
 * Create a custom plugin
 */
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
  requiredGateways?: GatewayType[];
  configSchema?: JSONSchema;
  config?: Record<string, unknown>;
  gatewayId?: string;
  category?: PluginCategory;
  tags?: string[];
  /** Events this plugin handles (e.g. ["telegram.message"]) */
  eventTypes?: string[];
  /** "responder" (sends replies, exclusive) or "observer" (read-only) */
  eventRole?: string;
  /** Slugs of plugins this one conflicts with */
  conflictsWith?: string[];
}

/**
 * Update custom plugin code
 */
export interface UpdateCustomPluginRequest {
  code?: string;
  name?: string;
  description?: string;
  configSchema?: JSONSchema;
  category?: PluginCategory;
  tags?: string[];
}

/**
 * Create a plugin from a Git repository
 */
export interface CreatePluginFromRepoRequest {
  /** Git repository URL (https or git://) */
  gitUrl: string;
  /** Branch to clone (default: default branch) */
  branch?: string;
  /** Optional gateway to bind the plugin to */
  gatewayId?: string;
}

/**
 * Register an existing workspace directory as a plugin
 */
export interface RegisterDirectoryAsPluginRequest {
  /** Path to directory inside workspace (e.g. "plugins/my-bot") */
  dirPath: string;
  /** Optional gateway to bind the plugin to */
  gatewayId?: string;
}
