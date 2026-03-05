/**
 * OpenRouter Provider Fetcher
 *
 * Fetches ALL models + pricing from OpenRouter's /api/v1/models endpoint.
 * OpenRouter returns comprehensive data including per-token pricing.
 *
 * Pricing from the API:
 * - pricing.prompt: string — cost per token for input (e.g., "0.0000003" = $0.30/MTok)
 * - pricing.completion: string — cost per token for output
 * - pricing.input_cache_read: string — cost for cached input tokens (optional)
 *
 * Model IDs use the format: "provider/model-name" (e.g., "anthropic/claude-opus-4")
 *
 * OpenRouter aggregates models from many providers, so the total model count
 * is typically 300+. We filter to relevant models for comparison.
 *
 * @module modules/2bot-ai-provider/pricing-monitor/provider-fetchers/openrouter.fetcher
 */

import type { ModelType, ProviderFetcher, ProviderModelInfo } from "../pricing-monitor.types";

interface OpenRouterModel {
  id: string;
  canonical_slug?: string;
  hugging_face_id?: string;
  name: string;
  created: number;
  description?: string;
  context_length: number;
  architecture?: {
    modality?: string;
    tokenizer?: string;
    instruct_type?: string | null;
  };
  pricing: {
    prompt: string;
    completion: string;
    input_cache_read?: string;
    image?: string;
    request?: string;
  };
  top_provider?: {
    context_length: number;
    max_completion_tokens: number;
    is_moderated: boolean;
  };
  per_request_limits?: object;
  supported_parameters?: string[];
  default_parameters?: object;
  expiration_date?: string;
}

interface OpenRouterModelsResponse {
  data: OpenRouterModel[];
}

export class OpenRouterFetcher implements ProviderFetcher {
  readonly providerId = "openrouter";
  readonly providerName = "OpenRouter";
  readonly supportsPricing = true;
  readonly supportsCapabilities = true;

  async fetchModels(): Promise<ProviderModelInfo[]> {
    // OpenRouter's /api/v1/models endpoint is public — no API key needed
    const response = await fetch("https://openrouter.ai/api/v1/models", {
      headers: {
        "User-Agent": "2Bot-PriceMonitor/1.0",
      },
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as OpenRouterModelsResponse;

    return data.data
      .filter((m) => this.isRelevantModel(m))
      .map((m) => {
        const type = this.inferType(m);
        const result: ProviderModelInfo = {
          modelId: m.id,
          displayName: m.name,
          type,
          contextLength: m.context_length,
          createdAt: m.created ? new Date(m.created * 1000).toISOString() : undefined,
          capabilities: this.extractCapabilities(m),
        };

        // Parse pricing (OpenRouter gives per-token, we need per-MTok)
        const promptPerToken = parseFloat(m.pricing.prompt || "0");
        const completionPerToken = parseFloat(m.pricing.completion || "0");

        if (promptPerToken > 0 || completionPerToken > 0) {
          // Convert per-token to per-million-tokens
          const inputPerMTok = promptPerToken * 1_000_000;
          const outputPerMTok = completionPerToken * 1_000_000;

          result.pricingUnit = "per_mtok";
          result.pricing = {
            inputPerMTok,
            outputPerMTok,
          };
        }

        // Some models have per-image pricing (additive, don't overwrite token pricing unit)
        if (m.pricing.image) {
          const imagePrice = parseFloat(m.pricing.image);
          if (imagePrice > 0) {
            // Only set pricingUnit to per_image if there's no token pricing
            if (!result.pricingUnit) {
              result.pricingUnit = "per_image";
            }
            result.imagePricing = { perImage: imagePrice };
          }
        }

        return result;
      });
  }

  /**
   * Filter to relevant models. OpenRouter has 300+ models — we filter to
   * well-known providers that we might track.
   */
  private isRelevantModel(model: OpenRouterModel): boolean {
    // Include all models — the price monitor should see everything
    // to detect new models from any provider
    //
    // Exclude free/zero-cost models and expired models
    const promptPrice = parseFloat(model.pricing.prompt || "0");
    const completionPrice = parseFloat(model.pricing.completion || "0");

    // Skip completely free models (they're not relevant for pricing monitoring)
    if (promptPrice === 0 && completionPrice === 0) return false;

    // Skip expired models
    if (model.expiration_date) {
      const expiry = new Date(model.expiration_date);
      if (expiry < new Date()) return false;
    }

    return true;
  }

  /**
   * Infer model type from model ID and architecture.
   */
  private inferType(model: OpenRouterModel): ModelType {
    const id = model.id.toLowerCase();
    const modality = model.architecture?.modality?.toLowerCase() || "";

    // Image models
    if (id.includes("dall-e") || id.includes("imagen") || id.includes("flux") ||
        id.includes("stable-diffusion") || modality.includes("image")) {
      return "image";
    }

    // Audio models
    if (id.includes("whisper") || id.includes("tts") || modality.includes("audio")) {
      return "audio";
    }

    // Embedding models
    if (id.includes("embedding") || modality.includes("embedding")) {
      return "embedding";
    }

    // Default to chat (vast majority of OpenRouter models)
    return "chat";
  }

  /**
   * Extract capabilities from model data.
   */
  private extractCapabilities(model: OpenRouterModel): string[] {
    const caps: string[] = ["chat"];

    if (model.supported_parameters?.includes("tools")) {
      caps.push("tools");
    }

    const modality = model.architecture?.modality?.toLowerCase() || "";
    if (modality.includes("image")) {
      caps.push("vision");
    }

    return caps;
  }
}
