/**
 * Base Gateway Provider
 *
 * Abstract base class for gateway providers that implements common functionality
 * and provides helper methods for concrete implementations.
 *
 * @module modules/gateway/providers/base.provider
 */

import { logger } from "@/lib/logger";
import type { GatewayType } from "@prisma/client";
import type { GatewayAction, GatewayProvider } from "../gateway.registry";
import { gatewayService } from "../gateway.service";

/**
 * Provider logger - child loggers created per provider type
 */
const providerLogger = logger.child({ module: "gateway-provider" });

/**
 * Connection state for tracking active gateway connections
 */
interface ConnectionState {
  gatewayId: string;
  connectedAt: Date;
  lastActivity?: Date;
  metadata?: Record<string, unknown>;
}

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
export abstract class BaseGatewayProvider<TCredentials = unknown, TConfig = unknown>
  implements GatewayProvider<TCredentials, TConfig>
{
  /** Gateway type this provider handles */
  abstract readonly type: GatewayType;

  /** Human-readable name */
  abstract readonly name: string;

  /** Provider description */
  abstract readonly description: string;

  /** Active connections map: gatewayId -> ConnectionState */
  protected connections: Map<string, ConnectionState> = new Map();

  /** Logger instance for this provider */
  protected log = providerLogger;

  /**
   * Initialize logger with provider type
   */
  protected initLogger(): void {
    this.log = providerLogger.child({ provider: this.type });
  }

  // ==========================================
  // Public Interface Methods
  // ==========================================

  /**
   * Connect to the gateway
   * Wraps doConnect with state management and error handling
   */
  async connect(gatewayId: string, credentials: TCredentials, config?: TConfig): Promise<void> {
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
      await gatewayService.updateStatus(gatewayId, "CONNECTED");

      this.log.info({ gatewayId }, "Gateway connected successfully");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      this.log.error({ gatewayId, error: errorMessage }, "Failed to connect gateway");

      // Update status to ERROR
      await gatewayService.updateStatus(gatewayId, "ERROR", errorMessage);

      throw error;
    }
  }

  /**
   * Disconnect from the gateway
   * Wraps doDisconnect with state management and error handling
   */
  async disconnect(gatewayId: string): Promise<void> {
    this.initLogger();
    this.log.info({ gatewayId }, "Disconnecting gateway...");

    try {
      // Perform actual disconnection
      await this.doDisconnect(gatewayId);

      // Remove from tracked connections
      this.connections.delete(gatewayId);

      // Update gateway status
      await gatewayService.updateStatus(gatewayId, "DISCONNECTED");

      this.log.info({ gatewayId }, "Gateway disconnected successfully");
    } catch (error) {
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
  async validateCredentials(
    credentials: TCredentials
  ): Promise<{ valid: boolean; error?: string }> {
    this.initLogger();
    this.log.debug("Validating credentials...");

    try {
      const result = await this.doValidateCredentials(credentials);
      this.log.debug({ valid: result.valid }, "Credential validation complete");
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      this.log.error({ error: errorMessage }, "Credential validation failed");
      return { valid: false, error: errorMessage };
    }
  }

  /**
   * Execute a gateway action
   * Wraps doExecute with logging and error handling
   */
  async execute<TParams = unknown, TResult = unknown>(
    gatewayId: string,
    action: string,
    params: TParams
  ): Promise<TResult> {
    this.initLogger();
    this.log.debug({ gatewayId, action }, "Executing gateway action...");

    // Verify connection exists
    const connection = this.connections.get(gatewayId);
    if (!connection) {
      throw new GatewayNotConnectedError(gatewayId, this.type);
    }

    try {
      const result = await this.doExecute<TParams, TResult>(gatewayId, action, params);

      // Update last activity
      connection.lastActivity = new Date();

      this.log.debug({ gatewayId, action }, "Action executed successfully");
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      this.log.error({ gatewayId, action, error: errorMessage }, "Action execution failed");
      throw error;
    }
  }

  /**
   * Check gateway health
   * Wraps doCheckHealth with error handling
   */
  async checkHealth(
    gatewayId: string,
    credentials: TCredentials
  ): Promise<{ healthy: boolean; latency?: number; error?: string }> {
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
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      this.log.error({ gatewayId, error: errorMessage }, "Health check failed");
      return { healthy: false, error: errorMessage };
    }
  }

  /**
   * Get supported actions
   * Must be implemented by concrete class
   */
  abstract getSupportedActions(): GatewayAction[];

  // ==========================================
  // Abstract Methods (implement in subclass)
  // ==========================================

  /**
   * Perform actual connection logic
   * Called by connect() after state setup
   */
  protected abstract doConnect(
    gatewayId: string,
    credentials: TCredentials,
    config?: TConfig
  ): Promise<void>;

  /**
   * Perform actual disconnection logic
   * Called by disconnect() before state cleanup
   */
  protected abstract doDisconnect(gatewayId: string): Promise<void>;

  /**
   * Perform credential validation
   * Should not modify any state
   */
  protected abstract doValidateCredentials(
    credentials: TCredentials
  ): Promise<{ valid: boolean; error?: string }>;

  /**
   * Perform the action execution
   * Called by execute() after connection verification
   */
  protected abstract doExecute<TParams = unknown, TResult = unknown>(
    gatewayId: string,
    action: string,
    params: TParams
  ): Promise<TResult>;

  /**
   * Perform health check
   * Should be lightweight and fast
   */
  protected abstract doCheckHealth(
    gatewayId: string,
    credentials: TCredentials
  ): Promise<{ healthy: boolean; latency?: number; error?: string }>;

  // ==========================================
  // Helper Methods
  // ==========================================

  /**
   * Check if a gateway is currently connected
   */
  isConnected(gatewayId: string): boolean {
    return this.connections.has(gatewayId);
  }

  /**
   * Get connection state for a gateway
   */
  getConnectionState(gatewayId: string): ConnectionState | undefined {
    return this.connections.get(gatewayId);
  }

  /**
   * Get all active connection IDs
   */
  getActiveConnections(): string[] {
    return Array.from(this.connections.keys());
  }

  /**
   * Update connection metadata
   */
  protected updateConnectionMetadata(
    gatewayId: string,
    metadata: Record<string, unknown>
  ): void {
    const connection = this.connections.get(gatewayId);
    if (connection) {
      connection.metadata = { ...connection.metadata, ...metadata };
    }
  }
}

/**
 * Error thrown when trying to execute on a non-connected gateway
 */
export class GatewayNotConnectedError extends Error {
  constructor(
    public readonly gatewayId: string,
    public readonly type: GatewayType
  ) {
    super(`Gateway ${gatewayId} (${type}) is not connected`);
    this.name = "GatewayNotConnectedError";
  }
}

/**
 * Error thrown when an unsupported action is requested
 */
export class UnsupportedActionError extends Error {
  constructor(
    public readonly action: string,
    public readonly type: GatewayType
  ) {
    super(`Action "${action}" is not supported by ${type} gateway`);
    this.name = "UnsupportedActionError";
  }
}

/**
 * Error thrown when credentials are invalid
 */
export class InvalidCredentialsError extends Error {
  constructor(
    public readonly type: GatewayType,
    public readonly reason?: string
  ) {
    super(`Invalid credentials for ${type} gateway${reason ? `: ${reason}` : ""}`);
    this.name = "InvalidCredentialsError";
  }
}
