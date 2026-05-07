/**
 * `streamLLMCallWithDeltas` tests — F-7 streaming aggregation.
 *
 * The helper wraps `twoBotAIProvider.textGenerationStream` so the agent
 * loop can:
 *   - forward each text delta to the SSE stream as it arrives, AND
 *   - assemble Anthropic-style `toolUse` deltas (id+name on first chunk,
 *     argumentsDelta JSON on each subsequent input_json_delta) into a
 *     fully-formed `ToolCallResult[]` on the returned response.
 *
 * Tests stub the provider with a hand-rolled async generator so the
 * aggregation logic is exercised without any network or LLM cost.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const textGenerationStreamMock = vi.fn();

vi.mock("@/modules/2bot-ai-provider", () => ({
  twoBotAIProvider: {
    textGenerationStream: (...args: unknown[]) => textGenerationStreamMock(...args),
  },
  canResolveTwoBotAIModel: () => true,
}));

import { __testables } from "../cursor-worker-runner";

const { streamLLMCallWithDeltas } = __testables;

interface ToolUseDelta {
  index: number;
  id?: string;
  name?: string;
  argumentsDelta?: string;
}
interface Chunk {
  id: string;
  delta: string;
  finishReason: "stop" | "length" | "content_filter" | "tool_use" | null;
  toolUse?: ToolUseDelta;
}

function makeProviderGenerator(
  chunks: Chunk[],
  finalResponse: Record<string, unknown>,
): AsyncGenerator<Chunk, Record<string, unknown>> {
  async function* gen(): AsyncGenerator<Chunk, Record<string, unknown>> {
    for (const c of chunks) {
      yield c;
    }
    return finalResponse;
  }
  return gen();
}

const baseRequest = {
  messages: [{ role: "user" as const, content: "hi" }],
  model: "2bot-ai-code-lite",
  userId: "u1",
} as const;

const baseFinalResponse = {
  id: "resp_1",
  model: "2bot-ai-code-lite",
  content: "",
  finishReason: "stop" as const,
  usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
  creditsUsed: 1.5,
  newBalance: 100,
};

describe("streamLLMCallWithDeltas", () => {
  beforeEach(() => {
    textGenerationStreamMock.mockReset();
  });

  it("yields one delta event per text chunk", async () => {
    textGenerationStreamMock.mockReturnValueOnce(
      makeProviderGenerator(
        [
          { id: "1", delta: "Hello ", finishReason: null },
          { id: "1", delta: "world", finishReason: null },
          { id: "1", delta: "!", finishReason: "stop" },
        ],
        { ...baseFinalResponse, content: "Hello world!" },
      ),
    );

    const stream = streamLLMCallWithDeltas(baseRequest as unknown as Parameters<typeof streamLLMCallWithDeltas>[0]);
    const deltas: string[] = [];
    let result: IteratorResult<{ kind: "delta"; text: string }, unknown> | undefined;
    while (!(result = await stream.next()).done) {
      const v = result.value as { kind: "delta"; text: string };
      deltas.push(v.text);
    }
    expect(deltas).toEqual(["Hello ", "world", "!"]);
    const final = result.value as { content: string; toolCalls?: unknown };
    expect(final.content).toBe("Hello world!");
    expect(final.toolCalls).toBeUndefined();
  });

  it("does not yield a delta for empty-text chunks", async () => {
    textGenerationStreamMock.mockReturnValueOnce(
      makeProviderGenerator(
        [
          { id: "1", delta: "", finishReason: null },
          { id: "1", delta: "Hi", finishReason: "stop" },
        ],
        { ...baseFinalResponse, content: "Hi" },
      ),
    );
    const stream = streamLLMCallWithDeltas(baseRequest as unknown as Parameters<typeof streamLLMCallWithDeltas>[0]);
    const deltas: string[] = [];
    let result: IteratorResult<{ kind: "delta"; text: string }, unknown> | undefined;
    while (!(result = await stream.next()).done) {
      deltas.push((result.value as { text: string }).text);
    }
    expect(deltas).toEqual(["Hi"]);
  });

  it("aggregates a single tool call from incremental deltas", async () => {
    textGenerationStreamMock.mockReturnValueOnce(
      makeProviderGenerator(
        [
          // tool_use start: id + name only
          {
            id: "1",
            delta: "",
            finishReason: null,
            toolUse: { index: 0, id: "tu_1", name: "read_file" },
          },
          // input_json_delta in fragments — JSON parses cleanly when concatenated
          { id: "1", delta: "", finishReason: null, toolUse: { index: 0, argumentsDelta: '{"path"' } },
          { id: "1", delta: "", finishReason: null, toolUse: { index: 0, argumentsDelta: ':"src/' } },
          { id: "1", delta: "", finishReason: null, toolUse: { index: 0, argumentsDelta: 'index.ts"}' } },
          { id: "1", delta: "", finishReason: "tool_use" },
        ],
        { ...baseFinalResponse, finishReason: "tool_use" as const },
      ),
    );

    const stream = streamLLMCallWithDeltas(baseRequest as unknown as Parameters<typeof streamLLMCallWithDeltas>[0]);
    let result: IteratorResult<{ kind: "delta"; text: string }, unknown> | undefined;
    while (!(result = await stream.next()).done) { /* drain */ }
    const final = result.value as { toolCalls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }> };
    expect(final.toolCalls).toHaveLength(1);
    expect(final.toolCalls?.[0]).toEqual({
      id: "tu_1",
      name: "read_file",
      arguments: { path: "src/index.ts" },
    });
  });

  it("aggregates multiple parallel tool calls in stream order", async () => {
    textGenerationStreamMock.mockReturnValueOnce(
      makeProviderGenerator(
        [
          {
            id: "1", delta: "", finishReason: null,
            toolUse: { index: 0, id: "tu_a", name: "list_files" },
          },
          { id: "1", delta: "", finishReason: null, toolUse: { index: 0, argumentsDelta: '{"dir":"src"}' } },
          {
            id: "1", delta: "", finishReason: null,
            toolUse: { index: 1, id: "tu_b", name: "read_file" },
          },
          { id: "1", delta: "", finishReason: null, toolUse: { index: 1, argumentsDelta: '{"path":"a.ts"}' } },
          { id: "1", delta: "", finishReason: "tool_use" },
        ],
        { ...baseFinalResponse, finishReason: "tool_use" as const },
      ),
    );

    const stream = streamLLMCallWithDeltas(baseRequest as unknown as Parameters<typeof streamLLMCallWithDeltas>[0]);
    let result: IteratorResult<{ kind: "delta"; text: string }, unknown> | undefined;
    while (!(result = await stream.next()).done) { /* drain */ }
    const final = result.value as { toolCalls?: Array<{ id: string; name: string }> };
    expect(final.toolCalls).toHaveLength(2);
    expect(final.toolCalls?.[0]).toMatchObject({ id: "tu_a", name: "list_files" });
    expect(final.toolCalls?.[1]).toMatchObject({ id: "tu_b", name: "read_file" });
  });

  it("falls back to empty args when partial JSON fails to parse", async () => {
    // Provider sends malformed argumentsDelta — the helper must not throw,
    // and should surface empty args so the tool fails downstream with a
    // clear message rather than crashing the agent loop.
    textGenerationStreamMock.mockReturnValueOnce(
      makeProviderGenerator(
        [
          { id: "1", delta: "", finishReason: null, toolUse: { index: 0, id: "tu", name: "read_file" } },
          { id: "1", delta: "", finishReason: null, toolUse: { index: 0, argumentsDelta: '{"path":' } },
          { id: "1", delta: "", finishReason: "tool_use" },
        ],
        { ...baseFinalResponse, finishReason: "tool_use" as const },
      ),
    );

    const stream = streamLLMCallWithDeltas(baseRequest as unknown as Parameters<typeof streamLLMCallWithDeltas>[0]);
    let result: IteratorResult<{ kind: "delta"; text: string }, unknown> | undefined;
    while (!(result = await stream.next()).done) { /* drain */ }
    const final = result.value as { toolCalls?: Array<{ arguments: Record<string, unknown> }> };
    expect(final.toolCalls).toHaveLength(1);
    expect(final.toolCalls?.[0]?.arguments).toEqual({});
  });

  it("drops tool-use entries that never receive a name (incomplete chunks)", async () => {
    // Provider sent argumentsDelta but never the start chunk with id/name
    // — should be silently filtered rather than producing a malformed call.
    textGenerationStreamMock.mockReturnValueOnce(
      makeProviderGenerator(
        [
          { id: "1", delta: "", finishReason: null, toolUse: { index: 0, argumentsDelta: '{"x":1}' } },
          { id: "1", delta: "", finishReason: "tool_use" },
        ],
        { ...baseFinalResponse, finishReason: "tool_use" as const },
      ),
    );

    const stream = streamLLMCallWithDeltas(baseRequest as unknown as Parameters<typeof streamLLMCallWithDeltas>[0]);
    let result: IteratorResult<{ kind: "delta"; text: string }, unknown> | undefined;
    while (!(result = await stream.next()).done) { /* drain */ }
    const final = result.value as { toolCalls?: Array<unknown> };
    expect(final.toolCalls).toBeUndefined();
  });

  it("preserves the provider's final response fields (usage, model, credits)", async () => {
    textGenerationStreamMock.mockReturnValueOnce(
      makeProviderGenerator(
        [{ id: "1", delta: "ok", finishReason: "stop" }],
        { ...baseFinalResponse, content: "ok", model: "claude-sonnet-4-6" },
      ),
    );
    const stream = streamLLMCallWithDeltas(baseRequest as unknown as Parameters<typeof streamLLMCallWithDeltas>[0]);
    let result: IteratorResult<{ kind: "delta"; text: string }, unknown> | undefined;
    while (!(result = await stream.next()).done) { /* drain */ }
    const final = result.value as { model: string; usage: { inputTokens: number }; creditsUsed: number };
    expect(final.model).toBe("claude-sonnet-4-6");
    expect(final.usage.inputTokens).toBe(100);
    expect(final.creditsUsed).toBe(1.5);
  });
});
