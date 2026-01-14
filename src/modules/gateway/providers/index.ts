/**
 * Gateway Providers
 *
 * Export all gateway provider implementations and base classes.
 *
 * @module modules/gateway/providers
 */

// Base provider and errors
export {
    BaseGatewayProvider,
    GatewayNotConnectedError, InvalidCredentialsError, UnsupportedActionError
} from "./base.provider";

// Telegram Bot provider
export {
    TelegramApiError, TelegramBotProvider, telegramBotProvider
} from "./telegram-bot.provider";

// AI provider (OpenAI, Anthropic, etc.)
export {
    AIApiError, AIProvider, aiProvider
} from "./ai.provider";

// Concrete providers will be exported here as they are implemented:
// export { WebhookProvider } from "./webhook.provider";
