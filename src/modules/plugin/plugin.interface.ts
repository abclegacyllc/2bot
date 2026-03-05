/**
 * Plugin Interface/Contract
 *
 * Defines the contracts that plugins must implement and the context
 * they receive during execution. All built-in and marketplace plugins
 * must conform to these interfaces.
 *
 * @module modules/plugin/plugin.interface
 */

import type { GatewayType } from "@prisma/client";
import { Prisma } from "@prisma/client";
import type { Logger } from "pino";

import type { JSONSchema, PluginCategory } from "./plugin.types";

// ===========================================
// Plugin Events
// ===========================================

/**
 * Telegram message event
 */
export interface TelegramMessageEventData {
  messageId: number;
  chatId: number;
  chatType: "private" | "group" | "supergroup" | "channel";
  from?: {
    id: number;
    isBot: boolean;
    firstName: string;
    lastName?: string;
    username?: string;
  };
  text?: string;
  photo?: Array<{
    fileId: string;
    fileUniqueId: string;
    width: number;
    height: number;
  }>;
  document?: {
    fileId: string;
    fileUniqueId: string;
    fileName?: string;
    mimeType?: string;
  };
  date: number;
  replyToMessage?: TelegramMessageEventData;
}

/**
 * Telegram callback query event
 */
export interface TelegramCallbackEventData {
  id: string;
  chatId: number;
  from: {
    id: number;
    isBot: boolean;
    firstName: string;
    lastName?: string;
    username?: string;
  };
  message?: TelegramMessageEventData;
  data?: string;
}

/**
 * Telegram chat member updated event
 * Fires when the bot or a chat member status changes
 */
export interface TelegramChatMemberUpdatedEventData {
  chatId: number;
  chatType: "private" | "group" | "supergroup" | "channel";
  chatTitle?: string;
  from: {
    id: number;
    isBot: boolean;
    firstName: string;
    lastName?: string;
    username?: string;
  };
  date: number;
  oldStatus: "creator" | "administrator" | "member" | "restricted" | "left" | "kicked";
  newStatus: "creator" | "administrator" | "member" | "restricted" | "left" | "kicked";
  oldMember: {
    userId: number;
    isBot: boolean;
    firstName: string;
    username?: string;
  };
  newMember: {
    userId: number;
    isBot: boolean;
    firstName: string;
    username?: string;
  };
}

/**
 * Telegram inline query event
 */
export interface TelegramInlineQueryEventData {
  id: string;
  from: {
    id: number;
    isBot: boolean;
    firstName: string;
    lastName?: string;
    username?: string;
  };
  query: string;
  offset: string;
  chatType?: "sender" | "private" | "group" | "supergroup" | "channel";
}

/**
 * Telegram chosen inline result event
 */
export interface TelegramChosenInlineResultEventData {
  resultId: string;
  from: {
    id: number;
    isBot: boolean;
    firstName: string;
    lastName?: string;
    username?: string;
  };
  query: string;
  inlineMessageId?: string;
}

/**
 * Telegram poll state event
 */
export interface TelegramPollEventData {
  pollId: string;
  question: string;
  options: Array<{ text: string; voterCount: number }>;
  totalVoterCount: number;
  isClosed: boolean;
  isAnonymous: boolean;
  type: "regular" | "quiz";
  allowsMultipleAnswers: boolean;
  correctOptionId?: number;
  explanation?: string;
}

/**
 * Telegram poll answer event
 */
export interface TelegramPollAnswerEventData {
  pollId: string;
  user: {
    id: number;
    isBot: boolean;
    firstName: string;
    lastName?: string;
    username?: string;
  };
  optionIds: number[];
}

/**
 * Schedule trigger event
 */
export interface ScheduleTriggerEventData {
  scheduledTime: Date;
  cronExpression: string;
  timezone?: string;
}

/**
 * Custom gateway / webhook trigger event
 */
export interface CustomGatewayEventData {
  method: string;
  headers: Record<string, string>;
  query: Record<string, string>;
  body: unknown;
  /** Decrypted credentials stored on the gateway (key-value pairs) */
  credentials: Record<string, string>;
}

/** @deprecated Use CustomGatewayEventData */
export type WebhookTriggerEventData = CustomGatewayEventData;

/**
 * Manual trigger event
 */
export interface ManualTriggerEventData {
  triggeredBy: string;
  triggeredAt: Date;
  params?: Record<string, unknown>;
}

/**
 * Union type for all plugin events
 */
export type PluginEvent =
  | { type: "telegram.message"; data: TelegramMessageEventData; gatewayId: string }
  | { type: "telegram.callback"; data: TelegramCallbackEventData; gatewayId: string }
  | { type: "telegram.my_chat_member"; data: TelegramChatMemberUpdatedEventData; gatewayId: string }
  | { type: "telegram.chat_member"; data: TelegramChatMemberUpdatedEventData; gatewayId: string }
  | { type: "telegram.inline_query"; data: TelegramInlineQueryEventData; gatewayId: string }
  | { type: "telegram.chosen_inline_result"; data: TelegramChosenInlineResultEventData; gatewayId: string }
  | { type: "telegram.poll"; data: TelegramPollEventData; gatewayId: string }
  | { type: "telegram.poll_answer"; data: TelegramPollAnswerEventData; gatewayId: string }
  | { type: "schedule.trigger"; data: ScheduleTriggerEventData }
  | { type: "webhook.trigger"; data: CustomGatewayEventData; gatewayId: string }
  | { type: "customGateway.incoming"; data: CustomGatewayEventData; gatewayId: string }
  | { type: "manual.trigger"; data: ManualTriggerEventData }
  | { type: "workflow.step"; data: { input: unknown; previousOutput?: unknown } };

/**
 * Event types as constants
 */
export const PLUGIN_EVENT_TYPES = {
  TELEGRAM_MESSAGE: "telegram.message",
  TELEGRAM_CALLBACK: "telegram.callback",
  TELEGRAM_MY_CHAT_MEMBER: "telegram.my_chat_member",
  TELEGRAM_CHAT_MEMBER: "telegram.chat_member",
  TELEGRAM_INLINE_QUERY: "telegram.inline_query",
  TELEGRAM_CHOSEN_INLINE_RESULT: "telegram.chosen_inline_result",
  TELEGRAM_POLL: "telegram.poll",
  TELEGRAM_POLL_ANSWER: "telegram.poll_answer",
  SCHEDULE_TRIGGER: "schedule.trigger",
  WEBHOOK_TRIGGER: "webhook.trigger",
  CUSTOM_GATEWAY_INCOMING: "customGateway.incoming",
  MANUAL_TRIGGER: "manual.trigger",
  WORKFLOW_STEP: "workflow.step",
} as const;

// ===========================================
// Plugin Context
// ===========================================

/**
 * Gateway accessor for plugins to interact with gateways
 */
export interface GatewayAccessor {
  /**
   * Get a connected gateway by type
   */
  getByType(type: GatewayType): { id: string; name: string } | undefined;

  /**
   * Get a specific gateway by ID
   */
  getById(id: string): { id: string; name: string; type: GatewayType } | undefined;

  /**
   * Execute an action on a gateway
   */
  execute<TResult = unknown>(
    gatewayId: string,
    action: string,
    params: unknown
  ): Promise<TResult>;

  /**
   * List available gateways
   */
  list(): Array<{ id: string; name: string; type: GatewayType }>;
}

/**
 * Plugin storage for persisting data between executions
 */
export interface PluginStorage {
  /**
   * Get a value from storage
   */
  get<T>(key: string): Promise<T | null>;

  /**
   * Set a value in storage
   */
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;

  /**
   * Delete a value from storage
   */
  delete(key: string): Promise<void>;

  /**
   * Check if a key exists
   */
  has(key: string): Promise<boolean>;

  /**
   * Increment a numeric value
   */
  increment(key: string, by?: number): Promise<number>;
}

/**
 * Context provided to plugins during execution
 */
export interface PluginContext {
  /** User ID who owns this plugin installation */
  userId: string;

  /** Organization ID if plugin is org-owned */
  organizationId?: string;

  /** User's plugin configuration */
  config: Record<string, unknown>;

  /** Plugin installation ID */
  userPluginId: string;

  /** Entry file path inside workspace (e.g. "plugins/my-bot.js" or "plugins/my-bot/index.js") */
  entryFile?: string;

  /** Access to user's gateways */
  gateways: GatewayAccessor;

  /** Persistent storage for plugin data */
  storage: PluginStorage;

  /** Logger instance for this plugin */
  logger: Logger;

  /** Abort signal for cancellation */
  signal?: AbortSignal;
}

// ===========================================
// Plugin Execution Result
// ===========================================

/**
 * Result returned from plugin execution
 */
export interface PluginExecutionResult {
  /** Whether execution was successful */
  success: boolean;

  /** Output data (for workflow chaining) */
  output?: unknown;

  /** Error message if failed */
  error?: string;

  /** Execution metrics */
  metrics: {
    /** Execution duration in milliseconds */
    durationMs: number;
    /** Tokens used (for AI plugins) */
    tokensUsed?: number;
    /** Number of API calls made */
    apiCalls?: number;
  };
}

// ===========================================
// Plugin Handler Interface
// ===========================================

/**
 * Plugin handler interface that all plugins must implement
 */
export interface PluginHandler {
  // ==========================================
  // Metadata (required)
  // ==========================================

  /** Unique plugin identifier */
  readonly slug: string;

  /** Human-readable name */
  readonly name: string;

  /** Plugin description */
  readonly description: string;

  /** Semantic version */
  readonly version: string;

  /** Category for organization */
  readonly category: PluginCategory;

  /** Required gateway types */
  readonly requiredGateways: GatewayType[];

  /** JSON Schema for configuration validation */
  readonly configSchema: JSONSchema;

  /** JSON Schema for input validation (workflow step) */
  readonly inputSchema?: JSONSchema;

  /** JSON Schema for output validation (workflow step) */
  readonly outputSchema?: JSONSchema;

  /** Icon name for UI display */
  readonly icon: string;

  /** Tags for categorization and search */
  readonly tags: string[];

  // ==========================================
  // Event Handlers (required)
  // ==========================================

  /**
   * Handle an incoming event
   * This is the main execution entry point
   */
  onEvent(event: PluginEvent, context: PluginContext): Promise<PluginExecutionResult>;

  // ==========================================
  // Lifecycle Hooks (optional)
  // ==========================================

  /**
   * Called when plugin is installed
   */
  onInstall?(context: PluginContext): Promise<void>;

  /**
   * Called when plugin is uninstalled
   */
  onUninstall?(context: PluginContext): Promise<void>;

  /**
   * Called when plugin is enabled
   */
  onEnable?(context: PluginContext): Promise<void>;

  /**
   * Called when plugin is disabled
   */
  onDisable?(context: PluginContext): Promise<void>;

  // ==========================================
  // Seed Data Generation
  // ==========================================

  /**
   * Generate Prisma seed data from plugin metadata.
   * Used by database seeding to ensure single source of truth.
   */
  toSeedData(): Prisma.PluginCreateInput;
}

// ===========================================
// Plugin Registration
// ===========================================

/**
 * Plugin registration info for the registry
 */
export interface PluginRegistration {
  /** Plugin handler implementation */
  handler: PluginHandler;

  /** Whether this is a built-in plugin */
  isBuiltin: boolean;

  /** Tags for discovery */
  tags?: string[];

  /** Icon URL or name */
  icon?: string;
}

// ===========================================
// Base Plugin Class
// ===========================================

/**
 * Abstract base class for plugin implementations
 * Provides common functionality and default implementations
 */
export abstract class BasePlugin implements PluginHandler {
  abstract readonly slug: string;
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly version: string;
  abstract readonly category: PluginCategory;
  abstract readonly requiredGateways: GatewayType[];
  abstract readonly configSchema: JSONSchema;

  /** Icon name or URL for display */
  abstract readonly icon: string;

  /** Tags for discovery and filtering */
  abstract readonly tags: string[];

  readonly inputSchema?: JSONSchema;
  readonly outputSchema?: JSONSchema;

  /**
   * Main event handler - must be implemented by subclass
   */
  abstract onEvent(
    event: PluginEvent,
    context: PluginContext
  ): Promise<PluginExecutionResult>;

  /**
   * Generate Prisma seed data from plugin metadata.
   * Used by database seeding to ensure single source of truth.
   */
  toSeedData(): Prisma.PluginCreateInput {
    return {
      slug: this.slug,
      name: this.name,
      description: this.description,
      version: this.version,
      requiredGateways: this.requiredGateways,
      configSchema: this.configSchema as Prisma.InputJsonValue,
      inputSchema: (this.inputSchema as Prisma.InputJsonValue) ?? Prisma.DbNull,
      outputSchema: (this.outputSchema as Prisma.InputJsonValue) ?? Prisma.DbNull,
      icon: this.icon,
      category: this.category,
      tags: this.tags,
      isBuiltin: true,
      isActive: true,
    };
  }

  /**
   * Helper to create a success result
   */
  protected success(output?: unknown, metrics?: Partial<PluginExecutionResult["metrics"]>): PluginExecutionResult {
    return {
      success: true,
      output,
      metrics: {
        durationMs: 0, // Will be overwritten by executor
        ...metrics,
      },
    };
  }

  /**
   * Helper to create a failure result
   */
  protected failure(error: string, metrics?: Partial<PluginExecutionResult["metrics"]>): PluginExecutionResult {
    return {
      success: false,
      error,
      metrics: {
        durationMs: 0,
        ...metrics,
      },
    };
  }

  /**
   * Type guard for telegram message events
   */
  protected isTelegramMessage(event: PluginEvent): event is { type: "telegram.message"; data: TelegramMessageEventData; gatewayId: string } {
    return event.type === "telegram.message";
  }

  /**
   * Type guard for telegram callback events
   */
  protected isTelegramCallback(event: PluginEvent): event is { type: "telegram.callback"; data: TelegramCallbackEventData; gatewayId: string } {
    return event.type === "telegram.callback";
  }

  /**
   * Type guard for chat member update events (bot added/removed from chat)
   */
  protected isMyChatMemberUpdate(event: PluginEvent): event is { type: "telegram.my_chat_member"; data: TelegramChatMemberUpdatedEventData; gatewayId: string } {
    return event.type === "telegram.my_chat_member";
  }

  /**
   * Type guard for chat member update events (any member, not just the bot)
   */
  protected isChatMemberUpdate(event: PluginEvent): event is { type: "telegram.chat_member"; data: TelegramChatMemberUpdatedEventData; gatewayId: string } {
    return event.type === "telegram.chat_member";
  }

  /**
   * Type guard for inline query events
   */
  protected isInlineQuery(event: PluginEvent): event is { type: "telegram.inline_query"; data: TelegramInlineQueryEventData; gatewayId: string } {
    return event.type === "telegram.inline_query";
  }

  /**
   * Type guard for poll events
   */
  protected isPoll(event: PluginEvent): event is { type: "telegram.poll"; data: TelegramPollEventData; gatewayId: string } {
    return event.type === "telegram.poll";
  }

  /**
   * Type guard for poll answer events
   */
  protected isPollAnswer(event: PluginEvent): event is { type: "telegram.poll_answer"; data: TelegramPollAnswerEventData; gatewayId: string } {
    return event.type === "telegram.poll_answer";
  }

  /**
   * Type guard for workflow step events
   */
  protected isWorkflowStep(event: PluginEvent): event is { type: "workflow.step"; data: { input: unknown; previousOutput?: unknown } } {
    return event.type === "workflow.step";
  }
}

// ===========================================
// Plugin Errors
// ===========================================

/**
 * Base error for plugin-related errors
 */
export class PluginError extends Error {
  constructor(
    message: string,
    public readonly pluginSlug?: string
  ) {
    super(message);
    this.name = "PluginError";
  }
}

/**
 * Plugin not found error
 */
export class PluginNotFoundError extends PluginError {
  constructor(slug: string) {
    super(`Plugin not found: ${slug}`, slug);
    this.name = "PluginNotFoundError";
  }
}

/**
 * Plugin execution error
 */
export class PluginExecutionError extends PluginError {
  constructor(
    message: string,
    pluginSlug?: string,
    public readonly cause?: Error
  ) {
    super(message, pluginSlug);
    this.name = "PluginExecutionError";
  }
}

/**
 * Plugin timeout error
 */
export class PluginTimeoutError extends PluginError {
  constructor(
    pluginSlug: string,
    public readonly timeoutMs: number
  ) {
    super(`Plugin execution timed out after ${timeoutMs}ms`, pluginSlug);
    this.name = "PluginTimeoutError";
  }
}

/**
 * Plugin crash error (worker thread died)
 */
export class PluginCrashError extends PluginError {
  constructor(
    pluginSlug: string,
    public readonly originalError: Error
  ) {
    super(`Plugin crashed: ${originalError.message}`, pluginSlug);
    this.name = "PluginCrashError";
  }
}

/**
 * Plugin configuration error
 */
export class PluginConfigError extends PluginError {
  constructor(
    message: string,
    pluginSlug: string,
    public readonly configErrors: string[]
  ) {
    super(message, pluginSlug);
    this.name = "PluginConfigError";
  }
}
