/**
 * OpenTelemetry bootstrap (Wave 4.1)
 *
 * Initialises the OTel SDK with HTTP/Express/PG/Redis auto-instrumentation
 * and the Prisma instrumentation. Must run BEFORE any imports that touch
 * the libraries it patches — that's why `start.ts` imports this file
 * first thing, and why we read env synchronously here.
 *
 * The whole SDK is gated by `OTEL_ENABLED`. Default off so dev runs
 * stay quiet; flip to `true` in staging to verify, then in prod to
 * collect.
 *
 * Exporter: OTLP/HTTP (the lingua franca of OTel collectors). Point
 * `OTEL_EXPORTER_OTLP_ENDPOINT` at a Tempo / Jaeger / Honeycomb / etc.
 * collector. Without an endpoint we still install the SDK and emit
 * traces to the in-process span processor — useful for testing the
 * instrumentation contract without a backend.
 *
 * @module server/otel
 */

import { trace } from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";
import { PrismaInstrumentation } from "@prisma/instrumentation";

let sdk: NodeSDK | null = null;
let started = false;

function isEnabled(): boolean {
  const raw = (process.env.OTEL_ENABLED || "").toLowerCase();
  return raw === "true" || raw === "1" || raw === "enabled";
}

/**
 * Start OTel. Idempotent: a second call is a no-op. Safe to import
 * unconditionally — the body short-circuits when the env flag is off.
 */
export function startOtel(): void {
  if (started) return;
  started = true;

  if (!isEnabled()) {
    return;
  }

  const serviceName = process.env.OTEL_SERVICE_NAME || "2bot-api";
  const serviceVersion = process.env.npm_package_version || "0.0.0";
  const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

  // The auto-instrumentation set covers HTTP, Express, ioredis, pg, fs,
  // dns, net, etc. We disable a few noisy ones by default — fs is
  // particularly chatty and rarely useful for traces (every fs call
  // becomes a span). Operators can enable them via the standard
  // OTEL_NODE_DISABLED_INSTRUMENTATIONS env var if needed.
  const instrumentations = [
    getNodeAutoInstrumentations({
      "@opentelemetry/instrumentation-fs": { enabled: false },
      "@opentelemetry/instrumentation-dns": { enabled: false },
      "@opentelemetry/instrumentation-net": { enabled: false },
    }),
    new PrismaInstrumentation(),
  ];

  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: serviceName,
      [ATTR_SERVICE_VERSION]: serviceVersion,
      "deployment.environment": process.env.NODE_ENV || "development",
    }),
    traceExporter: otlpEndpoint
      ? new OTLPTraceExporter({ url: `${otlpEndpoint.replace(/\/$/, "")}/v1/traces` })
      : undefined,
    instrumentations,
  });

  sdk.start();

  // Install graceful shutdown so traces in flight get flushed when the
  // server exits (graceful-shutdown.ts only handles HTTP/DB; the OTel
  // SDK has its own).
  for (const sig of ["SIGTERM", "SIGINT"] as const) {
    process.once(sig, () => {
      sdk?.shutdown().catch(() => {
        // shutdown may race with our other cleanup; swallowing here
        // because we're exiting anyway.
      });
    });
  }
}

/**
 * Convenience for adding the active trace id to log records. Returns
 * an empty object if OTel is off or no active trace exists.
 */
export function getActiveTraceFields(): Record<string, string> {
  const span = trace.getActiveSpan();
  if (!span) return {};
  const ctx = span.spanContext();
  if (!ctx?.traceId) return {};
  return { traceId: ctx.traceId, spanId: ctx.spanId };
}
