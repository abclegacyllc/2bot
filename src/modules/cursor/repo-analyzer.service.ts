/**
 * Repo Analyzer Service
 *
 * Clones a Git repository into the workspace, reads key files,
 * and uses AI to produce a structured analysis of the repo's purpose,
 * architecture, dependencies, and config patterns.
 *
 * This analysis is injected into the Coder worker's system prompt
 * so it can generate a native 2Bot plugin inspired by the repo.
 *
 * @module modules/cursor/repo-analyzer.service
 */

import { logger } from "@/lib/logger";
import { twoBotAIProvider } from "@/modules/2bot-ai-provider";
import type { TextGenerationMessage } from "@/modules/2bot-ai-provider/types";
import type { BridgeClient } from "@/modules/workspace/bridge-client.service";

const analyzerLog = logger.child({ module: "cursor", capability: "repo-analyzer" });

// ===========================================
// Types
// ===========================================

export interface RepoAnalysis {
  /** Detected primary language */
  language: string;
  /** Framework/library in use (e.g. "telegraf", "discord.py", "express") */
  framework: string | null;
  /** One-line summary of the repo's purpose */
  purpose: string;
  /** Key features extracted from code and readme */
  features: string[];
  /** External APIs the repo calls */
  externalApis: Array<{
    name: string;
    baseUrl: string;
    authMethod: "api_key" | "bearer" | "oauth" | "none" | "unknown";
  }>;
  /** Environment variables detected */
  envVars: Array<{
    name: string;
    purpose: string;
    required: boolean;
  }>;
  /** Key logic/algorithms worth porting */
  coreLogic: Array<{
    name: string;
    description: string;
    sourceFile: string;
    portable: boolean;
  }>;
  /** Bot commands detected */
  commands: Array<{
    command: string;
    description: string;
  }>;
  /** Suggested configSchema for the 2Bot plugin */
  suggestedConfigSchema: Record<string, unknown>;
  /** Safe npm deps to include in the generated plugin */
  npmDependencies: string[];
  /** Complexity rating */
  complexity: "simple" | "medium" | "complex";
  /** Warnings about things that can't be auto-ported */
  warnings: string[];
  /** Full file tree listing */
  fileTree: string[];
  /** Contents of key files (path → content) — for coder reference */
  keyFileContents: Record<string, string>;
}

// ===========================================
// Constants
// ===========================================

/** Max file size to read (100KB) */
const MAX_FILE_SIZE = 100_000;

/** Max total content to send to AI (200KB) */
const MAX_TOTAL_CONTENT = 200_000;

/** Max number of source files to read beyond manifests */
const MAX_SOURCE_FILES = 8;

/** Files to prioritize reading (order matters) */
const PRIORITY_FILES = [
  // Documentation
  "README.md", "README", "readme.md", "README.rst",
  // JS/TS manifests
  "package.json",
  // Python manifests
  "requirements.txt", "pyproject.toml", "setup.py", "Pipfile",
  // Go manifests
  "go.mod",
  // Rust manifests
  "Cargo.toml",
  // Config patterns
  ".env.example", ".env.sample", "env.example", ".env.template",
  "config.json", "config.yaml", "config.yml", "config.js", "config.ts",
  // Docker
  "docker-compose.yml", "docker-compose.yaml", "Dockerfile",
  // Plugin manifest (if it's already a 2bot plugin)
  "plugin.json",
];

/** Common entry point filenames (checked when package.json has no "main") */
const COMMON_ENTRY_FILES = [
  "index.js", "index.ts", "src/index.js", "src/index.ts",
  "app.js", "app.ts", "src/app.js", "src/app.ts",
  "main.js", "main.ts", "src/main.js", "src/main.ts",
  "bot.js", "bot.ts", "src/bot.js", "src/bot.ts",
  "server.js", "server.ts", "src/server.js", "src/server.ts",
  // Python
  "app.py", "bot.py", "main.py", "src/bot.py", "src/main.py", "src/app.py",
  // Go
  "main.go", "cmd/main.go",
];

/** Source directories to scan for additional files */
const SOURCE_DIRS = ["src", "lib", "commands", "handlers", "utils", "helpers", "modules", "services"];

/** File extensions to consider as source code */
const SOURCE_EXTENSIONS = new Set([
  ".js", ".ts", ".tsx", ".mjs", ".cjs",
  ".py",
  ".go",
  ".rs",
  ".java", ".kt",
  ".rb",
  ".php",
]);

// ===========================================
// Main API
// ===========================================

/**
 * Analyze a cloned repository and produce a structured report.
 *
 * @param client - Bridge client connected to the user's workspace container
 * @param cloneDir - Directory where repo was cloned (relative to workspace root)
 * @param userId - User ID for AI billing
 * @returns Structured analysis of the repository
 */
export async function analyzeRepo(
  client: BridgeClient,
  cloneDir: string,
  userId: string,
): Promise<{ analysis: RepoAnalysis; creditsUsed: number }> {
  analyzerLog.info({ cloneDir }, "Starting repo analysis");

  // Step 1: Get full file tree
  const fileTree = await getFileTree(client, cloneDir);
  analyzerLog.debug({ cloneDir, fileCount: fileTree.length }, "File tree retrieved");

  // Step 2: Read key files
  const keyFiles = await readKeyFiles(client, cloneDir, fileTree);
  analyzerLog.debug(
    { cloneDir, keyFileCount: Object.keys(keyFiles).length },
    "Key files read",
  );

  // Step 3: Send to AI for analysis
  const { analysis, creditsUsed } = await aiAnalyze(cloneDir, fileTree, keyFiles, userId);
  analyzerLog.info(
    { cloneDir, language: analysis.language, complexity: analysis.complexity, creditsUsed },
    "Repo analysis complete",
  );

  // Attach raw data for coder reference
  analysis.fileTree = fileTree;
  analysis.keyFileContents = keyFiles;

  return { analysis, creditsUsed };
}

// ===========================================
// File Discovery
// ===========================================

/**
 * Get a flat list of all files in the cloned repo (recursive).
 */
async function getFileTree(client: BridgeClient, cloneDir: string): Promise<string[]> {
  try {
    const listing = await client.fileList(cloneDir, true) as Array<{ name: string; type: string }>;
    return (listing || [])
      .filter((f) => f.type === "file")
      .map((f) => f.name)
      .filter((name) => {
        // Skip common noise directories
        if (name.startsWith("node_modules/")) return false;
        if (name.startsWith(".git/")) return false;
        if (name.startsWith("__pycache__/")) return false;
        if (name.startsWith(".venv/")) return false;
        if (name.startsWith("vendor/")) return false;
        if (name.startsWith("dist/")) return false;
        if (name.startsWith("build/")) return false;
        if (name.startsWith(".next/")) return false;
        return true;
      });
  } catch (err) {
    analyzerLog.warn({ cloneDir, error: (err as Error).message }, "Failed to list files");
    return [];
  }
}

/**
 * Read key files from the repo: manifests, config, entry points, and source files.
 * Respects size limits to avoid sending too much to the AI.
 */
async function readKeyFiles(
  client: BridgeClient,
  cloneDir: string,
  fileTree: string[],
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  let totalSize = 0;

  const fileSet = new Set(fileTree);

  // Helper: read a file if it exists and fits within limits
  async function tryRead(relativePath: string): Promise<boolean> {
    if (!fileSet.has(relativePath)) return false;
    if (result[relativePath]) return true; // already read
    if (totalSize >= MAX_TOTAL_CONTENT) return false;

    try {
      const response = await client.fileRead(`${cloneDir}/${relativePath}`) as { content?: string };
      const content = response?.content;
      if (!content) return false;

      // Enforce per-file size limit
      const trimmed = content.length > MAX_FILE_SIZE ? content.slice(0, MAX_FILE_SIZE) + "\n... (truncated)" : content;
      if (totalSize + trimmed.length > MAX_TOTAL_CONTENT) return false;

      result[relativePath] = trimmed;
      totalSize += trimmed.length;
      return true;
    } catch {
      return false;
    }
  }

  // 1. Read priority files (manifests, config, README)
  for (const file of PRIORITY_FILES) {
    if (totalSize >= MAX_TOTAL_CONTENT) break;
    await tryRead(file);
  }

  // 2. Detect and read entry point
  let entryFile: string | null = null;

  // Try package.json "main" field
  if (result["package.json"]) {
    try {
      const pkg = JSON.parse(result["package.json"]);
      if (pkg.main && fileSet.has(pkg.main)) {
        entryFile = pkg.main;
      }
    } catch { /* invalid JSON — skip */ }
  }

  // Try common entry file names
  if (!entryFile) {
    for (const candidate of COMMON_ENTRY_FILES) {
      if (fileSet.has(candidate)) {
        entryFile = candidate;
        break;
      }
    }
  }

  if (entryFile) {
    await tryRead(entryFile);
  }

  // 3. Read source files from common directories
  let sourceFilesRead = 0;
  for (const dir of SOURCE_DIRS) {
    if (sourceFilesRead >= MAX_SOURCE_FILES) break;

    const dirFiles = fileTree.filter((f) => {
      if (!f.startsWith(`${dir}/`)) return false;
      const ext = f.substring(f.lastIndexOf("."));
      return SOURCE_EXTENSIONS.has(ext);
    });

    // Sort by path depth (shallow first) then alphabetically
    dirFiles.sort((a, b) => {
      const depthA = a.split("/").length;
      const depthB = b.split("/").length;
      return depthA !== depthB ? depthA - depthB : a.localeCompare(b);
    });

    for (const file of dirFiles) {
      if (sourceFilesRead >= MAX_SOURCE_FILES) break;
      if (totalSize >= MAX_TOTAL_CONTENT) break;
      if (await tryRead(file)) {
        sourceFilesRead++;
      }
    }
  }

  // 4. If few source files found, try top-level source files
  if (sourceFilesRead < 3) {
    const topLevelSource = fileTree.filter((f) => {
      if (f.includes("/")) return false; // only top-level
      if (result[f]) return false; // already read
      const ext = f.substring(f.lastIndexOf("."));
      return SOURCE_EXTENSIONS.has(ext);
    });

    for (const file of topLevelSource) {
      if (sourceFilesRead >= MAX_SOURCE_FILES) break;
      if (totalSize >= MAX_TOTAL_CONTENT) break;
      if (await tryRead(file)) {
        sourceFilesRead++;
      }
    }
  }

  return result;
}

// ===========================================
// AI Analysis
// ===========================================

/**
 * Send file contents to AI and get structured analysis.
 */
async function aiAnalyze(
  cloneDir: string,
  fileTree: string[],
  keyFiles: Record<string, string>,
  userId: string,
): Promise<{ analysis: RepoAnalysis; creditsUsed: number }> {
  // Build the prompt with all file contents
  const fileContentsSection = Object.entries(keyFiles)
    .map(([path, content]) => `### ${path}\n\`\`\`\n${content}\n\`\`\``)
    .join("\n\n");

  const fileTreeSection = fileTree.slice(0, 200).join("\n");

  const messages: TextGenerationMessage[] = [
    {
      role: "system",
      content: ANALYSIS_SYSTEM_PROMPT,
    },
    {
      role: "user",
      content: `Analyze this repository cloned to \`${cloneDir}\`.

## File Tree (${fileTree.length} files)
\`\`\`
${fileTreeSection}
\`\`\`

## File Contents

${fileContentsSection}

Respond with a JSON object matching the RepoAnalysis schema. No markdown wrapping — just the raw JSON.`,
    },
  ];

  const response = await twoBotAIProvider.textGeneration({
    messages,
    model: "auto",
    temperature: 0.1,
    maxTokens: 4096,
    stream: false,
    userId,
    feature: "cursor",
    capability: "code-generation",
  });

  // Parse the JSON response
  const content = (response.content || "").trim();
  let analysis: RepoAnalysis;

  try {
    // Handle potential markdown code fences around JSON
    const jsonStr = content.startsWith("```")
      ? content.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "")
      : content;
    analysis = JSON.parse(jsonStr);
  } catch {
    analyzerLog.warn({ cloneDir, responseLength: content.length }, "AI returned non-JSON — using fallback");
    analysis = buildFallbackAnalysis(cloneDir, fileTree, keyFiles);
  }

  // Ensure all required fields exist
  analysis = normalizeAnalysis(analysis);

  return { analysis, creditsUsed: response.creditsUsed ?? 0 };
}

// ===========================================
// Analysis Prompt
// ===========================================

const ANALYSIS_SYSTEM_PROMPT = `You are a code analysis expert. You analyze Git repositories and produce structured reports.

Given a repository's file tree and key file contents, produce a JSON object with this exact schema:

{
  "language": "javascript|typescript|python|go|rust|java|ruby|php|other",
  "framework": "express|telegraf|discord.js|discord.py|aiogram|python-telegram-bot|grammY|nestjs|fastify|flask|django|gin|null",
  "purpose": "One-line summary of what this project does",
  "features": ["Feature 1", "Feature 2", ...],
  "externalApis": [
    { "name": "OpenWeatherMap", "baseUrl": "https://api.openweathermap.org", "authMethod": "api_key" }
  ],
  "envVars": [
    { "name": "API_KEY", "purpose": "Authentication for external service", "required": true }
  ],
  "coreLogic": [
    { "name": "Temperature conversion", "description": "Converts between F/C/K", "sourceFile": "src/utils.js", "portable": true }
  ],
  "commands": [
    { "command": "/start", "description": "Welcome message" },
    { "command": "/help", "description": "Show available commands" }
  ],
  "suggestedConfigSchema": {
    "type": "object",
    "properties": {
      "apiKey": { "type": "string", "title": "API Key", "description": "..." }
    }
  },
  "npmDependencies": ["axios"],
  "complexity": "simple|medium|complex",
  "warnings": ["Uses WebSocket server — will be stripped", "Uses SQLite — mapped to sdk.storage"]
}

Rules:
- Analyze the ACTUAL code, not just README descriptions
- For envVars: look at process.env, os.environ, .env files, config loaders
- For commands: look for command handlers (e.g., bot.command('/start'), @bot.message_handler)
- For externalApis: look for HTTP client calls (fetch, axios, requests, http.get)
- For coreLogic: identify algorithms, business logic, data transformations worth preserving
- For npmDependencies: only include packages safe for a sandboxed environment (axios, lodash, dayjs, etc.)
  Do NOT include: express, fastify, koa, socket.io, mongoose, sequelize, or any server framework
- For suggestedConfigSchema: map env vars and config values to a JSON Schema
  with user-friendly titles and descriptions. Use "uiComponent": "ai-model-selector" for AI model fields
- For complexity: simple = single file / few commands; medium = multi-file with APIs; complex = many features + database + complex logic
- For warnings: flag things that can't be directly ported (HTTP servers, WebSockets, databases, file system access, cron jobs)
- portable = true if the logic is pure JS/TS or can trivially run in Node.js; false if it needs Python/Go/system APIs

Respond with ONLY the JSON object. No markdown, no explanation.`;

// ===========================================
// Helpers
// ===========================================

/**
 * Build a basic fallback analysis when AI fails to return valid JSON.
 */
function buildFallbackAnalysis(
  cloneDir: string,
  fileTree: string[],
  keyFiles: Record<string, string>,
): RepoAnalysis {
  const repoName = cloneDir.split("/").pop() || "unknown";

  // Detect language from file extensions
  const extCounts: Record<string, number> = {};
  for (const file of fileTree) {
    const ext = file.substring(file.lastIndexOf("."));
    if (SOURCE_EXTENSIONS.has(ext)) {
      extCounts[ext] = (extCounts[ext] || 0) + 1;
    }
  }
  const topExt = Object.entries(extCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || ".js";
  const langMap: Record<string, string> = {
    ".js": "javascript", ".ts": "typescript", ".tsx": "typescript",
    ".py": "python", ".go": "go", ".rs": "rust", ".java": "java",
    ".rb": "ruby", ".php": "php",
  };
  const language = langMap[topExt] || "other";

  return {
    language,
    framework: null,
    purpose: `Project: ${repoName}`,
    features: [],
    externalApis: [],
    envVars: [],
    coreLogic: [],
    commands: [],
    suggestedConfigSchema: {},
    npmDependencies: [],
    complexity: fileTree.length > 20 ? "complex" : fileTree.length > 5 ? "medium" : "simple",
    warnings: ["AI analysis failed — manual review recommended"],
    fileTree,
    keyFileContents: keyFiles,
  };
}

/**
 * Ensure all required fields exist on the analysis object.
 */
function normalizeAnalysis(raw: Partial<RepoAnalysis>): RepoAnalysis {
  return {
    language: raw.language || "unknown",
    framework: raw.framework ?? null,
    purpose: raw.purpose || "Unknown project",
    features: Array.isArray(raw.features) ? raw.features : [],
    externalApis: Array.isArray(raw.externalApis) ? raw.externalApis : [],
    envVars: Array.isArray(raw.envVars) ? raw.envVars : [],
    coreLogic: Array.isArray(raw.coreLogic) ? raw.coreLogic : [],
    commands: Array.isArray(raw.commands) ? raw.commands : [],
    suggestedConfigSchema: raw.suggestedConfigSchema || {},
    npmDependencies: Array.isArray(raw.npmDependencies) ? raw.npmDependencies : [],
    complexity: raw.complexity || "medium",
    warnings: Array.isArray(raw.warnings) ? raw.warnings : [],
    fileTree: Array.isArray(raw.fileTree) ? raw.fileTree : [],
    keyFileContents: raw.keyFileContents || {},
  };
}
