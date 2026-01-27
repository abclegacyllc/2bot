"use strict";
/**
 * Gateway Provider Initialization
 *
 * Registers all gateway providers with the registry at server startup.
 *
 * @module server/init-providers
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeGatewayProviders = initializeGatewayProviders;
const logger_1 = require("@/lib/logger");
const gateway_registry_1 = require("@/modules/gateway/gateway.registry");
const providers_1 = require("@/modules/gateway/providers");
const logger = logger_1.loggers.server;
/**
 * Initialize and register all gateway providers
 *
 * This must be called before the server starts handling requests
 * that involve gateway operations.
 */
function initializeGatewayProviders() {
    logger.info("Initializing gateway providers...");
    try {
        // Register Telegram Bot provider
        gateway_registry_1.gatewayRegistry.register(providers_1.telegramBotProvider);
        // Register AI provider (OpenAI, Anthropic, etc.)
        gateway_registry_1.gatewayRegistry.register(providers_1.aiProvider);
        // Log registered providers
        const types = gateway_registry_1.gatewayRegistry.getTypes();
        logger.info({ providers: types }, `Registered ${types.length} gateway providers: ${types.join(", ")}`);
    }
    catch (error) {
        logger.error({ error }, "Failed to initialize gateway providers");
        throw error;
    }
}
//# sourceMappingURL=init-providers.js.map