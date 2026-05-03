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

/**
 * Max source files in lightweight mode (info-only / "what does this repo do?").
 * We read manifests + entry point + this many additional source files.
 * Keeps cost low while giving the AI real business-logic context.
 */
const MAX_LIGHTWEIGHT_SOURCE_FILES = 3;

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
// Smart File Selection Helpers
// ===========================================

/**
 * How many source files to read in full mode, scaled by total repo size.
 * Tiny repos: read everything. Large repos: be selective to save credits.
 */
function getSourceFileLimit(totalFileCount: number): number {
  if (totalFileCount < 20) return totalFileCount; // tiny repo — read it all
  if (totalFileCount < 60) return 15;
  if (totalFileCount < 150) return 10;
  return 7; // large repo — be very selective
}

/**
 * Score a source file path by its likely business-logic importance.
 * Returns -1 to exclude the file entirely (tests, types, generated files).
 * Higher score = read first.
 */
function scoreFile(path: string): number {
  const nameFull = path.split("/").pop()?.toLowerCase() ?? "";
  const dir = path.includes("/") ? path.split("/")[0]?.toLowerCase() ?? "" : "";
  const ext = nameFull.includes(".") ? nameFull.slice(nameFull.lastIndexOf(".")) : "";
  const nameBase = ext ? nameFull.slice(0, nameFull.lastIndexOf(".")) : nameFull;

  // ── Hard excludes ──────────────────────────────────────────
  // Test files
  if (nameFull.includes(".test.") || nameFull.includes(".spec.") || nameFull.includes("_test.")) return -1;
  if (dir === "__tests__" || dir === "test" || dir === "tests") return -1;
  // TypeScript declaration / type-only files (no runtime logic)
  if (ext === ".d.ts") return -1;
  // Build artefacts that may have leaked past the fileTree filter
  if (dir === "dist" || dir === "build" || dir === "out") return -1;

  let score = 0;

  // ── Directory importance ───────────────────────────────────
  const dirScores: Record<string, number> = {
    commands:    22,
    handlers:    20,
    routes:      18,
    controllers: 16,
    api:         14,
    modules:     12,
    services:    10,
    src:          8,
    lib:          6,
    utils:        3,
    helpers:      2,
  };
  // Top-level files (no directory) are often entry points or key modules
  score += dirScores[dir] ?? (path.includes("/") ? 1 : 16);

  // ── Filename importance ─────────────────────────────────────
  const highSignal = ["bot", "app", "main", "index", "command", "handler", "route", "controller", "api", "service", "worker", "action", "event", "message", "task", "job"];
  const lowSignal  = ["util", "helper", "format", "parse", "logger", "constant", "config", "env", "type", "interface", "schema", "seed", "migration", "fixture"];

  for (const n of highSignal) {
    if (nameBase.includes(n)) { score += 14; break; }
  }
  for (const n of lowSignal) {
    if (nameBase.includes(n)) { score -= 6; break; }
  }

  // ── Depth penalty — prefer shallower files ─────────────────
  const depth = path.split("/").length;
  score += Math.max(0, 10 - depth * 2);

  return score;
}

/**
 * Collect all source-code files from fileTree, score them, sort by score descending.
 * Files already in `exclude` (already read) are skipped.
 * Files scoring -1 (tests, types, build artefacts) are excluded.
 */
function selectSourceFiles(fileTree: string[], exclude: Set<string>): string[] {
  const scored: Array<[string, number]> = [];

  for (const file of fileTree) {
    if (exclude.has(file)) continue;
    const ext = file.substring(file.lastIndexOf("."));
    if (!SOURCE_EXTENSIONS.has(ext)) continue;
    const score = scoreFile(file);
    if (score < 0) continue;
    scored.push([file, score]);
  }

  scored.sort((a, b) => b[1] - a[1]);
  return scored.map(([f]) => f);
}

/**
 * Detect the repository's main entry-point file from manifests and common names.
 */
function detectEntryFile(existingFiles: Record<string, string>, fileSet: Set<string>): string | null {
  // package.json "main" field
  if (existingFiles["package.json"]) {
    try {
      const pkg = JSON.parse(existingFiles["package.json"]);
      if (pkg.main && fileSet.has(pkg.main)) return pkg.main as string;
    } catch { /* invalid JSON */ }
  }
  // Common entry names
  for (const candidate of COMMON_ENTRY_FILES) {
    if (fileSet.has(candidate)) return candidate;
  }
  return null;
}

// ===========================================
// Main API
// ===========================================

/**
 * Analyze a cloned repository and produce a structured report.
 * Yields `status` events at each step so the caller can forward them to the frontend.
 *
 * @param client - Bridge client connected to the user's workspace container
 * @param cloneDir - Directory where repo was cloned (relative to workspace root)
 * @param userId - User ID for AI billing
 * @param repoUrl - Original repo URL (used as cache key)
 * @param modelId - AI model to use
 * @param options - Analysis options
 * @param options.lightweight - If true, only read README + manifests + entry point (skip deep source scan). Use for "what is this repo?" questions.
 * @yields `{ type: "status", message }` progress events
 * @returns Structured analysis of the repository (final yielded value)
 */
export async function* analyzeRepo(
  client: BridgeClient,
  cloneDir: string,
  userId: string,
  repoUrl?: string,
  modelId?: string,
  options?: { lightweight?: boolean },
): AsyncGenerator<{ type: "status"; message: string }, { analysis: RepoAnalysis; creditsUsed: number; modelUsed: string }, unknown> {
  const lightweight = options?.lightweight ?? false;
  analyzerLog.info({ cloneDir, repoUrl, lightweight }, "Starting repo analysis");

  // Step 1: Get full file tree
  yield { type: "status", message: "Scanning repository file structure..." };
  let fileTree = await getFileTree(client, cloneDir);
  analyzerLog.debug({ cloneDir, fileCount: fileTree.length }, "File tree retrieved");

  // If fileList returned empty, the bridge may not support recursive listing
  // or the repo structure is non-standard. Try a terminal fallback to discover files.
  if (fileTree.length === 0) {
    analyzerLog.warn({ cloneDir }, "fileList returned empty — trying terminal fallback");
    yield { type: "status", message: "File listing empty — trying terminal fallback..." };
    try {
      const findResult = await client.send("terminal.create", {
        command: `find "${cloneDir}" -type f -not -path '*/.git/*' -not -path '*/node_modules/*' -not -path '*/__pycache__/*' | head -200`,
        timeout: 10_000,
      }) as { output?: string };
      if (findResult?.output) {
        const prefix = cloneDir.endsWith("/") ? cloneDir : `${cloneDir}/`;
        fileTree = findResult.output
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean)
          .map((abs) => abs.startsWith(prefix) ? abs.slice(prefix.length) : abs)
          .filter((name) => name && !name.startsWith(".git/"));
        analyzerLog.debug({ cloneDir, fileCount: fileTree.length }, "Terminal fallback found files");
      }
    } catch {
      analyzerLog.warn({ cloneDir }, "Terminal fallback also failed");
    }
  }

  const fileCount = fileTree.length;
  yield { type: "status", message: `Found ${fileCount} file${fileCount !== 1 ? "s" : ""}. Reading key files...` };

  // Step 2: Read key files
  const keyFiles = await readKeyFiles(client, cloneDir, fileTree, lightweight);
  const keyFileCount = Object.keys(keyFiles).length;
  analyzerLog.debug(
    { cloneDir, keyFileCount, lightweight },
    "Key files read",
  );

  yield { type: "status", message: `Read ${keyFileCount} key file${keyFileCount !== 1 ? "s" : ""}${lightweight ? " (quick scan)" : ""}. Analyzing with AI...` };

  // Step 3: Send to AI for analysis
  const { analysis, creditsUsed, modelUsed } = await aiAnalyze(cloneDir, fileTree, keyFiles, userId, modelId);
  analyzerLog.info(
    { cloneDir, language: analysis.language, complexity: analysis.complexity, creditsUsed },
    "Repo analysis complete",
  );

  // Attach raw data for coder reference (file tree for navigation, key files for read_file tool)
  analysis.fileTree = fileTree;
  analysis.keyFileContents = keyFiles;

  return { analysis, creditsUsed, modelUsed };
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
 *
 * File selection is scored by business-logic importance (commands > handlers > routes > src > utils)
 * and scaled dynamically by repo size so credits are spent where it matters.
 *
 * @param lightweight - If true (info-only query), read priority files + entry point +
 *   top-3 highest-scoring source files. Keeps cost low while giving the AI real logic context.
 *   Full mode scales the source-file count dynamically by repo size (7–15 files).
 */
async function readKeyFiles(
  client: BridgeClient,
  cloneDir: string,
  fileTree: string[],
  lightweight = false,
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  let totalSize = 0;

  const fileSet = new Set(fileTree);
  const fileTreeEmpty = fileTree.length === 0;

  // Helper: read a file if it exists and fits within limits
  // When fileTree is empty (listing failed), try reading the file directly
  async function tryRead(relativePath: string): Promise<boolean> {
    if (!fileTreeEmpty && !fileSet.has(relativePath)) return false;
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
  const entryFile = detectEntryFile(result, fileSet);
  if (entryFile) await tryRead(entryFile);

  // 3. Score and rank remaining source files, then read top N.
  //    lightweight: top 3 — gives AI real business-logic context without burning credits.
  //    full:        dynamic limit scaled by repo size (7–15 files).
  const limit = lightweight ? MAX_LIGHTWEIGHT_SOURCE_FILES : getSourceFileLimit(fileTree.length);
  const ranked = selectSourceFiles(fileTree, new Set(Object.keys(result)));

  let sourceFilesRead = 0;
  for (const file of ranked) {
    if (sourceFilesRead >= limit) break;
    if (totalSize >= MAX_TOTAL_CONTENT) break;
    if (await tryRead(file)) sourceFilesRead++;
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
  modelId?: string,
): Promise<{ analysis: RepoAnalysis; creditsUsed: number; modelUsed: string }> {
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

  let response;
  try {
    response = await twoBotAIProvider.textGeneration({
      messages,
      model: modelId || "auto",
      temperature: 0.1,
      maxTokens: 8192,
      stream: false,
      userId,
      feature: "cursor",
      capability: "code-generation",
    });
  } catch (err) {
    const errMsg = (err as Error).message || "";
    // If the selected model is unavailable, retry with auto (picks from fallback chain)
    if (modelId && modelId !== "auto" && (errMsg.includes("unavailable") || errMsg.includes("not available"))) {
      analyzerLog.warn({ failedModel: modelId }, "Model unavailable for repo analysis — retrying with auto");
      response = await twoBotAIProvider.textGeneration({
        messages,
        model: "auto",
        temperature: 0.1,
        maxTokens: 8192,
        stream: false,
        userId,
        feature: "cursor",
        capability: "code-generation",
      });
    } else {
      throw err;
    }
  }

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

  return { analysis, creditsUsed: response.creditsUsed ?? 0, modelUsed: response.model || modelId || "" };
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
- For npmDependencies: only include packages safe for a sandboxed environment (lodash, dayjs, uuid, etc.)
  Do NOT include: express, fastify, koa, socket.io, mongoose, sequelize, or any server framework
  Do NOT include: axios, node-fetch, got, superagent — the sdk.fetch built-in replaces all of these
  Do NOT include: cheerio, jsdom, htmlparser2, parse5 — HTML parsing must use regex in plugins
  Do NOT include: puppeteer, playwright, selenium — browser automation is not supported in the sandbox
- For suggestedConfigSchema: map env vars and config values to a JSON Schema
  with user-friendly titles and descriptions. Use "uiComponent": "ai-model-selector" for AI model fields.
  CRITICAL — configSchema is ONLY for values the USER must supply that the platform does not already provide.
  The platform/gateway ALREADY provides at runtime (never add these to configSchema):
    * Any bot/gateway auth token or secret — Telegram botToken, Discord token, Slack token, WhatsApp token, etc.
    * The gateway ID (available as event.gatewayId at runtime)
    * The gateway type (TELEGRAM_BOT, DISCORD_BOT, etc.)
    * User/org identity (PLUGIN_USER_ID, PLUGIN_ORG_ID env vars)
  Only add fields that are THIRD-PARTY and user-owned: OpenAI API key, weather API key, feature flags, thresholds, custom messages, etc.
- For complexity: simple = single file / few commands; medium = multi-file with APIs; complex = many features + database + complex logic
- For warnings: flag things that can't be directly ported (HTTP servers, WebSockets, databases, file system access, cron jobs)
- portable = true if the logic is pure JS/TS or can trivially run in Node.js; false if it needs Python/Go/system APIs

Respond with ONLY the JSON object. No markdown, no explanation.`;

// ===========================================
// Helpers
// ===========================================

/**
 * Semantic patterns that identify any field whose value the gateway/platform already provides at runtime.
 * Uses regex so it matches any naming convention (camelCase, snake_case, SCREAMING_SNAKE, kebab-case).
 * Principle: if the value comes from the gateway (auth token, ID) or from the platform (user/org ID)
 * it belongs to the runtime environment — never to user-supplied plugin config.
 */
const GATEWAY_CREDENTIAL_PATTERNS: RegExp[] = [
  // Any kind of bot/gateway authentication token or secret
  /bot[_-]?token/i,
  /bot[_-]?secret/i,
  /telegram[_-]?token/i,
  /telegram[_-]?bot[_-]?token/i,
  /discord[_-]?token/i,
  /discord[_-]?bot[_-]?secret/i,
  /slack[_-]?token/i,
  /slack[_-]?bot[_-]?token/i,
  /whatsapp[_-]?token/i,
  /gateway[_-]?token/i,
  /gateway[_-]?secret/i,
  // Gateway / platform identity fields
  /gateway[_-]?id/i,         // comes from event.gatewayId at runtime
  /plugin[_-]?user[_-]?id/i, // injected as PLUGIN_USER_ID env var
  /plugin[_-]?org[_-]?id/i,  // injected as PLUGIN_ORG_ID env var
];

/**
 * Remove any platform/gateway-provided fields from suggestedConfigSchema.
 * Uses semantic patterns so it works regardless of the naming convention the source repo used.
 */
function stripGatewayCredentials(schema: Record<string, unknown>): Record<string, unknown> {
  const props = schema.properties as Record<string, unknown> | undefined;
  if (!props) return schema;
  const filteredProps: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(props)) {
    if (!GATEWAY_CREDENTIAL_PATTERNS.some((re) => re.test(key))) {
      filteredProps[key] = val;
    }
  }
  const required = (schema.required as string[] | undefined)?.filter(
    (f) => !GATEWAY_CREDENTIAL_PATTERNS.some((re) => re.test(f)),
  );
  return { ...schema, properties: filteredProps, ...(required ? { required } : {}) };
}

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
    suggestedConfigSchema: stripGatewayCredentials(raw.suggestedConfigSchema || {}),
    npmDependencies: Array.isArray(raw.npmDependencies) ? raw.npmDependencies : [],
    complexity: raw.complexity || "medium",
    warnings: Array.isArray(raw.warnings) ? raw.warnings : [],
    fileTree: Array.isArray(raw.fileTree) ? raw.fileTree : [],
    keyFileContents: raw.keyFileContents || {},
  };
}
