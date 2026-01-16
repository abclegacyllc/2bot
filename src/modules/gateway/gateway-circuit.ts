/**
 * Gateway Circuit Breaker Integration
 *
 * Provides circuit breaker functionality for gateway operations.
 * Each gateway instance has its own circuit breaker to prevent
 * one failing gateway from affecting others.
 *
 * @module modules/gateway/gateway-circuit
 */

import {
    CircuitBreaker,
    CircuitOpenError,
    circuitRegistry,
    type CircuitBreakerStats,
} from "@/lib/circuit-breaker";
import type { GatewayType } from "@prisma/client";

// Re-export for convenience
export { CircuitOpenError } from "@/lib/circuit-breaker";

// ===========================================
// Gateway-Specific Circuit Configuration
// ===========================================

/**
 * Circuit breaker configs for different gateway types
 */
const GATEWAY_CIRCUIT_CONFIGS: Record<GatewayType, {
  failureThreshold: number;
  resetTimeoutMs: number;
  monitorWindowMs: number;
  halfOpenMaxAttempts: number;
}> = {
  TELEGRAM_BOT: {
    failureThreshold: 3,      // Telegram is critical, trip faster
    resetTimeoutMs: 30000,    // 30 seconds before retry
    monitorWindowMs: 60000,   // 1 minute window
    halfOpenMaxAttempts: 2,   // Fewer attempts needed
  },
  AI: {
    failureThreshold: 5,      // AI can be more tolerant
    resetTimeoutMs: 20000,    // 20 seconds (AI might recover faster)
    monitorWindowMs: 60000,   // 1 minute window
    halfOpenMaxAttempts: 3,   // Standard attempts
  },
  WEBHOOK: {
    failureThreshold: 5,      // Standard threshold
    resetTimeoutMs: 30000,    // 30 seconds
    monitorWindowMs: 60000,   // 1 minute window
    halfOpenMaxAttempts: 3,   // Standard attempts
  },
};

// ===========================================
// Gateway Circuit Management
// ===========================================

/**
 * Get the circuit breaker name for a gateway
 */
function getCircuitName(gatewayId: string, gatewayType: GatewayType): string {
  return `gateway:${gatewayType}:${gatewayId.slice(-8)}`;
}

/**
 * Get or create a circuit breaker for a gateway
 */
export function getGatewayCircuit(
  gatewayId: string,
  gatewayType: GatewayType
): CircuitBreaker {
  const name = getCircuitName(gatewayId, gatewayType);
  const config = GATEWAY_CIRCUIT_CONFIGS[gatewayType];
  return circuitRegistry.getOrCreate(name, config);
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
export async function executeWithCircuit<T>(
  gatewayId: string,
  gatewayType: GatewayType,
  operation: () => Promise<T>
): Promise<T> {
  const circuit = getGatewayCircuit(gatewayId, gatewayType);
  return circuit.execute(operation);
}

/**
 * Check if a gateway's circuit is available for requests
 */
export function isGatewayCircuitAvailable(
  gatewayId: string,
  gatewayType: GatewayType
): boolean {
  const name = getCircuitName(gatewayId, gatewayType);
  const circuit = circuitRegistry.get(name);

  // If no circuit exists yet, it's available
  if (!circuit) return true;

  return circuit.isAvailable();
}

/**
 * Get circuit breaker stats for a gateway
 */
export function getGatewayCircuitStats(
  gatewayId: string,
  gatewayType: GatewayType
): CircuitBreakerStats | null {
  const name = getCircuitName(gatewayId, gatewayType);
  const circuit = circuitRegistry.get(name);

  if (!circuit) return null;

  return circuit.getStats();
}

/**
 * Remove a gateway's circuit breaker (e.g., when gateway is deleted)
 */
export function removeGatewayCircuit(
  gatewayId: string,
  gatewayType: GatewayType
): void {
  const name = getCircuitName(gatewayId, gatewayType);
  circuitRegistry.remove(name);
}

/**
 * Get stats for all gateway circuits
 */
export function getAllGatewayCircuitStats(): Record<string, CircuitBreakerStats> {
  const allStats = circuitRegistry.getAllStats();
  const gatewayStats: Record<string, CircuitBreakerStats> = {};

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
export class GatewayUnavailableError extends Error {
  constructor(
    public readonly gatewayType: GatewayType,
    public readonly retryAfterMs: number,
    public readonly gatewayId?: string
  ) {
    super(
      `Gateway ${gatewayType} is temporarily unavailable. Retry after ${Math.ceil(retryAfterMs / 1000)}s`
    );
    this.name = "GatewayUnavailableError";
  }
}

/**
 * Convert CircuitOpenError to GatewayUnavailableError
 */
export function toGatewayUnavailableError(
  error: CircuitOpenError,
  gatewayType: GatewayType,
  gatewayId?: string
): GatewayUnavailableError {
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
export async function withCircuitBreaker<T>(
  gatewayId: string,
  gatewayType: GatewayType,
  operation: () => Promise<T>,
  options: {
    throwOnOpen?: boolean;
    fallback?: T;
  } = {}
): Promise<T | null> {
  const { throwOnOpen = true, fallback } = options;

  try {
    return await executeWithCircuit(gatewayId, gatewayType, operation);
  } catch (error) {
    if (error instanceof CircuitOpenError) {
      if (throwOnOpen) {
        throw toGatewayUnavailableError(error, gatewayType, gatewayId);
      }
      return fallback ?? null;
    }
    throw error;
  }
}
