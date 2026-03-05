/**
 * Fireworks AI Provider Fetcher
 *
 * Fetches model list from Fireworks AI's /v1/models endpoint.
 * Fireworks does NOT return pricing via API — only model IDs, capabilities,
 * and context lengths. We can still detect new/removed models.
 *
 * Model capabilities returned by Fireworks:
 * - supports_chat: boolean (text generation)
 * - supports_image_input: boolean (vision/multimodal)
 * - supports_tools: boolean (function calling)
 * - context_length: number
 * - kind: string (e.g., "HF_BASE_MODEL")
 *
 * Model IDs use the format: accounts/fireworks/models/<name>
 * We strip the prefix to get the short model name for matching.
 *
 * @module modules/2bot-ai-provider/pricing-monitor/provider-fetchers/fireworks.fetcher
 */

import type { ModelType, ProviderFetcher, ProviderModelInfo } from "../pricing-monitor.types";

interface FireworksModel {
  id: string;
  object: string;
  owned_by: string;
  created: number;
  kind: string;
  supports_chat: boolean;
  supports_image_input: boolean;
  supports_tools: boolean;
  context_length: number | null;
}

interface FireworksModelsResponse {
  object?: string;
  data: FireworksModel[];
}

export class FireworksFetcher implements ProviderFetcher {
  readonly providerId = "fireworks";
  readonly providerName = "Fireworks AI";
  readonly supportsPricing = false;
  readonly supportsCapabilities = true;

  private apiKey: string;

  constructor() {
    this.apiKey = process.env.TWOBOT_FIREWORKS_API_KEY || "";
  }

  async fetchModels(): Promise<ProviderModelInfo[]> {
    if (!this.apiKey) {
      throw new Error("TWOBOT_FIREWORKS_API_KEY not configured");
    }

    const response = await fetch("https://api.fireworks.ai/inference/v1/models", {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });

    if (!response.ok) {
      throw new Error(`Fireworks AI API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as FireworksModelsResponse;
    const models = Array.isArray(data) ? data : data.data;

    return models.map((m) => {
      const capabilities: string[] = [];
      if (m.supports_chat) capabilities.push("chat");
      if (m.supports_image_input) capabilities.push("vision");
      if (m.supports_tools) capabilities.push("tools");

      return {
        modelId: this.normalizeModelId(m.id),
        displayName: this.formatDisplayName(m.id),
        type: this.inferType(m),
        contextLength: m.context_length ?? undefined,
        createdAt: m.created ? new Date(m.created * 1000).toISOString() : undefined,
        capabilities,
        // Fireworks doesn't provide pricing via API
      };
    });
  }

  /**
   * Normalize Fireworks model ID to our internal format.
   * Fireworks uses "accounts/fireworks/models/<name>" — we extract just the name
   * and prefix with "accounts/fireworks/models/" for full matching.
   */
  private normalizeModelId(id: string): string {
    // Keep the full ID for accurate matching
    return id;
  }

  /**
   * Format a display name from the model ID.
   * "accounts/fireworks/models/deepseek-v3p1" → "DeepSeek V3p1"
   */
  private formatDisplayName(id: string): string {
    const shortName = id.replace(/^accounts\/[^/]+\/models\//, "");
    return shortName
      .split(/[-_]/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }

  /**
   * Infer model type from capabilities.
   * Fireworks primarily serves chat models and image generation models.
   */
  private inferType(model: FireworksModel): ModelType {
    const shortId = model.id.replace(/^accounts\/[^/]+\/models\//, "").toLowerCase();

    // Image generation models
    if (shortId.includes("flux") || shortId.includes("sdxl") || shortId.includes("stable-diffusion")) {
      return "image";
    }

    // Chat/text models (default for supports_chat)
    if (model.supports_chat) {
      return "chat";
    }

    return "unknown";
  }
}
