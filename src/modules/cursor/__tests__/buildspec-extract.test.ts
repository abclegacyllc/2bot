import { describe, it, expect } from "vitest";

import { extractBuildSpec } from "../buildspec-extract";

describe("extractBuildSpec", () => {
  it("returns null for empty/missing input", () => {
    expect(extractBuildSpec("")).toBeNull();
    expect(extractBuildSpec(undefined)).toBeNull();
    expect(extractBuildSpec(null)).toBeNull();
    expect(extractBuildSpec("no spec here")).toBeNull();
  });

  it("extracts a valid JSON block + preceding summary", () => {
    const text = `Here is your build:\n\n<buildspec>\n{"version":1,"project":{"name":"X","slug":"x","kind":"BOT"}}\n</buildspec>`;
    const result = extractBuildSpec(text);
    expect(result).not.toBeNull();
    expect(result!.summary).toBe("Here is your build:");
    expect(result!.spec).toEqual({
      version: 1,
      project: { name: "X", slug: "x", kind: "BOT" },
    });
  });

  it("returns null on malformed JSON", () => {
    const text = `<buildspec>{not json}</buildspec>`;
    expect(extractBuildSpec(text)).toBeNull();
  });

  it("returns null when body is an array", () => {
    const text = `<buildspec>[1,2,3]</buildspec>`;
    expect(extractBuildSpec(text)).toBeNull();
  });

  it("is case-insensitive on the tag", () => {
    const text = `<BUILDSPEC>{"a":1}</BuildSpec>`;
    const result = extractBuildSpec(text);
    expect(result).not.toBeNull();
    expect(result!.spec).toEqual({ a: 1 });
  });
});
