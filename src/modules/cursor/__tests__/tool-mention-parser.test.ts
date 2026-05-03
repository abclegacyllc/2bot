import { describe, expect, it } from "vitest";
import { buildForceToolDirective, parseToolMentions } from "../tool-mention-parser";

describe("parseToolMentions", () => {
  it("returns no force when no `#` present", () => {
    const r = parseToolMentions("just a normal request");
    expect(r.forceTool).toBeNull();
    expect(r.allMentioned).toEqual([]);
    expect(r.cleanedMessage).toBe("just a normal request");
  });

  it("strips a leading valid mention and sets forceTool", () => {
    const r = parseToolMentions("#search_codebase find the rate limiter");
    expect(r.forceTool).toBe("search_codebase");
    expect(r.allMentioned).toEqual(["search_codebase"]);
    expect(r.cleanedMessage).toBe("find the rate limiter");
  });

  it("strips a trailing mention", () => {
    const r = parseToolMentions("where is sendRates called? #find_usages");
    expect(r.forceTool).toBe("find_usages");
    expect(r.cleanedMessage).toBe("where is sendRates called?");
  });

  it("ignores unknown tool names and leaves them in", () => {
    const r = parseToolMentions("#totally_made_up tool name");
    expect(r.forceTool).toBeNull();
    expect(r.cleanedMessage).toContain("#totally_made_up");
  });

  it("ignores mentions inside fenced code blocks", () => {
    const r = parseToolMentions("look at this:\n```\nuse #search_codebase here\n```\nplease");
    expect(r.forceTool).toBeNull();
    expect(r.cleanedMessage).toContain("#search_codebase");
  });

  it("ignores mentions inside inline backticks", () => {
    const r = parseToolMentions("the `#search_codebase` tool is great");
    expect(r.forceTool).toBeNull();
  });

  it("first valid mention wins, others recorded but stripped", () => {
    const r = parseToolMentions("#search_codebase or maybe #find_usages would help");
    expect(r.forceTool).toBe("search_codebase");
    expect(r.allMentioned).toEqual(["search_codebase", "find_usages"]);
    expect(r.cleanedMessage).not.toContain("#search_codebase");
    expect(r.cleanedMessage).not.toContain("#find_usages");
  });

  it("does not match `#` preceded by a word char (e.g., `key#value`)", () => {
    const r = parseToolMentions("config key#search_codebase=yes");
    expect(r.forceTool).toBeNull();
  });
});

describe("buildForceToolDirective", () => {
  it("includes the forced tool name", () => {
    const out = buildForceToolDirective("search_codebase", ["search_codebase"]);
    expect(out).toContain("search_codebase");
    expect(out).toContain("User Tool Hint");
  });

  it("lists secondary mentions when present", () => {
    const out = buildForceToolDirective("search_codebase", ["search_codebase", "find_usages"]);
    expect(out).toContain("find_usages");
  });

  it("omits the secondary list when only one tool was mentioned", () => {
    const out = buildForceToolDirective("search_codebase", ["search_codebase"]);
    expect(out).not.toContain("They also mentioned");
  });
});
