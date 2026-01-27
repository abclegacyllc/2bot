"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SERVER_CONFIG = void 0;
exports.createApp = createApp;
exports.default = createApp;
exports.startServer = startServer;
const logger_1 = require("@/lib/logger");
const cors_1 = __importDefault(require("cors"));
const express_1 = __importDefault(require("express"));
const helmet_1 = __importDefault(require("helmet"));
const cors_2 = require("./middleware/cors");
const error_handler_1 = require("./middleware/error-handler");
const rate_limit_1 = require("./middleware/rate-limit");
const request_logger_1 = require("./middleware/request-logger");
const routes_1 = require("./routes");
const stripe_webhook_1 = __importDefault(require("./routes/stripe-webhook"));
const serverLogger = logger_1.loggers.server;
/**
 * API prefix for routes
 *
 * Phase 6.9: Production-like development (no prefix)
 *
 * Both development and production use the same URL structure:
 * - Dev:  localhost:3001/user/gateways
 * - Prod: api.2bot.org/user/gateways
 *
 * This ensures dev/prod parity and catches issues early.
 * The API_PREFIX env var is kept for edge cases only.
 */
const API_PREFIX = process.env.API_PREFIX ?? "";
/**
 * Create and configure Express application
 */
function createApp() {
    const app = (0, express_1.default)();
    // Security middleware
    app.use((0, helmet_1.default)());
    app.use((0, cors_1.default)(cors_2.corsOptions));
    // Stripe webhook needs raw body for signature verification
    // Must be registered BEFORE express.json()
    // Support both /api/webhooks/stripe and /webhooks/stripe (enterprise mode)
    const stripeWebhookPath = API_PREFIX ? `${API_PREFIX}/webhooks/stripe` : "/webhooks/stripe";
    app.use(stripeWebhookPath, express_1.default.raw({ type: "application/json" }), stripe_webhook_1.default);
    // Body parsing
    app.use(express_1.default.json({ limit: "10mb" }));
    app.use(express_1.default.urlencoded({ extended: true, limit: "10mb" }));
    // Request logging with Pino
    app.use(request_logger_1.pinoHttpMiddleware);
    // Rate limiting (apply early to protect all routes)
    app.use((0, rate_limit_1.rateLimitMiddleware)());
    // API routes
    // Phase 6.7.5.3: Support configurable prefix
    // When API_PREFIX="" (enterprise), routes are at root
    // When API_PREFIX="/api" (default), routes are at /api
    if (API_PREFIX) {
        app.use(API_PREFIX, routes_1.router);
    }
    else {
        app.use(routes_1.router);
    }
    // Log configured prefix
    serverLogger.info({ apiPrefix: API_PREFIX || "(root)" }, "API routes configured");
    // Error handling (must be last)
    app.use(error_handler_1.errorHandler);
    return app;
}
/**
 * Server configuration
 */
exports.SERVER_CONFIG = {
    port: parseInt(process.env.SERVER_PORT || "3001", 10),
    host: process.env.SERVER_HOST || "0.0.0.0",
    apiPrefix: API_PREFIX,
};
/**
 * Start the Express server
 */
function startServer(app) {
    const { port, host, apiPrefix } = exports.SERVER_CONFIG;
    const healthPath = apiPrefix ? `${apiPrefix}/health` : "/health";
    app.listen(port, host, () => {
        serverLogger.info({ port, host }, `🚀 Express API server running on http://${host}:${port}`);
        serverLogger.info(`   Health check: http://${host}:${port}${healthPath}`);
        if (!apiPrefix) {
            serverLogger.info(`   Enterprise mode: Routes at root (no /api prefix)`);
        }
    });
}
//# sourceMappingURL=app.js.map