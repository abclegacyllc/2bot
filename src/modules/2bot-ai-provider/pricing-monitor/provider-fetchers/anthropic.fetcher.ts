/**
 * Anthropic Provider Fetcher
 *
 * Fetches model list from Anthropic's /v1/models endpoint.
 * Anthropic does NOT return pricing data — only model IDs and display names.
 * We can still detect new/removed models and model ID changes.
 *
 * @module modules/2bot-ai-provider/pricing-monitor/provider-fetchers/anthropic.fetcher
 */

import type { ProviderFetcher, ProviderModelInfo } from "../pricing-monitor.types";

interface AnthropicModel {
  type: string;
  id: string;
  display_name: string;
  created_at: string;
}

interface AnthropicModelsResponse {
  data: AnthropicModel[];
  has_more: boolean;
  first_id: string;
  last_id: string;
}

export class AnthropicFetcher implements ProviderFetcher {
  readonly providerId = "anthropic";
  readonly providerName = "Anthropic";
  readonly supportsPricing = false;
  readonly supportsCapabilities = false;

  private apiKey: string;

  constructor() {
    this.apiKey = process.env.TWOBOT_ANTHROPIC_API_KEY || "";
  }

  async fetchModels(): Promise<ProviderModelInfo[]> {
    if (!this.apiKey) {
      throw new Error("TWOBOT_ANTHROPIC_API_KEY not configured");
    }

    const response = await fetch("https://api.anthropic.com/v1/models", {
      headers: {
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
    });

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as AnthropicModelsResponse;

    return data.data.map((m) => ({
      modelId: m.id,
      displayName: m.display_name,
      type: "chat" as const,
      createdAt: m.created_at,
      // Anthropic doesn't provide pricing or context_length via API
    }));
  }
}
