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
 * Build the production transport spec from environment.
 *
 * Supports a generic Pino transport target via `LOG_TRANSPORT_TARGET`, e.g.:
 *   LOG_TRANSPORT_TARGET=pino-loki
 *   LOG_TRANSPORT_OPTIONS='{"host":"http://loki:3100","labels":{"app":"2bot"}}'
 *
 * Or a multi-line `LOG_TRANSPORT_TARGETS` JSON array of `{target,options}`
 * entries for ship-and-stdout fan-out.
 *
 * Returns `undefined` when no transport is configured (default: stdout JSON).
 */
function buildProductionTransport(): pino.TransportTargetOptions | pino.TransportMultiOptions | undefined {
  const multi = process.env.LOG_TRANSPORT_TARGETS;
  if (multi) {
    try {
      const targets = JSON.parse(multi) as pino.TransportTargetOptions[];
      if (Array.isArray(targets) && targets.length > 0) {
        return { targets };
      }
    } catch (err) {
      // Fall through to single-target / stdout. Don't crash logging on bad config.

      console.error("Invalid LOG_TRANSPORT_TARGETS JSON, falling back to stdout:", err);
    }
  }

  const target = process.env.LOG_TRANSPORT_TARGET;
  if (!target) return undefined;

  let options: Record<string, unknown> = {};
  if (process.env.LOG_TRANSPORT_OPTIONS) {
    try {
      options = JSON.parse(process.env.LOG_TRANSPORT_OPTIONS) as Record<string, unknown>;
    } catch (err) {

      console.error("Invalid LOG_TRANSPORT_OPTIONS JSON, ignoring:", err);
    }
  }
  return { target, options };
}

const productionTransport = isProduction ? buildProductionTransport() : undefined;

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
    ...(productionTransport ? { transport: productionTransport } : {}),
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
