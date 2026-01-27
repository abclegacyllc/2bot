"use strict";
/**
 * Gateway Providers
 *
 * Export all gateway provider implementations and base classes.
 *
 * @module modules/gateway/providers
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiProvider = exports.AIProvider = exports.AIApiError = exports.telegramBotProvider = exports.TelegramBotProvider = exports.TelegramApiError = exports.UnsupportedActionError = exports.InvalidCredentialsError = exports.GatewayNotConnectedError = exports.BaseGatewayProvider = void 0;
// Base provider and errors
var base_provider_1 = require("./base.provider");
Object.defineProperty(exports, "BaseGatewayProvider", { enumerable: true, get: function () { return base_provider_1.BaseGatewayProvider; } });
Object.defineProperty(exports, "GatewayNotConnectedError", { enumerable: true, get: function () { return base_provider_1.GatewayNotConnectedError; } });
Object.defineProperty(exports, "InvalidCredentialsError", { enumerable: true, get: function () { return base_provider_1.InvalidCredentialsError; } });
Object.defineProperty(exports, "UnsupportedActionError", { enumerable: true, get: function () { return base_provider_1.UnsupportedActionError; } });
// Telegram Bot provider
var telegram_bot_provider_1 = require("./telegram-bot.provider");
Object.defineProperty(exports, "TelegramApiError", { enumerable: true, get: function () { return telegram_bot_provider_1.TelegramApiError; } });
Object.defineProperty(exports, "TelegramBotProvider", { enumerable: true, get: function () { return telegram_bot_provider_1.TelegramBotProvider; } });
Object.defineProperty(exports, "telegramBotProvider", { enumerable: true, get: function () { return telegram_bot_provider_1.telegramBotProvider; } });
// AI provider (OpenAI, Anthropic, etc.)
var ai_provider_1 = require("./ai.provider");
Object.defineProperty(exports, "AIApiError", { enumerable: true, get: function () { return ai_provider_1.AIApiError; } });
Object.defineProperty(exports, "AIProvider", { enumerable: true, get: function () { return ai_provider_1.AIProvider; } });
Object.defineProperty(exports, "aiProvider", { enumerable: true, get: function () { return ai_provider_1.aiProvider; } });
// Concrete providers will be exported here as they are implemented:
// export { WebhookProvider } from "./webhook.provider";
//# sourceMappingURL=index.js.map