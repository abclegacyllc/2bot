import pino from "pino";

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
  // AI Privacy Redaction
  "messages",
  "content",
  "input",
  "output",
  "prompt",
  "completion",
  "text", // Common field for text content
];

/**
 * Pino logger configuration
 */
export const logger = pino({
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
    timestamp: pino.stdTimeFunctions.isoTime,
  }),
  base: {
    env: process.env.NODE_ENV,
    ...(isProduction && { pid: process.pid }),
  },
});

/**
 * Create a child logger with context
 */
export function createLogger(context: string, meta?: Record<string, unknown>): pino.Logger {
  return logger.child({ context, ...meta });
}

/**
 * Pre-configured loggers for different modules
 */
export const loggers = {
  server: createLogger("server"),
  auth: createLogger("auth"),
  db: createLogger("database"),
  redis: createLogger("redis"),
  telegram: createLogger("telegram"),
  ai: createLogger("ai"),
  billing: createLogger("billing"),
  plugins: createLogger("plugins"),
};

export type Logger = pino.Logger;
