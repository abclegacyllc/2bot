/**
 * AST Parser — Tree-sitter based code analysis
 *
 * Parses source files into ASTs and extracts structured information:
 * - Function/method signatures and bodies
 * - Class definitions with their methods
 * - Import/export statements
 * - File outlines (compact signature-only summaries)
 *
 * Supports: JavaScript, TypeScript, Python
 * Falls back to regex-based extraction for unsupported languages.
 *
 * @module modules/cursor/code-indexer/ast-parser
 */

import Parser from "tree-sitter";

// Lazy-loaded language grammars (loaded once, cached)
let jsLang: unknown;
let tsLang: unknown;
let pyLang: unknown;

type SupportedLanguage = "javascript" | "typescript" | "python";

function getLanguage(lang: SupportedLanguage): unknown {
  switch (lang) {
    case "javascript":
      if (!jsLang) jsLang = require("tree-sitter-javascript");
      return jsLang;
    case "typescript":
      if (!tsLang) tsLang = require("tree-sitter-typescript").typescript;
      return tsLang;
    case "python":
      if (!pyLang) pyLang = require("tree-sitter-python");
      return pyLang;
  }
}

// Single parser instance (reused, language swapped as needed)
let parserInstance: Parser | null = null;

function getParser(lang: SupportedLanguage): Parser {
  if (!parserInstance) parserInstance = new Parser();
  parserInstance.setLanguage(getLanguage(lang) as Parameters<Parser["setLanguage"]>[0]);
  return parserInstance;
}

// ===========================================
// Language Detection
// ===========================================

const EXTENSION_MAP: Record<string, SupportedLanguage> = {
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".ts": "typescript",
  ".tsx": "typescript",
  ".mts": "typescript",
  ".cts": "typescript",
  ".py": "javascript", // mapped to python below
};

// Fix: Python extension
EXTENSION_MAP[".py"] = "python";
EXTENSION_MAP[".pyw"] = "python";

/**
 * Detect language from file extension.
 * Returns null for unsupported languages.
 */
export function detectLanguage(filePath: string): SupportedLanguage | null {
  const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
  return EXTENSION_MAP[ext] ?? null;
}

// ===========================================
// Extracted Types
// ===========================================

export interface ExtractedFunction {
  name: string;
  /** Full text including signature and body */
  body: string;
  /** Signature line only (e.g. "function hello(name, age)") */
  signature: string;
  startLine: number;
  endLine: number;
  /** Parameter names */
  params: string[];
  /** Whether it's a method inside a class */
  isMethod: boolean;
  /** Parent class name if it's a method */
  className?: string;
}

export interface ExtractedClass {
  name: string;
  startLine: number;
  endLine: number;
  methods: Array<{ name: string; signature: string; startLine: number; endLine: number }>;
  properties: string[];
}

export interface ExtractedImport {
  source: string;
  specifiers: string[];
  raw: string;
}

export interface FileOutline {
  language: SupportedLanguage;
  imports: string[];
  classes: Array<{
    name: string;
    methods: string[];
  }>;
  functions: string[];
  exports: string[];
  /** Total lines in file */
  lineCount: number;
}

// ===========================================
// AST Extraction — JavaScript / TypeScript
// ===========================================

function extractFunctionsJS(rootNode: Parser.SyntaxNode, source: string, _lang: SupportedLanguage): ExtractedFunction[] {
  const functions: ExtractedFunction[] = [];

  function visit(node: Parser.SyntaxNode, parentClass?: string) {
    // Function declarations: function name(...) { ... }
    if (node.type === "function_declaration" || node.type === "generator_function_declaration") {
      const nameNode = node.childForFieldName("name");
      const paramsNode = node.childForFieldName("parameters");
      if (nameNode) {
        functions.push({
          name: nameNode.text,
          body: node.text,
          signature: buildSignatureJS(node, source),
          startLine: node.startPosition.row + 1,
          endLine: node.endPosition.row + 1,
          params: extractParamNames(paramsNode),
          isMethod: false,
        });
      }
    }

    // Arrow functions assigned to const/let/var
    if (node.type === "lexical_declaration" || node.type === "variable_declaration") {
      for (const decl of node.children) {
        if (decl.type === "variable_declarator") {
          const nameNode = decl.childForFieldName("name");
          const valueNode = decl.childForFieldName("value");
          if (nameNode && valueNode && (valueNode.type === "arrow_function" || valueNode.type === "function_expression")) {
            const paramsNode = valueNode.childForFieldName("parameters");
            functions.push({
              name: nameNode.text,
              body: node.text,
              signature: buildSignatureJS(node, source),
              startLine: node.startPosition.row + 1,
              endLine: node.endPosition.row + 1,
              params: extractParamNames(paramsNode),
              isMethod: false,
            });
          }
        }
      }
    }

    // Class methods
    if (node.type === "method_definition" && parentClass) {
      const nameNode = node.childForFieldName("name");
      const paramsNode = node.childForFieldName("parameters");
      if (nameNode) {
        functions.push({
          name: nameNode.text,
          body: node.text,
          signature: buildMethodSignatureJS(node),
          startLine: node.startPosition.row + 1,
          endLine: node.endPosition.row + 1,
          params: extractParamNames(paramsNode),
          isMethod: true,
          className: parentClass,
        });
      }
    }

    // Class declarations — recurse into body
    if (node.type === "class_declaration") {
      const nameNode = node.childForFieldName("name");
      const bodyNode = node.childForFieldName("body");
      const className = nameNode?.text ?? "(anonymous)";
      if (bodyNode) {
        for (const child of bodyNode.children) {
          visit(child, className);
        }
      }
      return; // Don't recurse deeper (handled above)
    }

    // Export wrappers — unwrap and recurse
    if (node.type === "export_statement") {
      for (const child of node.children) {
        visit(child, parentClass);
      }
      return;
    }

    // For top-level: recurse into children (but not into function bodies)
    if (!parentClass && !["function_declaration", "arrow_function", "function_expression"].includes(node.type)) {
      for (const child of node.children) {
        visit(child, parentClass);
      }
    }
  }

  for (const child of rootNode.children) {
    visit(child);
  }

  return functions;
}

function buildSignatureJS(node: Parser.SyntaxNode, _source: string): string {
  // For function declarations, take the first line up to '{'
  const text = node.text;
  const braceIdx = text.indexOf("{");
  if (braceIdx > 0) {
    return text.substring(0, braceIdx).trim();
  }
  // For arrow functions (const x = ...), take first line
  const newlineIdx = text.indexOf("\n");
  if (newlineIdx > 0) return text.substring(0, newlineIdx).trim();
  return text.substring(0, 120);
}

function buildMethodSignatureJS(node: Parser.SyntaxNode): string {
  const text = node.text;
  const braceIdx = text.indexOf("{");
  if (braceIdx > 0) return text.substring(0, braceIdx).trim();
  return text.substring(0, 120);
}

function extractParamNames(paramsNode: Parser.SyntaxNode | null): string[] {
  if (!paramsNode) return [];
  const names: string[] = [];
  for (const child of paramsNode.children) {
    if (child.type === "identifier" || child.type === "required_parameter" || child.type === "optional_parameter") {
      // For TS typed params, get the name child
      const nameChild = child.childForFieldName("pattern") ?? child.childForFieldName("name");
      names.push(nameChild?.text ?? child.text);
    } else if (child.type === "rest_pattern" || child.type === "rest_element") {
      names.push("..." + (child.children[1]?.text ?? ""));
    }
  }
  return names.filter((n) => n && n !== "," && n !== "(" && n !== ")");
}

function extractClassesJS(rootNode: Parser.SyntaxNode): ExtractedClass[] {
  const classes: ExtractedClass[] = [];

  function visit(node: Parser.SyntaxNode) {
    if (node.type === "class_declaration") {
      const nameNode = node.childForFieldName("name");
      const bodyNode = node.childForFieldName("body");
      const cls: ExtractedClass = {
        name: nameNode?.text ?? "(anonymous)",
        startLine: node.startPosition.row + 1,
        endLine: node.endPosition.row + 1,
        methods: [],
        properties: [],
      };

      if (bodyNode) {
        for (const child of bodyNode.children) {
          if (child.type === "method_definition") {
            const mName = child.childForFieldName("name");
            cls.methods.push({
              name: mName?.text ?? "(anonymous)",
              signature: buildMethodSignatureJS(child),
              startLine: child.startPosition.row + 1,
              endLine: child.endPosition.row + 1,
            });
          }
          if (child.type === "field_definition" || child.type === "public_field_definition") {
            const pName = child.childForFieldName("property") ?? child.childForFieldName("name");
            if (pName) cls.properties.push(pName.text);
          }
        }
      }
      classes.push(cls);
    }

    // Unwrap exports
    if (node.type === "export_statement") {
      for (const child of node.children) visit(child);
      return;
    }

    // Don't recurse into function bodies
    if (!["function_declaration", "arrow_function", "function_expression"].includes(node.type)) {
      for (const child of node.children) visit(child);
    }
  }

  for (const child of rootNode.children) visit(child);
  return classes;
}

function extractImportsJS(rootNode: Parser.SyntaxNode): ExtractedImport[] {
  const imports: ExtractedImport[] = [];
  for (const child of rootNode.children) {
    // ES imports
    if (child.type === "import_statement") {
      const sourceNode = child.childForFieldName("source");
      const specifiers: string[] = [];

      // Recursively find import specifiers (TS nests them in import_clause > named_imports)
      function collectSpecifiers(node: Parser.SyntaxNode) {
        if (node.type === "import_specifier") {
          specifiers.push(node.childForFieldName("name")?.text ?? node.text);
          return;
        }
        if (node.type === "namespace_import") {
          specifiers.push(node.text);
          return;
        }
        // Default import identifier (direct child of import_clause)
        if (node.type === "identifier" && node.parent?.type === "import_clause") {
          specifiers.push(node.text);
          return;
        }
        for (const c of node.children) collectSpecifiers(c);
      }
      collectSpecifiers(child);

      imports.push({
        source: sourceNode?.text?.replace(/['"]/g, "") ?? "",
        specifiers,
        raw: child.text,
      });
    }
    // CommonJS require
    if (child.type === "lexical_declaration" || child.type === "variable_declaration" || child.type === "expression_statement") {
      const text = child.text;
      const requireMatch = text.match(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/);
      if (requireMatch) {
        const nameMatch = text.match(/(?:const|let|var)\s+(?:{([^}]+)}|(\w+))\s*=/);
        const specifiers = nameMatch?.[1]?.split(",").map((s) => s.trim()) ?? (nameMatch?.[2] ? [nameMatch[2]] : []);
        imports.push({ source: requireMatch[1]!, specifiers, raw: child.text });
      }
    }
  }
  return imports;
}

// ===========================================
// AST Extraction — Python
// ===========================================

function extractFunctionsPy(rootNode: Parser.SyntaxNode): ExtractedFunction[] {
  const functions: ExtractedFunction[] = [];

  function visit(node: Parser.SyntaxNode, parentClass?: string) {
    if (node.type === "function_definition") {
      const nameNode = node.childForFieldName("name");
      const paramsNode = node.childForFieldName("parameters");
      if (nameNode) {
        const params: string[] = [];
        if (paramsNode) {
          for (const p of paramsNode.children) {
            if (p.type === "identifier") params.push(p.text);
            if (p.type === "typed_parameter" || p.type === "typed_default_parameter" || p.type === "default_parameter") {
              const pName = p.childForFieldName("name") ?? p.children[0];
              if (pName) params.push(pName.text);
            }
            if (p.type === "list_splat_pattern" || p.type === "dictionary_splat_pattern") {
              params.push(p.text);
            }
          }
        }

        // Build signature: "def name(params):" optionally with return type
        const returnType = node.childForFieldName("return_type");
        const sig = `def ${nameNode.text}(${params.filter((p) => p !== "," && p !== "(" && p !== ")").join(", ")})${returnType ? " -> " + returnType.text : ""}`;

        functions.push({
          name: nameNode.text,
          body: node.text,
          signature: sig,
          startLine: node.startPosition.row + 1,
          endLine: node.endPosition.row + 1,
          params: params.filter((p) => p !== "self" && p !== "cls" && p !== "," && p !== "(" && p !== ")"),
          isMethod: !!parentClass,
          className: parentClass,
        });
      }
    }

    if (node.type === "class_definition") {
      const nameNode = node.childForFieldName("name");
      const bodyNode = node.childForFieldName("body");
      if (bodyNode) {
        for (const child of bodyNode.children) {
          visit(child, nameNode?.text);
        }
      }
      return;
    }

    // Recurse into top-level compound statements
    if (node.type === "if_statement" || node.type === "decorated_definition") {
      for (const child of node.children) visit(child, parentClass);
    }
  }

  for (const child of rootNode.children) visit(child);
  return functions;
}

function extractClassesPy(rootNode: Parser.SyntaxNode): ExtractedClass[] {
  const classes: ExtractedClass[] = [];

  function visit(node: Parser.SyntaxNode) {
    if (node.type === "class_definition") {
      const nameNode = node.childForFieldName("name");
      const bodyNode = node.childForFieldName("body");
      const cls: ExtractedClass = {
        name: nameNode?.text ?? "(anonymous)",
        startLine: node.startPosition.row + 1,
        endLine: node.endPosition.row + 1,
        methods: [],
        properties: [],
      };

      if (bodyNode) {
        for (const child of bodyNode.children) {
          if (child.type === "function_definition") {
            const mName = child.childForFieldName("name");
            const paramsNode = child.childForFieldName("parameters");
            const params: string[] = [];
            if (paramsNode) {
              for (const p of paramsNode.children) {
                if (p.type === "identifier" && p.text !== "self" && p.text !== "cls") params.push(p.text);
              }
            }
            cls.methods.push({
              name: mName?.text ?? "",
              signature: `def ${mName?.text}(${params.join(", ")})`,
              startLine: child.startPosition.row + 1,
              endLine: child.endPosition.row + 1,
            });
          }
          // Class-level assignments as properties
          if (child.type === "expression_statement") {
            const assign = child.children[0];
            if (assign?.type === "assignment") {
              const left = assign.childForFieldName("left");
              if (left?.type === "identifier") cls.properties.push(left.text);
            }
          }
        }
      }
      classes.push(cls);
    }

    if (node.type === "decorated_definition") {
      for (const child of node.children) visit(child);
    }
  }

  for (const child of rootNode.children) visit(child);
  return classes;
}

function extractImportsPy(rootNode: Parser.SyntaxNode): ExtractedImport[] {
  const imports: ExtractedImport[] = [];
  for (const child of rootNode.children) {
    if (child.type === "import_statement") {
      const names = child.children
        .filter((c) => c.type === "dotted_name")
        .map((c) => c.text);
      imports.push({ source: names[0] ?? "", specifiers: names, raw: child.text });
    }
    if (child.type === "import_from_statement") {
      const moduleNode = child.childForFieldName("module_name");
      const names: string[] = [];
      child.children.forEach((c) => {
        if (c.type === "dotted_name" && c !== moduleNode) names.push(c.text);
        if (c.type === "aliased_import") names.push(c.children[0]?.text ?? c.text);
      });
      imports.push({ source: moduleNode?.text ?? "", specifiers: names, raw: child.text });
    }
  }
  return imports;
}

// ===========================================
// Public API
// ===========================================

/**
 * Extract all functions/methods from a source file.
 */
export function extractFunctions(content: string, language: SupportedLanguage): ExtractedFunction[] {
  const parser = getParser(language);
  const tree = parser.parse(content);
  try {
    if (language === "python") return extractFunctionsPy(tree.rootNode);
    return extractFunctionsJS(tree.rootNode, content, language);
  } finally {
    // tree-sitter trees should be freed
  }
}

/**
 * Extract all classes from a source file.
 */
export function extractClasses(content: string, language: SupportedLanguage): ExtractedClass[] {
  const parser = getParser(language);
  const tree = parser.parse(content);
  if (language === "python") return extractClassesPy(tree.rootNode);
  return extractClassesJS(tree.rootNode);
}

/**
 * Extract all imports from a source file.
 */
export function extractImports(content: string, language: SupportedLanguage): ExtractedImport[] {
  const parser = getParser(language);
  const tree = parser.parse(content);
  if (language === "python") return extractImportsPy(tree.rootNode);
  return extractImportsJS(tree.rootNode);
}

/**
 * Get a single function/method body by name.
 * Searches top-level functions and class methods.
 * Returns null if not found.
 */
export function getFunction(content: string, language: SupportedLanguage, functionName: string): ExtractedFunction | null {
  const fns = extractFunctions(content, language);
  return fns.find((f) => f.name === functionName) ?? null;
}

/**
 * Generate a compact file outline — signatures only, no bodies.
 * This is the key cost saver: ~50 tokens vs ~500+ for full file read.
 *
 * Example output:
 * ```
 * [imports] express, ./utils, ../config
 * [class] AuthService { login(email, password), logout(), refreshToken() }
 * [function] hashPassword(raw)
 * [function] validateEmail(email)
 * [exports] AuthService, hashPassword
 * ```
 */
export function getFileOutline(content: string, language: SupportedLanguage): FileOutline {
  const parser = getParser(language);
  const tree = parser.parse(content);
  const rootNode = tree.rootNode;

  const imports = language === "python"
    ? extractImportsPy(rootNode).map((i) => i.raw)
    : extractImportsJS(rootNode).map((i) => i.raw);

  const classes = language === "python"
    ? extractClassesPy(rootNode).map((c) => ({
        name: c.name,
        methods: c.methods.map((m) => m.signature),
      }))
    : extractClassesJS(rootNode).map((c) => ({
        name: c.name,
        methods: c.methods.map((m) => m.signature),
      }));

  const functions = language === "python"
    ? extractFunctionsPy(rootNode)
        .filter((f) => !f.isMethod)
        .map((f) => f.signature)
    : extractFunctionsJS(rootNode, content, language)
        .filter((f) => !f.isMethod)
        .map((f) => f.signature);

  const exports: string[] = [];
  if (language !== "python") {
    for (const child of rootNode.children) {
      if (child.type === "export_statement") {
        const decl = child.children.find(
          (c) =>
            c.type === "function_declaration" ||
            c.type === "class_declaration" ||
            c.type === "lexical_declaration",
        );
        if (decl) {
          const nameNode = decl.childForFieldName("name") ?? decl.children.find((c) => c.type === "variable_declarator")?.childForFieldName("name");
          if (nameNode) exports.push(nameNode.text);
        }
        // export { a, b }
        const clause = child.children.find((c) => c.type === "export_clause");
        if (clause) {
          clause.children.forEach((c) => {
            if (c.type === "export_specifier") {
              exports.push(c.childForFieldName("name")?.text ?? c.text);
            }
          });
        }
        // export default
        if (child.text.startsWith("export default")) {
          exports.push("(default)");
        }
      }
      // module.exports
      if (child.type === "expression_statement" && child.text.includes("module.exports")) {
        exports.push("module.exports");
      }
    }
  }

  return {
    language,
    imports: imports.map((i) => i.length > 100 ? i.substring(0, 100) + "..." : i),
    classes,
    functions: functions.map((f) => f.length > 150 ? f.substring(0, 150) + "..." : f),
    exports,
    lineCount: content.split("\n").length,
  };
}

/**
 * Format a FileOutline as a compact string for the LLM.
 */
export function formatOutline(outline: FileOutline): string {
  const lines: string[] = [];
  lines.push(`[${outline.language}] ${outline.lineCount} lines`);

  if (outline.imports.length > 0) {
    lines.push(`[imports] ${outline.imports.join(" | ")}`);
  }

  for (const cls of outline.classes) {
    const methodList = cls.methods.length > 0 ? ` { ${cls.methods.join(", ")} }` : "";
    lines.push(`[class] ${cls.name}${methodList}`);
  }

  for (const fn of outline.functions) {
    lines.push(`[function] ${fn}`);
  }

  if (outline.exports.length > 0) {
    lines.push(`[exports] ${outline.exports.join(", ")}`);
  }

  return lines.join("\n");
}

/**
 * Regex-based fallback for unsupported languages.
 * Returns a simple outline based on pattern matching.
 */
export function getFallbackOutline(content: string, filePath: string): string {
  const lines = content.split("\n");
  const result: string[] = [`[${filePath.split(".").pop() ?? "unknown"}] ${lines.length} lines`];

  // Extract function-like patterns
  const fnPatterns = [
    /^\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)/,
    /^\s*(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\(/,
    /^\s*(?:export\s+)?class\s+(\w+)/,
    /^\s*def\s+(\w+)\s*\(/,
    /^\s*class\s+(\w+)/,
    /^\s*(?:pub\s+)?fn\s+(\w+)/,
    /^\s*func\s+(\w+)/,
  ];

  for (let i = 0; i < lines.length && result.length < 30; i++) {
    const line = lines[i];
    for (const pat of fnPatterns) {
      const m = line?.match(pat);
      if (m) {
        result.push(`  L${i + 1}: ${line!.trim().substring(0, 120)}`);
        break;
      }
    }
  }

  if (result.length === 1) {
    // No patterns found — return first 30 lines as context
    result.push("(no recognizable structure — first 30 lines)");
    for (let i = 0; i < Math.min(30, lines.length); i++) {
      if (lines[i]?.trim()) result.push(`  ${lines[i]}`);
    }
  }

  return result.join("\n");
}
