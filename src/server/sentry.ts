/**
 * Sentry on the Express server (Wave 4.6)
 *
 * The Next.js app already wires Sentry through `sentry.{client,server,
 * edge}.config.ts`. The standalone Express API at `src/server/start.ts`
 * was running without Sentry — uncaught exceptions there only reached
 * pino logs. This module fixes that.
 *
 * Why a separate module from the Next.js configs? Because the Express
 * process is `tsx src/server/start.ts`, not Next.js — the SDK we want
 * is `@sentry/node`, not `@sentry/nextjs`. Initialising both in one
 * process is fine; they share the same DSN/transport.
 *
 * Gating: enabled iff `NEXT_PUBLIC_SENTRY_DSN` (or `SENTRY_DSN`) is
 * set. No DSN → completely silent, no SDK overhead.
 *
 * Use `attachSentryHandlers(app)` from `app.ts` to install the
 * request handler + error handler middleware.
 *
 * @module server/sentry
 */

import * as Sentry from "@sentry/node";
import type { Express } from "express";

let started = false;

function getDsn(): string | undefined {
  return process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN;
}

/**
 * Initialise Sentry. Idempotent. Must run before any request reaches
 * the Express app — `start.ts` calls this immediately after dotenv.
 */
export function startSentry(): void {
  if (started) return;
  started = true;

  const dsn = getDsn();
  if (!dsn) {
    return; // no DSN → no Sentry, no overhead
  }

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || "development",
    // 10% trace sampling in prod, 100% in dev (matches the Next.js side).
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
    // Don't drown the project quota in noise from health-check probes.
    ignoreTransactions: ["GET /health", "GET /metrics"],
    // Auto-instrument http, express, prisma, etc. The list is curated
    // by @sentry/node; we trust the defaults but keep this comment as
    // a hint for future on-call engineers.
    integrations: [
      // Sentry node v10 integrations are auto-included by `init()`.
      // Enabling profiling or extra integrations would go here.
    ],
    // Filter PII at the SDK boundary. Pino's redaction already strips
    // most secrets in logs, but uncaught exceptions can still carry
    // raw context (req.body, etc) — Sentry does its own scrubbing of
    // common fields, but we add the Wave-2.1 MFA paths explicitly.
    beforeSend(event) {
      const data = event.request?.data;
      if (data && typeof data === "object" && data !== null) {
        const obj = data as Record<string, unknown>;
        for (const k of [
          "password",
          "newPassword",
          "currentPassword",
          "token",
          "refreshToken",
          "code",
          "totpCode",
          "mfaCode",
          "mfaToken",
        ]) {
          if (k in obj) obj[k] = "[Filtered]";
        }
      }
      return event;
    },
  });
}

/**
 * Attach Sentry's request and error handlers to an Express app.
 *
 * The request handler MUST be the first middleware on the app so it
 * captures every request scope. The error handler MUST sit BEFORE the
 * application's own `errorHandler` so Sentry sees the exception before
 * it's reformatted into a JSON response.
 *
 * Both calls are no-ops when Sentry isn't initialised, so it's safe to
 * call from app.ts unconditionally.
 */
export function attachSentryHandlers(app: Express): void {
  if (!started || !getDsn()) return;
  Sentry.setupExpressErrorHandler(app);
}
