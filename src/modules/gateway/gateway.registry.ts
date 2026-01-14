/**
 * Gateway Registry
 *
 * Registry pattern for managing gateway providers.
 * Allows dynamic registration of gateway implementations and retrieval by type.
 *
 * @module modules/gateway/gateway.registry
 */

import { logger } from "@/lib/logger";
import type { GatewayType } from "@prisma/client";

const registryLogger = logger.child({ module: "gateway-registry" });

/**
 * Gateway Provider interface
 * All gateway implementations must conform to this interface
 */
export interface GatewayProvider<TCredentials = unknown, TConfig = unknown> {
  /** Gateway type this provider handles */
  readonly type: GatewayType;

  /** Human-readable name for UI */
  readonly name: string;

  /** Provider description */
  readonly description: string;

  /**
   * Connect/initialize the gateway
   * Called when gateway status should be set to CONNECTED
   */
  connect(gatewayId: string, credentials: TCredentials, config?: TConfig): Promise<void>;

  /**
   * Disconnect/cleanup the gateway
   * Called when gateway is being disabled or deleted
   */
  disconnect(gatewayId: string): Promise<void>;

  /**
   * Validate credentials without connecting
   * Used for testing credentials before saving
   */
  validateCredentials(credentials: TCredentials): Promise<{ valid: boolean; error?: string }>;

  /**
   * Execute a gateway-specific action
   * Action names and params are gateway-specific
   */
  execute<TParams = unknown, TResult = unknown>(
    gatewayId: string,
    action: string,
    params: TParams
  ): Promise<TResult>;

  /**
   * Check gateway health/status
   * Used by health check workers
   */
  checkHealth(gatewayId: string, credentials: TCredentials): Promise<{
    healthy: boolean;
    latency?: number;
    error?: string;
  }>;

  /**
   * Get supported actions for this gateway type
   * Used for documentation and UI
   */
  getSupportedActions(): GatewayAction[];
}

/**
 * Gateway action metadata
 */
export interface GatewayAction {
  name: string;
  description: string;
  params?: Record<string, {
    type: "string" | "number" | "boolean" | "object" | "array";
    required: boolean;
    description?: string;
  }>;
  returns?: string;
}

/**
 * Provider registration options
 */
export interface ProviderRegistrationOptions {
  /** Override existing provider if already registered */
  override?: boolean;
}

/**
 * Gateway Registry Error
 */
export class GatewayRegistryError extends Error {
  constructor(
    message: string,
    public readonly code: "NOT_FOUND" | "ALREADY_REGISTERED" | "INVALID_PROVIDER"
  ) {
    super(message);
    this.name = "GatewayRegistryError";
  }
}

/**
 * Gateway Registry
 *
 * Singleton registry for managing gateway providers.
 * Providers are registered at application startup.
 */
class GatewayRegistry {
  private providers: Map<GatewayType, GatewayProvider> = new Map();

  /**
   * Register a gateway provider
   *
   * @param provider - The provider implementation
   * @param options - Registration options
   * @throws GatewayRegistryError if provider already registered (unless override=true)
   */
  register(provider: GatewayProvider, options: ProviderRegistrationOptions = {}): void {
    const { override = false } = options;

    if (this.providers.has(provider.type) && !override) {
      throw new GatewayRegistryError(
        `Provider for ${provider.type} is already registered`,
        "ALREADY_REGISTERED"
      );
    }

    this.providers.set(provider.type, provider);
    registryLogger.info(
      { type: provider.type, name: provider.name },
      `Registered gateway provider: ${provider.name}`
    );
  }

  /**
   * Get a provider by gateway type
   *
   * @param type - The gateway type
   * @returns The provider implementation
   * @throws GatewayRegistryError if provider not found
   */
  get(type: GatewayType): GatewayProvider {
    const provider = this.providers.get(type);
    if (!provider) {
      throw new GatewayRegistryError(
        `No provider registered for gateway type: ${type}`,
        "NOT_FOUND"
      );
    }
    return provider;
  }

  /**
   * Check if a provider is registered for a type
   */
  has(type: GatewayType): boolean {
    return this.providers.has(type);
  }

  /**
   * Get all registered providers
   */
  getAll(): GatewayProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * Get all registered gateway types
   */
  getTypes(): GatewayType[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Get provider metadata for UI
   */
  getProviderInfo(): Array<{
    type: GatewayType;
    name: string;
    description: string;
    actions: GatewayAction[];
  }> {
    return this.getAll().map((provider) => ({
      type: provider.type,
      name: provider.name,
      description: provider.description,
      actions: provider.getSupportedActions(),
    }));
  }

  /**
   * Unregister a provider (mainly for testing)
   */
  unregister(type: GatewayType): boolean {
    const deleted = this.providers.delete(type);
    if (deleted) {
      registryLogger.info({ type }, `Unregistered gateway provider: ${type}`);
    }
    return deleted;
  }

  /**
   * Clear all providers (mainly for testing)
   */
  clear(): void {
    this.providers.clear();
    registryLogger.info("Cleared all gateway providers");
  }
}

/**
 * Singleton gateway registry instance
 */
export const gatewayRegistry = new GatewayRegistry();
