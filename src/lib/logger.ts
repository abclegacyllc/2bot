import { trace } from "@opentelemetry/api";
import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";
const isDevelopment = process.env.NODE_ENV === "development";
const logLevel = process.env.LOG_LEVEL ?? (isProduction ? "info" : "debug");

/**
 * Wave 4.1 — fish the active OTel trace id off the current async-local
 * context so every log line is correlatable with a trace in Tempo /
 * Honeycomb / Jaeger.
 *
 * `@opentelemetry/api` is a thin always-loadable shim — when no SDK is
 * registered (`OTEL_ENABLED=false`) `getActiveSpan()` returns null and
 * this function returns undefined, so pino's mixin adds no fields.
 */
function activeTraceFields(): { traceId: string; spanId: string } | undefined {
  const span = trace.getActiveSpan();
  if (!span) return undefined;
  const ctx = span.spanContext();
  if (!ctx?.traceId) return undefined;
  return { traceId: ctx.traceId, spanId: ctx.spanId };
}

/**
 * Paths that get redacted before any log line is emitted.
 *
 * Pattern: prefer narrow, well-named paths over broad keys. A bare key
 * like `"text"` or `"id"` matches every nested occurrence in every log
 * line and tends to nuke useful debug data; nested or wildcard paths
 * (`*.messages[*].content`) only redact the field at that location.
 */
const REDACT_PATHS = [
  // Auth / credentials
  "password",
  "newPassword",
  "currentPassword",
  "token",
  "accessToken",
  "refreshToken",
  "sessionToken",
  "apiKey",
  "secret",
  "authorization",
  "cookie",
  // TOTP / MFA (Wave 2)
  "totpSecret",
  "totpRecoveryCode",
  "totpRecoveryCodes",
  "recoveryCode",
  "recoveryCodes",
  // Cryptographic material
  "privateKey",
  "serviceAccountKey",
  // Header-level redactions
  "req.headers.authorization",
  "req.headers.cookie",
  "req.headers['x-stripe-signature']",
  "req.headers['stripe-signature']",
  "res.headers['set-cookie']",
  // Auth flow body fields (don't blanket-redact the bare key — too broad)
  "req.body.password",
  "req.body.newPassword",
  "req.body.currentPassword",
  "req.body.token",
  "req.body.refreshToken",
  "req.body.code", // OTP / email verification / reset codes
  "req.body.sig",  // generic signature payloads
  "req.body.totpCode",
  // AI message content (chat conversations) — narrow paths only.
  // Bare `text`/`content`/`prompt`/`completion` were redacting useful
  // fields; restrict to known PII shapes.
  "messages[*].content",
  "*.messages[*].content",
  "req.body.messages[*].content",
  "res.body.messages[*].content",
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
  // Wave 4.1: stamp every log line with the active OTel trace id (when
  // there is one). pino's `mixin` runs synchronously per log call, so
  // there's no cost when no trace is active.
  mixin: () => activeTraceFields() ?? {},
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
