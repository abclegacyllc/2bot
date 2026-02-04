/**
 * Provider Health Check Service
 *
 * Validates API keys by making REAL API calls to providers.
 * Also triggers model discovery to dynamically detect available models.
 * Caches validation results to avoid repeated checks.
 *
 * Cache TTL Strategy:
 * - Production: 30 minutes (reduce costs from repeated validation calls)
 * - Development: 5 minutes (faster feedback during development)
 *
 * @module modules/2bot-ai-provider/provider-health.service
 */

import { logger } from "@/lib/logger";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { discoverAllModels } from "./model-discovery.service";
import { setProviderValidated } from "./provider-config";
import type { TwoBotAIProvider } from "./types";

const log = logger.child({ module: "provider-health" });

// ===========================================
// Health Check Cache
// ===========================================

interface ProviderHealthStatus {
  provider: TwoBotAIProvider;
  healthy: boolean;
  lastChecked: Date;
  error?: string;
  latencyMs?: number;
}

// Cache health status with environment-aware TTL
// Production: 30 minutes (Anthropic validation costs money!)
// Development: 5 minutes (faster iteration)
const isProduction = process.env.NODE_ENV === "production";
const CACHE_TTL_MS = isProduction ? 30 * 60 * 1000 : 5 * 60 * 1000;
const healthCache = new Map<TwoBotAIProvider, ProviderHealthStatus>();

log.info({ cacheTtlMinutes: CACHE_TTL_MS / 60000, isProduction }, "Provider health cache TTL configured");

// ===========================================
// Real API Key Validation
// ===========================================

/**
 * Validate OpenAI API key by making a real API call
 */
async function validateOpenAIKey(): Promise<{ valid: boolean; error?: string; latencyMs: number }> {
  const apiKey = process.env.TWOBOT_OPENAI_API_KEY;

  // Basic format check first
  if (!apiKey) {
    return { valid: false, error: "TWOBOT_OPENAI_API_KEY not set", latencyMs: 0 };
  }

  if (!apiKey.startsWith("sk-") || apiKey.length < 20) {
    return { valid: false, error: "Invalid OpenAI API key format", latencyMs: 0 };
  }

  // Make real API call to validate
  const startTime = Date.now();
  try {
    const client = new OpenAI({ apiKey, timeout: 10000 });

    // Use models.list() as a lightweight validation call
    // This confirms the key is valid without consuming tokens
    await client.models.list();

    const latencyMs = Date.now() - startTime;
    log.info({ latencyMs }, "OpenAI API key validated successfully");

    return { valid: true, latencyMs };
  } catch (error) {
    const latencyMs = Date.now() - startTime;

    if (error instanceof OpenAI.AuthenticationError) {
      log.error({ error: error.message }, "OpenAI API key is invalid");
      return { valid: false, error: "Invalid API key - authentication failed", latencyMs };
    }

    if (error instanceof OpenAI.RateLimitError) {
      // Rate limited but key is valid
      log.warn("OpenAI rate limited, but key is valid");
      return { valid: true, latencyMs };
    }

    if (error instanceof OpenAI.APIConnectionError) {
      log.error({ error: error.message }, "Cannot connect to OpenAI API");
      return { valid: false, error: "Cannot connect to OpenAI API", latencyMs };
    }

    log.error({ error }, "OpenAI validation failed with unknown error");
    return { valid: false, error: `Validation failed: ${error}`, latencyMs };
  }
}

/**
 * Validate Anthropic API key by making a real API call
 */
async function validateAnthropicKey(): Promise<{ valid: boolean; error?: string; latencyMs: number }> {
  const apiKey = process.env.TWOBOT_ANTHROPIC_API_KEY;

  // Basic format check first
  if (!apiKey) {
    return { valid: false, error: "TWOBOT_ANTHROPIC_API_KEY not set", latencyMs: 0 };
  }

  if (!apiKey.startsWith("sk-ant-") || apiKey.length < 20) {
    return { valid: false, error: "Invalid Anthropic API key format", latencyMs: 0 };
  }

  // Make real API call to validate
  const startTime = Date.now();
  try {
    const client = new Anthropic({ apiKey, timeout: 10000 });

    // Use a minimal message to validate the key
    // Unfortunately Anthropic doesn't have a models.list endpoint
    // So we use a minimal completion request with max_tokens=1
    await client.messages.create({
      model: "claude-3-haiku-20240307", // Cheapest model for validation
      max_tokens: 1,
      messages: [{ role: "user", content: "Hi" }],
    });

    const latencyMs = Date.now() - startTime;
    log.info({ latencyMs }, "Anthropic API key validated successfully");

    return { valid: true, latencyMs };
  } catch (error) {
    const latencyMs = Date.now() - startTime;

    if (error instanceof Anthropic.AuthenticationError) {
      log.error({ error: error.message }, "Anthropic API key is invalid");
      return { valid: false, error: "Invalid API key - authentication failed", latencyMs };
    }

    if (error instanceof Anthropic.RateLimitError) {
      // Rate limited but key is valid
      log.warn("Anthropic rate limited, but key is valid");
      return { valid: true, latencyMs };
    }

    if (error instanceof Anthropic.APIConnectionError) {
      log.error({ error: error.message }, "Cannot connect to Anthropic API");
      return { valid: false, error: "Cannot connect to Anthropic API", latencyMs };
    }

    // Check for model not available error (key is valid, model might be deprecated)
    if (error instanceof Anthropic.BadRequestError) {
      log.warn("Anthropic validation model issue, assuming key is valid");
      return { valid: true, latencyMs };
    }

    log.error({ error }, "Anthropic validation failed with unknown error");
    return { valid: false, error: `Validation failed: ${error}`, latencyMs };
  }
}

// ===========================================
// Public Health Check API
// ===========================================

/**
 * Check if a provider is healthy (with caching)
 */
export async function isProviderHealthy(provider: TwoBotAIProvider): Promise<boolean> {
  const cached = healthCache.get(provider);

  // Return cached result if still valid
  if (cached && Date.now() - cached.lastChecked.getTime() < CACHE_TTL_MS) {
    return cached.healthy;
  }

  // Run health check
  const status = await checkProviderHealth(provider);
  healthCache.set(provider, status);

  // Update the provider-config validation cache
  setProviderValidated(provider, status.healthy);

  return status.healthy;
}

/**
 * Run health check for a specific provider
 */
export async function checkProviderHealth(provider: TwoBotAIProvider): Promise<ProviderHealthStatus> {
  log.info({ provider }, "Running provider health check...");

  let result: { valid: boolean; error?: string; latencyMs: number };

  switch (provider) {
    case "openai":
      result = await validateOpenAIKey();
      break;
    case "anthropic":
      result = await validateAnthropicKey();
      break;
    default:
      result = { valid: false, error: `Unknown provider: ${provider}`, latencyMs: 0 };
  }

  const status: ProviderHealthStatus = {
    provider,
    healthy: result.valid,
    lastChecked: new Date(),
    error: result.error,
    latencyMs: result.latencyMs,
  };

  if (result.valid) {
    log.info({ provider, latencyMs: result.latencyMs }, "Provider is healthy");
  } else {
    log.error({ provider, error: result.error }, "Provider health check FAILED");
  }

  return status;
}

/**
 * Check all providers and return their health status
 */
export async function checkAllProviders(): Promise<ProviderHealthStatus[]> {
  const providers: TwoBotAIProvider[] = ["openai", "anthropic"];
  const results: ProviderHealthStatus[] = [];

  for (const provider of providers) {
    const status = await checkProviderHealth(provider);
    healthCache.set(provider, status);

    // Update the provider-config validation cache
    setProviderValidated(provider, status.healthy);

    results.push(status);
  }

  return results;
}

/**
 * Get cached health status (without making API calls)
 */
export function getCachedHealthStatus(): Map<TwoBotAIProvider, ProviderHealthStatus> {
  return new Map(healthCache);
}

/**
 * Clear health cache (force re-check on next call)
 */
export function clearHealthCache(): void {
  healthCache.clear();
  log.info("Health cache cleared");
}

/**
 * Initialize health checks and model discovery on startup
 * Should be called once when server starts
 */
export async function initializeProviderHealth(): Promise<void> {
  log.info("Initializing provider health checks and model discovery...");

  // Step 1: Check provider health (validates API keys)
  const results = await checkAllProviders();

  const healthyProviders = results.filter((r) => r.healthy).map((r) => r.provider);
  const unhealthyProviders = results.filter((r) => !r.healthy);

  if (healthyProviders.length === 0) {
    log.error(
      { unhealthyProviders: unhealthyProviders.map((p) => ({ provider: p.provider, error: p.error })) },
      "⚠️  NO AI PROVIDERS ARE HEALTHY! 2Bot AI will not work!"
    );
    return;
  }

  log.info(
    { healthyProviders },
    `✅ Provider health check complete: ${healthyProviders.length} provider(s) healthy`
  );

  for (const unhealthy of unhealthyProviders) {
    log.warn({ provider: unhealthy.provider, error: unhealthy.error }, "Provider not available");
  }

  // Step 2: Discover available models from healthy providers
  log.info("Discovering available models from providers...");
  try {
    const models = await discoverAllModels(true);
    log.info(
      { totalModels: models.length },
      `✅ Model discovery complete: ${models.length} models available`
    );
  } catch (error) {
    log.error({ error }, "Model discovery failed");
  }
}
