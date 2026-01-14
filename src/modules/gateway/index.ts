/**
 * Gateway Module
 *
 * Manages Telegram Bot, AI providers, and webhook gateways
 * with encrypted credential storage and status tracking.
 *
 * @module modules/gateway
 */

export const GATEWAY_MODULE = "gateway" as const;

// Types
export * from "./gateway.types";

// Validation
export * from "./gateway.validation";

// Service
export { gatewayService } from "./gateway.service";

// Registry
export {
    GatewayRegistryError, gatewayRegistry, type GatewayAction, type GatewayProvider, type ProviderRegistrationOptions
} from "./gateway.registry";

// Providers
export {
    AIApiError, AIProvider, BaseGatewayProvider,
    GatewayNotConnectedError, InvalidCredentialsError, TelegramApiError, TelegramBotProvider, UnsupportedActionError, aiProvider, telegramBotProvider
} from "./providers";

