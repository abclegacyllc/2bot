/**
 * compactStaleToolResults — F-6 token-efficiency tests.
 *
 * The function trims any tool-result message older than the most recent
 * assistant turn when its content is above STALE_TOOL_RESULT_THRESHOLD,
 * keeping only the head + a deterministic footer marker. Tests verify:
 *
 *   1. tool results above the threshold are trimmed (head preserved)
 *   2. tool results below the threshold are left intact
 *   3. the most-recent exchange (after the last assistant turn) is NOT
 *      touched — that's the active context the LLM is reasoning over
 *   4. non-tool-result user messages (the original prompt, ask_user
 *      answers, corrections) are skipped — they're not bulk dump output
 *   5. the function is idempotent — running it twice produces the same
 *      result, so the runner can call it every iteration without
 *      re-walking already-trimmed messages
 */

import { describe, expect, it } from "vitest";

import { __testables } from "../cursor-worker-runner";

const { compactStaleToolResults } = __testables;

const TRIMMER_FOOTER = "[content trimmed — already processed in earlier steps]";
const HEAD_CHARS = 400;

function bigToolResult(toolName: string, sizeChars: number): string {
  const header = `[✅ TOOL RESULT: ${toolName}]\n`;
  const body = "x".repeat(Math.max(0, sizeChars - header.length));
  return header + body;
}

describe("compactStaleToolResults", () => {
  it("trims a stale tool-result above the threshold", () => {
    const big = bigToolResult("list_available_plugins", 4000);
    const messages = [
      { role: "user" as const, content: "hi, what plugins do I have?" },
      { role: "assistant" as const, content: "Let me check..." },
      { role: "user" as const, content: big },
      { role: "assistant" as const, content: "You have these plugins..." },
    ];
    compactStaleToolResults(messages);

    const stale = messages[2]!;
    expect(stale.content.length).toBeLessThan(big.length);
    expect(stale.content.startsWith("[✅ TOOL RESULT: list_available_plugins]")).toBe(true);
    expect(stale.content).toContain(TRIMMER_FOOTER);
    // Header is intact within the kept head window.
    expect(stale.content.indexOf("\n")).toBeGreaterThan(0);
    expect(stale.content.length).toBeLessThanOrEqual(HEAD_CHARS + 200);
  });

  it("leaves tool results below the threshold intact", () => {
    const small = bigToolResult("read_file", 800);
    const messages = [
      { role: "user" as const, content: "show me file" },
      { role: "assistant" as const, content: "Reading..." },
      { role: "user" as const, content: small },
      { role: "assistant" as const, content: "It says hello world" },
    ];
    const before = messages[2]!.content;
    compactStaleToolResults(messages);
    expect(messages[2]!.content).toBe(before);
  });

  it("does NOT touch tool results AFTER the most recent assistant turn", () => {
    // Layout: user → assistant → tool_result(big) → tool_result(big)
    // The "current" exchange started at the last assistant — both following
    // tool results are still being reasoned over; we must not corrupt them.
    const big1 = bigToolResult("read_file", 4000);
    const big2 = bigToolResult("list_files", 5000);
    const messages = [
      { role: "user" as const, content: "go" },
      { role: "assistant" as const, content: "calling tools..." },
      { role: "user" as const, content: big1 },
      { role: "user" as const, content: big2 },
    ];
    const before = [messages[2]!.content, messages[3]!.content];
    compactStaleToolResults(messages);
    expect(messages[2]!.content).toBe(before[0]);
    expect(messages[3]!.content).toBe(before[1]);
  });

  it("skips non-tool-result user messages (free-form prompts and answers)", () => {
    // ask_user answer, original user prompt, mid-stream correction — all
    // arrive as user-role messages without a `[✅ TOOL RESULT: …]` prefix.
    const correction = "x".repeat(4000);
    const askAnswer = "y".repeat(3000);
    const messages = [
      { role: "user" as const, content: "build me a thing" },
      { role: "assistant" as const, content: "ok" },
      { role: "user" as const, content: correction },
      { role: "user" as const, content: askAnswer },
      { role: "assistant" as const, content: "done" },
    ];
    compactStaleToolResults(messages);
    expect(messages[2]!.content).toBe(correction);
    expect(messages[3]!.content).toBe(askAnswer);
  });

  it("trims tool errors the same way as tool successes", () => {
    const errMsg = `[❌ TOOL ERROR: search_files]\n${"e".repeat(4000)}`;
    const messages = [
      { role: "user" as const, content: "search" },
      { role: "assistant" as const, content: "trying..." },
      { role: "user" as const, content: errMsg },
      { role: "assistant" as const, content: "no results" },
    ];
    compactStaleToolResults(messages);
    expect(messages[2]!.content).toContain(TRIMMER_FOOTER);
    expect(messages[2]!.content.startsWith("[❌ TOOL ERROR: search_files]")).toBe(true);
  });

  it("is idempotent — second call leaves an already-trimmed message alone", () => {
    const big = bigToolResult("list_user_plugins", 5000);
    const messages = [
      { role: "user" as const, content: "list" },
      { role: "assistant" as const, content: "checking..." },
      { role: "user" as const, content: big },
      { role: "assistant" as const, content: "ok" },
    ];
    compactStaleToolResults(messages);
    const afterFirst = messages[2]!.content;
    compactStaleToolResults(messages);
    expect(messages[2]!.content).toBe(afterFirst);
  });

  it("no-ops on a conversation with no prior assistant turn", () => {
    const big = bigToolResult("list_files", 4000);
    const messages = [
      { role: "user" as const, content: "go" },
      { role: "user" as const, content: big },
    ];
    compactStaleToolResults(messages);
    // No assistant turn => nothing is "stale" yet.
    expect(messages[1]!.content).toBe(big);
  });
});
