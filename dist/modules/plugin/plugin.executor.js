"use strict";
/**
 * Plugin Executor
 *
 * Executes plugins in isolated worker threads with resource limits.
 * Provides timeout handling, crash recovery, circuit breaker protection,
 * and metrics collection.
 *
 * @module modules/plugin/plugin.executor
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resetPluginCircuit = exports.PluginCircuitOpenError = exports.isPluginCircuitOpen = exports.getPluginCircuitStats = exports.getAllPluginCircuits = exports.cleanupPluginCircuit = exports.PluginExecutor = void 0;
exports.registerPlugin = registerPlugin;
exports.getPluginExecutor = getPluginExecutor;
exports.createPluginStorage = createPluginStorage;
exports.createGatewayAccessor = createGatewayAccessor;
const node_path_1 = __importDefault(require("node:path"));
const node_worker_threads_1 = require("node:worker_threads");
const circuit_breaker_1 = require("@/lib/circuit-breaker");
const logger_1 = require("@/lib/logger");
const prisma_1 = require("@/lib/prisma");
const plugin_circuit_1 = require("./plugin-circuit");
const plugin_interface_1 = require("./plugin.interface");
const executorLogger = logger_1.logger.child({ module: "plugin-executor" });
const DEFAULT_CONFIG = {
    timeoutMs: 30_000,
    memoryLimitMb: 128,
    useWorkers: true,
};
/**
 * Execute a plugin in a worker thread
 */
async function executeInWorker(pluginSlug, pluginCode, event, context, config) {
    return new Promise((resolve, reject) => {
        const workerPath = node_path_1.default.resolve(__dirname, "plugin-worker.js");
        // Prepare worker input (context without functions)
        const workerInput = {
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
        const worker = new node_worker_threads_1.Worker(workerPath, {
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
            reject(new plugin_interface_1.PluginTimeoutError(pluginSlug, config.timeoutMs));
        }, config.timeoutMs);
        // Handle messages from worker (storage, gateway requests)
        worker.on("message", async (message) => {
            if (message.type === "result") {
                clearTimeout(timeout);
                resolve(message.result);
                return;
            }
            // Handle storage operations
            if (message.type === "storage.get") {
                const { key } = message.payload;
                try {
                    const value = await context.storage.get(key);
                    worker.postMessage({
                        type: "storage.response",
                        id: message.id,
                        result: value,
                    });
                }
                catch (error) {
                    worker.postMessage({
                        type: "storage.response",
                        id: message.id,
                        error: error instanceof Error ? error.message : "Storage error",
                    });
                }
            }
            if (message.type === "storage.set") {
                const { key, value, ttlSeconds } = message.payload;
                try {
                    await context.storage.set(key, value, ttlSeconds);
                    worker.postMessage({
                        type: "storage.response",
                        id: message.id,
                        result: null,
                    });
                }
                catch (error) {
                    worker.postMessage({
                        type: "storage.response",
                        id: message.id,
                        error: error instanceof Error ? error.message : "Storage error",
                    });
                }
            }
            if (message.type === "storage.delete") {
                const { key } = message.payload;
                try {
                    await context.storage.delete(key);
                    worker.postMessage({
                        type: "storage.response",
                        id: message.id,
                        result: null,
                    });
                }
                catch (error) {
                    worker.postMessage({
                        type: "storage.response",
                        id: message.id,
                        error: error instanceof Error ? error.message : "Storage error",
                    });
                }
            }
            // Handle gateway operations
            if (message.type === "gateway.execute") {
                const { gatewayId, action, params } = message.payload;
                try {
                    const result = await context.gateways.execute(gatewayId, action, params);
                    worker.postMessage({
                        type: "gateway.response",
                        id: message.id,
                        result,
                    });
                }
                catch (error) {
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
            reject(new plugin_interface_1.PluginCrashError(pluginSlug, error));
        });
        // Handle worker exit
        worker.on("exit", (code) => {
            clearTimeout(timeout);
            if (code !== 0) {
                reject(new plugin_interface_1.PluginCrashError(pluginSlug, new Error(`Worker exited with code ${code}`)));
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
const pluginRegistry = new Map();
/**
 * Register a plugin handler for in-process execution
 */
function registerPlugin(slug, handler) {
    pluginRegistry.set(slug, handler);
    executorLogger.info({ slug }, "Plugin registered for in-process execution");
}
/**
 * Execute a plugin in-process (without worker thread isolation)
 */
async function executeInProcess(pluginSlug, event, context, config) {
    const handler = pluginRegistry.get(pluginSlug);
    if (!handler) {
        throw new plugin_interface_1.PluginExecutionError(`Plugin not registered: ${pluginSlug}`, pluginSlug);
    }
    const startTime = Date.now();
    // Create abort controller for timeout
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => {
        abortController.abort();
    }, config.timeoutMs);
    // Add abort signal to context
    const contextWithSignal = {
        ...context,
        signal: abortController.signal,
    };
    try {
        const result = await Promise.race([
            handler.onEvent(event, contextWithSignal),
            new Promise((_, reject) => {
                abortController.signal.addEventListener("abort", () => {
                    reject(new plugin_interface_1.PluginTimeoutError(pluginSlug, config.timeoutMs));
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
    }
    catch (error) {
        clearTimeout(timeoutId);
        if (error instanceof plugin_interface_1.PluginTimeoutError) {
            throw error;
        }
        throw new plugin_interface_1.PluginExecutionError(error instanceof Error ? error.message : String(error), pluginSlug, error instanceof Error ? error : undefined);
    }
}
// ===========================================
// Main Executor
// ===========================================
/**
 * Plugin executor singleton
 */
class PluginExecutor {
    config;
    constructor(config = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        executorLogger.info({ config: this.config }, "Plugin executor initialized");
    }
    /**
     * Execute a plugin event
     */
    async execute(pluginSlug, pluginCode, event, context) {
        const startTime = Date.now();
        executorLogger.debug({ pluginSlug, eventType: event.type, userId: context.userId }, "Executing plugin");
        // Check if circuit is open before attempting execution
        if ((0, plugin_circuit_1.isPluginCircuitOpen)(pluginSlug)) {
            const stats = (0, plugin_circuit_1.getPluginCircuitStats)(pluginSlug);
            const retryAfterMs = stats?.lastStateChange
                ? 60000 - (Date.now() - stats.lastStateChange.getTime())
                : 60000;
            executorLogger.warn({ pluginSlug, userId: context.userId, retryAfterMs }, "Plugin circuit is OPEN, skipping execution");
            // Record as failure (circuit open is a failure case)
            await this.recordExecution(context.userPluginId, false, Date.now() - startTime, `Circuit open - too many recent failures`);
            throw new plugin_circuit_1.PluginCircuitOpenError(pluginSlug, Math.max(0, retryAfterMs));
        }
        try {
            // Execute with circuit breaker protection
            const result = await (0, plugin_circuit_1.executePluginWithCircuit)(pluginSlug, async () => {
                let innerResult;
                if (this.config.useWorkers && pluginCode && !pluginCode.startsWith("@builtin/")) {
                    innerResult = await executeInWorker(pluginSlug, pluginCode, event, context, this.config);
                }
                else {
                    innerResult = await executeInProcess(pluginSlug, event, context, this.config);
                }
                // If the plugin returned failure, we should throw to trigger circuit breaker
                if (!innerResult.success) {
                    const error = new Error(innerResult.error ?? "Plugin execution failed");
                    error.pluginResult = innerResult;
                    throw error;
                }
                return innerResult;
            });
            // Ensure duration is set
            if (result.metrics.durationMs === 0) {
                result.metrics.durationMs = Date.now() - startTime;
            }
            // Record success
            await this.recordExecution(context.userPluginId, result.success, result.metrics.durationMs, result.error);
            executorLogger.info({
                pluginSlug,
                success: result.success,
                durationMs: result.metrics.durationMs,
                userId: context.userId,
            }, "Plugin execution complete");
            return result;
        }
        catch (error) {
            const durationMs = Date.now() - startTime;
            // Handle circuit breaker open error
            if (error instanceof circuit_breaker_1.CircuitOpenError) {
                await this.recordExecution(context.userPluginId, false, durationMs, `Circuit open - service unavailable`);
                throw plugin_circuit_1.PluginCircuitOpenError.fromCircuitError(pluginSlug, error);
            }
            // Check if error contains a plugin result (plugin returned failure)
            const pluginResult = error?.pluginResult;
            if (pluginResult) {
                await this.recordExecution(context.userPluginId, false, pluginResult.metrics.durationMs || durationMs, pluginResult.error);
                executorLogger.warn({
                    pluginSlug,
                    error: pluginResult.error,
                    durationMs: pluginResult.metrics.durationMs,
                    userId: context.userId,
                }, "Plugin returned failure result");
                return pluginResult;
            }
            const errorMessage = error instanceof Error ? error.message : String(error);
            // Record failure
            await this.recordExecution(context.userPluginId, false, durationMs, errorMessage);
            executorLogger.error({
                pluginSlug,
                error: errorMessage,
                durationMs,
                userId: context.userId,
            }, "Plugin execution failed");
            // Re-throw specific errors
            if (error instanceof plugin_interface_1.PluginTimeoutError || error instanceof plugin_interface_1.PluginCrashError) {
                throw error;
            }
            throw new plugin_interface_1.PluginExecutionError(errorMessage, pluginSlug, error instanceof Error ? error : undefined);
        }
    }
    /**
     * Execute a lifecycle hook (install, uninstall, enable, disable)
     */
    async executeLifecycle(pluginSlug, hook, context) {
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
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            executorLogger.error({ pluginSlug, hook, error: errorMessage }, "Lifecycle hook failed");
            throw new plugin_interface_1.PluginExecutionError(`${hook} failed: ${errorMessage}`, pluginSlug);
        }
    }
    /**
     * Record plugin execution result to database
     */
    async recordExecution(userPluginId, success, _durationMs, error) {
        try {
            if (success) {
                await prisma_1.prisma.userPlugin.update({
                    where: { id: userPluginId },
                    data: {
                        executionCount: { increment: 1 },
                        lastExecutedAt: new Date(),
                        lastError: null,
                    },
                });
            }
            else {
                await prisma_1.prisma.userPlugin.update({
                    where: { id: userPluginId },
                    data: {
                        executionCount: { increment: 1 },
                        lastExecutedAt: new Date(),
                        lastError: error ?? "Unknown error",
                    },
                });
            }
        }
        catch (error) {
            executorLogger.warn({ userPluginId, error: error instanceof Error ? error.message : "Unknown" }, "Failed to record execution");
        }
    }
    /**
     * Update configuration
     */
    updateConfig(config) {
        this.config = { ...this.config, ...config };
        executorLogger.info({ config: this.config }, "Executor configuration updated");
    }
    /**
     * Get current configuration
     */
    getConfig() {
        return { ...this.config };
    }
}
exports.PluginExecutor = PluginExecutor;
// ===========================================
// Default Executor Instance
// ===========================================
let defaultExecutor = null;
/**
 * Get or create the default plugin executor
 */
function getPluginExecutor(config) {
    if (!defaultExecutor) {
        defaultExecutor = new PluginExecutor(config);
    }
    else if (config) {
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
function createPluginStorage(userPluginId, _userId) {
    // Using a prefix to namespace storage keys per plugin installation
    const keyPrefix = `plugin:${userPluginId}:`;
    // In-memory storage for now (replace with Redis in production)
    const memoryStore = new Map();
    return {
        async get(key) {
            const item = memoryStore.get(`${keyPrefix}${key}`);
            if (!item)
                return null;
            // Check expiration
            if (item.expiresAt && Date.now() > item.expiresAt) {
                memoryStore.delete(`${keyPrefix}${key}`);
                return null;
            }
            return item.value;
        },
        async set(key, value, ttlSeconds) {
            memoryStore.set(`${keyPrefix}${key}`, {
                value,
                expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined,
            });
        },
        async delete(key) {
            memoryStore.delete(`${keyPrefix}${key}`);
        },
        async has(key) {
            const result = await this.get(key);
            return result !== null;
        },
        async increment(key, by = 1) {
            const current = (await this.get(key)) ?? 0;
            const newValue = current + by;
            await this.set(key, newValue);
            return newValue;
        },
    };
}
/**
 * Create a gateway accessor for a user
 */
function createGatewayAccessor(userId, gateways, executeGateway) {
    return {
        getByType(type) {
            const gateway = gateways.find((g) => g.type === type);
            return gateway ? { id: gateway.id, name: gateway.name } : undefined;
        },
        getById(id) {
            const gateway = gateways.find((g) => g.id === id);
            // Type assertion needed because gateways array has string type, not GatewayType
            return gateway ? { id: gateway.id, name: gateway.name, type: gateway.type } : undefined;
        },
        async execute(gatewayId, action, params) {
            // Verify gateway belongs to user
            const gateway = gateways.find((g) => g.id === gatewayId);
            if (!gateway) {
                throw new Error(`Gateway not found or not accessible: ${gatewayId}`);
            }
            return executeGateway(gatewayId, action, params);
        },
        list() {
            return gateways.map((g) => ({
                id: g.id,
                name: g.name,
                type: g.type,
            }));
        },
    };
}
// ===========================================
// Re-exports
// ===========================================
var plugin_circuit_2 = require("./plugin-circuit");
Object.defineProperty(exports, "cleanupPluginCircuit", { enumerable: true, get: function () { return plugin_circuit_2.cleanupPluginCircuit; } });
Object.defineProperty(exports, "getAllPluginCircuits", { enumerable: true, get: function () { return plugin_circuit_2.getAllPluginCircuits; } });
Object.defineProperty(exports, "getPluginCircuitStats", { enumerable: true, get: function () { return plugin_circuit_2.getPluginCircuitStats; } });
Object.defineProperty(exports, "isPluginCircuitOpen", { enumerable: true, get: function () { return plugin_circuit_2.isPluginCircuitOpen; } });
Object.defineProperty(exports, "PluginCircuitOpenError", { enumerable: true, get: function () { return plugin_circuit_2.PluginCircuitOpenError; } });
Object.defineProperty(exports, "resetPluginCircuit", { enumerable: true, get: function () { return plugin_circuit_2.resetPluginCircuit; } });
//# sourceMappingURL=plugin.executor.js.map