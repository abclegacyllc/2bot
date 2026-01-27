"use strict";
/**
 * Base Gateway Provider
 *
 * Abstract base class for gateway providers that implements common functionality
 * and provides helper methods for concrete implementations.
 *
 * @module modules/gateway/providers/base.provider
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.InvalidCredentialsError = exports.UnsupportedActionError = exports.GatewayNotConnectedError = exports.BaseGatewayProvider = void 0;
const logger_1 = require("@/lib/logger");
const gateway_circuit_1 = require("../gateway-circuit");
const gateway_service_1 = require("../gateway.service");
/**
 * Provider logger - child loggers created per provider type
 */
const providerLogger = logger_1.logger.child({ module: "gateway-provider" });
/**
 * Abstract base class for gateway providers
 *
 * Provides common functionality:
 * - Connection state management
 * - Logging
 * - Status updates
 * - Error handling
 *
 * Concrete implementations must implement:
 * - doConnect() - actual connection logic
 * - doDisconnect() - actual disconnection logic
 * - doValidateCredentials() - credential validation
 * - doExecute() - action execution
 * - doCheckHealth() - health check
 */
class BaseGatewayProvider {
    /** Active connections map: gatewayId -> ConnectionState */
    connections = new Map();
    /** Logger instance for this provider */
    log = providerLogger;
    /**
     * Initialize logger with provider type
     */
    initLogger() {
        this.log = providerLogger.child({ provider: this.type });
    }
    // ==========================================
    // Public Interface Methods
    // ==========================================
    /**
     * Connect to the gateway
     * Wraps doConnect with state management and error handling
     */
    async connect(gatewayId, credentials, config) {
        this.initLogger();
        this.log.info({ gatewayId }, "Connecting gateway...");
        try {
            // Disconnect if already connected
            if (this.connections.has(gatewayId)) {
                await this.disconnect(gatewayId);
            }
            // Perform actual connection
            await this.doConnect(gatewayId, credentials, config);
            // Track connection state
            this.connections.set(gatewayId, {
                gatewayId,
                connectedAt: new Date(),
            });
            // Update gateway status in database
            await gateway_service_1.gatewayService.updateStatus(gatewayId, "CONNECTED");
            this.log.info({ gatewayId }, "Gateway connected successfully");
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Unknown error";
            this.log.error({ gatewayId, error: errorMessage }, "Failed to connect gateway");
            // Update status to ERROR
            await gateway_service_1.gatewayService.updateStatus(gatewayId, "ERROR", errorMessage);
            throw error;
        }
    }
    /**
     * Disconnect from the gateway
     * Wraps doDisconnect with state management and error handling
     */
    async disconnect(gatewayId) {
        this.initLogger();
        this.log.info({ gatewayId }, "Disconnecting gateway...");
        try {
            // Perform actual disconnection
            await this.doDisconnect(gatewayId);
            // Remove from tracked connections
            this.connections.delete(gatewayId);
            // Remove circuit breaker for this gateway
            (0, gateway_circuit_1.removeGatewayCircuit)(gatewayId, this.type);
            // Update gateway status
            await gateway_service_1.gatewayService.updateStatus(gatewayId, "DISCONNECTED");
            this.log.info({ gatewayId }, "Gateway disconnected successfully");
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Unknown error";
            this.log.error({ gatewayId, error: errorMessage }, "Failed to disconnect gateway");
            // Still remove from connections even on error
            this.connections.delete(gatewayId);
            throw error;
        }
    }
    /**
     * Validate credentials
     * Wraps doValidateCredentials with error handling
     */
    async validateCredentials(credentials) {
        this.initLogger();
        this.log.debug("Validating credentials...");
        try {
            const result = await this.doValidateCredentials(credentials);
            this.log.debug({ valid: result.valid }, "Credential validation complete");
            return result;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Unknown error";
            this.log.error({ error: errorMessage }, "Credential validation failed");
            return { valid: false, error: errorMessage };
        }
    }
    /**
     * Execute a gateway action
     * Wraps doExecute with circuit breaker, logging, and error handling
     */
    async execute(gatewayId, action, params) {
        this.initLogger();
        this.log.debug({ gatewayId, action }, "Executing gateway action...");
        // Verify connection exists
        const connection = this.connections.get(gatewayId);
        if (!connection) {
            throw new GatewayNotConnectedError(gatewayId, this.type);
        }
        try {
            // Execute action through circuit breaker
            const result = await (0, gateway_circuit_1.executeWithCircuit)(gatewayId, this.type, async () => {
                return this.doExecute(gatewayId, action, params);
            });
            // Update last activity
            connection.lastActivity = new Date();
            this.log.debug({ gatewayId, action }, "Action executed successfully");
            return result;
        }
        catch (error) {
            // Convert circuit open error to gateway unavailable error
            if (error instanceof gateway_circuit_1.CircuitOpenError) {
                this.log.warn({ gatewayId, action, retryAfterMs: error.retryAfterMs }, "Circuit breaker is OPEN - gateway temporarily unavailable");
                throw new gateway_circuit_1.GatewayUnavailableError(this.type, error.retryAfterMs, gatewayId);
            }
            const errorMessage = error instanceof Error ? error.message : "Unknown error";
            this.log.error({ gatewayId, action, error: errorMessage }, "Action execution failed");
            throw error;
        }
    }
    /**
     * Check gateway health
     * Wraps doCheckHealth with error handling
     */
    async checkHealth(gatewayId, credentials) {
        this.initLogger();
        this.log.debug({ gatewayId }, "Checking gateway health...");
        try {
            const startTime = Date.now();
            const result = await this.doCheckHealth(gatewayId, credentials);
            const latency = Date.now() - startTime;
            this.log.debug({ gatewayId, healthy: result.healthy, latency }, "Health check complete");
            return {
                ...result,
                latency: result.latency ?? latency,
            };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Unknown error";
            this.log.error({ gatewayId, error: errorMessage }, "Health check failed");
            return { healthy: false, error: errorMessage };
        }
    }
    // ==========================================
    // Helper Methods
    // ==========================================
    /**
     * Check if a gateway is currently connected
     */
    isConnected(gatewayId) {
        return this.connections.has(gatewayId);
    }
    /**
     * Get connection state for a gateway
     */
    getConnectionState(gatewayId) {
        return this.connections.get(gatewayId);
    }
    /**
     * Get all active connection IDs
     */
    getActiveConnections() {
        return Array.from(this.connections.keys());
    }
    /**
     * Update connection metadata
     */
    updateConnectionMetadata(gatewayId, metadata) {
        const connection = this.connections.get(gatewayId);
        if (connection) {
            connection.metadata = { ...connection.metadata, ...metadata };
        }
    }
}
exports.BaseGatewayProvider = BaseGatewayProvider;
/**
 * Error thrown when trying to execute on a non-connected gateway
 */
class GatewayNotConnectedError extends Error {
    gatewayId;
    type;
    constructor(gatewayId, type) {
        super(`Gateway ${gatewayId} (${type}) is not connected`);
        this.gatewayId = gatewayId;
        this.type = type;
        this.name = "GatewayNotConnectedError";
    }
}
exports.GatewayNotConnectedError = GatewayNotConnectedError;
/**
 * Error thrown when an unsupported action is requested
 */
class UnsupportedActionError extends Error {
    action;
    type;
    constructor(action, type) {
        super(`Action "${action}" is not supported by ${type} gateway`);
        this.action = action;
        this.type = type;
        this.name = "UnsupportedActionError";
    }
}
exports.UnsupportedActionError = UnsupportedActionError;
/**
 * Error thrown when credentials are invalid
 */
class InvalidCredentialsError extends Error {
    type;
    reason;
    constructor(type, reason) {
        super(`Invalid credentials for ${type} gateway${reason ? `: ${reason}` : ""}`);
        this.type = type;
        this.reason = reason;
        this.name = "InvalidCredentialsError";
    }
}
exports.InvalidCredentialsError = InvalidCredentialsError;
//# sourceMappingURL=base.provider.js.map