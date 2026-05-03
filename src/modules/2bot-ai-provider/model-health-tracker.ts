/**
 * Model Health Tracker (P2-I)
 *
 * Tracks per-model failure counts and automatically disables models that
 * fail repeatedly within a time window. Models recover automatically
 * after a cooldown period.
 *
 * Also feeds failures to the provider circuit breaker for provider-level
 * health tracking and admin alerts.
 *
 * Used by:
 * - `getAutoFallbackChain()` / `getAvailableModels()` to exclude unhealthy models
 * - `/real-models` endpoint to expose `isHealthy` per model
 * - Failover chains to record success/failure
 *
 * @module modules/2bot-ai-provider/model-health-tracker
 */

import { logger } from "@/lib/logger";
import { recordProviderFailure, recordProviderSuccess } from "./provider-circuit-breaker";
import type { TwoBotAIProvider } from "./types";

const log = logger.child({ module: "model-health-tracker" });

// ===========================================
// Configuration
// ===========================================

/** Number of failures within the window before disabling a model */
const FAILURE_THRESHOLD = 3;

/** Time window for counting failures (5 minutes) */
const FAILURE_WINDOW_MS = 5 * 60 * 1000;

/** How long a disabled model stays disabled before auto-recovery (3 minutes) */
const COOLDOWN_MS = 3 * 60 * 1000;

// ===========================================
// State
// ===========================================

interface ModelHealthRecord {
  /** Timestamps of recent failures (within the window) */
  failures: number[];
  /** When the model was disabled (undefined = not disabled) */
  disabledAt?: number;
  /** Most recent error message */
  lastError?: string;
}

const healthRecords = new Map<string, ModelHealthRecord>();

// ===========================================
// Public API
// ===========================================

/**
 * Record a model failure. If failures exceed the threshold, the model
 * is temporarily disabled. Also feeds the provider circuit breaker.
 *
 * @param modelId - The model that failed
 * @param error - Error message
 * @param provider - Optional provider override. If not given, attempts to look up via model cache.
 */
export function recordModelFailure(modelId: string, error?: string, provider?: TwoBotAIProvider): void {
  const now = Date.now();
  let record = healthRecords.get(modelId);

  if (!record) {
    record = { failures: [] };
    healthRecords.set(modelId, record);
  }

  // Prune old failures outside the window
  record.failures = record.failures.filter((t) => now - t < FAILURE_WINDOW_MS);
  record.failures.push(now);
  record.lastError = error;

  if (record.failures.length >= FAILURE_THRESHOLD && !record.disabledAt) {
    record.disabledAt = now;
    log.warn(
      { modelId, failureCount: record.failures.length, lastError: error },
      `⛔ Model auto-disabled after ${FAILURE_THRESHOLD} failures in ${FAILURE_WINDOW_MS / 60000}min window`
    );
  }

  // Feed provider circuit breaker (if provider is known)
  if (provider && error) {
    recordProviderFailure(provider, modelId, error);
  } else if (error) {
    // Try to resolve provider from model→provider mapping
    // Lazy import to avoid circular dependency
    const resolvedProvider = resolveModelProvider(modelId);
    if (resolvedProvider) {
      recordProviderFailure(resolvedProvider, modelId, error);
    }
  }
}

/**
 * Record a successful model call. Clears failure history for the model.
 * Also notifies the provider circuit breaker.
 */
export function recordModelSuccess(modelId: string, provider?: TwoBotAIProvider): void {
  const record = healthRecords.get(modelId);
  if (record) {
    if (record.disabledAt) {
      log.info({ modelId }, "✅ Model re-enabled after successful call");
    }
    healthRecords.delete(modelId);
  }

  // Notify provider circuit breaker
  const resolvedProvider = provider || resolveModelProvider(modelId);
  if (resolvedProvider) {
    recordProviderSuccess(resolvedProvider);
  }
}

/**
 * Check if a model is currently healthy (not disabled or cooldown expired).
 */
export function isModelHealthy(modelId: string): boolean {
  const record = healthRecords.get(modelId);
  if (!record || !record.disabledAt) return true;

  // Check if cooldown has expired → auto-recover
  if (Date.now() - record.disabledAt >= COOLDOWN_MS) {
    log.info(
      { modelId, disabledMinutesAgo: Math.round((Date.now() - record.disabledAt) / 60000) },
      "🔄 Model cooldown expired, re-enabling"
    );
    healthRecords.delete(modelId);
    return true;
  }

  return false;
}

/**
 * Get health summary for all tracked models (for diagnostics / admin).
 */
export function getModelHealthSummary(): Array<{
  modelId: string;
  healthy: boolean;
  recentFailures: number;
  disabledAt?: Date;
  lastError?: string;
}> {
  const now = Date.now();
  const summary: Array<{
    modelId: string;
    healthy: boolean;
    recentFailures: number;
    disabledAt?: Date;
    lastError?: string;
  }> = [];

  for (const [modelId, record] of healthRecords) {
    const recentFailures = record.failures.filter((t) => now - t < FAILURE_WINDOW_MS).length;
    summary.push({
      modelId,
      healthy: isModelHealthy(modelId),
      recentFailures,
      disabledAt: record.disabledAt ? new Date(record.disabledAt) : undefined,
      lastError: record.lastError,
    });
  }

  return summary;
}

/**
 * Clear all health records (for testing or admin reset).
 */
export function clearModelHealthRecords(): void {
  healthRecords.clear();
  log.info("Model health records cleared");
}

// ===========================================
// Internal Helpers
// ===========================================

/**
 * Cache of model→provider mappings to avoid repeated lookups.
 * Populated lazily as models are recorded.
 */
const modelProviderCache = new Map<string, TwoBotAIProvider>();

/**
 * Resolve a model ID to its provider. Uses a lazy cache + dynamic import
 * of provider-config to avoid circular dependencies.
 */
function resolveModelProvider(modelId: string): TwoBotAIProvider | undefined {
  const cached = modelProviderCache.get(modelId);
  if (cached) return cached;

  try {
    // Dynamic require to break circular import chain
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getModelIfAvailable } = require("./provider-config") as {
      getModelIfAvailable: (id: string) => { provider: TwoBotAIProvider } | undefined;
    };
    const model = getModelIfAvailable(modelId);
    if (model) {
      modelProviderCache.set(modelId, model.provider);
      return model.provider;
    }
  } catch {
    // provider-config not yet initialized — skip
  }
  return undefined;
}
