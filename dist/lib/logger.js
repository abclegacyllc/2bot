"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loggers = exports.logger = void 0;
exports.createLogger = createLogger;
const pino_1 = __importDefault(require("pino"));
const isProduction = process.env.NODE_ENV === "production";
const isDevelopment = process.env.NODE_ENV === "development";
const logLevel = process.env.LOG_LEVEL ?? (isProduction ? "info" : "debug");
/**
 * Sensitive keys to redact from logs
 */
const REDACT_PATHS = [
    "password",
    "newPassword",
    "currentPassword",
    "token",
    "accessToken",
    "refreshToken",
    "apiKey",
    "secret",
    "authorization",
    "cookie",
    "req.headers.authorization",
    "req.headers.cookie",
    "res.headers['set-cookie']",
];
/**
 * Pino logger configuration
 */
exports.logger = (0, pino_1.default)({
    level: logLevel,
    redact: {
        paths: REDACT_PATHS,
        censor: "[REDACTED]",
    },
    ...(isDevelopment && {
        transport: {
            target: "pino-pretty",
            options: {
                colorize: true,
                translateTime: "SYS:standard",
                ignore: "pid,hostname",
                messageFormat: "{msg}",
            },
        },
    }),
    ...(isProduction && {
        formatters: {
            level: (label) => ({ level: label }),
        },
        timestamp: pino_1.default.stdTimeFunctions.isoTime,
    }),
    base: {
        env: process.env.NODE_ENV,
        ...(isProduction && { pid: process.pid }),
    },
});
/**
 * Create a child logger with context
 */
function createLogger(context, meta) {
    return exports.logger.child({ context, ...meta });
}
/**
 * Pre-configured loggers for different modules
 */
exports.loggers = {
    server: createLogger("server"),
    auth: createLogger("auth"),
    db: createLogger("database"),
    redis: createLogger("redis"),
    telegram: createLogger("telegram"),
    ai: createLogger("ai"),
    billing: createLogger("billing"),
    plugins: createLogger("plugins"),
};
//# sourceMappingURL=logger.js.map