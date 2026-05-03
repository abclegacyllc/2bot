/**
 * Provider Balance / Credits Monitoring Service
 *
 * Checks remaining balance / credits on external AI provider accounts.
 * Only providers with balance APIs are supported:
 * - Together AI: GET /v1/balance
 * - OpenRouter: GET /api/v1/auth/key  (returns limit_remaining, usage, limit)
 *
 * Providers without balance APIs: OpenAI, Anthropic, Fireworks, Google Vertex AI
 *
 * @module modules/2bot-ai-provider/provider-balance.service
 */

import { logger } from "@/lib/logger";
import type { TwoBotAIProvider } from "./types";

const log = logger.child({ module: "provider-balance" });

// ===========================================
// Types
// ===========================================

export interface ProviderBalance {
  provider: TwoBotAIProvider;
  /** Whether this provider has a balance API */
  supported: boolean;
  /** Balance in USD (null if unsupported or fetch failed) */
  balanceUsd: number | null;
  /** Total spent / used in USD (null if unavailable) */
  usedUsd: number | null;
  /** Credit limit in USD (null if no limit or unavailable) */
  limitUsd: number | null;
  /** Whether the provider is on a free tier */
  isFreeTier?: boolean;
  /** Human-readable note */
  note?: string;
  /** Error if fetch failed */
  error?: string;
  /** When this was last checked */
  lastChecked: string;
}

// ===========================================
// Cache (5-minute TTL)
// ===========================================

const BALANCE_CACHE_TTL_MS = 5 * 60 * 1000;
const balanceCache = new Map<TwoBotAIProvider, { data: ProviderBalance; fetchedAt: number }>();

// ===========================================
// Together AI Balance
// ===========================================

async function fetchTogetherBalance(): Promise<ProviderBalance> {
  const apiKey = process.env.TWOBOT_TOGETHER_API_KEY;
  const now = new Date().toISOString();

  if (!apiKey) {
    return { provider: "together", supported: true, balanceUsd: null, usedUsd: null, limitUsd: null, error: "No API key", lastChecked: now };
  }

  try {
    const response = await fetch("https://api.together.xyz/v1/balance", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      log.warn({ status: response.status, error: errText }, "Together AI balance check failed");
      return { provider: "together", supported: true, balanceUsd: null, usedUsd: null, limitUsd: null, error: `HTTP ${response.status}`, lastChecked: now };
    }

    const body = (await response.json()) as { balance?: number; total_balance?: number };
    const balance = body.balance ?? body.total_balance ?? null;

    log.info({ balance }, "Together AI balance fetched");
    return {
      provider: "together",
      supported: true,
      balanceUsd: typeof balance === "number" ? balance : null,
      usedUsd: null,
      limitUsd: null,
      lastChecked: now,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log.error({ error: msg }, "Together AI balance fetch error");
    return { provider: "together", supported: true, balanceUsd: null, usedUsd: null, limitUsd: null, error: msg, lastChecked: now };
  }
}

// ===========================================
// OpenRouter Balance
// ===========================================

async function fetchOpenRouterBalance(): Promise<ProviderBalance> {
  const apiKey = process.env.TWOBOT_OPENROUTER_API_KEY;
  const now = new Date().toISOString();

  if (!apiKey) {
    return { provider: "openrouter", supported: true, balanceUsd: null, usedUsd: null, limitUsd: null, error: "No API key", lastChecked: now };
  }

  try {
    const response = await fetch("https://openrouter.ai/api/v1/auth/key", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return { provider: "openrouter", supported: true, balanceUsd: null, usedUsd: null, limitUsd: null, error: `HTTP ${response.status}`, lastChecked: now };
    }

    const body = (await response.json()) as {
      data?: {
        limit_remaining?: number | null;
        usage?: number;
        limit?: number | null;
        is_free_tier?: boolean;
      };
    };

    const remaining = body.data?.limit_remaining ?? null;
    const usage = body.data?.usage ?? null;
    const limit = body.data?.limit ?? null;
    const isFreeTier = body.data?.is_free_tier === true;

    log.info({ remaining, usage, limit, isFreeTier }, "OpenRouter balance fetched");
    return {
      provider: "openrouter",
      supported: true,
      balanceUsd: typeof remaining === "number" ? remaining : null,
      usedUsd: typeof usage === "number" ? usage : null,
      limitUsd: typeof limit === "number" ? limit : null,
      isFreeTier,
      note: isFreeTier ? "Free tier account" : undefined,
      lastChecked: now,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log.error({ error: msg }, "OpenRouter balance fetch error");
    return { provider: "openrouter", supported: true, balanceUsd: null, usedUsd: null, limitUsd: null, error: msg, lastChecked: now };
  }
}

// ===========================================
// Unsupported Provider Stubs
// ===========================================

function unsupportedBalance(provider: TwoBotAIProvider, note: string): ProviderBalance {
  return {
    provider,
    supported: false,
    balanceUsd: null,
    usedUsd: null,
    limitUsd: null,
    note,
    lastChecked: new Date().toISOString(),
  };
}

// ===========================================
// Public API
// ===========================================

const balanceFetchers: Record<TwoBotAIProvider, () => Promise<ProviderBalance>> = {
  together: async () => unsupportedBalance("together", "Together AI has no public billing API"),
  openrouter: fetchOpenRouterBalance,
  openai: async () => unsupportedBalance("openai", "OpenAI key is placeholder — needs real key with admin scope"),
  anthropic: async () => unsupportedBalance("anthropic", "Anthropic has no public billing API"),
  fireworks: async () => unsupportedBalance("fireworks", "Fireworks billing API returns 403 — needs admin-scoped key"),
  google: async () => unsupportedBalance("google", "Vertex AI billing requires Google Cloud Billing API + OAuth2"),
};

/**
 * Get balance for a single provider (cached for 5 minutes)
 */
export async function getProviderBalance(provider: TwoBotAIProvider): Promise<ProviderBalance> {
  const cached = balanceCache.get(provider);
  if (cached && Date.now() - cached.fetchedAt < BALANCE_CACHE_TTL_MS) {
    return cached.data;
  }

  const fetcher = balanceFetchers[provider];
  if (!fetcher) {
    return unsupportedBalance(provider, "Unknown provider");
  }

  const data = await fetcher();
  balanceCache.set(provider, { data, fetchedAt: Date.now() });
  return data;
}

/**
 * Get balances for all providers (parallel fetch, cached)
 */
export async function getAllProviderBalances(): Promise<ProviderBalance[]> {
  const providers: TwoBotAIProvider[] = ["openai", "anthropic", "together", "fireworks", "openrouter", "google"];
  return Promise.all(providers.map(getProviderBalance));
}

/**
 * Clear balance cache (force re-fetch)
 */
export function clearBalanceCache(): void {
  balanceCache.clear();
  log.info("Balance cache cleared");
}
