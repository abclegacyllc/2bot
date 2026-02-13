/**
 * Together AI Provider Fetcher
 *
 * Fetches ALL models + pricing from Together AI's /v1/models endpoint.
 * Together AI returns the most comprehensive data of any provider.
 *
 * Model types returned by Together AI:
 * - chat (50): text generation, input/output per MTok
 * - image (30): image generation, pricing.base per image (often 0 in API)
 * - video (23): video generation, no API pricing
 * - audio (5): TTS, input per MTok
 * - transcribe (1): STT (Whisper), input/output per MTok
 * - embedding (4): input/output per MTok
 * - rerank (1): input/output per MTok
 * - moderation (4): input/output per MTok
 * - language (1): base language model
 * - unknown (136): older/unlisted models
 *
 * @module modules/2bot-ai-provider/pricing-monitor/provider-fetchers/together-ai.fetcher
 */

import type { ModelType, ProviderFetcher, ProviderModelInfo } from "../pricing-monitor.types";

interface TogetherAIModel {
  id: string;
  type: string;
  display_name?: string;
  pricing?: {
    hourly: number;
    input: number;
    output: number;
    base: number;
    finetune: number;
  };
  context_length?: number;
  created_at?: string;
}

export class TogetherAIFetcher implements ProviderFetcher {
  readonly providerId = "together-ai";
  readonly providerName = "Together AI";
  readonly supportsPricing = true;
  readonly supportsCapabilities = true;

  private apiKey: string;

  constructor() {
    this.apiKey = process.env.TWOBOT_TOGETHER_API_KEY || "";
  }

  async fetchModels(): Promise<ProviderModelInfo[]> {
    if (!this.apiKey) {
      throw new Error("TWOBOT_TOGETHER_API_KEY not configured");
    }

    const response = await fetch("https://api.together.ai/v1/models", {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });

    if (!response.ok) {
      throw new Error(`Together AI API error: ${response.status} ${response.statusText}`);
    }

    const models = (await response.json()) as TogetherAIModel[];

    return models.map((m) => {
      const type = this.mapType(m.type);
      const result: ProviderModelInfo = {
        modelId: m.id,
        displayName: m.display_name || m.id,
        type,
        contextLength: m.context_length,
        createdAt: m.created_at,
      };

      // Determine pricing based on model type
      if (m.pricing) {
        switch (type) {
          case "chat":
          case "moderation":
          case "rerank":
          case "language":
          case "code":
          case "unknown": {
            // Per-MTok token pricing (input/output)
            if (m.pricing.input > 0 || m.pricing.output > 0) {
              result.pricingUnit = "per_mtok";
              result.pricing = {
                inputPerMTok: m.pricing.input,
                outputPerMTok: m.pricing.output,
              };
            }
            break;
          }

          case "embedding": {
            // Embedding uses input per MTok (output usually same or 0)
            if (m.pricing.input > 0) {
              result.pricingUnit = "per_mtok";
              result.pricing = {
                inputPerMTok: m.pricing.input,
                outputPerMTok: m.pricing.output,
              };
            }
            break;
          }

          case "audio":
          case "transcribe": {
            // Audio/TTS models: input per MTok
            if (m.pricing.input > 0 || m.pricing.output > 0) {
              result.pricingUnit = "per_mtok";
              result.pricing = {
                inputPerMTok: m.pricing.input,
                outputPerMTok: m.pricing.output,
              };
            }
            break;
          }

          case "image": {
            // Image models: pricing.base = $/image (often 0 in API)
            if (m.pricing.base > 0) {
              result.pricingUnit = "per_image";
              result.imagePricing = {
                perImage: m.pricing.base,
              };
            }
            // Fall back to input/output if base is 0 but tokens have pricing
            else if (m.pricing.input > 0 || m.pricing.output > 0) {
              result.pricingUnit = "per_mtok";
              result.pricing = {
                inputPerMTok: m.pricing.input,
                outputPerMTok: m.pricing.output,
              };
            }
            break;
          }

          case "video": {
            // Video models: no pricing in API currently (all 0)
            // If they add it later, it might be base or input/output
            if (m.pricing.base > 0) {
              result.pricingUnit = "per_image"; // per-video uses same structure
              result.imagePricing = {
                perImage: m.pricing.base,
              };
            }
            break;
          }
        }
      }

      return result;
    });
  }

  private mapType(togetherType: string): ModelType {
    switch (togetherType) {
      case "chat": return "chat";
      case "image": return "image";
      case "video": return "video";
      case "audio": return "audio";
      case "transcribe": return "transcribe";
      case "embedding": return "embedding";
      case "moderation": return "moderation";
      case "code": return "code";
      case "rerank": return "rerank";
      case "language": return "language";
      default: return "unknown";
    }
  }
}
