/**
 * Cost Context Library
 *
 * Pure functions for cost estimation against the model registry. Used by:
 *   - `/internal/cost/estimate` route (bridge RPC backing)
 *   - Server-side AI orchestration to budget calls before dispatch
 *
 * Estimates are returned in BOTH USD and credits (USD * MARGIN). The credits
 * figure matches the deduction the live request will make.
 *
 * @module lib/cost-context
 */

import { MARGIN, MODEL_REGISTRY } from "@/modules/2bot-ai-provider/model-registry";
import type { TwoBotAIProvider } from "@/modules/2bot-ai-provider/types";

export interface EstimateInput {
  /** Capability — controls which pricing field is used. */
  kind:
    | "text"
    | "image"
    | "speech-synthesis"
    | "speech-recognition"
    | "video"
    | "embedding";
  /** Registry model id (e.g. "gpt-4o"). */
  modelId: string;
  /** Optional preferred provider; falls back to first available. */
  provider?: TwoBotAIProvider;
  /** Token / item counts (depends on `kind`). */
  inputTokens?: number;
  outputTokens?: number;
  imageCount?: number;
  charCount?: number;
  minutes?: number;
  videoSeconds?: number;
}

export interface EstimateResult {
  ok: true;
  modelId: string;
  provider: string;
  kind: EstimateInput["kind"];
  /** Cost in USD (provider's published price). */
  usd: number;
  /** Equivalent in 2bot credits (USD × MARGIN). */
  credits: number;
  breakdown: Record<string, number>;
}

export interface EstimateError {
  ok: false;
  error: string;
}

/**
 * Estimate the USD + credit cost for a given AI invocation. Returns
 * `{ ok: false, error }` on missing model / unsupported pricing rather than
 * throwing — bridge RPC callers expect a structured response.
 */
export function estimateCost(input: EstimateInput): EstimateResult | EstimateError {
  const entry = MODEL_REGISTRY.find((e) => e.id === input.modelId);
  if (!entry) return { ok: false, error: `Unknown model: ${input.modelId}` };
  if (entry.deprecated) return { ok: false, error: `Model ${input.modelId} is deprecated` };

  const providerEntries = Object.entries(entry.providers) as Array<
    [TwoBotAIProvider, typeof entry.providers[TwoBotAIProvider]]
  >;
  if (providerEntries.length === 0) {
    return { ok: false, error: `No providers configured for ${input.modelId}` };
  }

  const chosen =
    (input.provider && providerEntries.find(([p]) => p === input.provider)) ??
    providerEntries[0];
  if (!chosen) {
    return { ok: false, error: `No providers configured for ${input.modelId}` };
  }

  const [providerId, cost] = chosen;
  if (!cost) return { ok: false, error: `No pricing for provider ${providerId}` };

  const breakdown: Record<string, number> = {};
  let usd = 0;

  switch (input.kind) {
    case "text":
    case "embedding": {
      if (cost.inputPer1M === undefined) {
        return { ok: false, error: "Model has no per-token pricing" };
      }
      const inTok = Math.max(0, input.inputTokens ?? 0);
      const outTok = Math.max(0, input.outputTokens ?? 0);
      const inUsd = (inTok / 1_000_000) * cost.inputPer1M;
      const outUsd = (outTok / 1_000_000) * (cost.outputPer1M ?? 0);
      breakdown.inputTokensUsd = inUsd;
      breakdown.outputTokensUsd = outUsd;
      usd = inUsd + outUsd;
      break;
    }
    case "image": {
      if (cost.perImage === undefined) {
        return { ok: false, error: "Model has no per-image pricing" };
      }
      const n = Math.max(0, input.imageCount ?? 1);
      usd = n * cost.perImage;
      breakdown.imagesUsd = usd;
      break;
    }
    case "speech-synthesis": {
      if (cost.perCharM === undefined) {
        return { ok: false, error: "Model has no per-character pricing" };
      }
      const chars = Math.max(0, input.charCount ?? 0);
      usd = (chars / 1_000_000) * cost.perCharM;
      breakdown.charactersUsd = usd;
      break;
    }
    case "speech-recognition": {
      if (cost.perMinute === undefined) {
        return { ok: false, error: "Model has no per-minute pricing" };
      }
      const m = Math.max(0, input.minutes ?? 0);
      usd = m * cost.perMinute;
      breakdown.minutesUsd = usd;
      break;
    }
    case "video": {
      if (cost.perSecond === undefined) {
        return { ok: false, error: "Model has no per-second pricing" };
      }
      const s = Math.max(0, input.videoSeconds ?? 0);
      usd = s * cost.perSecond;
      breakdown.videoSecondsUsd = usd;
      break;
    }
  }

  // Normalise tiny floating-point noise to 8 decimals.
  const usdRounded = Math.round(usd * 1e8) / 1e8;
  const credits = Math.round(usd * MARGIN * 1e8) / 1e8;

  return {
    ok: true,
    modelId: cost.modelId,
    provider: providerId,
    kind: input.kind,
    usd: usdRounded,
    credits,
    breakdown,
  };
}
