"use strict";
/**
 * Telegram Bot Gateway Provider
 *
 * Implements the GatewayProvider interface for Telegram Bot API.
 * Uses native fetch for API calls (no external dependencies).
 *
 * @module modules/gateway/providers/telegram-bot.provider
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.telegramBotProvider = exports.TelegramApiError = exports.TelegramBotProvider = void 0;
const base_provider_1 = require("./base.provider");
// ===========================================
// Telegram API Types
// ===========================================
/**
 * Telegram Bot API base URL
 */
const TELEGRAM_API_BASE = "https://api.telegram.org";
// ===========================================
// Provider Implementation
// ===========================================
/**
 * Telegram Bot Provider
 *
 * Supported actions:
 * - getMe: Get bot info
 * - sendMessage: Send a text message
 * - setWebhook: Configure webhook URL
 * - deleteWebhook: Remove webhook
 * - getWebhookInfo: Get current webhook status
 */
class TelegramBotProvider extends base_provider_1.BaseGatewayProvider {
    type = "TELEGRAM_BOT";
    name = "Telegram Bot";
    description = "Connect your Telegram bot to receive and send messages";
    /** Cache bot info per gateway */
    botInfoCache = new Map();
    /** Store credentials per gateway (for execute calls) */
    credentialsCache = new Map();
    // ===========================================
    // Abstract Method Implementations
    // ===========================================
    async doConnect(gatewayId, credentials, config) {
        // Validate token by getting bot info
        const botInfo = await this.callApi(credentials.botToken, "getMe");
        // Cache bot info and credentials
        this.botInfoCache.set(gatewayId, botInfo);
        this.credentialsCache.set(gatewayId, credentials);
        this.log.info({ gatewayId, botUsername: botInfo.username }, `Connected to Telegram bot @${botInfo.username}`);
        // Set webhook if configured
        if (config?.webhookUrl) {
            await this.callApi(credentials.botToken, "setWebhook", {
                url: config.webhookUrl,
                allowed_updates: config.allowedUpdates,
                drop_pending_updates: config.dropPendingUpdates,
            });
            this.log.info({ gatewayId, webhookUrl: config.webhookUrl }, "Webhook configured");
        }
    }
    async doDisconnect(gatewayId) {
        // Clear cached bot info and credentials
        this.botInfoCache.delete(gatewayId);
        this.credentialsCache.delete(gatewayId);
        this.log.info({ gatewayId }, "Telegram bot disconnected");
    }
    async doValidateCredentials(credentials) {
        try {
            // Token format check: <bot_id>:<hash>
            const tokenRegex = /^\d+:[A-Za-z0-9_-]{35}$/;
            if (!tokenRegex.test(credentials.botToken)) {
                return { valid: false, error: "Invalid bot token format" };
            }
            // Try to get bot info
            const botInfo = await this.callApi(credentials.botToken, "getMe");
            if (!botInfo.is_bot) {
                return { valid: false, error: "Token is not for a bot" };
            }
            return { valid: true };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "Unknown error";
            return { valid: false, error: message };
        }
    }
    async doExecute(gatewayId, action, params) {
        // Get credentials from cache
        const credentials = this.credentialsCache.get(gatewayId);
        if (!credentials) {
            throw new Error("Bot credentials not found - gateway not connected");
        }
        const botToken = credentials.botToken;
        switch (action) {
            case "getMe":
                return this.callApi(botToken, "getMe");
            case "sendMessage":
                return this.executeSendMessage(botToken, params);
            case "setWebhook":
                return this.executeSetWebhook(botToken, params);
            case "deleteWebhook":
                return this.executeDeleteWebhook(botToken, params);
            case "getWebhookInfo":
                return this.callApi(botToken, "getWebhookInfo");
            default:
                throw new base_provider_1.UnsupportedActionError(action, this.type);
        }
    }
    async doCheckHealth(gatewayId, credentials) {
        try {
            const start = Date.now();
            await this.callApi(credentials.botToken, "getMe");
            const latency = Date.now() - start;
            return { healthy: true, latency };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "Unknown error";
            return { healthy: false, error: message };
        }
    }
    getSupportedActions() {
        return [
            {
                name: "getMe",
                description: "Get information about the bot",
                returns: "TelegramUser",
            },
            {
                name: "sendMessage",
                description: "Send a text message to a chat",
                params: {
                    chat_id: { type: "string", required: true, description: "Chat ID or @username" },
                    text: { type: "string", required: true, description: "Message text" },
                    parse_mode: {
                        type: "string",
                        required: false,
                        description: "HTML or Markdown",
                    },
                    disable_notification: {
                        type: "boolean",
                        required: false,
                        description: "Send silently",
                    },
                },
                returns: "TelegramMessage",
            },
            {
                name: "setWebhook",
                description: "Set the webhook URL for receiving updates",
                params: {
                    url: { type: "string", required: true, description: "Webhook URL (HTTPS)" },
                    allowed_updates: {
                        type: "array",
                        required: false,
                        description: "Update types to receive",
                    },
                    drop_pending_updates: {
                        type: "boolean",
                        required: false,
                        description: "Drop pending updates",
                    },
                },
                returns: "boolean",
            },
            {
                name: "deleteWebhook",
                description: "Remove the webhook",
                params: {
                    drop_pending_updates: {
                        type: "boolean",
                        required: false,
                        description: "Drop pending updates",
                    },
                },
                returns: "boolean",
            },
            {
                name: "getWebhookInfo",
                description: "Get current webhook status",
                returns: "TelegramWebhookInfo",
            },
        ];
    }
    // ===========================================
    // Action Implementations
    // ===========================================
    async executeSendMessage(botToken, params) {
        if (!params.chat_id) {
            throw new Error("chat_id is required");
        }
        if (!params.text) {
            throw new Error("text is required");
        }
        return this.callApi(botToken, "sendMessage", {
            chat_id: params.chat_id,
            text: params.text,
            parse_mode: params.parse_mode,
            disable_notification: params.disable_notification,
            disable_web_page_preview: params.disable_web_page_preview,
            reply_to_message_id: params.reply_to_message_id,
        });
    }
    async executeSetWebhook(botToken, params) {
        if (!params.url) {
            throw new Error("url is required");
        }
        // URL must be HTTPS
        if (!params.url.startsWith("https://")) {
            throw new Error("Webhook URL must use HTTPS");
        }
        await this.callApi(botToken, "setWebhook", {
            url: params.url,
            allowed_updates: params.allowed_updates,
            drop_pending_updates: params.drop_pending_updates,
            max_connections: params.max_connections,
            secret_token: params.secret_token,
        });
        return true;
    }
    async executeDeleteWebhook(botToken, params) {
        await this.callApi(botToken, "deleteWebhook", {
            drop_pending_updates: params.drop_pending_updates,
        });
        return true;
    }
    // ===========================================
    // API Helper
    // ===========================================
    /**
     * Call Telegram Bot API
     */
    async callApi(botToken, method, params) {
        const url = `${TELEGRAM_API_BASE}/bot${botToken}/${method}`;
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: params ? JSON.stringify(params) : undefined,
        });
        const data = (await response.json());
        if (!data.ok) {
            throw new TelegramApiError(data.description || "Unknown Telegram API error", data.error_code || 0, method);
        }
        return data.result;
    }
    // ===========================================
    // Public Helper Methods
    // ===========================================
    /**
     * Get cached bot info for a gateway
     */
    getBotInfo(gatewayId) {
        return this.botInfoCache.get(gatewayId);
    }
    /**
     * Validate a bot token format (without API call)
     */
    static isValidTokenFormat(token) {
        return /^\d+:[A-Za-z0-9_-]{35}$/.test(token);
    }
}
exports.TelegramBotProvider = TelegramBotProvider;
// ===========================================
// Errors
// ===========================================
/**
 * Telegram API Error
 */
class TelegramApiError extends Error {
    errorCode;
    method;
    constructor(message, errorCode, method) {
        super(`Telegram API error (${errorCode}): ${message}`);
        this.errorCode = errorCode;
        this.method = method;
        this.name = "TelegramApiError";
    }
}
exports.TelegramApiError = TelegramApiError;
// ===========================================
// Singleton Instance
// ===========================================
/**
 * Singleton Telegram Bot provider instance
 */
exports.telegramBotProvider = new TelegramBotProvider();
//# sourceMappingURL=telegram-bot.provider.js.map