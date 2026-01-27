"use strict";
/**
 * Plugin Worker Implementation
 *
 * This file runs inside a worker thread and executes plugin code
 * in an isolated environment with resource limits.
 *
 * @module modules/plugin/plugin-worker
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const node_worker_threads_1 = require("node:worker_threads");
const pino_1 = require("pino");
// ===========================================
// Worker Context Implementation
// ===========================================
const input = node_worker_threads_1.workerData;
// Create a logger for this worker
const workerLogger = (0, pino_1.pino)({
    name: `plugin-worker:${input.pluginSlug}`,
    level: process.env.LOG_LEVEL ?? "info",
});
// Pending message responses
const pendingMessages = new Map();
// Message ID counter
let messageIdCounter = 0;
/**
 * Send a message to the parent thread and wait for response
 */
function sendMessage(type, payload) {
    return new Promise((resolve, reject) => {
        const id = `msg-${++messageIdCounter}`;
        pendingMessages.set(id, { resolve, reject });
        node_worker_threads_1.parentPort?.postMessage({
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
node_worker_threads_1.parentPort?.on("message", (message) => {
    const pending = pendingMessages.get(message.id);
    if (pending) {
        pendingMessages.delete(message.id);
        if (message.error) {
            pending.reject(new Error(message.error));
        }
        else {
            pending.resolve(message.result);
        }
    }
});
/**
 * Create storage accessor that communicates with main thread
 */
function createStorage() {
    return {
        async get(key) {
            return sendMessage("storage.get", { key });
        },
        async set(key, value, ttlSeconds) {
            await sendMessage("storage.set", { key, value, ttlSeconds });
        },
        async delete(key) {
            await sendMessage("storage.delete", { key });
        },
        async has(key) {
            const result = await sendMessage("storage.get", { key });
            return result !== null;
        },
        async increment(key, by = 1) {
            const current = (await sendMessage("storage.get", { key })) ?? 0;
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
        getByType(type) {
            return input.context.gateways.find((g) => g.type === type);
        },
        getById(id) {
            return input.context.gateways.find((g) => g.id === id);
        },
        async execute(gatewayId, action, params) {
            return sendMessage("gateway.execute", {
                gatewayId,
                action,
                params,
            });
        },
        list() {
            return input.context.gateways;
        },
    };
}
// ===========================================
// Plugin Execution
// ===========================================
async function executePlugin() {
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
    }
    catch (error) {
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
async function loadPluginModule(code) {
    // For built-in plugins, we can require them directly
    // The code string would be the module path
    if (code.startsWith("@builtin/")) {
        const modulePath = code.replace("@builtin/", "");
        const module = await Promise.resolve(`${modulePath}`).then(s => __importStar(require(s)));
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
    node_worker_threads_1.parentPort?.postMessage({ type: "result", result });
})
    .catch((error) => {
    node_worker_threads_1.parentPort?.postMessage({
        type: "result",
        result: {
            success: false,
            error: error instanceof Error ? error.message : String(error),
            durationMs: 0,
        },
    });
});
//# sourceMappingURL=plugin-worker.js.map