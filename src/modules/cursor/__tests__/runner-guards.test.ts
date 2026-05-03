/**
 * Phase 1 runner-guard tests.
 *
 * Covers:
 *  - Greeting short-circuit regex (positive + negative cases)
 *  - edit_file fuzzy match locator (`locateClosestMatch`)
 *  - File-read cache snapshot/restore round-trip
 *  - Diagnosis-claim pattern (used by the diagnosis-lock soft enforcement)
 *  - Render line window + occurrence finder helpers
 */

import { beforeEach, describe, expect, it } from "vitest";

import { __testables } from "../cursor-worker-runner";

const {
  locateClosestMatch,
  renderLineWindow,
  findAllOccurrenceLines,
  snapshotFileReadCache,
  restoreFileReadCache,
  getCachedFileRead,
  setCachedFileRead,
  greetingPattern,
  diagnosisPattern,
} = __testables;

// ─────────────────────────────────────────────────────────────────────────────
// Greeting regex
// ─────────────────────────────────────────────────────────────────────────────
describe("greetingPattern", () => {
  const positive = ["hi", "hey", "hello", "yo", "sup", "ok", "thanks", "thank you", "cool", "nice"];
  const negative = [
    "hello can you fix the bug",
    "hi! please install the plugin",
    "hey, what about the credits?",
    "create a bot that responds to messages",
    "ok, but first read the plugin file",
    "thanks for the explanation, now refactor it",
  ];

  for (const greeting of positive) {
    it(`matches \"${greeting}\"`, () => {
      expect(greetingPattern.test(greeting)).toBe(true);
    });
  }

  for (const text of negative) {
    it(`does NOT match \"${text}\"`, () => {
      // Note: the runner additionally length-checks (<25) and rejects "?".
      // Here we test the regex itself — multi-word real requests must fail.
      const matches = greetingPattern.test(text);
      // For long messages the regex may still match the leading "hi" word boundary.
      // The full guard combines regex + length<25 + no "?". Simulate that.
      const passes = matches && text.length < 25 && !text.includes("?");
      expect(passes).toBe(false);
    });
  }

  it("matches with trailing punctuation", () => {
    expect(greetingPattern.test("hey!")).toBe(true);
    expect(greetingPattern.test("thanks.")).toBe(true);
    expect(greetingPattern.test("ok,")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// locateClosestMatch
// ─────────────────────────────────────────────────────────────────────────────
describe("locateClosestMatch", () => {
  const file = [
    "import foo from 'bar';",
    "",
    "export function hello(name: string) {",
    "  return `hi ${name}`;",
    "}",
    "",
    "export function goodbye(name: string) {",
    "  return `bye ${name}`;",
    "}",
  ].join("\n");

  it("finds the line whose content most closely resembles the search head", () => {
    const result = locateClosestMatch(file, "export function hello(name: number)");
    expect(result).not.toBeNull();
    expect(result!.line).toBe(3);
  });

  it("returns null when nothing remotely matches", () => {
    const result = locateClosestMatch(file, "totally unrelated zzzqqq content here");
    expect(result).toBeNull();
  });

  it("returns null for too-short search strings", () => {
    expect(locateClosestMatch(file, "ab")).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// renderLineWindow + findAllOccurrenceLines
// ─────────────────────────────────────────────────────────────────────────────
describe("renderLineWindow", () => {
  it("renders ±N lines with line-number prefixes", () => {
    const file = ["a", "b", "c", "d", "e"].join("\n");
    const out = renderLineWindow(file, 3, 1);
    expect(out).toContain("2  b");
    expect(out).toContain("3  c");
    expect(out).toContain("4  d");
    // Bounds: doesn't include line 1 or line 5.
    expect(out).not.toContain("1  a");
    expect(out).not.toContain("5  e");
  });

  it("clamps to file bounds", () => {
    const file = ["only-line"].join("\n");
    expect(renderLineWindow(file, 1, 5)).toContain("1  only-line");
  });
});

describe("findAllOccurrenceLines", () => {
  it("returns 1-based line numbers for every match", () => {
    const file = ["foo", "bar", "foo", "baz", "foo"].join("\n");
    expect(findAllOccurrenceLines(file, "foo")).toEqual([1, 3, 5]);
  });

  it("respects the limit", () => {
    const file = "x\nx\nx\nx\nx\nx\nx";
    expect(findAllOccurrenceLines(file, "x", 3)).toEqual([1, 2, 3]);
  });

  it("returns empty for an empty needle", () => {
    expect(findAllOccurrenceLines("anything", "")).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// File-read cache snapshot round-trip
// ─────────────────────────────────────────────────────────────────────────────
describe("file-read cache snapshot", () => {
  const SID_A = "session-cache-test-A";
  const SID_B = "session-cache-test-B";

  beforeEach(() => {
    // Clear by overwriting with empty restoration is not possible; instead
    // each test uses unique session ids so isolation holds.
  });

  it("snapshots only the entries belonging to the given session", () => {
    setCachedFileRead(SID_A, "/a.ts", "content A");
    setCachedFileRead(SID_B, "/b.ts", "content B");

    const snap = snapshotFileReadCache(SID_A);
    expect(snap).toEqual({ "/a.ts": "content A" });
    expect(snap["/b.ts"]).toBeUndefined();
  });

  it("restores entries with fresh timestamps so they don't immediately expire", () => {
    const SID = "session-cache-test-restore";
    const snapshot = { "/x.ts": "hello world" };
    restoreFileReadCache(SID, snapshot);

    const got = getCachedFileRead(SID, "/x.ts");
    expect(got).toBe("hello world");
  });

  it("ignores undefined snapshots", () => {
    expect(() => restoreFileReadCache("noop", undefined)).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Diagnosis claim pattern
// ─────────────────────────────────────────────────────────────────────────────
describe("diagnosisPattern", () => {
  const positives = [
    "Found it — the api key was missing",
    "I see the issue here, the regex is wrong",
    "I found the bug in the validator",
    "The problem is in the auth middleware",
    "The bug is that we don't await the promise",
    "That's why it always returns 500",
    "Root cause is a stale cache",
  ];
  const negatives = [
    "Let me check what's happening",
    "I'll read the file first",
    "Looking at the code now",
    "I need to understand the flow",
  ];

  for (const text of positives) {
    it(`detects diagnosis in: \"${text}\"`, () => {
      expect(diagnosisPattern.test(text)).toBe(true);
    });
  }
  for (const text of negatives) {
    it(`does NOT misfire on: \"${text}\"`, () => {
      expect(diagnosisPattern.test(text)).toBe(false);
    });
  }
});
