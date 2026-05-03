/**
 * Model Probe Service
 *
 * Proactively tests individual AI models to detect unavailability BEFORE
 * users hit errors. Unlike the health tracker (reactive), this actively
 * sends lightweight test requests to verify models work.
 *
 * Strategies per provider:
 * - Together AI: GET /v1/models → check if our model IDs exist in their catalog
 * - OpenRouter: GET /api/v1/models → check if our model IDs exist
 * - OpenAI/Anthropic/Fireworks/Google: Minimal completion probe (1 token)
 *
 * This is ONLY triggered on admin action (expensive), not on a schedule.
 *
 * @module modules/2bot-ai-provider/model-probe.service
 */

import { logger } from "@/lib/logger";
import OpenAI from "openai";
import { getRegistryEntriesByProvider, MODEL_REGISTRY } from "./model-registry";
import type { TwoBotAIProvider } from "./types";

const log = logger.child({ module: "model-probe" });

// ===========================================
// Types
// ===========================================

export interface ModelProbeResult {
  /** Our canonical model ID (e.g. "qwen-2.5-coder-32b") */
  modelId: string;
  /** Provider-specific model ID (e.g. "Qwen/Qwen2.5-Coder-32B-Instruct") */
  providerModelId: string;
  /** Provider name */
  provider: TwoBotAIProvider;
  /** Whether the model is available */
  available: boolean;
  /** Error message if unavailable */
  error?: string;
  /** Probe latency in ms */
  latencyMs: number;
  /** How the model was probed */
  method: "catalog-check" | "completion-probe" | "skipped";
}

export interface ProbeReport {
  provider: TwoBotAIProvider;
  totalModels: number;
  availableModels: number;
  unavailableModels: number;
  results: ModelProbeResult[];
  durationMs: number;
  timestamp: string;
}

// ===========================================
// Together AI: Catalog Check
// ===========================================

async function probeTogetherModels(): Promise<ModelProbeResult[]> {
  const apiKey = process.env.TWOBOT_TOGETHER_API_KEY;
  if (!apiKey) return [];

  const entries = getRegistryEntriesByProvider("together");
  if (entries.length === 0) return [];

  const startTime = Date.now();
  let catalogModelIds: Set<string>;

  try {
    const response = await fetch("https://api.together.xyz/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      return entries.map((e) => ({
        modelId: e.id,
        providerModelId: e.providers.together!.modelId,
        provider: "together" as const,
        available: false,
        error: `Catalog fetch failed: HTTP ${response.status}`,
        latencyMs: Date.now() - startTime,
        method: "catalog-check" as const,
      }));
    }

    const body = (await response.json()) as Array<{ id?: string }>;
    catalogModelIds = new Set(body.map((m) => m.id).filter((id): id is string => !!id));
    log.info({ totalCatalogModels: catalogModelIds.size }, "Together AI catalog fetched");
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return entries.map((e) => ({
      modelId: e.id,
      providerModelId: e.providers.together!.modelId,
      provider: "together" as const,
      available: false,
      error: `Catalog fetch error: ${msg}`,
      latencyMs: Date.now() - startTime,
      method: "catalog-check" as const,
    }));
  }

  const fetchLatency = Date.now() - startTime;

  return entries.map((entry) => {
    const providerModelId = entry.providers.together!.modelId;
    const available = catalogModelIds.has(providerModelId);
    return {
      modelId: entry.id,
      providerModelId,
      provider: "together" as const,
      available,
      error: available ? undefined : `Model "${providerModelId}" not found in Together AI catalog`,
      latencyMs: fetchLatency,
      method: "catalog-check" as const,
    };
  });
}

// ===========================================
// OpenRouter: Catalog Check
// ===========================================

async function probeOpenRouterModels(): Promise<ModelProbeResult[]> {
  const apiKey = process.env.TWOBOT_OPENROUTER_API_KEY;
  if (!apiKey) return [];

  const entries = getRegistryEntriesByProvider("openrouter");
  if (entries.length === 0) return [];

  const startTime = Date.now();
  let catalogModelIds: Set<string>;

  try {
    const response = await fetch("https://openrouter.ai/api/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      return entries.map((e) => ({
        modelId: e.id,
        providerModelId: e.providers.openrouter!.modelId,
        provider: "openrouter" as const,
        available: false,
        error: `Catalog fetch failed: HTTP ${response.status}`,
        latencyMs: Date.now() - startTime,
        method: "catalog-check" as const,
      }));
    }

    const body = (await response.json()) as { data?: Array<{ id?: string }> };
    const models = body.data ?? [];
    catalogModelIds = new Set(models.map((m) => m.id).filter((id): id is string => !!id));
    log.info({ totalCatalogModels: catalogModelIds.size }, "OpenRouter catalog fetched");
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return entries.map((e) => ({
      modelId: e.id,
      providerModelId: e.providers.openrouter!.modelId,
      provider: "openrouter" as const,
      available: false,
      error: `Catalog fetch error: ${msg}`,
      latencyMs: Date.now() - startTime,
      method: "catalog-check" as const,
    }));
  }

  const fetchLatency = Date.now() - startTime;

  return entries.map((entry) => {
    const providerModelId = entry.providers.openrouter!.modelId;
    const available = catalogModelIds.has(providerModelId);
    return {
      modelId: entry.id,
      providerModelId,
      provider: "openrouter" as const,
      available,
      error: available ? undefined : `Model "${providerModelId}" not found in OpenRouter catalog`,
      latencyMs: fetchLatency,
      method: "catalog-check" as const,
    };
  });
}

// ===========================================
// OpenAI: Catalog Check (models.list)
// ===========================================

async function probeOpenAIModels(): Promise<ModelProbeResult[]> {
  const apiKey = process.env.TWOBOT_OPENAI_API_KEY;
  if (!apiKey) return [];

  const entries = getRegistryEntriesByProvider("openai");
  if (entries.length === 0) return [];

  const startTime = Date.now();
  let catalogModelIds: Set<string>;

  try {
    const client = new OpenAI({ apiKey, timeout: 15000 });
    const models = await client.models.list();
    catalogModelIds = new Set<string>();
    for await (const m of models) {
      catalogModelIds.add(m.id);
    }
    log.info({ totalCatalogModels: catalogModelIds.size }, "OpenAI catalog fetched");
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return entries.map((e) => ({
      modelId: e.id,
      providerModelId: e.providers.openai!.modelId,
      provider: "openai" as const,
      available: false,
      error: `Catalog fetch error: ${msg}`,
      latencyMs: Date.now() - startTime,
      method: "catalog-check" as const,
    }));
  }

  const fetchLatency = Date.now() - startTime;

  return entries.map((entry) => {
    const providerModelId = entry.providers.openai!.modelId;
    const available = catalogModelIds.has(providerModelId);
    return {
      modelId: entry.id,
      providerModelId,
      provider: "openai" as const,
      available,
      error: available ? undefined : `Model "${providerModelId}" not found in OpenAI catalog`,
      latencyMs: fetchLatency,
      method: "catalog-check" as const,
    };
  });
}

// ===========================================
// Fireworks: Catalog Check (models.list via OpenAI SDK)
// ===========================================

async function probeFireworksModels(): Promise<ModelProbeResult[]> {
  const apiKey = process.env.TWOBOT_FIREWORKS_API_KEY;
  if (!apiKey) return [];

  const entries = getRegistryEntriesByProvider("fireworks");
  if (entries.length === 0) return [];

  const startTime = Date.now();
  let catalogModelIds: Set<string>;

  try {
    const client = new OpenAI({
      apiKey,
      baseURL: "https://api.fireworks.ai/inference/v1",
      timeout: 15000,
    });
    const models = await client.models.list();
    catalogModelIds = new Set<string>();
    for await (const m of models) {
      catalogModelIds.add(m.id);
    }
    log.info({ totalCatalogModels: catalogModelIds.size }, "Fireworks catalog fetched");
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return entries.map((e) => ({
      modelId: e.id,
      providerModelId: e.providers.fireworks!.modelId,
      provider: "fireworks" as const,
      available: false,
      error: `Catalog fetch error: ${msg}`,
      latencyMs: Date.now() - startTime,
      method: "catalog-check" as const,
    }));
  }

  const fetchLatency = Date.now() - startTime;

  return entries.map((entry) => {
    const providerModelId = entry.providers.fireworks!.modelId;
    const available = catalogModelIds.has(providerModelId);
    return {
      modelId: entry.id,
      providerModelId,
      provider: "fireworks" as const,
      available,
      error: available ? undefined : `Model "${providerModelId}" not found in Fireworks catalog`,
      latencyMs: fetchLatency,
      method: "catalog-check" as const,
    };
  });
}

// ===========================================
// Google Vertex AI: Catalog Check via models.list REST API
// ===========================================

async function probeGoogleModels(): Promise<ModelProbeResult[]> {
  const serviceAccountJson = process.env.TWOBOT_VERTEX_AI_SERVICE_ACCOUNT;
  const project = process.env.TWOBOT_VERTEX_AI_PROJECT;
  const region = process.env.TWOBOT_VERTEX_AI_REGION || "us-central1";

  if (!serviceAccountJson || !project) {
    const entries = getRegistryEntriesByProvider("google");
    return entries.map((e) => ({
      modelId: e.id,
      providerModelId: e.providers.google!.modelId,
      provider: "google" as const,
      available: false,
      error: "Vertex AI credentials not configured",
      latencyMs: 0,
      method: "catalog-check" as const,
    }));
  }

  const entries = getRegistryEntriesByProvider("google");
  if (entries.length === 0) return [];

  const startTime = Date.now();

  try {
    // Get access token using service account JWT exchange
    const sa = JSON.parse(serviceAccountJson) as {
      client_email: string;
      private_key: string;
      token_uri?: string;
    };

    const now = Math.floor(Date.now() / 1000);
    const { createSign } = await import("crypto");
    const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/cloud-platform",
      aud: sa.token_uri || "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    })).toString("base64url");

    const sign = createSign("RSA-SHA256");
    sign.update(`${header}.${payload}`);
    const signature = sign.sign(sa.private_key, "base64url");
    const jwt = `${header}.${payload}.${signature}`;

    const tokenResponse = await fetch(sa.token_uri || "https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!tokenResponse.ok) {
      throw new Error(`Token exchange failed: ${tokenResponse.status}`);
    }

    const tokenData = (await tokenResponse.json()) as { access_token: string };
    const accessToken = tokenData.access_token;

    // Fetch the Vertex AI model list — paginate to get all
    const catalogModelIds = new Set<string>();
    let pageToken: string | undefined;

    do {
      const url = new URL(`https://${region}-aiplatform.googleapis.com/v1/projects/${project}/locations/${region}/models`);
      url.searchParams.set("pageSize", "100");
      if (pageToken) url.searchParams.set("pageToken", pageToken);

      const listRes = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(15_000),
      });

      if (!listRes.ok) {
        // Try the publishers endpoint instead (for foundation models)
        break;
      }

      const listData = (await listRes.json()) as {
        models?: Array<{ name: string; displayName?: string }>;
        nextPageToken?: string;
      };

      for (const m of listData.models ?? []) {
        // Extract the model ID from the full resource name
        const modelId = m.name.split("/").at(-1);
        if (modelId) catalogModelIds.add(modelId);
        if (m.displayName) catalogModelIds.add(m.displayName);
      }

      pageToken = listData.nextPageToken;
    } while (pageToken);

    // Also check the publishers/google/models endpoint for foundation models
    const publisherUrl = `https://${region}-aiplatform.googleapis.com/v1/publishers/google/models`;
    try {
      const pubRes = await fetch(publisherUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(15_000),
      });
      if (pubRes.ok) {
        const pubData = (await pubRes.json()) as {
          publisherModels?: Array<{ name: string; versionId?: string }>;
        };
        for (const m of pubData.publisherModels ?? []) {
          const modelId = m.name.split("/").at(-1);
          if (modelId) catalogModelIds.add(modelId);
        }
      }
    } catch {
      // Publisher endpoint may not be available in all regions
    }

    const fetchLatency = Date.now() - startTime;
    log.info({ totalCatalogModels: catalogModelIds.size }, "Google Vertex AI catalog fetched");

    // For Google models, the providerModelId may be a full model name or just an ID.
    // We do a flexible match: check if the catalog contains the exact ID or if the
    // providerModelId is a prefix/substring of any catalog entry.
    return entries.map((entry) => {
      const providerModelId = entry.providers.google!.modelId;
      const exactMatch = catalogModelIds.has(providerModelId);
      const prefixMatch = !exactMatch && Array.from(catalogModelIds).some(
        (catId) => catId.startsWith(providerModelId) || providerModelId.startsWith(catId)
      );
      const available = exactMatch || prefixMatch;
      return {
        modelId: entry.id,
        providerModelId,
        provider: "google" as const,
        available,
        error: available ? undefined : `Model "${providerModelId}" not found in Vertex AI catalog`,
        latencyMs: fetchLatency,
        method: "catalog-check" as const,
      };
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const fetchLatency = Date.now() - startTime;
    return entries.map((e) => ({
      modelId: e.id,
      providerModelId: e.providers.google!.modelId,
      provider: "google" as const,
      available: false,
      error: `Vertex AI catalog check failed: ${msg}`,
      latencyMs: fetchLatency,
      method: "catalog-check" as const,
    }));
  }
}

// ===========================================
// Anthropic: Skip (no cheap catalog check)
// ===========================================

function skipProbe(provider: TwoBotAIProvider, reason: string): ModelProbeResult[] {
  const entries = getRegistryEntriesByProvider(provider);
  return entries.map((entry) => ({
    modelId: entry.id,
    providerModelId: entry.providers[provider]!.modelId,
    provider,
    available: true, // Assume available (optimistic)
    error: undefined,
    latencyMs: 0,
    method: "skipped" as const,
  }));
}

// ===========================================
// Public API
// ===========================================

const probers: Record<TwoBotAIProvider, () => Promise<ModelProbeResult[]>> = {
  together: probeTogetherModels,
  openrouter: probeOpenRouterModels,
  openai: probeOpenAIModels,
  fireworks: probeFireworksModels,
  anthropic: async () => skipProbe("anthropic", "No catalog API — would require paid completion probe"),
  google: probeGoogleModels,
};

/**
 * Probe all models for a specific provider. Returns per-model availability.
 */
export async function probeProviderModels(provider: TwoBotAIProvider): Promise<ProbeReport> {
  const startTime = Date.now();
  const results = await probers[provider]();
  const durationMs = Date.now() - startTime;

  const report: ProbeReport = {
    provider,
    totalModels: results.length,
    availableModels: results.filter((r) => r.available).length,
    unavailableModels: results.filter((r) => !r.available).length,
    results,
    durationMs,
    timestamp: new Date().toISOString(),
  };

  if (report.unavailableModels > 0) {
    log.warn(
      { provider, unavailable: report.unavailableModels, total: report.totalModels },
      `Model probe: ${report.unavailableModels}/${report.totalModels} models unavailable on ${provider}`
    );
  } else {
    log.info(
      { provider, total: report.totalModels, durationMs },
      `Model probe: all ${report.totalModels} models available on ${provider}`
    );
  }

  return report;
}

/**
 * Probe all models across ALL providers. Returns per-provider reports.
 */
export async function probeAllModels(): Promise<ProbeReport[]> {
  const providers: TwoBotAIProvider[] = ["openai", "anthropic", "together", "fireworks", "openrouter", "google"];

  // Run all providers in parallel
  const reports = await Promise.all(providers.map(probeProviderModels));

  const totalUnavailable = reports.reduce((sum, r) => sum + r.unavailableModels, 0);
  const totalModels = reports.reduce((sum, r) => sum + r.totalModels, 0);

  log.info(
    { totalModels, totalUnavailable },
    `Full model probe complete: ${totalUnavailable}/${totalModels} models unavailable`
  );

  return reports;
}

// ===========================================
// Model-Centric View (cross-provider per model)
// ===========================================

export interface ModelProviderStatus {
  provider: TwoBotAIProvider;
  providerModelId: string;
  available: boolean;
  error?: string;
  method: "catalog-check" | "completion-probe" | "skipped";
}

export interface ModelCentricProbe {
  modelId: string;
  displayName: string;
  capability: string;
  providers: ModelProviderStatus[];
  /** Number of providers where this model is available */
  availableCount: number;
  /** Total number of providers for this model */
  totalProviders: number;
}

/**
 * Convert per-provider probe reports into a model-centric view.
 * Each model shows all its providers and their availability status.
 */
export function toModelCentricView(reports: ProbeReport[]): ModelCentricProbe[] {
  // Build a lookup: modelId → provider → result
  const resultsByModel = new Map<string, Map<TwoBotAIProvider, ModelProbeResult>>();
  for (const report of reports) {
    for (const result of report.results) {
      if (!resultsByModel.has(result.modelId)) {
        resultsByModel.set(result.modelId, new Map());
      }
      resultsByModel.get(result.modelId)!.set(result.provider, result);
    }
  }

  // Build model-centric entries from the registry
  const modelViews: ModelCentricProbe[] = [];

  for (const entry of MODEL_REGISTRY) {
    const providerKeys = Object.keys(entry.providers) as TwoBotAIProvider[];
    if (providerKeys.length === 0) continue;

    const probeResults = resultsByModel.get(entry.id);
    const providers: ModelProviderStatus[] = providerKeys.map((provider) => {
      const result = probeResults?.get(provider);
      const providerCost = entry.providers[provider];
      return {
        provider,
        providerModelId: providerCost?.modelId ?? entry.id,
        available: result?.available ?? true, // If not probed, assume available
        error: result?.error,
        method: result?.method ?? "skipped",
      };
    });

    const availableCount = providers.filter((p) => p.available).length;

    modelViews.push({
      modelId: entry.id,
      displayName: entry.displayName,
      capability: entry.capability,
      providers,
      availableCount,
      totalProviders: providers.length,
    });
  }

  // Sort: models with issues first, then by name
  modelViews.sort((a, b) => {
    const aHasIssues = a.availableCount < a.totalProviders ? 0 : 1;
    const bHasIssues = b.availableCount < b.totalProviders ? 0 : 1;
    if (aHasIssues !== bHasIssues) return aHasIssues - bHasIssues;
    return a.displayName.localeCompare(b.displayName);
  });

  return modelViews;
}
