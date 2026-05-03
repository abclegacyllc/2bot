/**
 * Plugin Executor
 *
 * Executes plugins in their workspace containers via the bridge agent,
 * or in-process for built-in server-side plugins.
 *
 * All custom/user plugins run in WORKSPACE mode (simplification).
 * Built-in plugins registered via registerPlugin() run in-process.
 *
 * @module modules/plugin/plugin.executor
 */

import { CircuitOpenError } from "@/lib/circuit-breaker";
import { decryptIfEncrypted } from "@/lib/encryption";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { bridgeClientManager } from "@/modules/workspace";

import type { PluginPermissions } from "@/shared/types/plugin";

import { extractGatewayIdFromPath, gatewayTypeToPlatform, getPluginEntryPath, isDirectoryLayout, pluginDeployService } from "./plugin-deploy.service";

import type { GatewayType } from "@prisma/client";

import {
    executePluginWithCircuit,
    PluginCircuitOpenError
} from "./plugin-circuit";
import type {
    GatewayAccessor,
    PluginContext,
    PluginEvent,
    PluginExecutionResult,
    PluginStorage,
    TelegramCallbackEventData,
    TelegramMessageEventData,
} from "./plugin.interface";
import {
    PluginCrashError,
    PluginExecutionError,
    PluginTimeoutError,
} from "./plugin.interface";

const executorLogger = logger.child({ module: "plugin-executor" });

// ===========================================
// Raw Telegram Format Converters
// ===========================================

/**
 * Convert internal TelegramMessageEventData back to raw Telegram format
 * so container plugins can use standard Telegram Bot API field names.
 */
function toRawTelegramUpdate(event: PluginEvent): Record<string, unknown> {
  if (event.type === 'telegram.message') {
    const d = event.data as TelegramMessageEventData;
    return {
      message: {
        message_id: d.messageId,
        chat: { id: d.chatId, type: d.chatType },
        from: d.from ? {
          id: d.from.id,
          is_bot: d.from.isBot,
          first_name: d.from.firstName,
          last_name: d.from.lastName,
          username: d.from.username,
        } : undefined,
        text: d.text,
        date: d.date,
        photo: d.photo?.map(p => ({
          file_id: p.fileId,
          file_unique_id: p.fileUniqueId,
          width: p.width,
          height: p.height,
        })),
        document: d.document ? {
          file_id: d.document.fileId,
          file_unique_id: d.document.fileUniqueId,
          file_name: d.document.fileName,
          mime_type: d.document.mimeType,
        } : undefined,
      },
    };
  }

  if (event.type === 'telegram.callback') {
    const d = event.data as TelegramCallbackEventData;
    return {
      callback_query: {
        id: d.id,
        from: {
          id: d.from.id,
          is_bot: d.from.isBot,
          first_name: d.from.firstName,
          last_name: d.from.lastName,
          username: d.from.username,
        },
        message: d.message ? {
          message_id: d.message.messageId,
          chat: { id: d.message.chatId, type: d.message.chatType },
          text: d.message.text,
          date: d.message.date,
        } : undefined,
        data: d.data,
      },
    };
  }

  // For other event types, pass data as-is
  return event.data as Record<string, unknown>;
}

// ===========================================
// Configuration
// ===========================================

export interface ExecutorConfig {
  /** Execution timeout in ms (default: 30000) */
  timeoutMs: number;
  /** Memory limit in MB (default: 128) */
  memoryLimitMb: number;
}

const DEFAULT_CONFIG: ExecutorConfig = {
  timeoutMs: 30_000,
  memoryLimitMb: 128,
};

// ===========================================
// In-Process Executor (built-in plugins only)
// ===========================================

/**
 * Plugin registry for in-process execution
 */
const pluginRegistry = new Map<
  string,
  {
    onEvent: (event: PluginEvent, context: PluginContext) => Promise<PluginExecutionResult>;
    onInstall?: (context: PluginContext) => Promise<void>;
    onUninstall?: (context: PluginContext) => Promise<void>;
    onEnable?: (context: PluginContext) => Promise<void>;
    onDisable?: (context: PluginContext) => Promise<void>;
  }
>();

/**
 * Register a plugin handler for in-process execution
 */
export function registerPlugin(
  slug: string,
  handler: {
    onEvent: (event: PluginEvent, context: PluginContext) => Promise<PluginExecutionResult>;
    onInstall?: (context: PluginContext) => Promise<void>;
    onUninstall?: (context: PluginContext) => Promise<void>;
    onEnable?: (context: PluginContext) => Promise<void>;
    onDisable?: (context: PluginContext) => Promise<void>;
  }
): void {
  pluginRegistry.set(slug, handler);
  executorLogger.info({ slug }, "Plugin registered for in-process execution");
}

/**
 * Execute a plugin in-process (without worker thread isolation)
 */
async function executeInProcess(
  pluginSlug: string,
  event: PluginEvent,
  context: PluginContext,
  config: ExecutorConfig
): Promise<PluginExecutionResult> {
  const handler = pluginRegistry.get(pluginSlug);

  if (!handler) {
    throw new PluginExecutionError(`Plugin not registered: ${pluginSlug}`, pluginSlug);
  }

  const startTime = Date.now();

  // Create abort controller for timeout
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => {
    abortController.abort();
  }, config.timeoutMs);

  // Add abort signal to context
  const contextWithSignal: PluginContext = {
    ...context,
    signal: abortController.signal,
  };

  try {
    const result = await Promise.race([
      handler.onEvent(event, contextWithSignal),
      new Promise<never>((_, reject) => {
        abortController.signal.addEventListener("abort", () => {
          reject(new PluginTimeoutError(pluginSlug, config.timeoutMs));
        });
      }),
    ]);

    clearTimeout(timeoutId);

    return {
      ...result,
      metrics: {
        ...result.metrics,
        durationMs: Date.now() - startTime,
      },
    };
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof PluginTimeoutError) {
      throw error;
    }

    throw new PluginExecutionError(
      error instanceof Error ? error.message : String(error),
      pluginSlug,
      error instanceof Error ? error : undefined
    );
  }
}

// ===========================================
// Workspace Container Executor
// ===========================================

/**
 * Execute a plugin inside a user's workspace container via bridge agent.
 *
 * Event-driven model: pushes the event to an already-running plugin process
 * via the bridge agent's plugin.event action. If the plugin is not running,
 * ensures file exists and starts the process first.
 *
 * Cold start path: If the user's container is STOPPED, auto-starts
 * it before executing — so events are never lost due to idle containers.
 */
async function executeInWorkspace(
  pluginSlug: string,
  event: PluginEvent,
  context: PluginContext,
  config: ExecutorConfig
): Promise<PluginExecutionResult> {
  const startTime = Date.now();

  // ── Find user's workspace container ──────────────────────────────
  // Try exact org match first, then fall back to any container for this user.
  let container = await prisma.workspaceContainer.findFirst({
    where: {
      userId: context.userId,
      organizationId: context.organizationId ?? null,
      status: { in: ['RUNNING', 'STOPPED'] },
    },
  });

  if (!container && context.organizationId) {
    container = await prisma.workspaceContainer.findFirst({
      where: {
        userId: context.userId,
        status: { in: ['RUNNING', 'STOPPED'] },
      },
    });
  }

  if (!container) {
    throw new PluginExecutionError(
      'No workspace container found. Please create a workspace first.',
      pluginSlug
    );
  }

  // ── Cold start: auto-start STOPPED containers ───────────────────
  if (container.status === 'STOPPED') {
    executorLogger.info(
      { pluginSlug, userId: context.userId, containerDbId: container.id },
      'Container is STOPPED — auto-starting for plugin execution (cold start)',
    );

    try {
      // Lazy import to avoid circular dependency at module level
      const { workspaceService } = await import('@/modules/workspace');

      // Timeout auto-start to prevent indefinite blocking
      const AUTO_START_TIMEOUT_MS = 60_000;
      await Promise.race([
        workspaceService.autoStartContainer(container.id),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Container auto-start timed out after 60s')), AUTO_START_TIMEOUT_MS)
        ),
      ]);

      // Re-fetch container to get updated bridgePort etc.
      const updated = await prisma.workspaceContainer.findUnique({
        where: { id: container.id },
      });
      if (!updated || updated.status !== 'RUNNING') {
        throw new Error('Container did not reach RUNNING status after auto-start');
      }
      container = updated;
    } catch (err) {
      throw new PluginExecutionError(
        `Cold start failed: ${err instanceof Error ? err.message : String(err)}`,
        pluginSlug,
      );
    }
  }

  // ── Ensure bridge client connection ─────────────────────────────
  let client = bridgeClientManager.getExistingClient(container.id);
  if (!client) {
    if (!container.bridgePort || !container.bridgeAuthToken) {
      throw new PluginExecutionError(
        'Workspace bridge connection info not available. Try restarting your workspace.',
        pluginSlug
      );
    }
    const authToken = decryptIfEncrypted(container.bridgeAuthToken);
    try {
      client = await bridgeClientManager.getClient(
        container.id,
        container.bridgePort,
        authToken,
      );
    } catch (err) {
      throw new PluginExecutionError(
        `Failed to connect to workspace bridge agent: ${err instanceof Error ? err.message : String(err)}`,
        pluginSlug
      );
    }
  }

  // ── Execute ─────────────────────────────────────────────────────
  try {
    // Ensure plugin file exists on the container filesystem (recover from template if missing)
    await pluginDeployService.ensureFileExists(
      container.id,
      pluginSlug,
      context.userId,
      context.organizationId ?? null,
      context.entryFile,
    );

    // Resolve gatewayId for env injection: prefer event field, fall back to entryFile path
    const eventGatewayId = 'gatewayId' in event ? event.gatewayId : null;
    const envGatewayId = eventGatewayId ?? (context.entryFile ? extractGatewayIdFromPath(context.entryFile) : null);

    // Ensure plugin process is running (start if not)
    await pluginDeployService.ensureRunning(
      container.id,
      pluginSlug,
      {
        PLUGIN_USER_ID: context.userId,
        ...(context.organizationId ? { PLUGIN_ORG_ID: context.organizationId } : {}),
        PLUGIN_CONFIG: JSON.stringify(context.config ?? {}),
        ...(envGatewayId ? { PLUGIN_GATEWAY_ID: envGatewayId } : {}),
      },
      context.entryFile,
    );
    let pluginFile = context.entryFile;
    if (!pluginFile) {
      const effectiveGwId = eventGatewayId ?? null;
      let platform: string | undefined;
      if (effectiveGwId) {
        const gw = await prisma.gateway.findUnique({ where: { id: effectiveGwId }, select: { type: true } });
        if (gw) platform = gatewayTypeToPlatform(gw.type);
      }
      const isDir = isDirectoryLayout(pluginSlug);
      pluginFile = getPluginEntryPath(effectiveGwId, pluginSlug, { platform, isDirectory: isDir });
    }

    // Push event to the running plugin via IPC
    // Convert to raw format so container plugins see standard API field names
    // Include _config so the SDK can update sdk.config per-execution (step-level overrides)
    const bridgeResult = await Promise.race([
      client.pluginEvent(pluginFile, {
        type: event.type,
        data: toRawTelegramUpdate(event),
        gatewayId: 'gatewayId' in event ? event.gatewayId : undefined,
        _workflow: event._workflow,
        _config: context.config,
      }),
      new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new PluginTimeoutError(pluginSlug, config.timeoutMs));
        }, config.timeoutMs);
      }),
    ]);

    const durationMs = Date.now() - startTime;

    if (bridgeResult.success) {
      return {
        success: true,
        output: bridgeResult.output ?? null,
        metrics: {
          durationMs,
        },
      };
    } else {
      return {
        success: false,
        error: bridgeResult.error ?? 'Plugin event delivery failed',
        metrics: {
          durationMs,
        },
      };
    }
  } catch (error) {
    if (error instanceof PluginTimeoutError) {
      throw error;
    }
    throw new PluginExecutionError(
      `Workspace execution failed: ${error instanceof Error ? error.message : String(error)}`,
      pluginSlug,
      error instanceof Error ? error : undefined
    );
  }
}

// ===========================================
// Main Executor
// ===========================================

/**
 * Plugin executor singleton
 */
export class PluginExecutor {
  private config: ExecutorConfig;

  /**
   * Short-TTL in-memory cache keyed by caller-supplied `context.idempotencyKey`.
   * Used to short-circuit duplicate `execute()` calls originating from the
   * same webhook event (e.g. the standalone + workflow-step double path).
   * Redis-backed idempotency dedup — survives server restarts and works across
   * multiple server instances. Key: `plugin:dedup:{idempotencyKey}`, TTL 30s.
   * Falls back to no-dedup if Redis is unavailable.
   */
  private static readonly IDEMPOTENCY_TTL_MS = 30_000;
  private static readonly IDEMPOTENCY_REDIS_PREFIX = 'plugin:dedup:';

  constructor(config: Partial<ExecutorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    executorLogger.info({ config: this.config }, "Plugin executor initialized");
  }

  private async getIdempotent(key: string): Promise<PluginExecutionResult | null> {
    try {
      const raw = await redis.get(`${PluginExecutor.IDEMPOTENCY_REDIS_PREFIX}${key}`);
      if (!raw) return null;
      return JSON.parse(raw) as PluginExecutionResult;
    } catch {
      return null;
    }
  }

  private setIdempotent(key: string, result: PluginExecutionResult): void {
    redis
      .set(
        `${PluginExecutor.IDEMPOTENCY_REDIS_PREFIX}${key}`,
        JSON.stringify(result),
        'PX',
        PluginExecutor.IDEMPOTENCY_TTL_MS,
      )
      .catch(() => {});
  }

  /**
   * Execute a plugin event
   *
   * Routing (simplification):
   *   - Built-in plugin registered in pluginRegistry → in-process
   *   - Everything else → workspace container via bridge agent
   */
  async execute(
    pluginSlug: string,
    event: PluginEvent,
    context: PluginContext,
  ): Promise<PluginExecutionResult> {
    const startTime = Date.now();

    // Idempotency short-circuit: if the caller supplied an `idempotencyKey`
    // and we've executed this plugin with the same key in the last 30s,
    // return the cached result. Protects against double-execution from
    // parallel paths (standalone + workflow-step) firing on the same webhook.
    if (context.idempotencyKey) {
      const cached = await this.getIdempotent(context.idempotencyKey);
      if (cached) {
        executorLogger.info(
          { pluginSlug, idempotencyKey: context.idempotencyKey, userId: context.userId },
          "Plugin execution deduplicated via idempotency cache",
        );
        return cached;
      }
    }

    executorLogger.debug(
      { pluginSlug, eventType: event.type, userId: context.userId },
      "Executing plugin"
    );

    try {
      // ── Permission enforcement ──
      // Check Plugin.permissions JSON before executing
      const pluginRecord = await prisma.plugin.findFirst({
        where: { slug: pluginSlug },
        select: { permissions: true },
      });
      if (pluginRecord?.permissions && typeof pluginRecord.permissions === "object") {
        const perms = pluginRecord.permissions as PluginPermissions;
        // If the plugin declares permissions, enforce them
        if (Object.keys(perms).length > 0) {
          // Events that require "reply" permission (messaging events)
          const replyEvents = ["telegram.message", "telegram.callback", "discord.message", "slack.message", "whatsapp.message"];
          if (replyEvents.includes(event.type) && perms.reply === false) {
            executorLogger.warn(
              { pluginSlug, eventType: event.type, userId: context.userId },
              "Plugin execution blocked: reply permission denied"
            );
            return {
              success: false,
              error: "Permission denied: plugin does not have reply permission",
              metrics: { durationMs: Date.now() - startTime },
            };
          }
        }
      }

      // Execute with circuit breaker protection (scoped per user)
      const result = await executePluginWithCircuit(pluginSlug, async () => {
        let innerResult: PluginExecutionResult;

        // Built-in plugins registered in-process run server-side
        if (pluginRegistry.has(pluginSlug)) {
          innerResult = await executeInProcess(pluginSlug, event, context, this.config);
        } else {
          // All custom/user plugins run in the workspace container
          innerResult = await executeInWorkspace(pluginSlug, event, context, this.config);
        }

        // If the plugin returned failure, we should throw to trigger circuit breaker
        if (!innerResult.success) {
          const error = new Error(innerResult.error ?? "Plugin execution failed");
          (error as Error & { pluginResult?: PluginExecutionResult }).pluginResult = innerResult;
          throw error;
        }

        return innerResult;
      }, false, context.userId);

      // Ensure duration is set
      if (result.metrics.durationMs === 0) {
        result.metrics.durationMs = Date.now() - startTime;
      }

      // Record success
      await this.recordExecution(
        context.userPluginId,
        result.success,
        result.metrics.durationMs,
        result.error
      );

      executorLogger.info(
        {
          pluginSlug,
          success: result.success,
          durationMs: result.metrics.durationMs,
          userId: context.userId,
        },
        "Plugin execution complete"
      );

      // Cache successful results for idempotency short-circuit
      if (context.idempotencyKey && result.success) {
        this.setIdempotent(context.idempotencyKey, result);
      }

      return result;
    } catch (error) {
      const durationMs = Date.now() - startTime;

      // Handle circuit breaker open error
      if (error instanceof CircuitOpenError) {
        await this.recordExecution(
          context.userPluginId,
          false,
          durationMs,
          `Circuit open - service unavailable`
        );
        throw PluginCircuitOpenError.fromCircuitError(pluginSlug, error);
      }

      // Check if error contains a plugin result (plugin returned failure)
      const pluginResult = (error as Error & { pluginResult?: PluginExecutionResult })?.pluginResult;
      if (pluginResult) {
        await this.recordExecution(
          context.userPluginId,
          false,
          pluginResult.metrics.durationMs || durationMs,
          pluginResult.error
        );

        executorLogger.warn(
          {
            pluginSlug,
            error: pluginResult.error,
            durationMs: pluginResult.metrics.durationMs,
            userId: context.userId,
          },
          "Plugin returned failure result"
        );

        return pluginResult;
      }

      const errorMessage = error instanceof Error ? error.message : String(error);

      // Record failure
      await this.recordExecution(context.userPluginId, false, durationMs, errorMessage);

      executorLogger.error(
        {
          pluginSlug,
          error: errorMessage,
          durationMs,
          userId: context.userId,
        },
        "Plugin execution failed"
      );

      // Re-throw specific errors
      if (error instanceof PluginTimeoutError || error instanceof PluginCrashError) {
        throw error;
      }

      throw new PluginExecutionError(errorMessage, pluginSlug, error instanceof Error ? error : undefined);
    }
  }

  /**
   * Execute a lifecycle hook (install, uninstall, enable, disable)
   */
  async executeLifecycle(
    pluginSlug: string,
    hook: "onInstall" | "onUninstall" | "onEnable" | "onDisable",
    context: PluginContext
  ): Promise<void> {
    const handler = pluginRegistry.get(pluginSlug);

    if (!handler) {
      executorLogger.warn({ pluginSlug, hook }, "Plugin not registered for lifecycle hook");
      return;
    }

    const hookFn = handler[hook];
    if (!hookFn) {
      executorLogger.debug({ pluginSlug, hook }, "Lifecycle hook not implemented");
      return;
    }

    executorLogger.debug({ pluginSlug, hook, userId: context.userId }, "Executing lifecycle hook");

    try {
      await hookFn(context);
      executorLogger.info({ pluginSlug, hook }, "Lifecycle hook complete");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      executorLogger.error({ pluginSlug, hook, error: errorMessage }, "Lifecycle hook failed");
      throw new PluginExecutionError(`${hook} failed: ${errorMessage}`, pluginSlug);
    }
  }

  /**
   * Record plugin execution result to database
   */
  private async recordExecution(
    userPluginId: string,
    success: boolean,
    _durationMs: number,
    error?: string
  ): Promise<void> {
    try {
      if (success) {
        await prisma.userPlugin.update({
          where: { id: userPluginId },
          data: {
            executionCount: { increment: 1 },
            lastExecutedAt: new Date(),
            lastError: null,
          },
        });
      } else {
        await prisma.userPlugin.update({
          where: { id: userPluginId },
          data: {
            executionCount: { increment: 1 },
            lastExecutedAt: new Date(),
            lastError: error ?? "Unknown error",
          },
        });
      }
    } catch (error) {
      executorLogger.warn(
        { userPluginId, error: error instanceof Error ? error.message : "Unknown" },
        "Failed to record execution"
      );
    }
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ExecutorConfig>): void {
    this.config = { ...this.config, ...config };
    executorLogger.info({ config: this.config }, "Executor configuration updated");
  }

  /**
   * Get current configuration
   */
  getConfig(): ExecutorConfig {
    return { ...this.config };
  }
}

// ===========================================
// Default Executor Instance
// ===========================================

let defaultExecutor: PluginExecutor | null = null;

/**
 * Get or create the default plugin executor
 */
export function getPluginExecutor(config?: Partial<ExecutorConfig>): PluginExecutor {
  if (!defaultExecutor) {
    defaultExecutor = new PluginExecutor(config);
  } else if (config) {
    defaultExecutor.updateConfig(config);
  }
  return defaultExecutor;
}

// ===========================================
// Utility Functions
// ===========================================

/**
 * Create a plugin storage implementation backed by Redis.
 * Each plugin installation gets its own namespaced key space.
 * Data persists across server restarts.
 */
export function createPluginStorage(
  userPluginId: string,
  _userId: string
): PluginStorage {
  // Namespace storage keys per plugin installation
  const keyPrefix = `plugin:${userPluginId}:`;

  return {
    async get<T>(key: string): Promise<T | null> {
      try {
        const raw = await redis.get(`${keyPrefix}${key}`);
        if (raw === null) return null;
        return JSON.parse(raw) as T;
      } catch {
        return null;
      }
    },

    async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
      const serialized = JSON.stringify(value);
      if (ttlSeconds && ttlSeconds > 0) {
        await redis.set(`${keyPrefix}${key}`, serialized, 'EX', ttlSeconds);
      } else {
        await redis.set(`${keyPrefix}${key}`, serialized);
      }
    },

    async delete(key: string): Promise<void> {
      await redis.del(`${keyPrefix}${key}`);
    },

    async has(key: string): Promise<boolean> {
      return (await redis.exists(`${keyPrefix}${key}`)) === 1;
    },

    async increment(key: string, by = 1): Promise<number> {
      // If key doesn't exist yet, Redis INCRBY creates it with value 0 first
      return redis.incrby(`${keyPrefix}${key}`, by);
    },
  };
}

/**
 * Create a gateway accessor for a user
 */
export function createGatewayAccessor(
  userId: string,
  gateways: Array<{ id: string; name: string; type: string }>,
  executeGateway: (gatewayId: string, action: string, params: unknown) => Promise<unknown>
): GatewayAccessor {
  return {
    getByType(type) {
      const gateway = gateways.find((g) => g.type === type);
      return gateway ? { id: gateway.id, name: gateway.name } : undefined;
    },

    getById(id) {
      const gateway = gateways.find((g) => g.id === id);
      // Type assertion needed because gateways array has string type, not GatewayType
      return gateway ? { id: gateway.id, name: gateway.name, type: gateway.type as GatewayType } : undefined;
    },

    async execute<TResult = unknown>(
      gatewayId: string,
      action: string,
      params: unknown
    ): Promise<TResult> {
      // Verify gateway belongs to user
      const gateway = gateways.find((g) => g.id === gatewayId);
      if (!gateway) {
        throw new Error(`Gateway not found or not accessible: ${gatewayId}`);
      }

      return executeGateway(gatewayId, action, params) as Promise<TResult>;
    },

    list() {
      return gateways.map((g) => ({
        id: g.id,
        name: g.name,
        type: g.type as GatewayType,
      }));
    },
  };
}

// ===========================================
// Diagnostics helpers (used by Test/Preflight surfaces)
// ===========================================

/**
 * Resolve a user's running workspace container and return a connected bridge client.
 * Returns `null` when no usable container exists or the bridge is unreachable.
 *
 * Used by preflight + log-capture flows; never throws.
 */
async function getBridgeClientForUser(
  userId: string,
  organizationId: string | null | undefined,
): Promise<{ client: Awaited<ReturnType<typeof bridgeClientManager.getClient>>; containerId: string } | null> {
  const container = await prisma.workspaceContainer.findFirst({
    where: {
      userId,
      ...(organizationId ? { organizationId } : {}),
      status: { in: ['RUNNING'] },
    },
    select: { id: true, bridgePort: true, bridgeAuthToken: true },
  }) ?? await prisma.workspaceContainer.findFirst({
    where: { userId, status: { in: ['RUNNING'] } },
    select: { id: true, bridgePort: true, bridgeAuthToken: true },
  });

  if (!container || !container.bridgePort || !container.bridgeAuthToken) return null;

  try {
    const authToken = decryptIfEncrypted(container.bridgeAuthToken);
    const client = await bridgeClientManager.getClient(container.id, container.bridgePort, authToken);
    return { client, containerId: container.id };
  } catch {
    return null;
  }
}

/**
 * Fetch recent stdout/stderr logs for a plugin from its workspace container.
 * Returns an empty array if the container is unavailable or the call fails.
 */
export async function fetchPluginLogs(
  userId: string,
  organizationId: string | null | undefined,
  pluginFile: string,
): Promise<Array<{ level: string; message: string; ts?: string | number }>> {
  const handle = await getBridgeClientForUser(userId, organizationId);
  if (!handle) return [];
  try {
    const result = await handle.client.pluginLogs(pluginFile) as {
      logs?: Array<{ level: string; message: string; ts?: string | number; timestamp?: string | number }>;
    };
    const raw = Array.isArray(result?.logs) ? result.logs : [];
    return raw.map((l) => ({
      level: l.level ?? 'info',
      message: l.message ?? '',
      ts: l.ts ?? l.timestamp,
    }));
  } catch {
    return [];
  }
}

/**
 * Run the bridge agent's static plugin validator (`node --check` + manifest + lint).
 * Returns `{ valid, problems[] }`. When the bridge is unreachable, returns
 * `{ valid: true, problems: [] }` so callers can fall through gracefully.
 */
export async function validatePluginInWorkspace(
  userId: string,
  organizationId: string | null | undefined,
  pluginFile: string,
): Promise<{
  valid: boolean;
  problems: Array<{ severity: 'error' | 'warning' | 'info'; message: string; line?: number; column?: number }>;
  bridgeAvailable: boolean;
}> {
  const handle = await getBridgeClientForUser(userId, organizationId);
  if (!handle) return { valid: true, problems: [], bridgeAvailable: false };
  try {
    const result = await handle.client.pluginValidate(pluginFile);
    return {
      valid: !!result.valid,
      problems: Array.isArray(result.problems) ? result.problems : [],
      bridgeAvailable: true,
    };
  } catch (err) {
    return {
      valid: false,
      problems: [{
        severity: 'error',
        message: `Bridge validation call failed: ${err instanceof Error ? err.message : String(err)}`,
      }],
      bridgeAvailable: true,
    };
  }
}

// ===========================================
// Re-exports
// ===========================================

export {
    cleanupPluginCircuit, getAllPluginCircuits, getPluginCircuitStats, isPluginCircuitOpen, PluginCircuitOpenError, resetPluginCircuit
} from "./plugin-circuit";

