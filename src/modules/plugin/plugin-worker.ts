/**
 * Plugin Worker Implementation
 *
 * This file runs inside a worker thread and executes plugin code
 * in an isolated environment with resource limits.
 *
 * @module modules/plugin/plugin-worker
 */

import { parentPort, workerData } from "node:worker_threads";
import { pino } from "pino";

// ===========================================
// Worker Data Types
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

interface WorkerResult {
  success: boolean;
  output?: unknown;
  error?: string;
  durationMs: number;
  tokensUsed?: number;
  apiCalls?: number;
}

interface WorkerMessage {
  type: "storage.get" | "storage.set" | "storage.delete" | "gateway.execute";
  id: string;
  payload: unknown;
}

interface WorkerResponse {
  type: "storage.response" | "gateway.response";
  id: string;
  result?: unknown;
  error?: string;
}

// ===========================================
// Worker Context Implementation
// ===========================================

const input = workerData as WorkerInput;

// Create a logger for this worker
const workerLogger = pino({
  name: `plugin-worker:${input.pluginSlug}`,
  level: process.env.LOG_LEVEL ?? "info",
});

// Pending message responses
const pendingMessages = new Map<string, {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}>();

// Message ID counter
let messageIdCounter = 0;

/**
 * Send a message to the parent thread and wait for response
 */
function sendMessage(type: WorkerMessage["type"], payload: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const id = `msg-${++messageIdCounter}`;
    pendingMessages.set(id, { resolve, reject });

    parentPort?.postMessage({
      type,
      id,
      payload,
    });

    // Timeout after 10 seconds
    setTimeout(() => {
      if (pendingMessages.has(id)) {
        pendingMessages.delete(id);
        reject(new Error(`Message ${type} timed out`));
      }
    }, 10000);
  });
}

// Handle responses from parent thread
parentPort?.on("message", (message: WorkerResponse) => {
  const pending = pendingMessages.get(message.id);
  if (pending) {
    pendingMessages.delete(message.id);
    if (message.error) {
      pending.reject(new Error(message.error));
    } else {
      pending.resolve(message.result);
    }
  }
});

/**
 * Create storage accessor that communicates with main thread
 */
function createStorage() {
  return {
    async get<T>(key: string): Promise<T | null> {
      return sendMessage("storage.get", { key }) as Promise<T | null>;
    },
    async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
      await sendMessage("storage.set", { key, value, ttlSeconds });
    },
    async delete(key: string): Promise<void> {
      await sendMessage("storage.delete", { key });
    },
    async has(key: string): Promise<boolean> {
      const result = await sendMessage("storage.get", { key });
      return result !== null;
    },
    async increment(key: string, by = 1): Promise<number> {
      const current = (await sendMessage("storage.get", { key })) as number ?? 0;
      const newValue = current + by;
      await sendMessage("storage.set", { key, value: newValue });
      return newValue;
    },
  };
}

/**
 * Create gateway accessor that communicates with main thread
 */
function createGateways() {
  return {
    getByType(type: string) {
      return input.context.gateways.find((g) => g.type === type);
    },
    getById(id: string) {
      return input.context.gateways.find((g) => g.id === id);
    },
    async execute<TResult = unknown>(
      gatewayId: string,
      action: string,
      params: unknown
    ): Promise<TResult> {
      return sendMessage("gateway.execute", {
        gatewayId,
        action,
        params,
      }) as Promise<TResult>;
    },
    list() {
      return input.context.gateways;
    },
  };
}

// ===========================================
// Plugin Execution
// ===========================================

async function executePlugin(): Promise<WorkerResult> {
  const startTime = Date.now();

  try {
    workerLogger.info({ slug: input.pluginSlug }, "Executing plugin in worker");

    // Create the plugin context
    const context = {
      userId: input.context.userId,
      organizationId: input.context.organizationId,
      config: input.context.config,
      userPluginId: input.context.userPluginId,
      gateways: createGateways(),
      storage: createStorage(),
      logger: workerLogger,
    };

    // Create the event
    const event = {
      type: input.eventType,
      data: input.eventData,
    };

    // Execute the plugin code
    // Note: In a real implementation, you would dynamically load the plugin module
    // For now, we use a simple eval-based approach with sandboxing
    const pluginModule = await loadPluginModule(input.pluginCode);

    if (!pluginModule?.onEvent) {
      throw new Error("Plugin module must export an onEvent function");
    }

    const result = await pluginModule.onEvent(event, context);

    const durationMs = Date.now() - startTime;
    workerLogger.info({ slug: input.pluginSlug, durationMs }, "Plugin execution complete");

    return {
      success: result.success ?? true,
      output: result.output,
      error: result.error,
      durationMs,
      tokensUsed: result.tokensUsed,
      apiCalls: result.apiCalls,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    workerLogger.error({ slug: input.pluginSlug, error: errorMessage }, "Plugin execution failed");

    return {
      success: false,
      error: errorMessage,
      durationMs,
    };
  }
}

/**
 * Load a plugin module from code string
 * 
 * Note: This is a simplified implementation. In production, you would want:
 * 1. A proper sandbox using vm2 or isolated-vm
 * 2. Module resolution for imports
 * 3. AST-based validation of the code
 */
async function loadPluginModule(code: string): Promise<{
  onEvent: (event: unknown, context: unknown) => Promise<WorkerResult>;
}> {
  // For built-in plugins, we can require them directly
  // The code string would be the module path
  if (code.startsWith("@builtin/")) {
    const modulePath = code.replace("@builtin/", "");
    const module = await import(modulePath);
    return module.default ?? module;
  }

  // For dynamic plugins, we would use vm2 or isolated-vm
  // For now, return a stub that throws an error
  throw new Error("Dynamic plugin loading not yet implemented. Use built-in plugins.");
}

// ===========================================
// Main Execution
// ===========================================

executePlugin()
  .then((result) => {
    parentPort?.postMessage({ type: "result", result });
  })
  .catch((error) => {
    parentPort?.postMessage({
      type: "result",
      result: {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        durationMs: 0,
      },
    });
  });
