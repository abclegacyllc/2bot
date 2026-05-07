/**
 * Cache-marker layout tests for the Anthropic adapter.
 *
 * Verifies the F-1 + F-4 token-efficiency wins:
 *   - Tool-array gets a `cache_control` marker on its LAST entry when the
 *     total tool payload is large enough (else the marker is omitted to
 *     avoid the per-request overhead).
 *   - Conversation tail gets a marker on its LAST content block when the
 *     total conversation content is large enough.
 *   - System block gets cache_control when the prompt is long.
 *
 * The behaviour matters because Anthropic caches the prefix UP TO and
 * INCLUDING the most recent marker. Wrong layout = no cache hit on
 * subsequent iterations = full input price.
 */

import { describe, expect, it } from "vitest";

import { __testables } from "../adapters/anthropic.adapter";

const { formatToolsForAnthropic, applyConversationCacheMarker, formatSystemForAnthropic } =
  __testables;

describe("formatToolsForAnthropic — F-1 cache marker", () => {
  it("returns no entries unchanged when tools array is empty", () => {
    expect(formatToolsForAnthropic([])).toEqual([]);
  });

  it("attaches cache_control to the LAST tool when payload is large", () => {
    // Two tools with descriptions long enough to clear the
    // CACHE_MIN_TOOLS_LENGTH (1500 char) gate.
    const tools = [
      {
        name: "search_files",
        description: "x".repeat(800),
        parameters: { type: "object" as const, properties: {} },
      },
      {
        name: "read_file",
        description: "y".repeat(800),
        parameters: { type: "object" as const, properties: {} },
      },
    ];
    const out = formatToolsForAnthropic(tools);
    expect(out).toHaveLength(2);
    expect((out[0] as unknown as Record<string, unknown>).cache_control).toBeUndefined();
    // Only the last tool carries the marker — Anthropic caches up to it.
    expect((out[1] as unknown as Record<string, unknown>).cache_control).toEqual({ type: "ephemeral" });
  });

  it("does NOT attach cache_control when total tool payload is small", () => {
    // Single tiny tool — under the threshold, caching overhead not worth it.
    const tools = [
      {
        name: "ping",
        description: "ping",
        parameters: { type: "object" as const, properties: {} },
      },
    ];
    const out = formatToolsForAnthropic(tools);
    expect(out).toHaveLength(1);
    expect((out[0] as unknown as Record<string, unknown>).cache_control).toBeUndefined();
  });

  it("only marks the LAST tool, even with many tools", () => {
    const tools = Array.from({ length: 5 }, (_, i) => ({
      name: `tool_${i}`,
      description: "z".repeat(400),
      parameters: { type: "object" as const, properties: {} },
    }));
    const out = formatToolsForAnthropic(tools);
    expect(out).toHaveLength(5);
    for (let i = 0; i < 4; i++) {
      expect((out[i] as unknown as Record<string, unknown>).cache_control).toBeUndefined();
    }
    expect((out[4] as unknown as Record<string, unknown>).cache_control).toEqual({ type: "ephemeral" });
  });

  it("does not mutate the caller's tool definitions", () => {
    const tools = [
      {
        name: "search_files",
        description: "x".repeat(800),
        parameters: { type: "object" as const, properties: {} },
      },
      {
        name: "read_file",
        description: "y".repeat(800),
        parameters: { type: "object" as const, properties: {} },
      },
    ];
    formatToolsForAnthropic(tools);
    // Original objects must remain unchanged so callers can reuse them.
    expect(tools[0]).not.toHaveProperty("cache_control");
    expect(tools[1]).not.toHaveProperty("cache_control");
  });
});

describe("applyConversationCacheMarker — F-4 conversation tail marker", () => {
  it("returns messages unchanged when below the size threshold", () => {
    const msgs = [
      { role: "user" as const, content: "hi" },
      { role: "assistant" as const, content: "hello" },
    ];
    const out = applyConversationCacheMarker(msgs);
    expect(out).toBe(msgs); // identity — no clone needed under threshold
  });

  it("returns empty arr unchanged", () => {
    expect(applyConversationCacheMarker([])).toEqual([]);
  });

  it("converts string content to a marked text block when over threshold", () => {
    const longText = "x".repeat(2500);
    const msgs = [{ role: "user" as const, content: longText }];
    const out = applyConversationCacheMarker(msgs);
    expect(out[0]?.role).toBe("user");
    expect(Array.isArray(out[0]?.content)).toBe(true);
    const blocks = (out[0]?.content as unknown) as Array<Record<string, unknown>>;
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      type: "text",
      text: longText,
      cache_control: { type: "ephemeral" },
    });
  });

  it("attaches the marker to the LAST block of the LAST message", () => {
    const longA = "a".repeat(800);
    const longB = "b".repeat(1500);
    const msgs = [
      { role: "user" as const, content: longA },
      {
        role: "assistant" as const,
        content: [
          { type: "text" as const, text: "intro" },
          { type: "text" as const, text: longB },
        ],
      },
    ];
    const out = applyConversationCacheMarker(msgs);
    // First message untouched.
    expect(out[0]).toBe(msgs[0]);
    // Last message: last block carries the marker; earlier blocks don't.
    const lastBlocks = (out[1]?.content as unknown) as Array<Record<string, unknown>>;
    expect(lastBlocks).toHaveLength(2);
    expect(lastBlocks[0]).not.toHaveProperty("cache_control");
    expect(lastBlocks[1]).toMatchObject({ cache_control: { type: "ephemeral" } });
  });

  it("does not mutate the caller's message array", () => {
    const longText = "z".repeat(2500);
    const msgs = [{ role: "user" as const, content: longText }];
    const before = msgs[0]?.content;
    applyConversationCacheMarker(msgs);
    expect(msgs[0]?.content).toBe(before);
  });

  it("handles a last message with empty string content (no marker)", () => {
    // Earlier large message + a trailing empty user turn — last has nothing
    // to mark, so we leave the array unchanged rather than producing an
    // empty-text block with cache_control.
    const msgs = [
      { role: "user" as const, content: "x".repeat(2500) },
      { role: "user" as const, content: "" },
    ];
    const out = applyConversationCacheMarker(msgs);
    expect(out[1]?.content).toBe("");
  });
});

describe("formatSystemForAnthropic", () => {
  it("returns undefined for missing content", () => {
    expect(formatSystemForAnthropic(undefined)).toBeUndefined();
  });

  it("returns plain string for short prompts (no caching overhead)", () => {
    expect(formatSystemForAnthropic("short")).toBe("short");
  });

  it("returns a cache-marked text block for long prompts", () => {
    const long = "y".repeat(1500);
    const out = formatSystemForAnthropic(long);
    expect(Array.isArray(out)).toBe(true);
    const blocks = (out as unknown) as Array<Record<string, unknown>>;
    expect(blocks[0]).toMatchObject({
      type: "text",
      text: long,
      cache_control: { type: "ephemeral" },
    });
  });
});
