/**
 * Cost Context tests (Phase 6.5)
 *
 * @module __tests__/cost-context
 */

import { describe, expect, it } from "vitest";

import { estimateCost } from "@/lib/cost-context";
import { MARGIN } from "@/modules/2bot-ai-provider/model-registry";

describe("estimateCost — text", () => {
  it("returns USD + credits for gpt-4o-mini with input+output tokens", () => {
    const r = estimateCost({
      kind: "text",
      modelId: "gpt-4o-mini",
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      // gpt-4o-mini: $0.15 in + $0.60 out per 1M
      expect(r.usd).toBeCloseTo(0.75, 6);
      expect(r.credits).toBeCloseTo(0.75 * MARGIN, 4);
      expect(r.provider).toBe("openai");
      expect(r.modelId).toBe("gpt-4o-mini");
      expect(r.breakdown.inputTokensUsd).toBeCloseTo(0.15, 6);
      expect(r.breakdown.outputTokensUsd).toBeCloseTo(0.6, 6);
    }
  });

  it("handles 0 tokens cleanly", () => {
    const r = estimateCost({
      kind: "text",
      modelId: "gpt-4o-mini",
      inputTokens: 0,
      outputTokens: 0,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.usd).toBe(0);
      expect(r.credits).toBe(0);
    }
  });

  it("clamps negative tokens to 0", () => {
    const r = estimateCost({
      kind: "text",
      modelId: "gpt-4o-mini",
      inputTokens: -100,
      outputTokens: -100,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.usd).toBe(0);
    }
  });
});

describe("estimateCost — error paths", () => {
  it("rejects unknown model", () => {
    const r = estimateCost({ kind: "text", modelId: "nope-9000", inputTokens: 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/unknown model/i);
  });

  it("rejects when wrong pricing kind is requested", () => {
    // gpt-4o-mini has per-token pricing, not per-image.
    const r = estimateCost({
      kind: "image",
      modelId: "gpt-4o-mini",
      imageCount: 1,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/per-image/i);
  });
});

describe("estimateCost — provider preference", () => {
  it("uses requested provider when available", () => {
    const r = estimateCost({
      kind: "text",
      modelId: "gpt-4o",
      provider: "openai",
      inputTokens: 1_000_000,
      outputTokens: 0,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.provider).toBe("openai");
      expect(r.usd).toBeCloseTo(2.5, 6);
    }
  });
});
