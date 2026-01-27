"use strict";
/**
 * Gateway Circuit Breaker Integration
 *
 * Provides circuit breaker functionality for gateway operations.
 * Each gateway instance has its own circuit breaker to prevent
 * one failing gateway from affecting others.
 *
 * @module modules/gateway/gateway-circuit
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.GatewayUnavailableError = exports.CircuitOpenError = void 0;
exports.getGatewayCircuit = getGatewayCircuit;
exports.executeWithCircuit = executeWithCircuit;
exports.isGatewayCircuitAvailable = isGatewayCircuitAvailable;
exports.getGatewayCircuitStats = getGatewayCircuitStats;
exports.removeGatewayCircuit = removeGatewayCircuit;
exports.getAllGatewayCircuitStats = getAllGatewayCircuitStats;
exports.toGatewayUnavailableError = toGatewayUnavailableError;
exports.withCircuitBreaker = withCircuitBreaker;
const circuit_breaker_1 = require("@/lib/circuit-breaker");
// Re-export for convenience
var circuit_breaker_2 = require("@/lib/circuit-breaker");
Object.defineProperty(exports, "CircuitOpenError", { enumerable: true, get: function () { return circuit_breaker_2.CircuitOpenError; } });
// ===========================================
// Gateway-Specific Circuit Configuration
// ===========================================
/**
 * Circuit breaker configs for different gateway types
 */
const GATEWAY_CIRCUIT_CONFIGS = {
    TELEGRAM_BOT: {
        failureThreshold: 3, // Telegram is critical, trip faster
        resetTimeoutMs: 30000, // 30 seconds before retry
        monitorWindowMs: 60000, // 1 minute window
        halfOpenMaxAttempts: 2, // Fewer attempts needed
    },
    AI: {
        failureThreshold: 5, // AI can be more tolerant
        resetTimeoutMs: 20000, // 20 seconds (AI might recover faster)
        monitorWindowMs: 60000, // 1 minute window
        halfOpenMaxAttempts: 3, // Standard attempts
    },
    WEBHOOK: {
        failureThreshold: 5, // Standard threshold
        resetTimeoutMs: 30000, // 30 seconds
        monitorWindowMs: 60000, // 1 minute window
        halfOpenMaxAttempts: 3, // Standard attempts
    },
};
// ===========================================
// Gateway Circuit Management
// ===========================================
/**
 * Get the circuit breaker name for a gateway
 */
function getCircuitName(gatewayId, gatewayType) {
    return `gateway:${gatewayType}:${gatewayId.slice(-8)}`;
}
/**
 * Get or create a circuit breaker for a gateway
 */
function getGatewayCircuit(gatewayId, gatewayType) {
    const name = getCircuitName(gatewayId, gatewayType);
    const config = GATEWAY_CIRCUIT_CONFIGS[gatewayType];
    return circuit_breaker_1.circuitRegistry.getOrCreate(name, config);
}
/**
 * Execute an operation through the gateway's circuit breaker
 *
 * @example
 * ```typescript
 * const result = await executeWithCircuit(
 *   gatewayId,
 *   "TELEGRAM_BOT",
 *   async () => {
 *     return await telegramApi.sendMessage(chatId, text);
 *   }
 * );
 * ```
 */
async function executeWithCircuit(gatewayId, gatewayType, operation) {
    const circuit = getGatewayCircuit(gatewayId, gatewayType);
    return circuit.execute(operation);
}
/**
 * Check if a gateway's circuit is available for requests
 */
function isGatewayCircuitAvailable(gatewayId, gatewayType) {
    const name = getCircuitName(gatewayId, gatewayType);
    const circuit = circuit_breaker_1.circuitRegistry.get(name);
    // If no circuit exists yet, it's available
    if (!circuit)
        return true;
    return circuit.isAvailable();
}
/**
 * Get circuit breaker stats for a gateway
 */
function getGatewayCircuitStats(gatewayId, gatewayType) {
    const name = getCircuitName(gatewayId, gatewayType);
    const circuit = circuit_breaker_1.circuitRegistry.get(name);
    if (!circuit)
        return null;
    return circuit.getStats();
}
/**
 * Remove a gateway's circuit breaker (e.g., when gateway is deleted)
 */
function removeGatewayCircuit(gatewayId, gatewayType) {
    const name = getCircuitName(gatewayId, gatewayType);
    circuit_breaker_1.circuitRegistry.remove(name);
}
/**
 * Get stats for all gateway circuits
 */
function getAllGatewayCircuitStats() {
    const allStats = circuit_breaker_1.circuitRegistry.getAllStats();
    const gatewayStats = {};
    // Filter to only gateway circuits
    for (const [name, stats] of Object.entries(allStats)) {
        if (name.startsWith("gateway:")) {
            gatewayStats[name] = stats;
        }
    }
    return gatewayStats;
}
// ===========================================
// Gateway Unavailable Error
// ===========================================
/**
 * Custom error for when a gateway is unavailable due to circuit breaker
 */
class GatewayUnavailableError extends Error {
    gatewayType;
    retryAfterMs;
    gatewayId;
    constructor(gatewayType, retryAfterMs, gatewayId) {
        super(`Gateway ${gatewayType} is temporarily unavailable. Retry after ${Math.ceil(retryAfterMs / 1000)}s`);
        this.gatewayType = gatewayType;
        this.retryAfterMs = retryAfterMs;
        this.gatewayId = gatewayId;
        this.name = "GatewayUnavailableError";
    }
}
exports.GatewayUnavailableError = GatewayUnavailableError;
/**
 * Convert CircuitOpenError to GatewayUnavailableError
 */
function toGatewayUnavailableError(error, gatewayType, gatewayId) {
    return new GatewayUnavailableError(gatewayType, error.retryAfterMs, gatewayId);
}
// ===========================================
// Wrapper Helpers
// ===========================================
/**
 * Wrap a gateway operation with circuit breaker and error handling
 *
 * @example
 * ```typescript
 * const result = await withCircuitBreaker(
 *   gatewayId,
 *   "TELEGRAM_BOT",
 *   async () => telegramApi.sendMessage(chatId, text),
 *   { throwOnOpen: false } // Return null instead of throwing
 * );
 * ```
 */
async function withCircuitBreaker(gatewayId, gatewayType, operation, options = {}) {
    const { throwOnOpen = true, fallback } = options;
    try {
        return await executeWithCircuit(gatewayId, gatewayType, operation);
    }
    catch (error) {
        if (error instanceof circuit_breaker_1.CircuitOpenError) {
            if (throwOnOpen) {
                throw toGatewayUnavailableError(error, gatewayType, gatewayId);
            }
            return fallback ?? null;
        }
        throw error;
    }
}
//# sourceMappingURL=gateway-circuit.js.map