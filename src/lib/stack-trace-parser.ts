/**
 * Stack Trace Parser
 *
 * Extracts plugin file references (`file:line:col`) from V8 / Node.js error
 * stack traces. Used to produce Layer-2 (runtime) per-file status icons that
 * mirror the Layer-1 (preflight) per-file annotations.
 *
 * @module lib/stack-trace-parser
 */

export interface StackFileRef {
  /** Workspace-relative file path (with `/workspace/` prefix stripped) */
  file: string;
  line?: number;
  column?: number;
}

/**
 * Parse a V8/Node.js error message + stack trace and return all referenced
 * plugin file paths (deduplicated, in occurrence order).
 *
 * Recognises:
 *   at fn (/workspace/plugins/foo/bar.js:42:7)
 *   at /workspace/plugins/foo/bar.js:42:7
 *   /workspace/plugins/foo/bar.js:42
 *
 * Filters out Node internals and node_modules frames.
 */
export function parseStackFiles(
  error: string | null | undefined
): StackFileRef[] {
  if (!error) return [];
  const refs: StackFileRef[] = [];
  const seen = new Set<string>();
  // path:line:col with optional surrounding `(`, leading `at `, or BOL
  const re = /(?:\(|\sat\s|^)([\w./-]+\.[a-zA-Z]+):(\d+)(?::(\d+))?\)?/g;
  const stripPrefixes = ["/workspace/", "/app/"];
  let m: RegExpExecArray | null;
  while ((m = re.exec(error)) !== null) {
    let file = m[1]!;
    if (file.startsWith("node:") || file.includes("internal/")) continue;
    if (file.includes("node_modules/")) continue;
    for (const prefix of stripPrefixes) {
      if (file.startsWith(prefix)) {
        file = file.slice(prefix.length);
        break;
      }
    }
    const line = m[2] ? parseInt(m[2], 10) : undefined;
    const column = m[3] ? parseInt(m[3], 10) : undefined;
    const key = `${file}:${line ?? ""}:${column ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push({ file, line, column });
  }
  return refs;
}

/**
 * Strip the plugin's own directory prefix (e.g. "plugins/kurs-uzbekistan/")
 * from a file path so it matches the relative paths used inside the plugin
 * code graph (e.g. "index.js", "commands/convert.js").
 *
 * Returns null if the ref does NOT belong to the given plugin directory.
 */
export function relativizeToPlugin(
  ref: StackFileRef,
  pluginDir: string | null | undefined
): string | null {
  if (!pluginDir) return ref.file;
  // Normalise both ends — drop leading/trailing slashes
  const dir = pluginDir.replace(/^\/+|\/+$/g, "");
  if (!dir) return ref.file;
  if (ref.file === dir) return "";
  if (ref.file.startsWith(dir + "/")) {
    return ref.file.slice(dir.length + 1);
  }
  return null;
}
