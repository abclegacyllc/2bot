/**
 * Together AI Web Price Fetcher
 *
 * Scrapes pricing data from Together AI's public pricing page
 * (https://www.together.ai/pricing) as a supplementary source.
 *
 * The Together AI API (`/v1/models`) returns $0 pricing for image, video,
 * and audio models. The website, however, displays real pricing from an
 * internal data source. This fetcher extracts that data from the HTML.
 *
 * Web slugs (e.g., "google-imagen-4-0-preview") are normalized to API model
 * IDs (e.g., "google/imagen-4.0-preview") for matching.
 *
 * Section boundaries are detected via "Price per ..." headers in the HTML:
 *   - "Price per 1M tokens"     → per_mtok (chat, embedding, moderation, rerank)
 *   - "Price per MP"            → per_image (image generation)
 *   - "Price per 1M Characters" → per_1m_chars (TTS/audio)
 *   - "Price per video"         → per_video (video generation)
 *   - "Price per audio minute"  → per_minute (transcription)
 *
 * @module modules/2bot-ai-provider/pricing-monitor/provider-fetchers/together-ai-web.fetcher
 */

import type { PricingUnit } from "../pricing-monitor.types";

// ===========================================
// Types
// ===========================================

export interface WebPriceEntry {
  /** Web page slug (e.g., "google-imagen-4-0-preview") */
  slug: string;

  /** Display name from the website */
  displayName: string;

  /** Price value in USD */
  price: number;

  /** Pricing unit determined from the section header */
  pricingUnit: PricingUnit | 'per_video';

  /** Normalized model ID (best-effort mapping to API model ID) */
  normalizedModelId?: string;
}

// ===========================================
// Section Boundary Detection
// ===========================================

interface SectionBoundary {
  position: number;
  unit: PricingUnit | 'per_video';
  label: string;
}

const SECTION_HEADERS: Array<{ keyword: string; unit: PricingUnit | 'per_video' }> = [
  { keyword: 'Price per 1M tokens',      unit: 'per_mtok' },
  { keyword: 'Price per MP',             unit: 'per_image' },
  { keyword: 'Price per 1M Characters',  unit: 'per_char' },  // Maps to per_char in our system
  { keyword: 'Price per video',          unit: 'per_video' },
  { keyword: 'Price per audio minute',   unit: 'per_minute' },
];

function detectSectionBoundaries(html: string): SectionBoundary[] {
  const boundaries: SectionBoundary[] = [];

  for (const { keyword, unit } of SECTION_HEADERS) {
    let idx = 0;
    while (true) {
      const found = html.indexOf(keyword, idx);
      if (found === -1) break;
      boundaries.push({ position: found, unit, label: keyword });
      idx = found + keyword.length;
    }
  }

  boundaries.sort((a, b) => a.position - b.position);
  return boundaries;
}

function getUnitForPosition(position: number, boundaries: SectionBoundary[]): PricingUnit | 'per_video' {
  let unit: PricingUnit | 'per_video' = 'per_mtok'; // Default to per_mtok (first section is LLM chat)
  for (const b of boundaries) {
    if (b.position < position) {
      unit = b.unit;
    } else {
      break;
    }
  }
  return unit;
}

// ===========================================
// Slug → Model ID Normalization
// ===========================================

/**
 * Known manual slug → model ID mappings for cases where
 * automatic normalization doesn't work.
 */
const SLUG_OVERRIDES: Record<string, string> = {
  // Image models
  'flux-1-schnell-2':          'black-forest-labs/FLUX.1-schnell',
  'flux-1-dev':                'black-forest-labs/FLUX.1-dev',
  'flux1-1-pro':               'black-forest-labs/FLUX1.1-pro',
  'flux-1-canny-pro':          'black-forest-labs/FLUX.1-canny-pro',
  'flux-1-kontext-dev':        'black-forest-labs/FLUX.1-kontext-dev',
  'flux-1-kontext-pro':        'black-forest-labs/FLUX.1-kontext-pro',
  'flux-1-kontext-max':        'black-forest-labs/FLUX.1-kontext-max',
  'flux-1-krea-dev':           'black-forest-labs/FLUX.1-krea-dev',
  'flux-2-pro':                'black-forest-labs/FLUX.2-pro',
  'flux-2-dev':                'black-forest-labs/FLUX.2-dev',
  'google-imagen-4-0-preview': 'google/imagen-4.0-preview',
  'google-imagen-4-0-fast':    'google/imagen-4.0-fast',
  'google-imagen-4-0-ultra':   'google/imagen-4.0-ultra',
  'bytedance-seedream-4-0':    'ByteDance-Seed/Seedream-4.0',
  'bytedance-seedream-3-0':    'ByteDance-Seed/Seedream-3.0',
  'bytedance-seededit':        'ByteDance-Seed/SeedEdit',
  'ideogram-3-0':              'ideogram/ideogram-3.0',
  'stable-diffusion-3':        'stabilityai/stable-diffusion-3-medium',
  'sd-xl':                     'stabilityai/stable-diffusion-xl-base-1.0',
  'dreamshaper':               'Lykon/dreamshaper-xl-v2-turbo',
  'qwen-image':                'Qwen/Qwen-Image',
  'qwen-image-edit':           'Qwen/Qwen-Image-Edit',
  'gemini-flash-image-2-5':    'google/gemini-flash-image-2.5',
  'hidream-i1-full':           'HiDream/HiDream-I1-Full',
  'hidream-i1-dev':            'HiDream/HiDream-I1-Dev',
  'hidream-i1-fast':           'HiDream/HiDream-I1-Fast',
  'juggernaut-pro-flux':       'RunDiffusion/Juggernaut-Pro-Flux',
  'juggernaut-lightning-flux':  'RunDiffusion/Juggernaut-Lightning-Flux',

  // Video models
  'google-veo-2-0':            'google/veo-2.0',
  'google-veo-3-0':            'google/veo-3.0',
  'google-veo-3-0-audio':      'google/veo-3.0-audio',
  'google-veo-3-0-fast':       'google/veo-3.0-fast',
  'google-veo-3-0-fast-audio': 'google/veo-3.0-fast-audio',
  'kling-2-1-master':          'kwai-kolors/kling-2.1-master',
  'kling-2-1-standard':        'kwai-kolors/kling-2.1-standard',
  'kling-2-1-pro':             'kwai-kolors/kling-2.1-pro',
  'kling-2-0-master':          'kwai-kolors/kling-2.0-master',
  'kling-1-6-standard':        'kwai-kolors/kling-1.6-standard',
  'kling-1-6-pro':             'kwai-kolors/kling-1.6-pro',
  'minimax-01-director':       'MiniMax/MiniMax-01-Director',
  'minimax-hailuo-02':         'MiniMax/Hailuo-02',
  'bytedance-seedance-1-0-lite': 'ByteDance-Seed/Seedance-1.0-Lite',
  'bytedance-seedance-1-0-pro': 'ByteDance-Seed/Seedance-1.0-Pro',
  'pixverse-v5':               'PixVerse/PixVerse-v5',
  'wan-2-2-i2v':               'Wan-AI/Wan2.2-I2V',
  'wan-2-2-t2v':               'Wan-AI/Wan2.2-T2V',
  'vidu-2-0':                  'Vidu/vidu-2.0',
  'vidu-q1':                   'Vidu/vidu-q1',
  'sora-2':                    'openai/sora-2',
  'sora-2-pro':                'openai/sora-2-pro',

  // Audio / TTS
  'cartesia-sonic':            'cartesia/sonic',
  'cartesia-sonic-3':          'cartesia/sonic-3',

  // Transcription
  'openai-whisper-large-v3':   'openai/whisper-large-v3',

  // Embedding
  'bge-base-en-v1-5':          'BAAI/bge-base-en-v1.5',
  'bge-large-en-v1-5':         'BAAI/bge-large-en-v1.5',
  'gte-modernbert-base':       'Alibaba-NLP/gte-modernbert-base',
  'multilingual-e5-large-instruct': 'intfloat/multilingual-e5-large-instruct',

  // Rerank
  'mxbai-rerank-large-v2':     'mixedbread-ai/mxbai-rerank-large-v2',

  // Moderation
  'virtueguard-text-lite':     'Virtue-AI/VirtueGuard-Text-Lite',
  'llama-guard-4-12b':         'meta-llama/Llama-Guard-4-12B',
  'llama-guard-3-8b':          'meta-llama/Llama-Guard-3-8B',
  'llama-guard-3-11b-vision-turbo': 'meta-llama/Llama-Guard-3-11B-Vision-Turbo',
  'llama-guard-2-8b':          'meta-llama/Llama-Guard-2-8B',
};

/**
 * Normalize a web slug to a likely API model ID.
 * First checks manual overrides, then applies heuristic transformations.
 */
function slugToModelId(slug: string): string {
  // Check manual overrides first
  if (SLUG_OVERRIDES[slug]) {
    return SLUG_OVERRIDES[slug];
  }

  // Heuristic fallback: replace first hyphen with slash, restore dots
  // This handles simple cases like "meta-llama-3-1-8b" → "meta-llama/3.1-8b" (approximately)
  // But for complex model IDs, manual overrides are preferred
  return slug;
}

// ===========================================
// HTML Parsing
// ===========================================

/**
 * Parse the Together AI pricing page HTML and extract model prices.
 *
 * The page uses Webflow CMS with consistent HTML structure:
 * - Model links:  href="/models/SLUG" class="pricing_model-link"
 * - Model names:  <p class="text-weight-medium">NAME</p>
 * - Prices:       <p data-cost-per-dolar="value">$PRICE</p> or just <p>$PRICE</p>
 *
 * Section boundaries use "Price per ..." headers to determine the pricing unit.
 */
function parseWebPrices(html: string): WebPriceEntry[] {
  const entries: WebPriceEntry[] = [];
  const boundaries = detectSectionBoundaries(html);

  // Regex to match: href="/models/SLUG" ... class="pricing_model-link" ... >NAME</p> ... >$PRICE
  const modelPattern = /href="\/models\/([^"]+)"[^>]*class="pricing_model-link[^"]*"[^>]*>\s*<p[^>]*>([^<]+)<\/p><\/a><\/td>\s*<td><div[^>]*>\s*<p[^>]*>(\$[0-9.,]+)/g;

  let match;
  while ((match = modelPattern.exec(html)) !== null) {
    const [, slug, displayName, priceStr] = match;
    if (!slug || !displayName || !priceStr) continue;

    const price = parseFloat(priceStr.replace('$', '').replace(',', ''));
    if (isNaN(price)) continue;

    const unit = getUnitForPosition(match.index, boundaries);
    const normalizedModelId = slugToModelId(slug);

    entries.push({
      slug,
      displayName: displayName.trim(),
      price,
      pricingUnit: unit,
      normalizedModelId: normalizedModelId !== slug ? normalizedModelId : undefined,
    });
  }

  return entries;
}

// ===========================================
// Public API
// ===========================================

/**
 * Fetch pricing data from Together AI's website.
 * Returns parsed price entries with normalized model IDs.
 */
export async function fetchTogetherAIWebPrices(): Promise<WebPriceEntry[]> {
  const response = await fetch('https://www.together.ai/pricing', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; 2Bot-PriceMonitor/1.0)',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Together AI pricing page: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  return parseWebPrices(html);
}

/**
 * Build a lookup map: normalizedModelId → WebPriceEntry
 * for fast matching against our models and API models.
 */
export function buildWebPriceLookup(entries: WebPriceEntry[]): Map<string, WebPriceEntry> {
  const map = new Map<string, WebPriceEntry>();
  for (const entry of entries) {
    const key = entry.normalizedModelId || entry.slug;
    map.set(key, entry);
  }
  return map;
}

/**
 * Build a reverse lookup: try to match an API model ID to a web price entry.
 * Uses the main lookup first (for known overrides), then tries fuzzy slug matching.
 *
 * Fuzzy matching: converts API model ID to a slug-like format and compares.
 * Example: "google/veo-3.0" → "google-veo-3-0" → matches web slug "google-veo-3-0"
 */
export function findWebPriceForModel(
  modelId: string,
  webLookup: Map<string, WebPriceEntry>,
  allWebEntries: WebPriceEntry[]
): WebPriceEntry | undefined {
  // 1. Direct lookup by normalized model ID (handles SLUG_OVERRIDES)
  const direct = webLookup.get(modelId);
  if (direct) return direct;

  // 2. Fuzzy: convert API model ID to slug-like format and search
  //    "google/veo-3.0" → "google-veo-3-0"
  //    "ByteDance-Seed/Seedream-4.0" → "bytedance-seed-seedream-4-0"
  const slugified = modelId
    .replace(/\//g, '-')       // slash → hyphen
    .replace(/\./g, '-')       // dots → hyphens
    .replace(/_/g, '-')        // underscores → hyphens
    .toLowerCase();

  for (const entry of allWebEntries) {
    if (entry.slug.toLowerCase() === slugified) {
      return entry;
    }
  }

  // 3. Partial match: check if slug is contained in slugified ID or vice versa
  //    Handles cases like "cartesia/sonic" → "cartesia-sonic"
  for (const entry of allWebEntries) {
    const entrySlug = entry.slug.toLowerCase();
    if (slugified.endsWith(entrySlug) || entrySlug.endsWith(slugified)) {
      return entry;
    }
  }

  return undefined;
}

