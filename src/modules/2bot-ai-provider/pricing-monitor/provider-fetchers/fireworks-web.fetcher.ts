/**
 * Fireworks AI Web Price Fetcher
 *
 * Scrapes pricing data from Fireworks AI's public pricing page
 * (https://fireworks.ai/pricing) as a supplementary source.
 *
 * The Fireworks API does NOT return pricing data. The website, however, displays
 * model-specific pricing. Fireworks uses a Next.js RSC (React Server Components)
 * format, so we extract pricing from the serialized component data in the HTML.
 *
 * Pricing structure on Fireworks:
 * - Text/Vision models: tier-based (by param count) + model-specific overrides
 *   - Generic tiers: <4B=$0.10, 4B-16B=$0.20, >16B=$0.90/MTok
 *   - MoE tiers: 0-56B=$0.50, 56.1B-176B=$1.20/MTok
 *   - Named models: DeepSeek V3, GLM-4.7, Kimi K2, etc. with custom input/output
 * - Image models: per-step or per-image pricing
 *   - FLUX.1 Kontext Pro: $0.04/image, Kontext Max: $0.08/image
 *   - FLUX.1 [schnell]: $0.00035/step, FLUX.1 [dev]: $0.0005/step
 * - STT models: per audio minute
 *   - Whisper-v3-large: $0.0015/min, Whisper-v3-large-turbo: $0.0009/min
 * - Embeddings: tier-based (by param count)
 *
 * @module modules/2bot-ai-provider/pricing-monitor/provider-fetchers/fireworks-web.fetcher
 */

import type { PricingUnit } from "../pricing-monitor.types";

// ===========================================
// Types
// ===========================================

export interface FireworksWebPriceEntry {
  /** Model name as shown on the website */
  displayName: string;

  /** Pricing unit */
  pricingUnit: PricingUnit;

  /** Input price in USD (per MTok for text, per image, per minute, etc.) */
  inputPrice: number;

  /** Output price in USD (per MTok for text; 0 for non-text) */
  outputPrice: number;

  /** Normalized model ID (best-effort mapping to API model ID) */
  normalizedModelId?: string;

  /** Whether this is a tier price (not model-specific) */
  isTier?: boolean;

  /** Tier description (e.g., "Less than 4B parameters") */
  tierDescription?: string;
}

// ===========================================
// Model Name → API Model ID Mapping
// ===========================================

/**
 * Manual mappings from web display names to API model IDs.
 * Fireworks API IDs use the format: accounts/fireworks/models/<name>
 */
const WEB_NAME_TO_MODEL_ID: Record<string, string> = {
  // Text/Vision models (web name → API model ID)
  "deepseek v3 family": "accounts/fireworks/models/deepseek-v3p1",
  "deepseek v3": "accounts/fireworks/models/deepseek-v3p1",
  "glm-4.7": "accounts/fireworks/models/glm-4p7",
  "glm-5": "accounts/fireworks/models/glm-5",
  "qwen3 vl 30b a3b": "accounts/fireworks/models/qwen3-vl-235b-a22b-instruct",
  "kimi k2 instruct": "accounts/fireworks/models/kimi-k2-instruct-0905",
  "kimi k2 thinking": "accounts/fireworks/models/kimi-k2-thinking",
  "kimi k2.5": "accounts/fireworks/models/kimi-k2p5",
  "openai gpt-oss-120b": "accounts/fireworks/models/gpt-oss-120b",
  "gpt-oss-120b": "accounts/fireworks/models/gpt-oss-120b",
  "openai gpt-oss-20b": "accounts/fireworks/models/gpt-oss-20b",
  "gpt-oss-20b": "accounts/fireworks/models/gpt-oss-20b",
  "minimax m2 family": "accounts/fireworks/models/minimax-m2p5",
  "minimax m2.5": "accounts/fireworks/models/minimax-m2p5",
  "deepseek r1": "accounts/fireworks/models/deepseek-r1-0528",
  "mixtral 8x22b": "accounts/fireworks/models/mixtral-8x22b-instruct",

  // Image models
  "flux.1 kontext pro": "accounts/fireworks/models/flux-kontext-pro",
  "flux.1 kontext max": "accounts/fireworks/models/flux-kontext-max",
  "flux.1 [schnell]": "accounts/fireworks/models/flux-1-schnell-fp8",
  "flux.1 [dev]": "accounts/fireworks/models/flux-1-dev-fp8",
};

// ===========================================
// Pricing Section Types
// ===========================================

type PricingSection = "text" | "stt" | "image" | "embeddings" | "unknown";

// ===========================================
// HTML / RSC Parsing
// ===========================================

/**
 * Parse the Fireworks pricing page and extract model-specific pricing.
 *
 * The page is a Next.js RSC page with pricing data embedded in serialized
 * React component JSON in `<script>self.__next_f.push(...)` blocks.
 *
 * Strategy:
 * 1. Find section headers ("Text and Vision", "Speech to Text", "Image Generation", "Embeddings")
 * 2. Extract table rows with model names and prices
 * 3. Parse price strings like "$0.56 input, $1.68 output" or "$0.04 per image"
 */
function parseFireworksPricing(html: string): FireworksWebPriceEntry[] {
  const entries: FireworksWebPriceEntry[] = [];

  // Strategy: Extract text content from the RSC-serialized HTML
  // Look for table data patterns in the raw HTML/RSC output

  // 1. Parse text/vision model-specific pricing
  //    Pattern: "children":"MODEL_NAME" ... "children":"$$PRICE input, $PRICE output"
  const modelPricePattern = /\"children\":\"([^"]+?)\"\}\]\}\],[^]*?\"children\":\"(?:\$\$?)(\d+(?:\.\d+)?)\s+input,\s+\$(\d+(?:\.\d+)?)\s+output/g;
  let match;

  while ((match = modelPricePattern.exec(html)) !== null) {
    const [, modelName, inputPrice, outputPrice] = match;
    if (!modelName || !inputPrice || !outputPrice) continue;

    // Skip non-model entries
    if (modelName.includes("Base model") || modelName.includes("parameter")) continue;

    const entry: FireworksWebPriceEntry = {
      displayName: modelName.trim(),
      pricingUnit: "per_mtok",
      inputPrice: parseFloat(inputPrice),
      outputPrice: parseFloat(outputPrice),
    };

    // Try to map to API model ID
    const normalized = WEB_NAME_TO_MODEL_ID[modelName.trim().toLowerCase()];
    if (normalized) {
      entry.normalizedModelId = normalized;
    }

    entries.push(entry);
  }

  // 2. Parse tier-based pricing (generic parameter tiers)
  //    Pattern: "children":"Less than 4B parameters" ... "children":"$$0.10"
  const tierPattern = /\"children\":\"([^"]*?(?:parameters|MoE)[^"]*?)\"\}\],[^]*?\"children\":\"(?:\$\$?)(\d+(?:\.\d+)?)\"/g;

  while ((match = tierPattern.exec(html)) !== null) {
    const [, tierDesc, price] = match;
    if (!tierDesc || !price) continue;

    entries.push({
      displayName: tierDesc.trim(),
      pricingUnit: "per_mtok",
      inputPrice: parseFloat(price),
      outputPrice: parseFloat(price), // Tier pricing is the same for input/output
      isTier: true,
      tierDescription: tierDesc.trim(),
    });
  }

  // 3. Parse per-image pricing
  //    Pattern: "children":"$$0.04 per image"
  const imageModelPattern = /\"children\":\"([^"]*?(?:FLUX|Kontext|flux)[^"]*?)\"\}\](?:[\s\S]{0,2000})\"children\":\"(?:\$\$?)(\d+(?:\.\d+)?)\s+per image\"/g;

  while ((match = imageModelPattern.exec(html)) !== null) {
    const [, modelName, price] = match;
    if (!modelName || !price) continue;

    const entry: FireworksWebPriceEntry = {
      displayName: modelName.trim(),
      pricingUnit: "per_image",
      inputPrice: parseFloat(price),
      outputPrice: 0,
    };

    const normalized = WEB_NAME_TO_MODEL_ID[modelName.trim().toLowerCase()];
    if (normalized) {
      entry.normalizedModelId = normalized;
    }

    entries.push(entry);
  }

  // 4. Parse per-step pricing for image models
  //    Pattern: "$$0.00035 per step"
  const stepPattern = /\"children\":\"([^"]*?(?:FLUX|All Non-Flux)[^"]*?)\"\}\](?:[\s\S]{0,2000})\"children\":\"(?:\$\$?)(\d+(?:\.\d+)?)\s+per step/g;

  while ((match = stepPattern.exec(html)) !== null) {
    const [, modelName, pricePerStep] = match;
    if (!modelName || !pricePerStep) continue;

    entries.push({
      displayName: modelName.trim(),
      pricingUnit: "per_image", // Approximate: convert to per-image later
      inputPrice: parseFloat(pricePerStep),
      outputPrice: 0,
      isTier: modelName.includes("All Non-Flux"),
      tierDescription: modelName.includes("All Non-Flux") ? modelName.trim() : undefined,
    });
  }

  // 5. Parse STT (Speech to Text) pricing
  //    Pattern: "Whisper-v3-large" ... "$$0.0015"
  const sttPattern = /\"children\":\"(Whisper[^"]*?)\"\}\],[^]*?\"children\":\"(?:\$\$?)(\d+(?:\.\d+)?)\"/g;

  while ((match = sttPattern.exec(html)) !== null) {
    const [, modelName, price] = match;
    if (!modelName || !price) continue;

    entries.push({
      displayName: modelName.trim(),
      pricingUnit: "per_minute",
      inputPrice: parseFloat(price),
      outputPrice: 0,
    });
  }

  // 6. Parse embeddings tier pricing
  //    Pattern: "up to 150M" ... "$$0.008"
  const embeddingPattern = /\"children\":\"((?:up to|(?:\d+M\s*-\s*\d+M)|Qwen3)[^"]*?)\"\}\],[^]*?\"children\":\"(?:\$\$?)(\d+(?:\.\d+)?)\"/g;

  while ((match = embeddingPattern.exec(html)) !== null) {
    const [, tierDesc, price] = match;
    if (!tierDesc || !price) continue;

    // Only match if it looks like an embedding tier (small prices)
    const parsedPrice = parseFloat(price);
    if (parsedPrice > 1) continue; // Embedding prices are always < $1

    entries.push({
      displayName: tierDesc.trim(),
      pricingUnit: "per_mtok",
      inputPrice: parsedPrice,
      outputPrice: 0,
      isTier: true,
      tierDescription: `Embedding: ${tierDesc.trim()}`,
    });
  }

  return entries;
}

/**
 * Alternative simpler parsing approach: extract ALL price-like patterns from
 * the Fireworks pricing page and associate them with nearby model names.
 *
 * This is more robust than the regex approach above, as it doesn't depend
 * on specific HTML structure.
 */
function parseFireworksPricingSimple(html: string): FireworksWebPriceEntry[] {
  const entries: FireworksWebPriceEntry[] = [];

  // Extract all "children":"VALUE" patterns from RSC data
  const childrenPattern = /\"children\":\"([^"]+)\"/g;
  const allChildren: Array<{ value: string; position: number }> = [];
  let match;

  while ((match = childrenPattern.exec(html)) !== null) {
    if (match[1]) {
      allChildren.push({ value: match[1], position: match.index });
    }
  }

  // Find section boundaries
  const sectionBoundaries: Array<{ section: PricingSection; position: number }> = [];

  for (const child of allChildren) {
    const val = child.value.toLowerCase();
    if (val === "text and vision") {
      sectionBoundaries.push({ section: "text", position: child.position });
    } else if (val.includes("speech to text")) {
      sectionBoundaries.push({ section: "stt", position: child.position });
    } else if (val === "image generation") {
      sectionBoundaries.push({ section: "image", position: child.position });
    } else if (val === "embeddings") {
      sectionBoundaries.push({ section: "embeddings", position: child.position });
    }
  }

  function getSectionForPosition(pos: number): PricingSection {
    let section: PricingSection = "unknown";
    for (const b of sectionBoundaries) {
      if (b.position <= pos) section = b.section;
      else break;
    }
    return section;
  }

  // Find price patterns: "$X.XX input, $Y.YY output" or "$$X.XX"
  for (let i = 0; i < allChildren.length; i++) {
    const child = allChildren[i];
    if (!child) continue;
    const val = child.value;
    const section = getSectionForPosition(child.position);

    // Pattern 1: "$X.XX input, $Y.YY output" (text models with split pricing)
    const splitPriceMatch = val.match(/^\$\$?(\d+(?:\.\d+)?)\s+input.*?\$(\d+(?:\.\d+)?)\s+output/);
    if (splitPriceMatch && section === "text") {
      // Look backwards for the model name
      const modelName = findPreviousModelName(allChildren, i);
      if (modelName && splitPriceMatch[1] && splitPriceMatch[2]) {
        const entry: FireworksWebPriceEntry = {
          displayName: modelName,
          pricingUnit: "per_mtok",
          inputPrice: parseFloat(splitPriceMatch[1]),
          outputPrice: parseFloat(splitPriceMatch[2]),
        };
        const normalized = WEB_NAME_TO_MODEL_ID[modelName.toLowerCase()];
        if (normalized) entry.normalizedModelId = normalized;
        entries.push(entry);
      }
      continue;
    }

    // Pattern 2: "$$X.XX per image" (image models)
    const perImageMatch = val.match(/^\$\$?(\d+(?:\.\d+)?)\s+per image/);
    if (perImageMatch && section === "image") {
      const modelName = findPreviousModelName(allChildren, i);
      if (modelName && perImageMatch[1]) {
        const entry: FireworksWebPriceEntry = {
          displayName: modelName,
          pricingUnit: "per_image",
          inputPrice: parseFloat(perImageMatch[1]),
          outputPrice: 0,
        };
        const normalized = WEB_NAME_TO_MODEL_ID[modelName.toLowerCase()];
        if (normalized) entry.normalizedModelId = normalized;
        entries.push(entry);
      }
      continue;
    }

    // Pattern 3: "$$X.XX per step" (image models, step-based)
    const perStepMatch = val.match(/^\$\$?(\d+(?:\.\d+)?)\s+per step/);
    if (perStepMatch && section === "image") {
      const modelName = findPreviousModelName(allChildren, i);
      if (modelName && perStepMatch[1]) {
        entries.push({
          displayName: modelName,
          pricingUnit: "per_image",
          inputPrice: parseFloat(perStepMatch[1]),
          outputPrice: 0,
          isTier: true,
          tierDescription: `Per step: ${modelName}`,
        });
      }
      continue;
    }

    // Pattern 4: Simple "$$X.XX" price in STT section
    const simplePriceMatch = val.match(/^\$\$?(\d+(?:\.\d+)?)$/);
    if (simplePriceMatch && section === "stt") {
      const modelName = findPreviousModelName(allChildren, i);
      if (modelName && modelName.toLowerCase().includes("whisper") && simplePriceMatch[1]) {
        entries.push({
          displayName: modelName,
          pricingUnit: "per_minute",
          inputPrice: parseFloat(simplePriceMatch[1]),
          outputPrice: 0,
        });
      }
      continue;
    }

    // Pattern 5: Simple "$$X.XX" in text section (tier pricing)
    if (simplePriceMatch && section === "text") {
      const tierDesc = findPreviousTierDescription(allChildren, i);
      if (tierDesc && simplePriceMatch[1]) {
        entries.push({
          displayName: tierDesc,
          pricingUnit: "per_mtok",
          inputPrice: parseFloat(simplePriceMatch[1]),
          outputPrice: parseFloat(simplePriceMatch[1]),
          isTier: true,
          tierDescription: tierDesc,
        });
      }
    }

    // Pattern 6: Simple "$$X.XX" in embeddings section
    if (simplePriceMatch && section === "embeddings") {
      const tierDesc = findPreviousModelName(allChildren, i);
      if (tierDesc && simplePriceMatch[1]) {
        entries.push({
          displayName: tierDesc,
          pricingUnit: "per_mtok",
          inputPrice: parseFloat(simplePriceMatch[1]),
          outputPrice: 0,
          isTier: true,
          tierDescription: `Embedding: ${tierDesc}`,
        });
      }
    }
  }

  return entries;
}

/**
 * Look backwards in the children array to find the most recent model name.
 * Skips over non-model-name entries (prices, CSS classes, etc.)
 */
function findPreviousModelName(
  children: Array<{ value: string; position: number }>,
  currentIndex: number
): string | undefined {
  for (let i = currentIndex - 1; i >= Math.max(0, currentIndex - 10); i--) {
    const child = children[i];
    if (!child) continue;
    const val = child.value;
    // Skip prices, CSS, and generic text
    if (val.startsWith("$")) continue;
    if (val.includes("border") || val.includes("className")) continue;
    if (val.includes("font-") || val.includes("text-")) continue;
    if (val.length < 3 || val.length > 100) continue;
    // Skip section headers
    if (["Text and Vision", "Image Generation", "Speech to Text (STT)", "Embeddings", "Base model", "$$ / 1M tokens", "Model", "Image model name"].includes(val)) continue;
    if (val.includes("$$ /")) continue;
    // This looks like a model name or tier description
    return val;
  }
  return undefined;
}

/**
 * Look backwards for a tier description (parameter count range).
 */
function findPreviousTierDescription(
  children: Array<{ value: string; position: number }>,
  currentIndex: number
): string | undefined {
  for (let i = currentIndex - 1; i >= Math.max(0, currentIndex - 5); i--) {
    const child = children[i];
    if (!child) continue;
    const val = child.value;
    if (val.includes("parameter") || val.includes("MoE")) {
      return val;
    }
  }
  return undefined;
}

// ===========================================
// Public API
// ===========================================

/**
 * Fetch pricing data from Fireworks AI's website.
 * Returns parsed price entries with normalized model IDs.
 */
export async function fetchFireworksWebPrices(): Promise<FireworksWebPriceEntry[]> {
  const response = await fetch("https://fireworks.ai/pricing", {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; 2Bot-PriceMonitor/1.0)",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Fireworks pricing page: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();

  // Use the simple parser (more robust for RSC format)
  const entries = parseFireworksPricingSimple(html);

  // Fall back to regex parser if simple parser found nothing
  if (entries.length === 0) {
    return parseFireworksPricing(html);
  }

  return entries;
}

/**
 * Build a lookup map: normalizedModelId → FireworksWebPriceEntry
 * for fast matching against our models and API models.
 */
export function buildFireworksWebPriceLookup(
  entries: FireworksWebPriceEntry[]
): Map<string, FireworksWebPriceEntry> {
  const map = new Map<string, FireworksWebPriceEntry>();
  for (const entry of entries) {
    if (entry.normalizedModelId) {
      map.set(entry.normalizedModelId, entry);
    }
  }
  return map;
}

/**
 * Find a web price entry for a given API model ID.
 * Tries direct lookup first, then fuzzy matching.
 */
export function findFireworksWebPriceForModel(
  modelId: string,
  webLookup: Map<string, FireworksWebPriceEntry>,
  allEntries: FireworksWebPriceEntry[]
): FireworksWebPriceEntry | undefined {
  // 1. Direct lookup
  const direct = webLookup.get(modelId);
  if (direct) return direct;

  // 2. Fuzzy: extract short name and try matching display names
  const shortName = modelId.replace(/^accounts\/[^/]+\/models\//, "").toLowerCase();

  for (const entry of allEntries) {
    if (entry.isTier) continue; // Skip tier entries for model-specific lookup

    const entryName = entry.displayName.toLowerCase();
    // Check if the short name contains the display name or vice versa
    if (entryName.includes(shortName) || shortName.includes(entryName.replace(/\s+/g, "-"))) {
      return entry;
    }
  }

  return undefined;
}
