/**
 * Gateway Provider Initialization
 *
 * Registers all gateway providers with the registry at server startup.
 *
 * @module server/init-providers
 */

import { loggers } from "@/lib/logger";
import { gatewayRegistry } from "@/modules/gateway/gateway.registry";
import {
    discordBotProvider,
    slackBotProvider,
    telegramBotProvider,
    whatsAppBotProvider,
} from "@/modules/gateway/providers";

const logger = loggers.server;

/**
 * Initialize and register all gateway providers
 *
 * This must be called before the server starts handling requests
 * that involve gateway operations.
 */
export function initializeGatewayProviders(): void {
  logger.info("Initializing gateway providers...");

  try {
    // Register Telegram Bot provider
    gatewayRegistry.register(telegramBotProvider);

    // Register Discord Bot provider
    gatewayRegistry.register(discordBotProvider);

    // Register Slack Bot provider
    gatewayRegistry.register(slackBotProvider);

    // Register WhatsApp Bot provider
    gatewayRegistry.register(whatsAppBotProvider);

    // Log registered providers
    const types = gatewayRegistry.getTypes();
    logger.info(
      { providers: types },
      `Registered ${types.length} gateway providers: ${types.join(", ")}`
    );
  } catch (error) {
    logger.error({ error }, "Failed to initialize gateway providers");
    throw error;
  }
}
