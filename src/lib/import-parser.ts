/**
 * Import Parser
 *
 * Regex-based utility to extract ES module imports and exports from JS/TS files.
 * Used to build code dependency graphs for plugin visualization.
 *
 * @module lib/import-parser
 */

export interface ParsedImport {
  /** The module specifier (e.g. "./utils", "lodash", "@/lib/helpers") */
  source: string;
  /** Whether this is a relative import (starts with . or ..) */
  isRelative: boolean;
  /** Named imports (e.g. ["foo", "bar"]) */
  names: string[];
  /** Default import name (e.g. "React") */
  defaultImport?: string;
  /** Whether it's a re-export or side-effect import */
  type: "import" | "re-export" | "side-effect" | "dynamic";
}

/**
 * Extract all import/export statements from JS/TS source code.
 *
 * Handles:
 * - `import { x, y } from "mod"`
 * - `import x from "mod"`
 * - `import * as x from "mod"`
 * - `import "mod"` (side-effect)
 * - `export { x } from "mod"` (re-export)
 * - `const x = require("mod")` (CJS)
 * - `import("mod")` (dynamic)
 */
export function parseImports(source: string): ParsedImport[] {
  const results: ParsedImport[] = [];

  // ES module static imports
  // import { foo, bar } from "mod"
  // import foo from "mod"
  // import * as foo from "mod"
  // import "mod"
  const esImportRe =
    /import\s+(?:(?:(?:\{([^}]*)\})|(\w+)|(\*\s+as\s+\w+))(?:\s*,\s*(?:\{([^}]*)\}|(\w+)))*\s+from\s+)?['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = esImportRe.exec(source)) !== null) {
    const src = match[6] ?? "";
    const namedBraces = match[1] ?? match[4] ?? "";
    const defaultName = match[2] ?? match[5];
    const names = namedBraces
      ? namedBraces
          .split(",")
          .map((n) => n.trim().split(/\s+as\s+/)[0]?.trim() ?? "")
          .filter(Boolean)
      : [];

    if (!src) continue;

    results.push({
      source: src,
      isRelative: src.startsWith("."),
      names,
      defaultImport: defaultName ?? undefined,
      type: !defaultName && names.length === 0 && !match[3] ? "side-effect" : "import",
    });
  }

  // Re-exports: export { x } from "mod"
  const reExportRe = /export\s+\{([^}]*)\}\s+from\s+['"]([^'"]+)['"]/g;
  while ((match = reExportRe.exec(source)) !== null) {
    const src = match[2] ?? "";
    const names = (match[1] ?? "")
      .split(",")
      .map((n) => n.trim().split(/\s+as\s+/)[0]?.trim() ?? "")
      .filter(Boolean);

    if (!src) continue;

    results.push({
      source: src,
      isRelative: src.startsWith("."),
      names,
      type: "re-export",
    });
  }

  // CommonJS require: const x = require("mod") / const { x } = require("mod")
  const requireRe = /(?:const|let|var)\s+(?:\w+|\{[^}]*\})\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = requireRe.exec(source)) !== null) {
    const src = match[1] ?? "";
    if (!src) continue;
    results.push({
      source: src,
      isRelative: src.startsWith("."),
      names: [],
      type: "import",
    });
  }

  // Dynamic import: import("mod")
  const dynamicRe = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = dynamicRe.exec(source)) !== null) {
    const src = match[1] ?? "";
    if (!src) continue;
    results.push({
      source: src,
      isRelative: src.startsWith("."),
      names: [],
      type: "dynamic",
    });
  }

  return results;
}
