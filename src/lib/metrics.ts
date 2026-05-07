/**
 * Prometheus Metrics
 *
 * Exposes a `/metrics` endpoint scraped by Prometheus. Captures:
 *  - Default Node.js process metrics (CPU, memory, GC, event loop lag)
 *  - HTTP request latency + counter (per route, status)
 *  - Workflow run counter + duration histogram
 *  - Plugin error counter
 *  - Workspace container count gauge
 *  - Bridge pending request gauge
 *
 * The collectors are exported so application code can `inc()` / `observe()`
 * directly. The `metricsHandler` Express handler renders the Prometheus
 * text-format response.
 *
 * @module lib/metrics
 */

import {
    Counter,
    Gauge,
    Histogram,
    Registry,
    collectDefaultMetrics,
} from "prom-client";

/**
 * Single shared registry. Lives at module scope so values accumulate across
 * the lifetime of the process. Multi-replica scrape works because each
 * Prometheus server is configured with all replica targets and aggregates.
 */
export const metricsRegistry = new Registry();

// Process-level defaults (CPU seconds, RSS, GC pauses, event-loop lag, etc.)
collectDefaultMetrics({
  register: metricsRegistry,
  prefix: "bot_",
});

// ─── HTTP ──────────────────────────────────────────────────────────────────

export const httpRequestsTotal = new Counter({
  name: "bot_http_requests_total",
  help: "HTTP requests handled by the API server.",
  labelNames: ["method", "route", "status"] as const,
  registers: [metricsRegistry],
});

export const httpRequestDurationMs = new Histogram({
  name: "bot_http_request_duration_ms",
  help: "HTTP request handler duration in milliseconds.",
  labelNames: ["method", "route", "status"] as const,
  // 1ms .. 30s, suitable for typical API latency profiles
  buckets: [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000],
  registers: [metricsRegistry],
});

// ─── Workflow ──────────────────────────────────────────────────────────────

export const workflowRunsTotal = new Counter({
  name: "bot_workflow_runs_total",
  help: "Workflow runs executed.",
  labelNames: ["status", "trigger"] as const, // status: success|failure, trigger: webhook|schedule|manual
  registers: [metricsRegistry],
});

export const workflowRunDurationMs = new Histogram({
  name: "bot_workflow_run_duration_ms",
  help: "Workflow run end-to-end duration in milliseconds.",
  labelNames: ["status"] as const,
  buckets: [10, 50, 100, 500, 1000, 5000, 10000, 30000, 60000, 300000],
  registers: [metricsRegistry],
});

// ─── Plugins ───────────────────────────────────────────────────────────────

export const pluginErrorsTotal = new Counter({
  name: "bot_plugin_errors_total",
  help: "Errors thrown by plugin executions.",
  labelNames: ["pluginSlug", "kind"] as const, // kind: timeout|crash|validation|other
  registers: [metricsRegistry],
});

export const pluginExecutionsTotal = new Counter({
  name: "bot_plugin_executions_total",
  help: "Plugin executions started.",
  labelNames: ["pluginSlug", "status"] as const,
  registers: [metricsRegistry],
});

/**
 * counts plugins reached via the legacy V1 direct-dispatch path
 * (gateway → handle*Webhook → routeEventToPlugins). Should drop to zero once
 * all UserPlugin installs have been auto-wrapped into ACTIVE workflows.
 *
 * Labels:
 *   - eventType: e.g. "telegram.message", "discord.interaction"
 *   - mode: "telemetry" (counted but still dispatched) | "disabled" (counted, NOT dispatched)
 */
export const v1DispatchTotal = new Counter({
  name: "bot_v1_dispatch_total",
  help: "Plugins reached via the legacy V1 direct-dispatch path (Phase 6.1 deprecation telemetry).",
  labelNames: ["eventType", "mode"] as const,
  registers: [metricsRegistry],
});

// ─── AI BuildSpec Orchestrator ─────────────────────────────────

/**
 * BuildSpec apply attempts, by terminal status.
 * Labels:
 *   - status: "applied" | "rolled-back" | "validation-failed"
 *   - source: free-form caller tag (default "api")
 */
export const buildspecApplyTotal = new Counter({
  name: "bot_buildspec_apply_total",
  help: "AI BuildSpec apply attempts by terminal status.",
  labelNames: ["status", "source"] as const,
  registers: [metricsRegistry],
});

/**
 * BuildSpec smoke-test failures (preflight errors), per failure reason.
 * Labels:
 *   - reason: "preflight" | "exception"
 */
export const buildspecSmokeFailuresTotal = new Counter({
  name: "bot_buildspec_smoke_failures_total",
  help: "BuildSpec smoke-test failures by reason.",
  labelNames: ["reason"] as const,
  registers: [metricsRegistry],
});

/**
 * Project version lifecycle events.
 * Labels:
 *   - status: "staged" | "activated" | "rolled-back" | "snapshot-failed"
 */
export const projectVersionsAppliedTotal = new Counter({
  name: "bot_project_versions_applied_total",
  help: "Project version lifecycle events.",
  labelNames: ["status"] as const,
  registers: [metricsRegistry],
});

/**
 * Cursor user-initiated cancel events.
 *
 * Labels:
 *   - phase: where the cancel was observed
 *       - "between_iterations" — between agent loop iterations (cheaper)
 *       - "between_tools"      — mid-tool-chain inside one iteration
 *       - "mid_stream"         — aborted an in-flight LLM stream
 *
 * Used to spot UX problems: a high cancel rate (especially mid-stream)
 * usually means the agent is taking too long, the model is broken, or
 * the user changed their mind — each suggests a different remediation.
 */
export const cursorCancelTotal = new Counter({
  name: "bot_cursor_cancel_total",
  help: "Cursor user-initiated cancel events by phase.",
  labelNames: ["phase"] as const,
  registers: [metricsRegistry],
});

/**
 * Bridge cost-context RPC calls.
 * Labels:
 *   - action: "credits" | "plan" | "estimate"
 *   - status: "ok" | "error"
 */
export const bridgeCostRpcTotal = new Counter({
  name: "bot_bridge_cost_rpc_total",
  help: "Cost-context bridge RPC calls.",
  labelNames: ["action", "status"] as const,
  registers: [metricsRegistry],
});

// ─── Workspace ─────────────────────────────────────────────────────────────

export const workspaceContainersGauge = new Gauge({
  name: "bot_workspace_containers",
  help: "Current count of workspace containers, by status.",
  labelNames: ["status"] as const, // running|stopped|error|provisioning
  registers: [metricsRegistry],
});

export const bridgePendingRequestsGauge = new Gauge({
  name: "bot_bridge_pending_requests",
  help: "Pending bridge requests across all clients.",
  registers: [metricsRegistry],
});

// ─── Rate limiter / circuit breaker ────────────────────────────────────────

export const rateLimitRejectionsTotal = new Counter({
  name: "bot_rate_limit_rejections_total",
  help: "Requests rejected by the rate limiter.",
  labelNames: ["route", "scope"] as const,
  registers: [metricsRegistry],
});

export const circuitBreakerStateGauge = new Gauge({
  name: "bot_circuit_breaker_state",
  help: "Circuit breaker state: 0=closed, 1=half-open, 2=open.",
  labelNames: ["name"] as const,
  registers: [metricsRegistry],
});

/**
 * Express handler that renders the Prometheus text-format snapshot.
 */
export async function metricsHandler(
  _req: { method?: string; url?: string },
  res: {
    setHeader: (name: string, value: string) => void;
    end: (body: string) => void;
    status: (code: number) => { end: (body: string) => void };
  }
): Promise<void> {
  try {
    const body = await metricsRegistry.metrics();
    res.setHeader("Content-Type", metricsRegistry.contentType);
    res.end(body);
  } catch (err) {
    res.status(500).end(`# metrics error: ${(err as Error).message}\n`);
  }
}
