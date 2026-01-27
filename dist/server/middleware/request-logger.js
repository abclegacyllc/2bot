"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestLogger = exports.pinoHttpMiddleware = void 0;
const logger_1 = require("@/lib/logger");
const crypto_1 = require("crypto");
const pino_http_1 = __importDefault(require("pino-http"));
const serverLogger = logger_1.loggers.server;
/**
 * Pino HTTP middleware for structured request logging
 */
exports.pinoHttpMiddleware = (0, pino_http_1.default)({
    logger: logger_1.logger,
    genReqId: (req) => req.headers["x-request-id"] || (0, crypto_1.randomUUID)(),
    customLogLevel: (_req, res, err) => {
        if (res.statusCode >= 500 || err)
            return "error";
        if (res.statusCode >= 400)
            return "warn";
        return "info";
    },
    customSuccessMessage: (req, res) => {
        return `${req.method} ${req.url} ${res.statusCode}`;
    },
    customErrorMessage: (req, res) => {
        return `${req.method} ${req.url} ${res.statusCode}`;
    },
    // Skip logging for health checks in production
    autoLogging: {
        ignore: (req) => {
            return process.env.NODE_ENV === "production" && req.url === "/api/health";
        },
    },
    customProps: (req) => ({
        requestId: req.id,
        userAgent: req.headers["user-agent"],
        ip: req.headers["x-forwarded-for"] ?? req.socket.remoteAddress,
    }),
    // Redact sensitive headers
    redact: ["req.headers.authorization", "req.headers.cookie"],
});
/**
 * Simple request logging middleware (fallback/custom)
 */
const requestLogger = (req, res, next) => {
    // Add request ID
    const requestId = req.headers["x-request-id"] || (0, crypto_1.randomUUID)();
    req.headers["x-request-id"] = requestId;
    res.setHeader("X-Request-ID", requestId);
    const start = Date.now();
    res.on("finish", () => {
        const duration = Date.now() - start;
        // Skip health check logs in production
        if (process.env.NODE_ENV === "production" && req.path === "/api/health") {
            return;
        }
        serverLogger.info({
            method: req.method,
            url: req.originalUrl,
            status: res.statusCode,
            duration,
            requestId,
            ip: req.ip,
            userAgent: req.get("user-agent"),
        }, `${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`);
    });
    next();
};
exports.requestLogger = requestLogger;
//# sourceMappingURL=request-logger.js.map