/**
 * OpenAI Provider Fetcher
 *
 * Fetches model list from OpenAI's /v1/models endpoint.
 * OpenAI does NOT return pricing or capabilities — only model IDs and metadata.
 * We can still detect new/removed models.
 *
 * @module modules/2bot-ai-provider/pricing-monitor/provider-fetchers/openai.fetcher
 */

import type { ModelType, ProviderFetcher, ProviderModelInfo } from "../pricing-monitor.types";

interface OpenAIModel {
  id: string;
  object: string;
  created: number;
  owned_by: string;
}

interface OpenAIModelsResponse {
  object: string;
  data: OpenAIModel[];
}

export class OpenAIFetcher implements ProviderFetcher {
  readonly providerId = "openai";
  readonly providerName = "OpenAI";
  readonly supportsPricing = false;
  readonly supportsCapabilities = false;

  private apiKey: string;

  constructor() {
    this.apiKey = process.env.TWOBOT_OPENAI_API_KEY || "";
  }

  async fetchModels(): Promise<ProviderModelInfo[]> {
    if (!this.apiKey || this.apiKey.includes("your-openai-key")) {
      throw new Error("TWOBOT_OPENAI_API_KEY not configured (placeholder key detected)");
    }

    const response = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as OpenAIModelsResponse;

    return data.data
      .filter((m) => this.isRelevantModel(m.id))
      .map((m) => ({
        modelId: m.id,
        displayName: m.id,
        type: this.inferType(m.id),
        createdAt: new Date(m.created * 1000).toISOString(),
        // OpenAI doesn't provide pricing via API
      }));
  }

  /** Filter out internal/system models, keep only ones we might care about */
  private isRelevantModel(id: string): boolean {
    const patterns = [
      /^gpt-/,
      /^o1/,
      /^o3/,
      /^dall-e/,
      /^tts-/,
      /^whisper/,
      /^text-embedding/,
      /^chatgpt/,
    ];
    return patterns.some((p) => p.test(id));
  }

  /** Infer model type from model ID */
  private inferType(id: string): ModelType {
    if (id.startsWith("dall-e")) return "image";
    if (id.startsWith("tts-")) return "audio";
    if (id.startsWith("whisper")) return "audio";
    if (id.startsWith("text-embedding")) return "embedding";
    return "chat";
  }
}
