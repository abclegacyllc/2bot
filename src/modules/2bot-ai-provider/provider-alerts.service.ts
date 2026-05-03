/**
 * Provider Alerts Service
 *
 * Persists AI provider health alerts for admin visibility.
 * Uses an in-memory ring buffer for fast access and DB for persistence.
 *
 * Listens to events from provider-circuit-breaker.ts and stores them
 * so the admin dashboard can display current + historical provider health.
 *
 * @module modules/2bot-ai-provider/provider-alerts.service
 */

import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import type { FailureCategory, ProviderAlertEvent } from "./provider-circuit-breaker";
import { providerAlerts } from "./provider-circuit-breaker";
import type { TwoBotAIProvider } from "./types";

const log = logger.child({ module: "provider-alerts" });

// ===========================================
// In-Memory Alert Buffer
// ===========================================

export interface StoredAlert {
  id: number;
  type: "provider_down" | "provider_recovered";
  provider: TwoBotAIProvider;
  category?: FailureCategory;
  error?: string;
  failureCount?: number;
  cooldownMinutes?: number;
  timestamp: Date;
  /** Whether admin has acknowledged this alert */
  acknowledged: boolean;
}

const MAX_ALERTS = 200;
let alertBuffer: StoredAlert[] = [];
let nextAlertId = 1;

function addAlert(event: ProviderAlertEvent): StoredAlert {
  const alert: StoredAlert = {
    id: nextAlertId++,
    type: event.type,
    provider: event.provider,
    category: event.category,
    error: event.error,
    failureCount: event.failureCount,
    cooldownMinutes: event.cooldownMinutes,
    timestamp: event.timestamp,
    acknowledged: false,
  };

  alertBuffer.push(alert);
  if (alertBuffer.length > MAX_ALERTS) {
    alertBuffer = alertBuffer.slice(-MAX_ALERTS);
  }

  return alert;
}

// ===========================================
// DB Persistence
// ===========================================

async function persistAlert(alert: StoredAlert): Promise<void> {
  try {
    await prisma.providerAlert.create({
      data: {
        type: alert.type,
        provider: alert.provider,
        category: alert.category ?? null,
        error: alert.error ?? null,
        failureCount: alert.failureCount ?? null,
        cooldownMinutes: alert.cooldownMinutes ?? null,
        timestamp: alert.timestamp,
        acknowledged: false,
      },
    });
  } catch (err) {
    // DB write failure is non-critical — in-memory buffer still has it
    log.warn(
      { error: (err as Error).message },
      "Failed to persist provider alert to DB (table may not exist yet)"
    );
  }
}

// ===========================================
// Event Listener — Wire up on import
// ===========================================

providerAlerts.on("alert", (event: ProviderAlertEvent) => {
  const alert = addAlert(event);

  // Persist to DB (fire-and-forget, non-blocking)
  persistAlert(alert).catch(() => {
    // Already logged inside persistAlert
  });
});

log.info("Provider alerts listener initialized");

// ===========================================
// Public Query API
// ===========================================

/**
 * Get recent alerts from in-memory buffer.
 */
export function getRecentAlerts(opts?: {
  provider?: TwoBotAIProvider;
  type?: "provider_down" | "provider_recovered";
  limit?: number;
  unacknowledgedOnly?: boolean;
}): StoredAlert[] {
  let results = [...alertBuffer];

  if (opts?.provider) {
    results = results.filter((a) => a.provider === opts.provider);
  }
  if (opts?.type) {
    results = results.filter((a) => a.type === opts.type);
  }
  if (opts?.unacknowledgedOnly) {
    results = results.filter((a) => !a.acknowledged);
  }

  // Return most recent first
  results.reverse();

  const limit = opts?.limit || 50;
  return results.slice(0, limit);
}

/**
 * Get the count of unacknowledged "provider_down" alerts.
 */
export function getUnacknowledgedAlertCount(): number {
  return alertBuffer.filter((a) => a.type === "provider_down" && !a.acknowledged).length;
}

/**
 * Acknowledge an alert (admin marks it as seen).
 */
export function acknowledgeAlert(alertId: number): boolean {
  const alert = alertBuffer.find((a) => a.id === alertId);
  if (!alert) return false;
  alert.acknowledged = true;

  // Also update DB (fire-and-forget)
  prisma.providerAlert
    .updateMany({
      where: {
        provider: alert.provider,
        timestamp: alert.timestamp,
        type: alert.type,
      },
      data: { acknowledged: true },
    })
    .catch(() => {});

  return true;
}

/**
 * Acknowledge all alerts for a provider.
 */
export function acknowledgeProviderAlerts(provider: TwoBotAIProvider): number {
  let count = 0;
  for (const alert of alertBuffer) {
    if (alert.provider === provider && !alert.acknowledged) {
      alert.acknowledged = true;
      count++;
    }
  }

  // Also update DB (fire-and-forget)
  prisma.providerAlert
    .updateMany({
      where: { provider, acknowledged: false },
      data: { acknowledged: true },
    })
    .catch(() => {});

  return count;
}

/**
 * Get alerts from DB (for historical data beyond in-memory buffer).
 */
export async function getHistoricalAlerts(opts?: {
  provider?: TwoBotAIProvider;
  since?: Date;
  limit?: number;
}): Promise<StoredAlert[]> {
  try {
    const where: Record<string, unknown> = {};
    if (opts?.provider) where.provider = opts.provider;
    if (opts?.since) where.timestamp = { gte: opts.since };

    const rows = await prisma.providerAlert.findMany({
      where,
      orderBy: { timestamp: "desc" },
      take: opts?.limit || 100,
    });

    return rows.map((r) => ({
      id: r.id,
      type: r.type as StoredAlert["type"],
      provider: r.provider as TwoBotAIProvider,
      category: (r.category as FailureCategory) || undefined,
      error: r.error || undefined,
      failureCount: r.failureCount || undefined,
      cooldownMinutes: r.cooldownMinutes || undefined,
      timestamp: r.timestamp,
      acknowledged: r.acknowledged,
    }));
  } catch {
    // Table may not exist yet — return in-memory data
    return getRecentAlerts(opts);
  }
}

/**
 * Get a summary of current provider health status for admin dashboard.
 * Combines circuit breaker state with recent alerts.
 */
export function getAlertSummary(): {
  totalAlerts: number;
  unacknowledged: number;
  providersDown: TwoBotAIProvider[];
  lastAlert?: StoredAlert;
} {
  const unacknowledged = alertBuffer.filter(
    (a) => a.type === "provider_down" && !a.acknowledged
  ).length;

  // Find currently-down providers (last event for each provider is "provider_down")
  const providerLastEvent = new Map<TwoBotAIProvider, StoredAlert>();
  for (const alert of alertBuffer) {
    providerLastEvent.set(alert.provider, alert);
  }
  const providersDown: TwoBotAIProvider[] = [];
  for (const [provider, lastAlert] of providerLastEvent) {
    if (lastAlert.type === "provider_down") {
      providersDown.push(provider);
    }
  }

  return {
    totalAlerts: alertBuffer.length,
    unacknowledged,
    providersDown,
    lastAlert: alertBuffer.length > 0 ? alertBuffer[alertBuffer.length - 1] : undefined,
  };
}
