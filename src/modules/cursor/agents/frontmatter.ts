/**
 * Minimal YAML Frontmatter Parser
 *
 * Parses the leading `---` block of a markdown file into a typed object.
 * Supports the subset needed by `.agent.md`:
 *   - scalars: string, number, boolean, null
 *   - arrays of scalars (inline `[a, b, c]` or block `- item`)
 *   - arrays of objects (block `- key: value`)
 *   - nested mappings (one level deep, sufficient for `handoffs:`)
 *
 * No external YAML dependency — the supported subset is intentional and
 * the loader rejects anything more complex with a clear error.
 *
 * @module modules/cursor/agents/frontmatter
 */

// ===========================================
// Public types
// ===========================================

export type FrontmatterScalar = string | number | boolean | null;
export type FrontmatterValue =
  | FrontmatterScalar
  | FrontmatterScalar[]
  | Record<string, FrontmatterScalar>[]
  | Record<string, FrontmatterScalar>;
export type Frontmatter = Record<string, FrontmatterValue>;

export interface FrontmatterParseResult {
  /** Parsed frontmatter (empty object if no `---` block) */
  data: Frontmatter;
  /** Markdown body after the closing `---` */
  body: string;
}

// ===========================================
// Top-level split
// ===========================================

/**
 * Split a markdown source into `{ frontmatter, body }`.
 * If the source does not start with `---`, the entire input is returned as body.
 */
export function splitFrontmatter(source: string): FrontmatterParseResult {
  // Normalize line endings without altering the body length unnecessarily.
  const normalized = source.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n") && normalized !== "---") {
    return { data: {}, body: normalized };
  }
  const rest = normalized.slice(4); // strip leading "---\n"
  const closeIdx = rest.indexOf("\n---");
  if (closeIdx === -1) {
    throw new FrontmatterError(
      "Frontmatter block not closed — expected `---` on its own line",
    );
  }
  const yaml = rest.slice(0, closeIdx);
  // Strip the closing fence + the newline after it (if any).
  let bodyStart = closeIdx + 4; // skip "\n---"
  if (rest[bodyStart] === "\n") bodyStart += 1;
  const body = rest.slice(bodyStart);
  const data = parseYaml(yaml);
  return { data, body };
}

// ===========================================
// YAML subset parser
// ===========================================

class FrontmatterError extends Error {
  constructor(message: string, line?: number) {
    super(line !== undefined ? `${message} (line ${line + 1})` : message);
    this.name = "FrontmatterError";
  }
}

interface Line {
  /** Number of leading spaces (tabs forbidden) */
  indent: number;
  /** Trimmed text, comments removed, with leading dash and dash-space stripped if any */
  text: string;
  /** True if this line started with `- ` */
  listItem: boolean;
  /** Original line index (for error messages) */
  lineNo: number;
}

function tokenize(yaml: string): Line[] {
  const out: Line[] = [];
  const rawLines = yaml.split("\n");
  for (let i = 0; i < rawLines.length; i++) {
    const raw = rawLines[i] ?? "";
    if (raw.includes("\t")) {
      throw new FrontmatterError(
        "Tabs are not allowed in frontmatter indentation",
        i,
      );
    }
    const stripped = raw.replace(/\s+#.*$/, "").trimEnd();
    if (stripped.trim() === "" || stripped.trim().startsWith("#")) continue;
    const indent = stripped.length - stripped.trimStart().length;
    const trimmed = stripped.slice(indent);
    if (trimmed.startsWith("- ")) {
      out.push({ indent, text: trimmed.slice(2).trim(), listItem: true, lineNo: i });
    } else if (trimmed === "-") {
      out.push({ indent, text: "", listItem: true, lineNo: i });
    } else {
      out.push({ indent, text: trimmed, listItem: false, lineNo: i });
    }
  }
  return out;
}

function parseScalar(raw: string): FrontmatterScalar {
  if (raw === "" || raw === "~" || raw === "null") return null;
  if (raw === "true") return true;
  if (raw === "false") return false;
  // Quoted strings (single or double) — strip surrounding quotes only.
  if ((raw.startsWith('"') && raw.endsWith('"')) ||
      (raw.startsWith("'") && raw.endsWith("'"))) {
    return raw.slice(1, -1);
  }
  // Number?
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
  return raw;
}

/** Parse an inline flow array `[a, b, "c d"]` */
function parseInlineArray(raw: string): FrontmatterScalar[] {
  const inner = raw.slice(1, -1).trim();
  if (inner === "") return [];
  const out: FrontmatterScalar[] = [];
  let depth = 0;
  let buf = "";
  let inQuote: '"' | "'" | null = null;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i] as string;
    if (inQuote) {
      buf += ch;
      if (ch === inQuote) inQuote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inQuote = ch;
      buf += ch;
      continue;
    }
    if (ch === "[" || ch === "{") depth++;
    if (ch === "]" || ch === "}") depth--;
    if (ch === "," && depth === 0) {
      out.push(parseScalar(buf.trim()));
      buf = "";
      continue;
    }
    buf += ch;
  }
  if (buf.trim() !== "") out.push(parseScalar(buf.trim()));
  return out;
}

/**
 * Parse a tokenized line block at a given indent. Returns the parsed value
 * and the index of the first line not consumed.
 */
function parseBlock(
  lines: Line[],
  start: number,
  baseIndent: number,
): { value: FrontmatterValue; next: number } {
  // Determine if this block is a list (first line is `- ...`) or a mapping.
  if (start >= lines.length) return { value: null, next: start };
  const first = lines[start]!;

  if (first.listItem && first.indent === baseIndent) {
    return parseList(lines, start, baseIndent);
  }
  return parseMapping(lines, start, baseIndent);
}

function parseList(
  lines: Line[],
  start: number,
  baseIndent: number,
): { value: FrontmatterValue; next: number } {
  const items: FrontmatterScalar[] = [];
  const objectItems: Record<string, FrontmatterScalar>[] = [];
  let i = start;
  let isObjectList = false;
  while (i < lines.length) {
    const line = lines[i]!;
    if (line.indent < baseIndent) break;
    if (line.indent > baseIndent) {
      throw new FrontmatterError(
        "Unexpected indentation inside list",
        line.lineNo,
      );
    }
    if (!line.listItem) break;
    // Object list item: `- key: value` or `-` followed by indented mapping.
    const colonIdx = indexOfTopLevelColon(line.text);
    if (colonIdx !== -1 && line.text !== "") {
      isObjectList = true;
      const obj: Record<string, FrontmatterScalar> = {};
      // Parse the inline `key: value` from the dash line itself.
      const key = line.text.slice(0, colonIdx).trim();
      const valStr = line.text.slice(colonIdx + 1).trim();
      if (valStr !== "") obj[key] = parseScalar(valStr);
      i += 1;
      // Continued mapping lines under this dash item must be indented further.
      while (i < lines.length) {
        const sub = lines[i]!;
        if (sub.indent <= baseIndent) break;
        if (sub.listItem) {
          throw new FrontmatterError(
            "Nested lists are not supported in frontmatter",
            sub.lineNo,
          );
        }
        const subColon = indexOfTopLevelColon(sub.text);
        if (subColon === -1) {
          throw new FrontmatterError(
            "Expected `key: value` inside object list item",
            sub.lineNo,
          );
        }
        const subKey = sub.text.slice(0, subColon).trim();
        const subVal = sub.text.slice(subColon + 1).trim();
        obj[subKey] = parseScalar(subVal);
        i += 1;
      }
      objectItems.push(obj);
    } else {
      items.push(parseScalar(line.text));
      i += 1;
    }
  }
  if (isObjectList && items.length > 0) {
    throw new FrontmatterError(
      "Mixed scalar / object list items are not supported",
      lines[start]!.lineNo,
    );
  }
  return {
    value: isObjectList ? objectItems : items,
    next: i,
  };
}

function parseMapping(
  lines: Line[],
  start: number,
  baseIndent: number,
): { value: FrontmatterValue; next: number } {
  const out: Record<string, FrontmatterScalar> = {};
  let i = start;
  while (i < lines.length) {
    const line = lines[i]!;
    if (line.indent < baseIndent) break;
    if (line.indent > baseIndent) {
      throw new FrontmatterError(
        "Unexpected indentation inside mapping",
        line.lineNo,
      );
    }
    if (line.listItem) break;
    const colonIdx = indexOfTopLevelColon(line.text);
    if (colonIdx === -1) {
      throw new FrontmatterError(
        `Expected \`key: value\` — got: ${line.text}`,
        line.lineNo,
      );
    }
    const key = line.text.slice(0, colonIdx).trim();
    const valStr = line.text.slice(colonIdx + 1).trim();
    if (valStr === "") {
      // Nested block
      const nested = parseBlock(lines, i + 1, baseIndent + 2);
      // We can't represent nested mappings/lists in the simple type union for
      // mappings, but the public typing for the file-level result allows it.
      // Cast through unknown for the inner object — the loader validates shape.
      (out as unknown as Record<string, FrontmatterValue>)[key] = nested.value;
      i = nested.next;
    } else if (valStr.startsWith("[") && valStr.endsWith("]")) {
      (out as unknown as Record<string, FrontmatterValue>)[key] = parseInlineArray(valStr);
      i += 1;
    } else {
      out[key] = parseScalar(valStr);
      i += 1;
    }
  }
  return { value: out, next: i };
}

/**
 * Find the index of the first colon that is a key:value separator.
 * Skips colons inside quoted strings.
 */
function indexOfTopLevelColon(text: string): number {
  let inQuote: '"' | "'" | null = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuote) {
      if (ch === inQuote) inQuote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inQuote = ch as '"' | "'";
      continue;
    }
    if (ch === ":") {
      // Must be followed by whitespace or end-of-line to count as separator.
      const next = text[i + 1];
      if (next === undefined || next === " ") return i;
    }
  }
  return -1;
}

function parseYaml(yaml: string): Frontmatter {
  const lines = tokenize(yaml);
  if (lines.length === 0) return {};
  const { value } = parseMapping(lines, 0, lines[0]!.indent);
  if (typeof value !== "object" || Array.isArray(value) || value === null) {
    throw new FrontmatterError("Frontmatter must be a mapping at the top level");
  }
  return value as Frontmatter;
}
