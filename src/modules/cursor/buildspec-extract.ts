/**
 * BuildSpec Extractor — producer-side helper.
 *
 * The Builder agent (`agents/builtin/builder.ts`) is instructed to emit its
 * proposal as a fenced `<buildspec>...</buildspec>` block inside its final
 * `finish` summary. This module extracts and parses that block so the worker
 * runner can yield a `buildspec` SSE event without needing a dedicated tool.
 *
 * The extractor is intentionally permissive at parse time — it returns the
 * raw object plus a short summary string. Validation against the BuildSpec
 * zod schema happens client-side via POST /cursor/buildspec/validate (or server-
 * side at apply time). This keeps the runner cheap and decoupled from
 * `@/modules/cursor/buildspec`.
 *
 * @module modules/cursor/buildspec-extract
 */

const BUILDSPEC_RE = /<buildspec>\s*([\s\S]*?)\s*<\/buildspec>/i;

export interface ExtractedBuildSpec {
  /** The parsed JSON object. Shape is `unknown` — caller validates. */
  spec: unknown;
  /** The text BEFORE the buildspec block, trimmed. Used as the human summary. */
  summary: string;
}

/**
 * Extract a `<buildspec>{...}</buildspec>` block from arbitrary agent text.
 * Returns `null` if no block is present, the JSON is malformed, or the body
 * isn't a JSON object.
 */
export function extractBuildSpec(text: string | undefined | null): ExtractedBuildSpec | null {
  if (typeof text !== "string" || text.length === 0) return null;
  const match = BUILDSPEC_RE.exec(text);
  if (!match) return null;
  const body = match[1];
  if (typeof body !== "string") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const summary = text.slice(0, match.index).trim();
  return { spec: parsed, summary };
}
