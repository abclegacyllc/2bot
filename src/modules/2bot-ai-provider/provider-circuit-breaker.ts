/**
 * Provider Circuit Breaker
 *
 * Tracks per-provider failure rates and automatically disables providers
 * that are experiencing systemic issues (e.g., expired credits, revoked keys,
 * model unavailability).
 *
 * Complements the per-model health tracker (model-health-tracker.ts):
 * - Model tracker: disables individual models after 3 failures in 5 min
 * - Circuit breaker: disables entire provider after N model failures in a window
 *
 * Features:
 * - Sticky failure classification: billing/auth failures get longer cooldowns
 * - Provider-level disable: prevents all models on a broken provider from being tried
 * - Admin alert events: emits events when providers go down/recover
 * - Auto-recovery with backoff: transient errors recover in 3 min, billing in 30 min
 *
 * @module modules/2bot-ai-provider/provider-circuit-breaker
 */

import { logger } from "@/lib/logger";
import { EventEmitter } from "events";
import type { TwoBotAIProvider } from "./types";

const log = logger.child({ module: "provider-circuit-breaker" });

// ===========================================
// Configuration
// ===========================================

/** Number of model failures from one provider before tripping the breaker */
const PROVIDER_FAILURE_THRESHOLD = 3;

/** Time window for counting provider failures (5 minutes) */
const PROVIDER_FAILURE_WINDOW_MS = 5 * 60 * 1000;

/** Cooldown for transient errors (model unavailable, timeout, 500) — 3 minutes */
const TRANSIENT_COOLDOWN_MS = 3 * 60 * 1000;

/** Cooldown for billing/credit errors (insufficient credits, payment required) — 30 minutes */
const BILLING_COOLDOWN_MS = 30 * 60 * 1000;

/** Cooldown for auth errors (invalid API key, revoked) — 60 minutes */
const AUTH_COOLDOWN_MS = 60 * 60 * 1000;

// ===========================================
// Failure Classification
// ===========================================

export type FailureCategory = "transient" | "billing" | "auth" | "model_unavailable";

/** Classify an error message into a failure category for cooldown decisions */
export function classifyFailure(errorMessage: string): FailureCategory {
  const lower = errorMessage.toLowerCase();

  // Billing / credit issues — long cooldown
  if (
    lower.includes("insufficient") ||
    lower.includes("credit") ||
    lower.includes("payment required") ||
    lower.includes("402") ||
    lower.includes("billing") ||
    lower.includes("quota exceeded") ||
    lower.includes("rate limit") ||
    lower.includes("free tier")
  ) {
    return "billing";
  }

  // Auth issues — longest cooldown
  if (
    lower.includes("authentication") ||
    lower.includes("unauthorized") ||
    lower.includes("invalid api key") ||
    lower.includes("401") ||
    lower.includes("api key is invalid") ||
    lower.includes("forbidden") ||
    lower.includes("403")
  ) {
    return "auth";
  }

  // Model unavailable — medium cooldown
  if (
    lower.includes("unavailable") ||
    lower.includes("not found") ||
    lower.includes("does not exist") ||
    lower.includes("not supported") ||
    lower.includes("404")
  ) {
    return "model_unavailable";
  }

  return "transient";
}

/** Get cooldown duration for a failure category */
function getCooldownForCategory(category: FailureCategory): number {
  switch (category) {
    case "auth":
      return AUTH_COOLDOWN_MS;
    case "billing":
      return BILLING_COOLDOWN_MS;
    case "model_unavailable":
    case "transient":
    default:
      return TRANSIENT_COOLDOWN_MS;
  }
}

// ===========================================
// State
// ===========================================

interface ProviderFailureRecord {
  /** Timestamps of recent model failures from this provider */
  failures: Array<{ timestamp: number; modelId: string; error: string; category: FailureCategory }>;
  /** When the provider was disabled (undefined = not disabled) */
  disabledAt?: number;
  /** How long to keep disabled (depends on failure category) */
  cooldownMs?: number;
  /** The worst failure category seen in the current window */
  worstCategory?: FailureCategory;
  /** Most recent error message */
  lastError?: string;
  /** Last model that failed */
  lastFailedModel?: string;
}

const providerRecords = new Map<TwoBotAIProvider, ProviderFailureRecord>();

// ===========================================
// Event Emitter for Admin Alerts
// ===========================================

export interface ProviderAlertEvent {
  type: "provider_down" | "provider_recovered";
  provider: TwoBotAIProvider;
  category?: FailureCategory;
  error?: string;
  failureCount?: number;
  cooldownMinutes?: number;
  timestamp: Date;
}

class ProviderAlertEmitter extends EventEmitter {
  emitAlert(event: ProviderAlertEvent): void {
    this.emit("alert", event);

    // Always log with special prefix for log monitoring tools
    if (event.type === "provider_down") {
      log.error(
        {
          provider: event.provider,
          category: event.category,
          error: event.error,
          failureCount: event.failureCount,
          cooldownMinutes: event.cooldownMinutes,
        },
        `[ADMIN_ALERT] ⛔ Provider DOWN: ${event.provider} (${event.category}) — cooldown ${event.cooldownMinutes}min`
      );
    } else {
      log.info(
        { provider: event.provider },
        `[ADMIN_ALERT] ✅ Provider RECOVERED: ${event.provider}`
      );
    }
  }
}

export const providerAlerts = new ProviderAlertEmitter();

// ===========================================
// Public API
// ===========================================

/**
 * Record a model failure and attribute it to the model's provider.
 * If enough models from the same provider fail, trip the circuit breaker.
 *
 * @param provider - The AI provider (openai, anthropic, together, etc.)
 * @param modelId - The specific model that failed
 * @param errorMessage - Error message from the failure
 */
export function recordProviderFailure(
  provider: TwoBotAIProvider,
  modelId: string,
  errorMessage: string
): void {
  const now = Date.now();
  const category = classifyFailure(errorMessage);
  let record = providerRecords.get(provider);

  if (!record) {
    record = { failures: [] };
    providerRecords.set(provider, record);
  }

  // Prune old failures outside the window
  record.failures = record.failures.filter(
    (f) => now - f.timestamp < PROVIDER_FAILURE_WINDOW_MS
  );

  record.failures.push({ timestamp: now, modelId, error: errorMessage, category });
  record.lastError = errorMessage;
  record.lastFailedModel = modelId;

  // Track worst category in window (auth > billing > model_unavailable > transient)
  const categoryPriority: Record<FailureCategory, number> = {
    auth: 3,
    billing: 2,
    model_unavailable: 1,
    transient: 0,
  };
  const currentWorst = record.worstCategory
    ? categoryPriority[record.worstCategory]
    : -1;
  if (categoryPriority[category] > currentWorst) {
    record.worstCategory = category;
  }

  // Check if we should trip the circuit breaker
  const uniqueModels = new Set(record.failures.map((f) => f.modelId));

  // For auth/billing errors, trip immediately on first failure (systemic issue)
  const shouldTrip =
    (category === "auth" || category === "billing") ||
    uniqueModels.size >= PROVIDER_FAILURE_THRESHOLD;

  if (shouldTrip && !record.disabledAt) {
    const cooldownMs = getCooldownForCategory(record.worstCategory || category);
    record.disabledAt = now;
    record.cooldownMs = cooldownMs;

    const cooldownMinutes = Math.round(cooldownMs / 60000);

    log.warn(
      {
        provider,
        failureCount: record.failures.length,
        uniqueModels: uniqueModels.size,
        worstCategory: record.worstCategory,
        cooldownMinutes,
        lastError: errorMessage,
      },
      `⛔ Provider circuit breaker TRIPPED: ${provider}`
    );

    providerAlerts.emitAlert({
      type: "provider_down",
      provider,
      category: record.worstCategory || category,
      error: errorMessage,
      failureCount: record.failures.length,
      cooldownMinutes,
      timestamp: new Date(),
    });
  }
}

/**
 * Record a successful call to a provider's model.
 * If the provider was disabled, mark it as recovered.
 */
export function recordProviderSuccess(provider: TwoBotAIProvider): void {
  const record = providerRecords.get(provider);
  if (!record) return;

  if (record.disabledAt) {
    log.info({ provider }, "✅ Provider circuit breaker RESET after successful call");

    providerAlerts.emitAlert({
      type: "provider_recovered",
      provider,
      timestamp: new Date(),
    });
  }

  providerRecords.delete(provider);
}

/**
 * Check if a provider is currently healthy (not circuit-broken).
 * Returns true if healthy, false if the breaker is tripped and cooldown hasn't expired.
 */
export function isProviderCircuitHealthy(provider: TwoBotAIProvider): boolean {
  const record = providerRecords.get(provider);
  if (!record || !record.disabledAt) return true;

  const cooldownMs = record.cooldownMs || TRANSIENT_COOLDOWN_MS;

  // Check if cooldown has expired → auto-recover
  if (Date.now() - record.disabledAt >= cooldownMs) {
    const cooldownMinutes = Math.round(cooldownMs / 60000);
    log.info(
      { provider, cooldownMinutes },
      `🔄 Provider circuit breaker cooldown expired, re-enabling: ${provider}`
    );

    providerAlerts.emitAlert({
      type: "provider_recovered",
      provider,
      timestamp: new Date(),
    });

    providerRecords.delete(provider);
    return true;
  }

  return false;
}

/**
 * Get circuit breaker status for all providers (for admin dashboard).
 */
export function getProviderCircuitStatus(): Array<{
  provider: TwoBotAIProvider;
  healthy: boolean;
  recentFailures: number;
  uniqueFailedModels: number;
  disabledAt?: Date;
  cooldownExpiresAt?: Date;
  worstCategory?: FailureCategory;
  lastError?: string;
  lastFailedModel?: string;
}> {
  const ALL_PROVIDERS: TwoBotAIProvider[] = [
    "openai", "anthropic", "together", "fireworks", "openrouter", "google",
  ];

  return ALL_PROVIDERS.map((provider) => {
    const record = providerRecords.get(provider);
    const now = Date.now();

    if (!record) {
      return {
        provider,
        healthy: true,
        recentFailures: 0,
        uniqueFailedModels: 0,
      };
    }

    const recentFailures = record.failures.filter(
      (f) => now - f.timestamp < PROVIDER_FAILURE_WINDOW_MS
    );
    const uniqueModels = new Set(recentFailures.map((f) => f.modelId));
    const cooldownMs = record.cooldownMs || TRANSIENT_COOLDOWN_MS;

    return {
      provider,
      healthy: isProviderCircuitHealthy(provider),
      recentFailures: recentFailures.length,
      uniqueFailedModels: uniqueModels.size,
      disabledAt: record.disabledAt ? new Date(record.disabledAt) : undefined,
      cooldownExpiresAt: record.disabledAt
        ? new Date(record.disabledAt + cooldownMs)
        : undefined,
      worstCategory: record.worstCategory,
      lastError: record.lastError,
      lastFailedModel: record.lastFailedModel,
    };
  });
}

/**
 * Force-reset a provider's circuit breaker (admin action).
 */
export function resetProviderCircuit(provider: TwoBotAIProvider): void {
  providerRecords.delete(provider);
  log.info({ provider }, "Provider circuit breaker manually reset by admin");
}

/**
 * Clear all circuit breaker state (for testing).
 */
export function clearAllCircuitBreakers(): void {
  providerRecords.clear();
  log.info("All provider circuit breakers cleared");
}
