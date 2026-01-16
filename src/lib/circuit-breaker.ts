/**
 * Circuit Breaker Library
 *
 * Implements the circuit breaker pattern to prevent cascading failures
 * when external services (like Telegram or AI APIs) are unavailable.
 *
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Service is failing, requests are immediately rejected
 * - HALF_OPEN: Testing if service has recovered
 *
 * @module lib/circuit-breaker
 */

import { logger } from "./logger";

const circuitLogger = logger.child({ module: "circuit-breaker" });

// ===========================================
// Types
// ===========================================

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface CircuitBreakerConfig {
  /** Name for logging/metrics */
  name: string;
  /** Number of failures before opening circuit (default: 5) */
  failureThreshold: number;
  /** Time in ms before attempting to close circuit (default: 30000) */
  resetTimeoutMs: number;
  /** Window in ms to count failures (default: 60000) */
  monitorWindowMs: number;
  /** Number of successful requests needed in HALF_OPEN to close circuit (default: 3) */
  halfOpenMaxAttempts: number;
}

export interface CircuitBreakerStats {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailure?: Date;
  lastStateChange: Date;
  totalRequests: number;
  totalFailures: number;
}

// ===========================================
// Circuit Breaker Error
// ===========================================

/**
 * Error thrown when circuit is OPEN and requests are being rejected
 */
export class CircuitOpenError extends Error {
  constructor(
    public readonly circuitName: string,
    public readonly retryAfterMs: number
  ) {
    super(`Circuit '${circuitName}' is OPEN. Retry after ${retryAfterMs}ms`);
    this.name = "CircuitOpenError";
  }
}

// ===========================================
// Circuit Breaker Class
// ===========================================

/**
 * Circuit Breaker implementation
 *
 * Usage:
 * ```typescript
 * const breaker = new CircuitBreaker({
 *   name: "telegram-api",
 *   failureThreshold: 5,
 *   resetTimeoutMs: 30000,
 *   monitorWindowMs: 60000,
 *   halfOpenMaxAttempts: 3,
 * });
 *
 * const result = await breaker.execute(() => fetchFromTelegram());
 * ```
 */
export class CircuitBreaker {
  private state: CircuitState = "CLOSED";
  private failures: number = 0;
  private successes: number = 0;
  private lastFailure?: Date;
  private lastStateChange: Date = new Date();
  private failureTimestamps: number[] = [];

  // Lifetime stats
  private totalRequests: number = 0;
  private totalFailures: number = 0;

  constructor(private readonly config: CircuitBreakerConfig) {
    circuitLogger.debug({ name: config.name }, "Circuit breaker created");
  }

  /**
   * Execute a function through the circuit breaker
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.totalRequests++;

    // Check if circuit should transition from OPEN to HALF_OPEN
    if (this.state === "OPEN") {
      if (this.shouldAttemptReset()) {
        this.transitionTo("HALF_OPEN");
      } else {
        const retryAfter = this.getRemainingTimeout();
        circuitLogger.debug(
          { name: this.config.name, retryAfter },
          "Circuit is OPEN, rejecting request"
        );
        throw new CircuitOpenError(this.config.name, retryAfter);
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    }
  }

  /**
   * Handle successful execution
   */
  private onSuccess(): void {
    if (this.state === "HALF_OPEN") {
      this.successes++;
      circuitLogger.debug(
        { name: this.config.name, successes: this.successes, required: this.config.halfOpenMaxAttempts },
        "Success in HALF_OPEN state"
      );

      if (this.successes >= this.config.halfOpenMaxAttempts) {
        this.transitionTo("CLOSED");
        this.reset();
      }
    } else if (this.state === "CLOSED") {
      // Clear old failures outside the monitor window
      this.pruneOldFailures();
    }
  }

  /**
   * Handle failed execution
   */
  private onFailure(error: unknown): void {
    this.failures++;
    this.totalFailures++;
    this.lastFailure = new Date();
    this.failureTimestamps.push(Date.now());

    // Prune old failures outside the monitor window
    this.pruneOldFailures();

    circuitLogger.warn(
      {
        name: this.config.name,
        failures: this.failures,
        threshold: this.config.failureThreshold,
        state: this.state,
        error: error instanceof Error ? error.message : String(error),
      },
      "Circuit breaker recorded failure"
    );

    if (this.state === "HALF_OPEN") {
      // Any failure in HALF_OPEN immediately opens the circuit
      this.transitionTo("OPEN");
    } else if (this.state === "CLOSED") {
      // Count failures within the monitor window
      const recentFailures = this.failureTimestamps.length;
      if (recentFailures >= this.config.failureThreshold) {
        this.transitionTo("OPEN");
      }
    }
  }

  /**
   * Remove failures older than the monitor window
   */
  private pruneOldFailures(): void {
    const cutoff = Date.now() - this.config.monitorWindowMs;
    this.failureTimestamps = this.failureTimestamps.filter((ts) => ts > cutoff);
  }

  /**
   * Transition to a new state
   */
  private transitionTo(newState: CircuitState): void {
    const oldState = this.state;
    this.state = newState;
    this.lastStateChange = new Date();

    circuitLogger.info(
      { name: this.config.name, from: oldState, to: newState },
      "Circuit breaker state transition"
    );

    if (newState === "HALF_OPEN") {
      this.successes = 0;
    }
  }

  /**
   * Check if enough time has passed to attempt reset
   */
  private shouldAttemptReset(): boolean {
    const elapsed = Date.now() - this.lastStateChange.getTime();
    return elapsed >= this.config.resetTimeoutMs;
  }

  /**
   * Get remaining timeout before circuit can attempt reset
   */
  private getRemainingTimeout(): number {
    const elapsed = Date.now() - this.lastStateChange.getTime();
    return Math.max(0, this.config.resetTimeoutMs - elapsed);
  }

  /**
   * Reset counters after successful recovery
   */
  private reset(): void {
    this.failures = 0;
    this.successes = 0;
    this.failureTimestamps = [];
    circuitLogger.info({ name: this.config.name }, "Circuit breaker reset");
  }

  /**
   * Get current circuit breaker statistics
   */
  getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      failures: this.failureTimestamps.length,
      successes: this.successes,
      lastFailure: this.lastFailure,
      lastStateChange: this.lastStateChange,
      totalRequests: this.totalRequests,
      totalFailures: this.totalFailures,
    };
  }

  /**
   * Check if circuit is available for requests
   */
  isAvailable(): boolean {
    if (this.state === "CLOSED") return true;
    if (this.state === "HALF_OPEN") return true;
    return this.shouldAttemptReset();
  }

  /**
   * Get current state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Get config name
   */
  getName(): string {
    return this.config.name;
  }

  /**
   * Force circuit to OPEN state (for testing or manual intervention)
   */
  forceOpen(): void {
    this.transitionTo("OPEN");
  }

  /**
   * Force circuit to CLOSED state (for testing or manual intervention)
   */
  forceClose(): void {
    this.transitionTo("CLOSED");
    this.reset();
  }
}

// ===========================================
// Factory Function
// ===========================================

/**
 * Default circuit breaker configuration
 */
export const DEFAULT_CIRCUIT_CONFIG: Omit<CircuitBreakerConfig, "name"> = {
  failureThreshold: 5,
  resetTimeoutMs: 30000,
  monitorWindowMs: 60000,
  halfOpenMaxAttempts: 3,
};

/**
 * Create a circuit breaker with default configuration
 */
export function createCircuitBreaker(
  name: string,
  overrides?: Partial<Omit<CircuitBreakerConfig, "name">>
): CircuitBreaker {
  return new CircuitBreaker({
    name,
    failureThreshold: overrides?.failureThreshold ?? DEFAULT_CIRCUIT_CONFIG.failureThreshold,
    resetTimeoutMs: overrides?.resetTimeoutMs ?? DEFAULT_CIRCUIT_CONFIG.resetTimeoutMs,
    monitorWindowMs: overrides?.monitorWindowMs ?? DEFAULT_CIRCUIT_CONFIG.monitorWindowMs,
    halfOpenMaxAttempts: overrides?.halfOpenMaxAttempts ?? DEFAULT_CIRCUIT_CONFIG.halfOpenMaxAttempts,
  });
}

// ===========================================
// Circuit Breaker Registry
// ===========================================

/**
 * Global registry for managing circuit breakers
 */
class CircuitBreakerRegistry {
  private circuits = new Map<string, CircuitBreaker>();

  /**
   * Get or create a circuit breaker by name
   */
  getOrCreate(
    name: string,
    config?: Partial<Omit<CircuitBreakerConfig, "name">>
  ): CircuitBreaker {
    let circuit = this.circuits.get(name);

    if (!circuit) {
      circuit = createCircuitBreaker(name, config);
      this.circuits.set(name, circuit);
    }

    return circuit;
  }

  /**
   * Get a circuit breaker by name (returns undefined if not found)
   */
  get(name: string): CircuitBreaker | undefined {
    return this.circuits.get(name);
  }

  /**
   * Check if a circuit exists
   */
  has(name: string): boolean {
    return this.circuits.has(name);
  }

  /**
   * Remove a circuit breaker
   */
  remove(name: string): boolean {
    return this.circuits.delete(name);
  }

  /**
   * Get all circuit breakers
   */
  getAll(): Map<string, CircuitBreaker> {
    return new Map(this.circuits);
  }

  /**
   * Get stats for all circuits
   */
  getAllStats(): Record<string, CircuitBreakerStats> {
    const stats: Record<string, CircuitBreakerStats> = {};
    for (const [name, circuit] of this.circuits) {
      stats[name] = circuit.getStats();
    }
    return stats;
  }

  /**
   * Clear all circuit breakers
   */
  clear(): void {
    this.circuits.clear();
  }
}

/**
 * Singleton registry instance
 */
export const circuitRegistry = new CircuitBreakerRegistry();
