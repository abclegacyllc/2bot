/**
 * Agent Loader
 *
 * Parses a `.agent.md` file (or equivalent string) into an `AgentDefinition`.
 *
 * Steps:
 *   1. Split frontmatter from markdown body.
 *   2. Validate required fields (name, description).
 *   3. Apply defaults for optional fields.
 *   4. Expand capability bundles in `tools:` to concrete tool names.
 *   5. Validate that every resolved tool name exists in the tool catalog.
 *
 * The loader is pure (no I/O). Use `agent-registry.ts` to load files from
 * disk or strings from a DB column and feed them into `loadAgent()`.
 *
 * @module modules/cursor/agents/agent-loader
 */

import type { CursorWorkerType } from "../cursor-workers";
import { splitFrontmatter, type Frontmatter } from "./frontmatter";
import { BUNDLE_NAMES, expandToolList } from "./tool-bundles";
import type { AgentDefinition, AgentHandoff } from "./types";

// ===========================================
// Errors
// ===========================================

/** Thrown when a `.agent.md` file is malformed */
export class AgentLoadError extends Error {
  constructor(agentName: string, message: string) {
    super(`Agent "${agentName}": ${message}`);
    this.name = "AgentLoadError";
  }
}

// ===========================================
// Public API
// ===========================================

export interface LoadAgentOptions {
  /** Source label for tracking ("builtin" by default) */
  source?: AgentDefinition["source"];
  /**
   * Set of tool names known to the runtime. When provided, the loader
   * validates that every resolved tool exists in this set and throws on
   * unknown references. When omitted, validation is skipped (useful for
   * unit tests).
   */
  knownTools?: Set<string>;
  /**
   * Optional fallback name used when the frontmatter omits `name:` (e.g.
   * derived from the filename). Required when frontmatter lacks `name`.
   */
  fallbackName?: string;
}

/**
 * Parse a `.agent.md` file body and return a validated `AgentDefinition`.
 *
 * @throws AgentLoadError if the frontmatter is missing required fields,
 *         references unknown bundles, or (when `knownTools` is supplied)
 *         references unknown tools.
 */
export function loadAgent(
  source: string,
  options: LoadAgentOptions = {},
): AgentDefinition {
  const { data, body } = splitFrontmatter(source);
  const fm = validateFrontmatter(data, options.fallbackName);
  const toolNames = resolveTools(fm, options.knownTools);
  return {
    source: options.source ?? "builtin",
    frontmatter: fm,
    toolNames,
    body: body.trim(),
  };
}

// ===========================================
// Frontmatter validation
// ===========================================

function validateFrontmatter(
  raw: Frontmatter,
  fallbackName: string | undefined,
): AgentDefinition["frontmatter"] {
  const name = pickString(raw, "name") ?? fallbackName;
  if (!name) {
    throw new AgentLoadError("<unknown>", "missing required `name` field");
  }
  if (!/^[a-z][a-z0-9-]*$/.test(name)) {
    throw new AgentLoadError(
      name,
      "`name` must be lowercase kebab-case (letters, digits, hyphens)",
    );
  }
  const description = pickString(raw, "description");
  if (!description) {
    throw new AgentLoadError(name, "missing required `description` field");
  }

  const fm: AgentDefinition["frontmatter"] = {
    name,
    description,
    displayName: pickString(raw, "displayName") ?? capitalize(name),
    argumentHint: pickString(raw, "argumentHint") ?? pickString(raw, "argument-hint"),
    userInvocable: pickBoolean(raw, "userInvocable") ?? true,
    disableModelInvocation: pickBoolean(raw, "disableModelInvocation") ?? false,
    tools: pickStringArray(name, raw, "tools"),
    agents: pickStringArray(name, raw, "agents"),
    model: pickStringArray(name, raw, "model"),
    handoffs: pickHandoffs(name, raw),
    runtime: pickRuntime(name, raw),
    studioMode: pickStudioMode(name, raw),
    // agent-owned execution config
    maxCredits: pickPositiveNumber(name, raw, "maxCredits"),
    maxIterations: pickPositiveNumber(name, raw, "maxIterations"),
    temperature: pickTemperature(name, raw),
    liteRouting: pickBoolean(raw, "liteRouting"),
    fullModelAfterTurn: pickPositiveNumber(name, raw, "fullModelAfterTurn"),
    needsWorkspace: pickBoolean(raw, "needsWorkspace"),
    pluginEdit: pickBoolean(raw, "pluginEdit"),
    workflowAware: pickBoolean(raw, "workflowAware"),
  };
  return fm;
}

function pickString(raw: Frontmatter, key: string): string | undefined {
  const v = raw[key];
  if (typeof v !== "string") return undefined;
  return v;
}

function pickBoolean(raw: Frontmatter, key: string): boolean | undefined {
  const v = raw[key];
  if (typeof v !== "boolean") return undefined;
  return v;
}

function pickStringArray(
  agentName: string,
  raw: Frontmatter,
  key: string,
): string[] | undefined {
  const v = raw[key];
  if (v === undefined || v === null) return undefined;
  if (!Array.isArray(v)) {
    throw new AgentLoadError(agentName, `\`${key}\` must be a list`);
  }
  const out: string[] = [];
  for (const entry of v) {
    if (typeof entry !== "string") {
      throw new AgentLoadError(
        agentName,
        `\`${key}\` entries must be strings (got ${typeof entry})`,
      );
    }
    out.push(entry);
  }
  return out;
}

function pickHandoffs(
  agentName: string,
  raw: Frontmatter,
): AgentHandoff[] | undefined {
  const v = raw["handoffs"];
  if (v === undefined || v === null) return undefined;
  if (!Array.isArray(v)) {
    throw new AgentLoadError(agentName, "`handoffs` must be a list");
  }
  const out: AgentHandoff[] = [];
  for (const entry of v) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new AgentLoadError(
        agentName,
        "`handoffs` entries must be `{ label, agent, prompt }` objects",
      );
    }
    const obj = entry as Record<string, unknown>;
    const label = obj["label"];
    const agent = obj["agent"];
    const prompt = obj["prompt"];
    if (typeof label !== "string" || typeof agent !== "string" || typeof prompt !== "string") {
      throw new AgentLoadError(
        agentName,
        "each handoff requires string `label`, `agent`, and `prompt`",
      );
    }
    out.push({ label, agent, prompt });
  }
  return out;
}

function pickRuntime(
  agentName: string,
  raw: Frontmatter,
): CursorWorkerType | undefined {
  const v = raw["runtime"];
  if (v === undefined || v === null) return undefined;
  if (v !== "assistant" && v !== "coder") {
    throw new AgentLoadError(
      agentName,
      "`runtime` must be either `assistant` or `coder`",
    );
  }
  return v;
}

function pickStudioMode(
  agentName: string,
  raw: Frontmatter,
): "agent" | "ask" | "plan" | "build" | undefined {
  const v = raw["studioMode"];
  if (v === undefined || v === null) return undefined;
  if (v !== "agent" && v !== "ask" && v !== "plan" && v !== "build") {
    throw new AgentLoadError(
      agentName,
      "`studioMode` must be one of: agent, ask, plan, build",
    );
  }
  return v;
}

function pickPositiveNumber(
  agentName: string,
  raw: Frontmatter,
  key: string,
): number | undefined {
  const v = raw[key];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) {
    throw new AgentLoadError(
      agentName,
      `\`${key}\` must be a positive number (got ${typeof v === "number" ? v : typeof v})`,
    );
  }
  return v;
}

function pickTemperature(
  agentName: string,
  raw: Frontmatter,
): number | undefined {
  const v = raw["temperature"];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 2) {
    throw new AgentLoadError(
      agentName,
      "`temperature` must be a number between 0 and 2",
    );
  }
  return v;
}

// ===========================================
// Tool resolution
// ===========================================

function resolveTools(
  fm: AgentDefinition["frontmatter"],
  knownTools: Set<string> | undefined,
): string[] {
  const entries = fm.tools ?? [];
  if (entries.length === 0) return [];
  // Validate bundle / tool references before expansion.
  if (knownTools) {
    for (const entry of entries) {
      const stripped = entry.startsWith("!") ? entry.slice(1) : entry;
      if (BUNDLE_NAMES.includes(stripped)) continue;
      if (knownTools.has(stripped)) continue;
      throw new AgentLoadError(
        fm.name,
        `unknown tool or bundle: \`${stripped}\` (must be a capability bundle or a tool name from cursor-worker-tools.ts)`,
      );
    }
  }
  return expandToolList(entries);
}

// ===========================================
// Helpers
// ===========================================

function capitalize(s: string): string {
  if (!s) return s;
  return s
    .split("-")
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : ""))
    .join(" ");
}

// ===========================================
// Public for completeness
// ===========================================

export type { AgentDefinition, AgentFrontmatter, AgentHandoff } from "./types";
