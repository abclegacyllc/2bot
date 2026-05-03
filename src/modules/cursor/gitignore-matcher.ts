/**
 * .gitignore-aware path filtering for Cursor agent file tools.
 *
 * Reads `.gitignore` (and a few sane defaults) from the workspace bridge once
 * per call site and exposes a `shouldSkip(path)` predicate. Cached per session
 * for the duration of a tool turn — kept simple, no TTL invalidation needed
 * because tool calls are short-lived and gitignore changes rarely.
 */

import ignore, { type Ignore } from "ignore";
import type { BridgeClient } from "@/modules/workspace";

// Defaults applied even if the workspace has no .gitignore. Match what the
// bridge agent's bootstrap .gitignore writes plus a few common-sense extras.
const DEFAULT_PATTERNS = [
  ".git/",
  "node_modules/",
  ".2bot/",
  "*.log",
  ".next/",
  "dist/",
  "build/",
  ".turbo/",
  ".cache/",
  "coverage/",
];

const matcherCache = new WeakMap<BridgeClient, Ignore>();

/**
 * Build (or return cached) gitignore matcher for this bridge client.
 * Reads `.gitignore` from workspace root; falls back silently to defaults.
 */
export async function loadGitignoreMatcher(client: BridgeClient): Promise<Ignore> {
  const cached = matcherCache.get(client);
  if (cached) return cached;

  const ig = ignore().add(DEFAULT_PATTERNS);

  try {
    const result = (await client.fileRead(".gitignore")) as { content?: string } | string | null;
    const content = typeof result === "string" ? result : result?.content;
    if (content && typeof content === "string") {
      ig.add(content);
    }
  } catch {
    // No .gitignore — defaults are enough.
  }

  matcherCache.set(client, ig);
  return ig;
}

/**
 * Normalize a path for the `ignore` package. It expects POSIX, no leading `/`,
 * and directories should NOT have trailing slashes when checked (the matcher
 * handles them based on the rules).
 */
export function normalizeForIgnore(p: string): string {
  let s = p.replace(/\\/g, "/");
  // Strip leading "./" and "/"
  s = s.replace(/^\.\//, "").replace(/^\/+/, "");
  return s;
}

/**
 * Filter a list of file/dir entries through the gitignore matcher.
 * `entries` should have a `name` field; the joined path is checked.
 *
 * `basePath` is the directory those names are relative to (so we match
 * the full workspace-relative path, not just the leaf).
 */
export function filterIgnored<T extends { name: string; type?: string }>(
  ig: Ignore,
  basePath: string,
  entries: T[],
): T[] {
  const base = basePath === "/" || basePath === "." || basePath === ""
    ? ""
    : `${basePath.replace(/^\.\//, "").replace(/^\/+/, "").replace(/\/+$/, "")}/`;

  return entries.filter((e) => {
    const isDir = e.type === "directory";
    const rel = `${base}${e.name}${isDir ? "/" : ""}`;
    const normalized = normalizeForIgnore(rel);
    if (!normalized) return true;
    return !ig.ignores(normalized);
  });
}
