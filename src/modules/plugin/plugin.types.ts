/**
 * Plugin Types
 *
 * Type definitions for the plugin system including plugin definitions,
 * execution context, events, and request/response DTOs.
 *
 * @module modules/plugin/plugin.types
 */

import type { GatewayType, Plugin, UserPlugin } from "@prisma/client";

// Re-export Prisma types
export type { Plugin, UserPlugin } from "@prisma/client";

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
  
  // For workflow integration (Phase 5+)
  inputSchema?: JSONSchema | null;
  outputSchema?: JSONSchema | null;
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
    inputSchema: plugin.inputSchema as JSONSchema | null,
    outputSchema: plugin.outputSchema as JSONSchema | null,
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
  isEnabled: boolean;
  executionCount: number;
  lastExecutedAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
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
    isEnabled: userPlugin.isEnabled,
    executionCount: userPlugin.executionCount,
    lastExecutedAt: userPlugin.lastExecutedAt,
    lastError: userPlugin.lastError,
    createdAt: userPlugin.createdAt,
    updatedAt: userPlugin.updatedAt,
  };
}

// ===========================================
// Request DTOs
// ===========================================

/**
 * Install plugin request
 */
export interface InstallPluginRequest {
  pluginId: string;
  config?: Record<string, unknown>;
  gatewayId?: string;
}

/**
 * Update plugin config request
 */
export interface UpdatePluginConfigRequest {
  config: Record<string, unknown>;
  gatewayId?: string | null;
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
}
