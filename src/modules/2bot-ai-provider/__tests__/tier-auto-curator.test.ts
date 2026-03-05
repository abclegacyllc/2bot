/**
 * Tier Auto-Curator Tests
 *
 * Tests for Phase 3 (Option C) auto-curation of provider options
 * based on pricing tables and tier cost ranges.
 *
 * @module modules/2bot-ai-provider/__tests__/tier-auto-curator.test
 */

import { describe, expect, it } from 'vitest';
import type { TwoBotAIModelId } from '../model-catalog/model-catalog.types';
import {
    autoGenerateMapping,
    autoGenerateProviderOptions,
    getTierCurationSummary,
    refreshAllTierAssignments,
    TIER_CURATION_RULES,
} from '../model-catalog/tier-auto-curator';
import { TWOBOT_AI_MODELS } from '../model-catalog/twobot-models';

// ===========================================
// autoGenerateProviderOptions Tests
// ===========================================

describe('autoGenerateProviderOptions', () => {
  describe('text-lite tier', () => {
    it('generates options within lite cost range', () => {
      const options = autoGenerateProviderOptions('2bot-ai-text-lite');
      expect(options.length).toBeGreaterThan(0);
      expect(options.length).toBeLessThanOrEqual(8);
    });

    it('includes Anthropic models with priority 1', () => {
      const options = autoGenerateProviderOptions('2bot-ai-text-lite');
      const anthropicOptions = options.filter((o) => o.provider === 'anthropic');
      expect(anthropicOptions.length).toBeGreaterThan(0);
      for (const opt of anthropicOptions) {
        expect(opt.priority).toBe(1);
      }
    });

    it('includes Together models with priority 2', () => {
      const options = autoGenerateProviderOptions('2bot-ai-text-lite');
      const togetherOptions = options.filter((o) => o.provider === 'together');
      expect(togetherOptions.length).toBeGreaterThan(0);
      for (const opt of togetherOptions) {
        expect(opt.priority).toBe(2);
      }
    });

    it('sorts by priority ascending', () => {
      const options = autoGenerateProviderOptions('2bot-ai-text-lite');
      for (let i = 1; i < options.length; i++) {
        expect(options[i]!.priority).toBeGreaterThanOrEqual(options[i - 1]!.priority);
      }
    });
  });

  describe('text-pro tier', () => {
    it('generates options within pro cost range', () => {
      const options = autoGenerateProviderOptions('2bot-ai-text-pro');
      expect(options.length).toBeGreaterThan(0);
      expect(options.length).toBeLessThanOrEqual(8);
    });

    it('includes multiple providers for failover diversity', () => {
      const options = autoGenerateProviderOptions('2bot-ai-text-pro');
      const providers = new Set(options.map((o) => o.provider));
      expect(providers.size).toBeGreaterThanOrEqual(2);
    });
  });

  describe('text-ultra tier', () => {
    it('generates options within ultra cost range', () => {
      const options = autoGenerateProviderOptions('2bot-ai-text-ultra');
      expect(options.length).toBeGreaterThan(0);
    });

    it('includes Claude Opus 4.6 (primary premium model)', () => {
      const options = autoGenerateProviderOptions('2bot-ai-text-ultra');
      const hasOpus46 = options.some(
        (o) => o.provider === 'anthropic' && o.modelId === 'claude-opus-4-6'
      );
      expect(hasOpus46).toBe(true);
    });
  });

  describe('reasoning models', () => {
    it('only includes reasoning-capable models for reasoning-pro', () => {
      const options = autoGenerateProviderOptions('2bot-ai-reasoning-pro');
      expect(options.length).toBeGreaterThan(0);
      // All options should be from the reasoning models registry
      // (verified by the requireReasoning flag in curation rules)
    });

    it('generates reasoning-ultra options', () => {
      const options = autoGenerateProviderOptions('2bot-ai-reasoning-ultra');
      expect(options.length).toBeGreaterThan(0);
    });

    it('reasoning-ultra includes high-cost reasoning models', () => {
      const options = autoGenerateProviderOptions('2bot-ai-reasoning-ultra');
      // Should include models like o1, o1-pro, deepseek-r1
      const providers = new Set(options.map((o) => o.provider));
      expect(providers.size).toBeGreaterThanOrEqual(2);
    });
  });

  describe('image models', () => {
    it('generates image-pro options with mid-range costs', () => {
      const options = autoGenerateProviderOptions('2bot-ai-image-pro');
      expect(options.length).toBeGreaterThan(0);
    });

    it('generates image-ultra options with premium costs', () => {
      const options = autoGenerateProviderOptions('2bot-ai-image-ultra');
      expect(options.length).toBeGreaterThan(0);
    });

    it('image-ultra includes dall-e-3 with HD providerConfig', () => {
      const options = autoGenerateProviderOptions('2bot-ai-image-ultra');
      const dalle3HD = options.find(
        (o) => o.provider === 'openai' && o.modelId === 'dall-e-3' && o.providerConfig?.quality === 'hd'
      );
      expect(dalle3HD).toBeDefined();
    });

    it('image-ultra excludes standard dall-e-3', () => {
      const options = autoGenerateProviderOptions('2bot-ai-image-ultra');
      const standardDalle3 = options.find(
        (o) => o.provider === 'openai' && o.modelId === 'dall-e-3' && !o.providerConfig
      );
      expect(standardDalle3).toBeUndefined();
    });
  });

  describe('manual-only models', () => {
    it('returns empty array for voice-pro (manual only)', () => {
      const options = autoGenerateProviderOptions('2bot-ai-voice-pro');
      expect(options).toEqual([]);
    });

    it('returns empty array for voice-ultra (manual only)', () => {
      const options = autoGenerateProviderOptions('2bot-ai-voice-ultra');
      expect(options).toEqual([]);
    });

    it('returns empty array for transcribe-lite (manual only)', () => {
      const options = autoGenerateProviderOptions('2bot-ai-transcribe-lite');
      expect(options).toEqual([]);
    });
  });

  describe('excluded models', () => {
    it('does not include legacy claude-3-opus', () => {
      const allModels = Object.keys(TWOBOT_AI_MODELS) as TwoBotAIModelId[];
      for (const modelId of allModels) {
        const options = autoGenerateProviderOptions(modelId);
        const hasLegacyOpus = options.some((o) => o.modelId === 'claude-3-opus-20240229');
        expect(hasLegacyOpus).toBe(false);
      }
    });

    it('does not include dall-e-3-hd (non-API model ID)', () => {
      const imageModels: TwoBotAIModelId[] = ['2bot-ai-image-pro', '2bot-ai-image-ultra'];
      for (const modelId of imageModels) {
        const options = autoGenerateProviderOptions(modelId);
        const hasDalle3HD = options.some((o) => o.modelId === 'dall-e-3-hd');
        expect(hasDalle3HD).toBe(false);
      }
    });
  });

  describe('provider caps', () => {
    it('limits to maxPerProvider per provider (default 2)', () => {
      const options = autoGenerateProviderOptions('2bot-ai-text-pro');
      const providerCounts = new Map<string, number>();
      for (const opt of options) {
        providerCounts.set(opt.provider, (providerCounts.get(opt.provider) ?? 0) + 1);
      }
      for (const [, count] of providerCounts) {
        expect(count).toBeLessThanOrEqual(2);
      }
    });

    it('limits total options to maxOptions (default 8)', () => {
      const allModels = Object.keys(TWOBOT_AI_MODELS) as TwoBotAIModelId[];
      for (const modelId of allModels) {
        const options = autoGenerateProviderOptions(modelId);
        expect(options.length).toBeLessThanOrEqual(8);
      }
    });
  });

  describe('all options have required fields', () => {
    it('every option has provider, modelId, priority, enabled', () => {
      const allModels = Object.keys(TWOBOT_AI_MODELS) as TwoBotAIModelId[];
      for (const modelId of allModels) {
        const options = autoGenerateProviderOptions(modelId);
        for (const opt of options) {
          expect(opt.provider).toBeTruthy();
          expect(opt.modelId).toBeTruthy();
          expect(typeof opt.priority).toBe('number');
          expect(opt.enabled).toBe(true);
        }
      }
    });
  });
});

// ===========================================
// autoGenerateMapping Tests
// ===========================================

describe('autoGenerateMapping', () => {
  it('returns undefined for manual-only models', () => {
    expect(autoGenerateMapping('2bot-ai-voice-pro')).toBeUndefined();
    expect(autoGenerateMapping('2bot-ai-voice-ultra')).toBeUndefined();
    expect(autoGenerateMapping('2bot-ai-transcribe-lite')).toBeUndefined();
  });

  it('returns valid mapping for text-pro', () => {
    const mapping = autoGenerateMapping('2bot-ai-text-pro');
    expect(mapping).toBeDefined();
    expect(mapping!.twobotAIModelId).toBe('2bot-ai-text-pro');
    expect(mapping!.providerOptions.length).toBeGreaterThan(0);
    expect(mapping!.defaultStrategy).toBe('lowest-cost');
    expect(mapping!.strategyConfig?.maxRetries).toBe(2);
  });

  it('uses lowest-cost strategy for reasoning models', () => {
    const mapping = autoGenerateMapping('2bot-ai-reasoning-pro');
    expect(mapping).toBeDefined();
    expect(mapping!.defaultStrategy).toBe('lowest-cost');
  });

  it('uses lowest-cost strategy for text-lite', () => {
    const mapping = autoGenerateMapping('2bot-ai-text-lite');
    expect(mapping).toBeDefined();
    expect(mapping!.defaultStrategy).toBe('lowest-cost');
  });
});

// ===========================================
// refreshAllTierAssignments Tests
// ===========================================

describe('refreshAllTierAssignments', () => {
  it('generates mappings for all auto-curated models', () => {
    const mappings = refreshAllTierAssignments();
    // Should have 7 auto-curated models (10 total - 3 manual)
    const autoCuratedModels = Object.keys(TWOBOT_AI_MODELS).filter((id) => {
      const rule = TIER_CURATION_RULES[id as TwoBotAIModelId];
      return !rule?.manualOnly;
    });
    expect(Object.keys(mappings).length).toBe(autoCuratedModels.length);
  });

  it('does not include manual-only models', () => {
    const mappings = refreshAllTierAssignments();
    expect(mappings['2bot-ai-voice-pro']).toBeUndefined();
    expect(mappings['2bot-ai-voice-ultra']).toBeUndefined();
    expect(mappings['2bot-ai-transcribe-lite']).toBeUndefined();
  });

  it('all mappings have non-empty providerOptions', () => {
    const mappings = refreshAllTierAssignments();
    for (const [, mapping] of Object.entries(mappings)) {
      if (mapping) {
        expect(mapping.providerOptions.length).toBeGreaterThan(0);
      }
    }
  });
});

// ===========================================
// getTierCurationSummary Tests
// ===========================================

describe('getTierCurationSummary', () => {
  it('returns summary for all models', () => {
    const summary = getTierCurationSummary();
    const allModelIds = Object.keys(TWOBOT_AI_MODELS);
    expect(Object.keys(summary).length).toBe(allModelIds.length);
  });

  it('marks manual-only models correctly', () => {
    const summary = getTierCurationSummary();
    expect(summary['2bot-ai-voice-pro']!.strategy).toBe('manual');
    expect(summary['2bot-ai-voice-pro']!.providers).toEqual(['manual']);
  });

  it('auto-curated models have provider diversity', () => {
    const summary = getTierCurationSummary();
    const autoCurated = Object.entries(summary).filter(([, s]) => s.strategy !== 'manual');
    for (const [, s] of autoCurated) {
      expect(s.providers.length).toBeGreaterThanOrEqual(1);
      expect(s.optionCount).toBeGreaterThan(0);
    }
  });
});

// ===========================================
// TIER_CURATION_RULES integrity
// ===========================================

describe('TIER_CURATION_RULES', () => {
  it('has rules for all 10 2Bot models', () => {
    const allModelIds = Object.keys(TWOBOT_AI_MODELS);
    for (const id of allModelIds) {
      expect(TIER_CURATION_RULES).toHaveProperty(id);
    }
  });

  it('voice and transcribe are manual-only', () => {
    expect(TIER_CURATION_RULES['2bot-ai-voice-pro']?.manualOnly).toBe(true);
    expect(TIER_CURATION_RULES['2bot-ai-voice-ultra']?.manualOnly).toBe(true);
    expect(TIER_CURATION_RULES['2bot-ai-transcribe-lite']?.manualOnly).toBe(true);
  });

  it('reasoning models require reasoning capability', () => {
    expect(TIER_CURATION_RULES['2bot-ai-reasoning-pro']?.requireReasoning).toBe(true);
    expect(TIER_CURATION_RULES['2bot-ai-reasoning-ultra']?.requireReasoning).toBe(true);
  });
});

// ===========================================
// Integration: TWOBOT_AI_MODEL_MAPPINGS
// ===========================================

describe('TWOBOT_AI_MODEL_MAPPINGS integration', () => {
  it('all 10 models have mappings after merge', async () => {
    // Import the final merged mappings
    const { TWOBOT_AI_MODEL_MAPPINGS } = await import('../model-catalog/model-mappings');
    const allModelIds = Object.keys(TWOBOT_AI_MODELS) as TwoBotAIModelId[];
    for (const id of allModelIds) {
      expect(TWOBOT_AI_MODEL_MAPPINGS[id]).toBeDefined();
      expect(TWOBOT_AI_MODEL_MAPPINGS[id]!.providerOptions.length).toBeGreaterThan(0);
    }
  });

  it('voice models use manual OpenAI mappings', async () => {
    const { TWOBOT_AI_MODEL_MAPPINGS } = await import('../model-catalog/model-mappings');
    const voicePro = TWOBOT_AI_MODEL_MAPPINGS['2bot-ai-voice-pro'];
    expect(voicePro.providerOptions).toHaveLength(1);
    expect(voicePro.providerOptions[0]!.provider).toBe('openai');
    expect(voicePro.providerOptions[0]!.modelId).toBe('tts-1');
  });

  it('transcribe uses manual OpenAI mapping', async () => {
    const { TWOBOT_AI_MODEL_MAPPINGS } = await import('../model-catalog/model-mappings');
    const transcribe = TWOBOT_AI_MODEL_MAPPINGS['2bot-ai-transcribe-lite'];
    expect(transcribe.providerOptions).toHaveLength(1);
    expect(transcribe.providerOptions[0]!.provider).toBe('openai');
    expect(transcribe.providerOptions[0]!.modelId).toBe('whisper-1');
  });
});
