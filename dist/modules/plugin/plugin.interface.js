"use strict";
/**
 * Plugin Interface/Contract
 *
 * Defines the contracts that plugins must implement and the context
 * they receive during execution. All built-in and marketplace plugins
 * must conform to these interfaces.
 *
 * @module modules/plugin/plugin.interface
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PluginConfigError = exports.PluginCrashError = exports.PluginTimeoutError = exports.PluginExecutionError = exports.PluginNotFoundError = exports.PluginError = exports.BasePlugin = exports.PLUGIN_EVENT_TYPES = void 0;
const client_1 = require("@prisma/client");
/**
 * Event types as constants
 */
exports.PLUGIN_EVENT_TYPES = {
    TELEGRAM_MESSAGE: "telegram.message",
    TELEGRAM_CALLBACK: "telegram.callback",
    SCHEDULE_TRIGGER: "schedule.trigger",
    WEBHOOK_TRIGGER: "webhook.trigger",
    MANUAL_TRIGGER: "manual.trigger",
    WORKFLOW_STEP: "workflow.step",
};
// ===========================================
// Base Plugin Class
// ===========================================
/**
 * Abstract base class for plugin implementations
 * Provides common functionality and default implementations
 */
class BasePlugin {
    inputSchema;
    outputSchema;
    /**
     * Generate Prisma seed data from plugin metadata.
     * Used by database seeding to ensure single source of truth.
     */
    toSeedData() {
        return {
            slug: this.slug,
            name: this.name,
            description: this.description,
            version: this.version,
            requiredGateways: this.requiredGateways,
            configSchema: this.configSchema,
            inputSchema: this.inputSchema ?? client_1.Prisma.DbNull,
            outputSchema: this.outputSchema ?? client_1.Prisma.DbNull,
            icon: this.icon,
            category: this.category,
            tags: this.tags,
            isBuiltin: true,
            isActive: true,
        };
    }
    /**
     * Helper to create a success result
     */
    success(output, metrics) {
        return {
            success: true,
            output,
            metrics: {
                durationMs: 0, // Will be overwritten by executor
                ...metrics,
            },
        };
    }
    /**
     * Helper to create a failure result
     */
    failure(error, metrics) {
        return {
            success: false,
            error,
            metrics: {
                durationMs: 0,
                ...metrics,
            },
        };
    }
    /**
     * Type guard for telegram message events
     */
    isTelegramMessage(event) {
        return event.type === "telegram.message";
    }
    /**
     * Type guard for telegram callback events
     */
    isTelegramCallback(event) {
        return event.type === "telegram.callback";
    }
    /**
     * Type guard for workflow step events
     */
    isWorkflowStep(event) {
        return event.type === "workflow.step";
    }
}
exports.BasePlugin = BasePlugin;
// ===========================================
// Plugin Errors
// ===========================================
/**
 * Base error for plugin-related errors
 */
class PluginError extends Error {
    pluginSlug;
    constructor(message, pluginSlug) {
        super(message);
        this.pluginSlug = pluginSlug;
        this.name = "PluginError";
    }
}
exports.PluginError = PluginError;
/**
 * Plugin not found error
 */
class PluginNotFoundError extends PluginError {
    constructor(slug) {
        super(`Plugin not found: ${slug}`, slug);
        this.name = "PluginNotFoundError";
    }
}
exports.PluginNotFoundError = PluginNotFoundError;
/**
 * Plugin execution error
 */
class PluginExecutionError extends PluginError {
    cause;
    constructor(message, pluginSlug, cause) {
        super(message, pluginSlug);
        this.cause = cause;
        this.name = "PluginExecutionError";
    }
}
exports.PluginExecutionError = PluginExecutionError;
/**
 * Plugin timeout error
 */
class PluginTimeoutError extends PluginError {
    timeoutMs;
    constructor(pluginSlug, timeoutMs) {
        super(`Plugin execution timed out after ${timeoutMs}ms`, pluginSlug);
        this.timeoutMs = timeoutMs;
        this.name = "PluginTimeoutError";
    }
}
exports.PluginTimeoutError = PluginTimeoutError;
/**
 * Plugin crash error (worker thread died)
 */
class PluginCrashError extends PluginError {
    originalError;
    constructor(pluginSlug, originalError) {
        super(`Plugin crashed: ${originalError.message}`, pluginSlug);
        this.originalError = originalError;
        this.name = "PluginCrashError";
    }
}
exports.PluginCrashError = PluginCrashError;
/**
 * Plugin configuration error
 */
class PluginConfigError extends PluginError {
    configErrors;
    constructor(message, pluginSlug, configErrors) {
        super(message, pluginSlug);
        this.configErrors = configErrors;
        this.name = "PluginConfigError";
    }
}
exports.PluginConfigError = PluginConfigError;
//# sourceMappingURL=plugin.interface.js.map