/**
 * Code Graph Builder
 *
 * Builds a dependency graph from a set of files and their parsed imports.
 * Used to visualize plugin code structure in the workflow canvas.
 *
 * @module lib/code-graph-builder
 */

import { parseImports, type ParsedImport } from "./import-parser";

// ===========================================
// Types
// ===========================================

export interface CodeGraphNode {
  /** Relative file path within the plugin directory */
  id: string;
  /** File name (e.g. "index.js") */
  label: string;
  /** Whether this is the entry file */
  isEntry: boolean;
  /** Number of imports this file has */
  importCount: number;
  /** Number of files that import this file */
  importedByCount: number;
}

export interface CodeGraphEdge {
  /** Source file path (the importer) */
  source: string;
  /** Target file path (the imported) */
  target: string;
  /** Import type */
  type: ParsedImport["type"];
  /** Imported names */
  names: string[];
}

export interface CodeGraph {
  nodes: CodeGraphNode[];
  edges: CodeGraphEdge[];
}

// ===========================================
// Builder
// ===========================================

/**
 * Resolve a relative import path to a file path within the file set.
 * Handles missing extensions (.js, .ts, .mjs) and index files.
 */
function resolveRelativeImport(
  from: string,
  importSource: string,
  fileSet: Set<string>
): string | null {
  // Get the directory of the importing file
  const dir = from.includes("/")
    ? from.substring(0, from.lastIndexOf("/"))
    : "";

  // Resolve relative path
  const segments = (dir ? `${dir}/${importSource}` : importSource).split("/");
  const resolved: string[] = [];
  for (const seg of segments) {
    if (seg === "." || seg === "") continue;
    if (seg === "..") {
      resolved.pop();
    } else {
      resolved.push(seg);
    }
  }
  const base = resolved.join("/");

  // Try exact match first
  if (fileSet.has(base)) return base;

  // Try with extensions
  const extensions = [".js", ".ts", ".mjs", ".cjs", ".jsx", ".tsx"];
  for (const ext of extensions) {
    if (fileSet.has(base + ext)) return base + ext;
  }

  // Try as directory with index file
  for (const ext of extensions) {
    if (fileSet.has(`${base}/index${ext}`)) return `${base}/index${ext}`;
  }

  return null;
}

/**
 * Build a code graph from a set of files with their source code.
 *
 * @param files Map of relative file path → source code
 * @param entryFile The entry file path (relative)
 * @returns A CodeGraph with nodes and edges
 */
export function buildCodeGraph(
  files: Map<string, string>,
  entryFile: string
): CodeGraph {
  const fileSet = new Set(files.keys());
  const edges: CodeGraphEdge[] = [];
  const importedByCount = new Map<string, number>();

  // Parse imports for each file
  for (const [filePath, source] of files) {
    const imports = parseImports(source);

    for (const imp of imports) {
      if (!imp.isRelative) continue; // Skip external modules

      const resolved = resolveRelativeImport(filePath, imp.source, fileSet);
      if (!resolved) continue;

      edges.push({
        source: filePath,
        target: resolved,
        type: imp.type,
        names: imp.names,
      });

      importedByCount.set(
        resolved,
        (importedByCount.get(resolved) ?? 0) + 1
      );
    }
  }

  // Build nodes
  const nodes: CodeGraphNode[] = [];
  for (const filePath of files.keys()) {
    const importsFromFile = edges.filter((e) => e.source === filePath);
    nodes.push({
      id: filePath,
      label: filePath.includes("/")
        ? filePath.substring(filePath.lastIndexOf("/") + 1)
        : filePath,
      isEntry: filePath === entryFile,
      importCount: importsFromFile.length,
      importedByCount: importedByCount.get(filePath) ?? 0,
    });
  }

  return { nodes, edges };
}
