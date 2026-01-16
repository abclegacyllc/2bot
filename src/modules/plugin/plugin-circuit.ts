/**
 * Plugin Circuit Breaker Integration
 *
 * Provides circuit breaker functionality for plugin execution.
 * Each plugin (by slug) has its own circuit breaker to prevent
 * one failing plugin from affecting system stability.
 *
 * @module modules/plugin/plugin-circuit
 */

import {
    CircuitBreaker,
    CircuitOpenError,
    circuitRegistry,
    type CircuitBreakerStats
} from "@/lib/circuit-breaker";

import { logger } from "@/lib/logger";

const circuitLogger = logger.child({ module: "plugin-circuit" });

// Re-export for convenience
export { CircuitOpenError } from "@/lib/circuit-breaker";

// ===========================================
// Plugin Circuit Configuration
// ===========================================

/**
 * Default circuit breaker config for plugins
 */
const DEFAULT_PLUGIN_CIRCUIT_CONFIG = {
  failureThreshold: 5,      // 5 consecutive failures to open
  resetTimeoutMs: 60000,    // 1 minute before retry
  monitorWindowMs: 120000,  // 2 minute window for failures
  halfOpenMaxAttempts: 2,   // 2 successes to close
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
function getCircuitName(pluginSlug: string): string {
  return `plugin:${pluginSlug}`;
}

/**
 * Get or create a circuit breaker for a plugin
 */
export function getPluginCircuit(
  pluginSlug: string,
  isStrict = false
): CircuitBreaker {
  const name = getCircuitName(pluginSlug);
  const config = isStrict ? STRICT_PLUGIN_CIRCUIT_CONFIG : DEFAULT_PLUGIN_CIRCUIT_CONFIG;
  return circuitRegistry.getOrCreate(name, config);
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
export async function executePluginWithCircuit<T>(
  pluginSlug: string,
  operation: () => Promise<T>,
  isStrict = false
): Promise<T> {
  const circuit = getPluginCircuit(pluginSlug, isStrict);
  return circuit.execute(operation);
}

/**
 * Record a manual success for a plugin circuit (useful for lifecycle hooks)
 */
export function recordPluginSuccess(pluginSlug: string): void {
  const circuit = circuitRegistry.get(getCircuitName(pluginSlug));
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
export function isPluginCircuitOpen(pluginSlug: string): boolean {
  const circuit = circuitRegistry.get(getCircuitName(pluginSlug));
  return circuit?.getStats().state === "OPEN";
}

/**
 * Get plugin circuit breaker stats
 */
export function getPluginCircuitStats(pluginSlug: string): CircuitBreakerStats | null {
  const circuit = circuitRegistry.get(getCircuitName(pluginSlug));
  return circuit?.getStats() ?? null;
}

/**
 * Get all plugin circuit breakers
 */
export function getAllPluginCircuits(): Array<{
  pluginSlug: string;
  stats: CircuitBreakerStats;
}> {
  const allStats = circuitRegistry.getAllStats();
  const result: Array<{ pluginSlug: string; stats: CircuitBreakerStats }> = [];
  
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
export function resetPluginCircuit(pluginSlug: string): void {
  const name = getCircuitName(pluginSlug);
  circuitRegistry.remove(name);
  circuitLogger.info({ pluginSlug }, "Plugin circuit breaker reset");
}

/**
 * Clean up circuit breakers for removed plugins
 */
export function cleanupPluginCircuit(pluginSlug: string): void {
  const name = getCircuitName(pluginSlug);
  circuitRegistry.remove(name);
  circuitLogger.debug({ pluginSlug }, "Plugin circuit breaker cleaned up");
}

// ===========================================
// Circuit Breaker Error for Plugins
// ===========================================

/**
 * Error thrown when plugin circuit is open
 */
export class PluginCircuitOpenError extends Error {
  constructor(
    public readonly pluginSlug: string,
    public readonly retryAfterMs: number
  ) {
    super(`Plugin '${pluginSlug}' circuit is OPEN. Retry after ${retryAfterMs}ms`);
    this.name = "PluginCircuitOpenError";
  }

  /**
   * Create from a CircuitOpenError
   */
  static fromCircuitError(
    pluginSlug: string,
    error: CircuitOpenError
  ): PluginCircuitOpenError {
    return new PluginCircuitOpenError(pluginSlug, error.retryAfterMs);
  }
}
