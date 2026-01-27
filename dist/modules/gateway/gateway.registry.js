"use strict";
/**
 * Gateway Registry
 *
 * Registry pattern for managing gateway providers.
 * Allows dynamic registration of gateway implementations and retrieval by type.
 *
 * @module modules/gateway/gateway.registry
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.gatewayRegistry = exports.GatewayRegistryError = void 0;
const logger_1 = require("@/lib/logger");
const registryLogger = logger_1.logger.child({ module: "gateway-registry" });
/**
 * Gateway Registry Error
 */
class GatewayRegistryError extends Error {
    code;
    constructor(message, code) {
        super(message);
        this.code = code;
        this.name = "GatewayRegistryError";
    }
}
exports.GatewayRegistryError = GatewayRegistryError;
/**
 * Gateway Registry
 *
 * Singleton registry for managing gateway providers.
 * Providers are registered at application startup.
 */
class GatewayRegistry {
    providers = new Map();
    /**
     * Register a gateway provider
     *
     * @param provider - The provider implementation
     * @param options - Registration options
     * @throws GatewayRegistryError if provider already registered (unless override=true)
     */
    register(provider, options = {}) {
        const { override = false } = options;
        if (this.providers.has(provider.type) && !override) {
            throw new GatewayRegistryError(`Provider for ${provider.type} is already registered`, "ALREADY_REGISTERED");
        }
        this.providers.set(provider.type, provider);
        registryLogger.info({ type: provider.type, name: provider.name }, `Registered gateway provider: ${provider.name}`);
    }
    /**
     * Get a provider by gateway type
     *
     * @param type - The gateway type
     * @returns The provider implementation
     * @throws GatewayRegistryError if provider not found
     */
    get(type) {
        const provider = this.providers.get(type);
        if (!provider) {
            throw new GatewayRegistryError(`No provider registered for gateway type: ${type}`, "NOT_FOUND");
        }
        return provider;
    }
    /**
     * Check if a provider is registered for a type
     */
    has(type) {
        return this.providers.has(type);
    }
    /**
     * Get all registered providers
     */
    getAll() {
        return Array.from(this.providers.values());
    }
    /**
     * Get all registered gateway types
     */
    getTypes() {
        return Array.from(this.providers.keys());
    }
    /**
     * Get provider metadata for UI
     */
    getProviderInfo() {
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
    unregister(type) {
        const deleted = this.providers.delete(type);
        if (deleted) {
            registryLogger.info({ type }, `Unregistered gateway provider: ${type}`);
        }
        return deleted;
    }
    /**
     * Clear all providers (mainly for testing)
     */
    clear() {
        this.providers.clear();
        registryLogger.info("Cleared all gateway providers");
    }
}
/**
 * Singleton gateway registry instance
 */
exports.gatewayRegistry = new GatewayRegistry();
//# sourceMappingURL=gateway.registry.js.map