"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.circuitRegistry = exports.DEFAULT_CIRCUIT_CONFIG = exports.CircuitBreaker = exports.CircuitOpenError = void 0;
exports.createCircuitBreaker = createCircuitBreaker;
const logger_1 = require("./logger");
const circuitLogger = logger_1.logger.child({ module: "circuit-breaker" });
// ===========================================
// Circuit Breaker Error
// ===========================================
/**
 * Error thrown when circuit is OPEN and requests are being rejected
 */
class CircuitOpenError extends Error {
    circuitName;
    retryAfterMs;
    constructor(circuitName, retryAfterMs) {
        super(`Circuit '${circuitName}' is OPEN. Retry after ${retryAfterMs}ms`);
        this.circuitName = circuitName;
        this.retryAfterMs = retryAfterMs;
        this.name = "CircuitOpenError";
    }
}
exports.CircuitOpenError = CircuitOpenError;
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
class CircuitBreaker {
    config;
    state = "CLOSED";
    failures = 0;
    successes = 0;
    lastFailure;
    lastStateChange = new Date();
    failureTimestamps = [];
    // Lifetime stats
    totalRequests = 0;
    totalFailures = 0;
    constructor(config) {
        this.config = config;
        circuitLogger.debug({ name: config.name }, "Circuit breaker created");
    }
    /**
     * Execute a function through the circuit breaker
     */
    async execute(fn) {
        this.totalRequests++;
        // Check if circuit should transition from OPEN to HALF_OPEN
        if (this.state === "OPEN") {
            if (this.shouldAttemptReset()) {
                this.transitionTo("HALF_OPEN");
            }
            else {
                const retryAfter = this.getRemainingTimeout();
                circuitLogger.debug({ name: this.config.name, retryAfter }, "Circuit is OPEN, rejecting request");
                throw new CircuitOpenError(this.config.name, retryAfter);
            }
        }
        try {
            const result = await fn();
            this.onSuccess();
            return result;
        }
        catch (error) {
            this.onFailure(error);
            throw error;
        }
    }
    /**
     * Handle successful execution
     */
    onSuccess() {
        if (this.state === "HALF_OPEN") {
            this.successes++;
            circuitLogger.debug({ name: this.config.name, successes: this.successes, required: this.config.halfOpenMaxAttempts }, "Success in HALF_OPEN state");
            if (this.successes >= this.config.halfOpenMaxAttempts) {
                this.transitionTo("CLOSED");
                this.reset();
            }
        }
        else if (this.state === "CLOSED") {
            // Clear old failures outside the monitor window
            this.pruneOldFailures();
        }
    }
    /**
     * Handle failed execution
     */
    onFailure(error) {
        this.failures++;
        this.totalFailures++;
        this.lastFailure = new Date();
        this.failureTimestamps.push(Date.now());
        // Prune old failures outside the monitor window
        this.pruneOldFailures();
        circuitLogger.warn({
            name: this.config.name,
            failures: this.failures,
            threshold: this.config.failureThreshold,
            state: this.state,
            error: error instanceof Error ? error.message : String(error),
        }, "Circuit breaker recorded failure");
        if (this.state === "HALF_OPEN") {
            // Any failure in HALF_OPEN immediately opens the circuit
            this.transitionTo("OPEN");
        }
        else if (this.state === "CLOSED") {
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
    pruneOldFailures() {
        const cutoff = Date.now() - this.config.monitorWindowMs;
        this.failureTimestamps = this.failureTimestamps.filter((ts) => ts > cutoff);
    }
    /**
     * Transition to a new state
     */
    transitionTo(newState) {
        const oldState = this.state;
        this.state = newState;
        this.lastStateChange = new Date();
        circuitLogger.info({ name: this.config.name, from: oldState, to: newState }, "Circuit breaker state transition");
        if (newState === "HALF_OPEN") {
            this.successes = 0;
        }
    }
    /**
     * Check if enough time has passed to attempt reset
     */
    shouldAttemptReset() {
        const elapsed = Date.now() - this.lastStateChange.getTime();
        return elapsed >= this.config.resetTimeoutMs;
    }
    /**
     * Get remaining timeout before circuit can attempt reset
     */
    getRemainingTimeout() {
        const elapsed = Date.now() - this.lastStateChange.getTime();
        return Math.max(0, this.config.resetTimeoutMs - elapsed);
    }
    /**
     * Reset counters after successful recovery
     */
    reset() {
        this.failures = 0;
        this.successes = 0;
        this.failureTimestamps = [];
        circuitLogger.info({ name: this.config.name }, "Circuit breaker reset");
    }
    /**
     * Get current circuit breaker statistics
     */
    getStats() {
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
    isAvailable() {
        if (this.state === "CLOSED")
            return true;
        if (this.state === "HALF_OPEN")
            return true;
        return this.shouldAttemptReset();
    }
    /**
     * Get current state
     */
    getState() {
        return this.state;
    }
    /**
     * Get config name
     */
    getName() {
        return this.config.name;
    }
    /**
     * Force circuit to OPEN state (for testing or manual intervention)
     */
    forceOpen() {
        this.transitionTo("OPEN");
    }
    /**
     * Force circuit to CLOSED state (for testing or manual intervention)
     */
    forceClose() {
        this.transitionTo("CLOSED");
        this.reset();
    }
}
exports.CircuitBreaker = CircuitBreaker;
// ===========================================
// Factory Function
// ===========================================
/**
 * Default circuit breaker configuration
 */
exports.DEFAULT_CIRCUIT_CONFIG = {
    failureThreshold: 5,
    resetTimeoutMs: 30000,
    monitorWindowMs: 60000,
    halfOpenMaxAttempts: 3,
};
/**
 * Create a circuit breaker with default configuration
 */
function createCircuitBreaker(name, overrides) {
    return new CircuitBreaker({
        name,
        failureThreshold: overrides?.failureThreshold ?? exports.DEFAULT_CIRCUIT_CONFIG.failureThreshold,
        resetTimeoutMs: overrides?.resetTimeoutMs ?? exports.DEFAULT_CIRCUIT_CONFIG.resetTimeoutMs,
        monitorWindowMs: overrides?.monitorWindowMs ?? exports.DEFAULT_CIRCUIT_CONFIG.monitorWindowMs,
        halfOpenMaxAttempts: overrides?.halfOpenMaxAttempts ?? exports.DEFAULT_CIRCUIT_CONFIG.halfOpenMaxAttempts,
    });
}
// ===========================================
// Circuit Breaker Registry
// ===========================================
/**
 * Global registry for managing circuit breakers
 */
class CircuitBreakerRegistry {
    circuits = new Map();
    /**
     * Get or create a circuit breaker by name
     */
    getOrCreate(name, config) {
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
    get(name) {
        return this.circuits.get(name);
    }
    /**
     * Check if a circuit exists
     */
    has(name) {
        return this.circuits.has(name);
    }
    /**
     * Remove a circuit breaker
     */
    remove(name) {
        return this.circuits.delete(name);
    }
    /**
     * Get all circuit breakers
     */
    getAll() {
        return new Map(this.circuits);
    }
    /**
     * Get stats for all circuits
     */
    getAllStats() {
        const stats = {};
        for (const [name, circuit] of this.circuits) {
            stats[name] = circuit.getStats();
        }
        return stats;
    }
    /**
     * Clear all circuit breakers
     */
    clear() {
        this.circuits.clear();
    }
}
/**
 * Singleton registry instance
 */
exports.circuitRegistry = new CircuitBreakerRegistry();
//# sourceMappingURL=circuit-breaker.js.map