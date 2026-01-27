"use strict";
/**
 * Plugin Circuit Breaker Integration
 *
 * Provides circuit breaker functionality for plugin execution.
 * Each plugin (by slug) has its own circuit breaker to prevent
 * one failing plugin from affecting system stability.
 *
 * @module modules/plugin/plugin-circuit
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PluginCircuitOpenError = exports.CircuitOpenError = void 0;
exports.getPluginCircuit = getPluginCircuit;
exports.executePluginWithCircuit = executePluginWithCircuit;
exports.recordPluginSuccess = recordPluginSuccess;
exports.isPluginCircuitOpen = isPluginCircuitOpen;
exports.getPluginCircuitStats = getPluginCircuitStats;
exports.getAllPluginCircuits = getAllPluginCircuits;
exports.resetPluginCircuit = resetPluginCircuit;
exports.cleanupPluginCircuit = cleanupPluginCircuit;
const circuit_breaker_1 = require("@/lib/circuit-breaker");
const logger_1 = require("@/lib/logger");
const circuitLogger = logger_1.logger.child({ module: "plugin-circuit" });
// Re-export for convenience
var circuit_breaker_2 = require("@/lib/circuit-breaker");
Object.defineProperty(exports, "CircuitOpenError", { enumerable: true, get: function () { return circuit_breaker_2.CircuitOpenError; } });
// ===========================================
// Plugin Circuit Configuration
// ===========================================
/**
 * Default circuit breaker config for plugins
 */
const DEFAULT_PLUGIN_CIRCUIT_CONFIG = {
    failureThreshold: 5, // 5 consecutive failures to open
    resetTimeoutMs: 60000, // 1 minute before retry
    monitorWindowMs: 120000, // 2 minute window for failures
    halfOpenMaxAttempts: 2, // 2 successes to close
};
/**
 * More strict config for critical plugins
 */
const STRICT_PLUGIN_CIRCUIT_CONFIG = {
    failureThreshold: 3,
    resetTimeoutMs: 30000,
    monitorWindowMs: 60000,
    halfOpenMaxAttempts: 3,
};
// ===========================================
// Plugin Circuit Management
// ===========================================
/**
 * Get the circuit breaker name for a plugin
 */
function getCircuitName(pluginSlug) {
    return `plugin:${pluginSlug}`;
}
/**
 * Get or create a circuit breaker for a plugin
 */
function getPluginCircuit(pluginSlug, isStrict = false) {
    const name = getCircuitName(pluginSlug);
    const config = isStrict ? STRICT_PLUGIN_CIRCUIT_CONFIG : DEFAULT_PLUGIN_CIRCUIT_CONFIG;
    return circuit_breaker_1.circuitRegistry.getOrCreate(name, config);
}
/**
 * Execute plugin operation through circuit breaker
 *
 * @example
 * ```typescript
 * const result = await executePluginWithCircuit(
 *   "my-plugin",
 *   async () => {
 *     return await executor.execute(event, context);
 *   }
 * );
 * ```
 */
async function executePluginWithCircuit(pluginSlug, operation, isStrict = false) {
    const circuit = getPluginCircuit(pluginSlug, isStrict);
    return circuit.execute(operation);
}
/**
 * Record a manual success for a plugin circuit (useful for lifecycle hooks)
 */
function recordPluginSuccess(pluginSlug) {
    const circuit = circuit_breaker_1.circuitRegistry.get(getCircuitName(pluginSlug));
    if (circuit) {
        // Force recording success by executing a successful no-op
        circuit.execute(async () => undefined).catch(() => {
            // Ignore errors - circuit might be open
        });
    }
}
/**
 * Check if a plugin's circuit is currently open
 */
function isPluginCircuitOpen(pluginSlug) {
    const circuit = circuit_breaker_1.circuitRegistry.get(getCircuitName(pluginSlug));
    return circuit?.getStats().state === "OPEN";
}
/**
 * Get plugin circuit breaker stats
 */
function getPluginCircuitStats(pluginSlug) {
    const circuit = circuit_breaker_1.circuitRegistry.get(getCircuitName(pluginSlug));
    return circuit?.getStats() ?? null;
}
/**
 * Get all plugin circuit breakers
 */
function getAllPluginCircuits() {
    const allStats = circuit_breaker_1.circuitRegistry.getAllStats();
    const result = [];
    for (const [name, stats] of Object.entries(allStats)) {
        if (name.startsWith("plugin:")) {
            result.push({
                pluginSlug: name.replace("plugin:", ""),
                stats,
            });
        }
    }
    return result;
}
/**
 * Reset a plugin's circuit breaker
 */
function resetPluginCircuit(pluginSlug) {
    const name = getCircuitName(pluginSlug);
    circuit_breaker_1.circuitRegistry.remove(name);
    circuitLogger.info({ pluginSlug }, "Plugin circuit breaker reset");
}
/**
 * Clean up circuit breakers for removed plugins
 */
function cleanupPluginCircuit(pluginSlug) {
    const name = getCircuitName(pluginSlug);
    circuit_breaker_1.circuitRegistry.remove(name);
    circuitLogger.debug({ pluginSlug }, "Plugin circuit breaker cleaned up");
}
// ===========================================
// Circuit Breaker Error for Plugins
// ===========================================
/**
 * Error thrown when plugin circuit is open
 */
class PluginCircuitOpenError extends Error {
    pluginSlug;
    retryAfterMs;
    constructor(pluginSlug, retryAfterMs) {
        super(`Plugin '${pluginSlug}' circuit is OPEN. Retry after ${retryAfterMs}ms`);
        this.pluginSlug = pluginSlug;
        this.retryAfterMs = retryAfterMs;
        this.name = "PluginCircuitOpenError";
    }
    /**
     * Create from a CircuitOpenError
     */
    static fromCircuitError(pluginSlug, error) {
        return new PluginCircuitOpenError(pluginSlug, error.retryAfterMs);
    }
}
exports.PluginCircuitOpenError = PluginCircuitOpenError;
//# sourceMappingURL=plugin-circuit.js.map