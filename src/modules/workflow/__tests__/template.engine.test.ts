import { describe, it, expect } from "vitest";
import {
  resolveTemplate,
  resolveInputMapping,
  evaluateCondition,
  buildTemplateContext,
} from "../template.engine";
import type { TemplateContext } from "../workflow.types";

// ---------------------------------------------------------------------------
// Helper: build a minimal TemplateContext for testing
// ---------------------------------------------------------------------------
function makeCtx(overrides: Partial<TemplateContext> = {}): TemplateContext {
  return {
    trigger: { message: { text: "hello", from: "user1", chat_id: "c123" } },
    prev: { output: "step0-output", error: undefined },
    steps: {
      0: { output: "step0-output", error: undefined },
      1: { output: { result: "computed", list: [1, 2, 3] }, error: undefined },
      3: { output: null, error: "timeout" }, // non-contiguous order
    },
    env: {},
    ctx: {
      userId: "u1",
      workflowId: "w1",
      runId: "r1",
      timestamp: new Date("2024-01-01"),
    },
    ...overrides,
  };
}

// ===========================================================================
// Bug 1 — bracket notation: {{steps[N].output}} must resolve correctly
// ===========================================================================
describe("Bug 1: bracket notation resolution", () => {
  const ctx = makeCtx();

  it("resolves {{steps[0].output}} via bracket notation", () => {
    expect(resolveTemplate("{{steps[0].output}}", ctx)).toBe("step0-output");
  });

  it("resolves {{steps[1].output.result}} nested bracket+dot", () => {
    expect(resolveTemplate("{{steps[1].output.result}}", ctx)).toBe("computed");
  });

  it("resolves dot notation equivalently: {{steps.0.output}}", () => {
    expect(resolveTemplate("{{steps.0.output}}", ctx)).toBe("step0-output");
  });

  it("resolves non-contiguous order: {{steps[3].error}}", () => {
    expect(resolveTemplate("{{steps[3].error}}", ctx)).toBe("timeout");
  });

  it("returns empty string for missing step order", () => {
    expect(resolveTemplate("{{steps[99].output}}", ctx)).toBe("");
  });
});

// ===========================================================================
// Bug 2 — `contains` operator in conditions
// ===========================================================================
describe("Bug 2: contains operator in conditions", () => {
  const ctx = makeCtx();

  it("contains returns true when substring is present", () => {
    expect(evaluateCondition("{{trigger.message.text}} contains 'hell'", ctx)).toBe(true);
  });

  it("contains returns false when substring is absent", () => {
    expect(evaluateCondition("{{trigger.message.text}} contains 'bye'", ctx)).toBe(false);
  });

  it("== still works correctly", () => {
    expect(evaluateCondition("{{trigger.message.text}} == 'hello'", ctx)).toBe(true);
    expect(evaluateCondition("{{trigger.message.text}} == 'nope'", ctx)).toBe(false);
  });

  it("!= still works correctly", () => {
    expect(evaluateCondition("{{trigger.message.text}} != 'nope'", ctx)).toBe(true);
    expect(evaluateCondition("{{trigger.message.text}} != 'hello'", ctx)).toBe(false);
  });

  it("truthy check works on a populated field", () => {
    expect(evaluateCondition("{{trigger.message.text}}", ctx)).toBe(true);
  });

  it("truthy check returns false for missing field", () => {
    expect(evaluateCondition("{{trigger.nonexistent}}", ctx)).toBe(false);
  });
});

// ===========================================================================
// Bug 3 — prev.output / prev.error resolution
// ===========================================================================
describe("Bug 3: prev.output and prev.error resolution", () => {
  it("resolves {{prev.output}} to previous step output", () => {
    const ctx = makeCtx();
    expect(resolveTemplate("{{prev.output}}", ctx)).toBe("step0-output");
  });

  it("resolves {{prev.error}} to undefined when no error", () => {
    const ctx = makeCtx();
    expect(resolveTemplate("{{prev.error}}", ctx)).toBe("");
  });

  it("resolves {{prev.error}} to the error string when present", () => {
    const ctx = makeCtx({ prev: { output: null, error: "failed" } as unknown });
    expect(resolveTemplate("{{prev.error}}", ctx)).toBe("failed");
  });

  it("resolves {{prev}} to the full { output, error } object", () => {
    const ctx = makeCtx();
    const result = resolveTemplate("{{prev}}", ctx);
    expect(result).toEqual({ output: "step0-output", error: undefined });
  });
});

// ===========================================================================
// Bug 4 — error data available in template context via buildTemplateContext
// ===========================================================================
describe("Bug 4: error data in template context", () => {
  it("includes output and error in steps map", () => {
    const ctx = buildTemplateContext(
      { message: "hi" },
      {
        0: { output: "ok", error: undefined },
        1: { output: null, error: "failed" },
      },
      2, // currentStepOrder
      { userId: "u1", workflowId: "w1", runId: "r1" }
    );

    // steps[0] should have both output and error
    expect(ctx.steps[0]).toEqual({ output: "ok", error: undefined });
    expect(ctx.steps[1]).toEqual({ output: null, error: "failed" });
  });

  it("prev includes error when previous step failed", () => {
    const ctx = buildTemplateContext(
      {},
      { 0: { output: null, error: "boom" } },
      1,
      { userId: "u1", workflowId: "w1", runId: "r1" }
    );

    expect(ctx.prev).toEqual({ output: null, error: "boom" });
  });

  it("resolves {{steps[1].error}} through full pipeline", () => {
    const ctx = buildTemplateContext(
      {},
      {
        0: { output: "fine" },
        1: { output: null, error: "kaboom" },
      },
      2,
      { userId: "u1", workflowId: "w1", runId: "r1" }
    );

    expect(resolveTemplate("{{steps[1].error}}", ctx)).toBe("kaboom");
    expect(resolveTemplate("{{steps[0].output}}", ctx)).toBe("fine");
  });
});

// ===========================================================================
// Bug 5 — step order consistency (template context keyed by order)
// ===========================================================================
describe("Bug 5: step order-based keying", () => {
  it("non-contiguous step orders are preserved in context", () => {
    const ctx = buildTemplateContext(
      {},
      {
        0: { output: "a" },
        2: { output: "b" },  // step order 1 was skipped/deleted
        5: { output: "c" },
      },
      6,
      { userId: "u1", workflowId: "w1", runId: "r1" }
    );

    expect(resolveTemplate("{{steps[0].output}}", ctx)).toBe("a");
    expect(resolveTemplate("{{steps[2].output}}", ctx)).toBe("b");
    expect(resolveTemplate("{{steps[5].output}}", ctx)).toBe("c");
    expect(resolveTemplate("{{steps[1].output}}", ctx)).toBe(""); // missing
  });
});

// ===========================================================================
// resolveInputMapping
// ===========================================================================
describe("resolveInputMapping", () => {
  it("resolves multiple keys in a mapping", () => {
    const ctx = makeCtx();
    const result = resolveInputMapping(
      {
        text: "{{trigger.message.text}}",
        prevOut: "{{prev.output}}",
        combined: "msg: {{trigger.message.text}}, out: {{steps[0].output}}",
      },
      ctx
    );

    expect(result.text).toBe("hello");
    expect(result.prevOut).toBe("step0-output");
    expect(result.combined).toBe("msg: hello, out: step0-output");
  });
});

// ===========================================================================
// Edge cases
// ===========================================================================
describe("Edge cases", () => {
  it("returns raw object for single-expression template", () => {
    const ctx = makeCtx();
    const result = resolveTemplate("{{steps[1].output}}", ctx);
    expect(result).toEqual({ result: "computed", list: [1, 2, 3] });
  });

  it("stringifies objects in mixed templates", () => {
    const ctx = makeCtx();
    const result = resolveTemplate("data: {{steps[1].output}}", ctx);
    expect(typeof result).toBe("string");
  });

  it("handles empty template", () => {
    const ctx = makeCtx();
    expect(resolveTemplate("", ctx)).toBe("");
  });

  it("handles no-expression text", () => {
    const ctx = makeCtx();
    expect(resolveTemplate("plain text", ctx)).toBe("plain text");
  });
});
