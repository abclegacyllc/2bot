/**
 * Plugin Executor
 *
 * Executes plugins in isolated worker threads with resource limits.
 * Provides timeout handling, crash recovery, circuit breaker protection,
 * and metrics collection.
 *
 * @module modules/plugin/plugin.executor
 */

import path from "node:path";
import { Worker } from "node:worker_threads";

import { CircuitOpenError } from "@/lib/circuit-breaker";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

import {
    executePluginWithCircuit,
    getPluginCircuitStats,
    isPluginCircuitOpen,
    PluginCircuitOpenError,
} from "./plugin-circuit";
import type {
    GatewayAccessor,
    PluginContext,
    PluginEvent,
    PluginExecutionResult,
    PluginStorage,
} from "./plugin.interface";
import {
    PluginCrashError,
    PluginExecutionError,
    PluginTimeoutError,
} from "./plugin.interface";

const executorLogger = logger.child({ module: "plugin-executor" });

// ===========================================
// Configuration
// ===========================================

export interface ExecutorConfig {
  /** Execution timeout in ms (default: 30000) */
  timeoutMs: number;
  /** Memory limit in MB (default: 128) */
  memoryLimitMb: number;
  /** Whether to use worker threads (default: true) */
  useWorkers: boolean;
}

const DEFAULT_CONFIG: ExecutorConfig = {
  timeoutMs: 30_000,
  memoryLimitMb: 128,
  useWorkers: true,
};

// ===========================================
// Worker Thread Executor
// ===========================================

interface WorkerInput {
  pluginSlug: string;
  pluginCode: string;
  eventType: string;
  eventData: unknown;
  context: {
    userId: string;
    organizationId?: string;
    config: Record<string, unknown>;
    userPluginId: string;
    gateways: Array<{ id: string; name: string; type: string }>;
  };
}

interface WorkerMessage {
  type: string;
  id: string;
  payload: unknown;
  result?: PluginExecutionResult;
}

/**
 * Execute a plugin in a worker thread
 */
async function executeInWorker(
  pluginSlug: string,
  pluginCode: string,
  event: PluginEvent,
  context: PluginContext,
  config: ExecutorConfig
): Promise<PluginExecutionResult> {
  return new Promise((resolve, reject) => {
    const workerPath = path.resolve(__dirname, "plugin-worker.js");

    // Prepare worker input (context without functions)
    const workerInput: WorkerInput = {
      pluginSlug,
      pluginCode,
      eventType: event.type,
      eventData: event.type === "workflow.step" ? event.data : event,
      context: {
        userId: context.userId,
        organizationId: context.organizationId,
        config: context.config,
        userPluginId: context.userPluginId,
        gateways: context.gateways.list().map((g) => ({
          id: g.id,
          name: g.name,
          type: g.type,
        })),
      },
    };

    const worker = new Worker(workerPath, {
      workerData: workerInput,
      resourceLimits: {
        maxOldGenerationSizeMb: config.memoryLimitMb,
        maxYoungGenerationSizeMb: config.memoryLimitMb / 4,
        stackSizeMb: 4,
      },
    });

    // Timeout handler
    const timeout = setTimeout(() => {
      worker.terminate();
      reject(new PluginTimeoutError(pluginSlug, config.timeoutMs));
    }, config.timeoutMs);

    // Handle messages from worker (storage, gateway requests)
    worker.on("message", async (message: WorkerMessage) => {
      if (message.type === "result") {
        clearTimeout(timeout);
        resolve(message.result!);
        return;
      }

      // Handle storage operations
      if (message.type === "storage.get") {
        const { key } = message.payload as { key: string };
        try {
          const value = await context.storage.get(key);
          worker.postMessage({
            type: "storage.response",
            id: message.id,
            result: value,
          });
        } catch (error) {
          worker.postMessage({
            type: "storage.response",
            id: message.id,
            error: error instanceof Error ? error.message : "Storage error",
          });
        }
      }

      if (message.type === "storage.set") {
        const { key, value, ttlSeconds } = message.payload as {
          key: string;
          value: unknown;
          ttlSeconds?: number;
        };
        try {
          await context.storage.set(key, value, ttlSeconds);
          worker.postMessage({
            type: "storage.response",
            id: message.id,
            result: null,
          });
        } catch (error) {
          worker.postMessage({
            type: "storage.response",
            id: message.id,
            error: error instanceof Error ? error.message : "Storage error",
          });
        }
      }

      if (message.type === "storage.delete") {
        const { key } = message.payload as { key: string };
        try {
          await context.storage.delete(key);
          worker.postMessage({
            type: "storage.response",
            id: message.id,
            result: null,
          });
        } catch (error) {
          worker.postMessage({
            type: "storage.response",
            id: message.id,
            error: error instanceof Error ? error.message : "Storage error",
          });
        }
      }

      // Handle gateway operations
      if (message.type === "gateway.execute") {
        const { gatewayId, action, params } = message.payload as {
          gatewayId: string;
          action: string;
          params: unknown;
        };
        try {
          const result = await context.gateways.execute(gatewayId, action, params);
          worker.postMessage({
            type: "gateway.response",
            id: message.id,
            result,
          });
        } catch (error) {
          worker.postMessage({
            type: "gateway.response",
            id: message.id,
            error: error instanceof Error ? error.message : "Gateway error",
          });
        }
      }
    });

    // Handle worker errors
    worker.on("error", (error) => {
      clearTimeout(timeout);
      reject(new PluginCrashError(pluginSlug, error));
    });

    // Handle worker exit
    worker.on("exit", (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new PluginCrashError(pluginSlug, new Error(`Worker exited with code ${code}`)));
      }
    });
  });
}

// ===========================================
// In-Process Executor (for testing/development)
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
// Main Executor
// ===========================================

/**
 * Plugin executor singleton
 */
export class PluginExecutor {
  private config: ExecutorConfig;

  constructor(config: Partial<ExecutorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    executorLogger.info({ config: this.config }, "Plugin executor initialized");
  }

  /**
   * Execute a plugin event
   */
  async execute(
    pluginSlug: string,
    pluginCode: string,
    event: PluginEvent,
    context: PluginContext
  ): Promise<PluginExecutionResult> {
    const startTime = Date.now();

    executorLogger.debug(
      { pluginSlug, eventType: event.type, userId: context.userId },
      "Executing plugin"
    );

    // Check if circuit is open before attempting execution
    if (isPluginCircuitOpen(pluginSlug)) {
      const stats = getPluginCircuitStats(pluginSlug);
      const retryAfterMs = stats?.lastStateChange
        ? 60000 - (Date.now() - stats.lastStateChange.getTime())
        : 60000;

      executorLogger.warn(
        { pluginSlug, userId: context.userId, retryAfterMs },
        "Plugin circuit is OPEN, skipping execution"
      );

      // Record as failure (circuit open is a failure case)
      await this.recordExecution(
        context.userPluginId,
        false,
        Date.now() - startTime,
        `Circuit open - too many recent failures`
      );

      throw new PluginCircuitOpenError(pluginSlug, Math.max(0, retryAfterMs));
    }

    try {
      // Execute with circuit breaker protection
      const result = await executePluginWithCircuit(pluginSlug, async () => {
        let innerResult: PluginExecutionResult;

        if (this.config.useWorkers && pluginCode && !pluginCode.startsWith("@builtin/")) {
          innerResult = await executeInWorker(
            pluginSlug,
            pluginCode,
            event,
            context,
            this.config
          );
        } else {
          innerResult = await executeInProcess(pluginSlug, event, context, this.config);
        }

        // If the plugin returned failure, we should throw to trigger circuit breaker
        if (!innerResult.success) {
          const error = new Error(innerResult.error ?? "Plugin execution failed");
          (error as any).pluginResult = innerResult;
          throw error;
        }

        return innerResult;
      });

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
      const pluginResult = (error as any)?.pluginResult as PluginExecutionResult | undefined;
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
 * Create a plugin storage implementation backed by Redis or database
 */
export function createPluginStorage(
  userPluginId: string,
  _userId: string
): PluginStorage {
  // Using a prefix to namespace storage keys per plugin installation
  const keyPrefix = `plugin:${userPluginId}:`;

  // In-memory storage for now (replace with Redis in production)
  const memoryStore = new Map<string, { value: unknown; expiresAt?: number }>();

  return {
    async get<T>(key: string): Promise<T | null> {
      const item = memoryStore.get(`${keyPrefix}${key}`);
      if (!item) return null;

      // Check expiration
      if (item.expiresAt && Date.now() > item.expiresAt) {
        memoryStore.delete(`${keyPrefix}${key}`);
        return null;
      }

      return item.value as T;
    },

    async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
      memoryStore.set(`${keyPrefix}${key}`, {
        value,
        expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined,
      });
    },

    async delete(key: string): Promise<void> {
      memoryStore.delete(`${keyPrefix}${key}`);
    },

    async has(key: string): Promise<boolean> {
      const result = await this.get(key);
      return result !== null;
    },

    async increment(key: string, by = 1): Promise<number> {
      const current = (await this.get<number>(key)) ?? 0;
      const newValue = current + by;
      await this.set(key, newValue);
      return newValue;
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
      return gateway ? { id: gateway.id, name: gateway.name, type: gateway.type as any } : undefined;
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
        type: g.type as any,
      }));
    },
  };
}

// ===========================================
// Re-exports
// ===========================================

export {
    cleanupPluginCircuit, getAllPluginCircuits, getPluginCircuitStats, isPluginCircuitOpen, PluginCircuitOpenError, resetPluginCircuit
} from "./plugin-circuit";

