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

// Discord Bot provider
export {
    DiscordApiError, DiscordBotProvider, discordBotProvider
} from "./discord-bot.provider";

// Slack Bot provider
export {
    SlackApiError, SlackBotProvider, slackBotProvider
} from "./slack-bot.provider";

// WhatsApp Bot provider
export {
    WhatsAppApiError, WhatsAppBotProvider, whatsAppBotProvider
} from "./whatsapp-bot.provider";

// Concrete providers will be exported here as they are implemented:
// export { WebhookProvider } from "./webhook.provider";
