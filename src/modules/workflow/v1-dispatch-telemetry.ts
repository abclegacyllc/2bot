/**
 * V1 Dispatch Telemetry
 *
 * Wraps the legacy webhook → handle*Webhook → routeEventToPlugins dispatch
 * path so we can:
 *   1. Count residual traffic by event type ("telemetry" mode).
 *   2. Disable the path once telemetry confirms zero traffic ("disabled").
 *   3. Keep current behaviour during rollout ("enabled", default).
 *
 * Controlled via PLUGIN_V1_DISPATCH env var. See .env.example.
 *
 * @module modules/workflow/v1-dispatch-telemetry
 */

import { logger } from "@/lib/logger";
import { v1DispatchTotal } from "@/lib/metrics";

const v1Logger = logger.child({ module: "v1-dispatch-telemetry" });

export type V1DispatchMode = "enabled" | "telemetry" | "disabled";

/**
 * Resolve the active dispatch mode. Read each call so a hot env reload (rare)
 * is honoured without a process restart.
 */
export function getV1DispatchMode(): V1DispatchMode {
  const raw = (process.env.PLUGIN_V1_DISPATCH ?? "enabled").toLowerCase();
  if (raw === "telemetry" || raw === "disabled") return raw;
  return "enabled";
}

/**
 * Returns true if the V1 dispatch path should actually invoke handle*Webhook.
 * (Telemetry mode counts but still dispatches; disabled mode counts and skips.)
 */
export function shouldRunV1Dispatch(): boolean {
  return getV1DispatchMode() !== "disabled";
}

/**
 * Record a V1 dispatch outcome.
 *
 * @param eventType Plugin event type (e.g. "telegram.message").
 * @param pluginsExecuted Plugins that received the event via V1.
 */
export function recordV1Dispatch(eventType: string, pluginsExecuted: number): void {
  const mode = getV1DispatchMode();

  // Always count, even when zero plugins matched — gives us a denominator and
  // confirms the V1 site is actually being entered.
  v1DispatchTotal.inc({ eventType, mode }, pluginsExecuted);

  if (pluginsExecuted > 0 && mode !== "enabled") {
    v1Logger.warn(
      { eventType, pluginsExecuted, mode },
      "V1 dispatch reached plugins not covered by an ACTIVE workflow — run the migration script",
    );
  }
}
