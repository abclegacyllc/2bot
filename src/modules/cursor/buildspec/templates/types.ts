/**
 * Code Template Library — types
 *
 * A code template materialises a complete plugin bundle (manifest +
 * source files) from a small set of typed inputs. Templates are pure
 * functions: no filesystem, no DB, no network. The Wave 2 codegen
 * pipeline calls `renderTemplate(...)` and persists the returned files
 * to the workspace container.
 *
 * Adding a template:
 *   1. Create `templates/<id>.ts` exporting a `CodeTemplate`.
 *   2. Register it in `templates/index.ts`.
 *   3. Add a unit test under `__tests__/templates/<id>.test.ts`.
 *
 * @module modules/cursor/buildspec/templates/types
 */

import type { GatewayType } from "@prisma/client";
import type { z } from "zod";

/** A single file in the rendered plugin bundle. */
export interface RenderedFile {
  /** Workspace-relative path, e.g. `"plugin.json"`, `"index.js"`. Never absolute, never starts with `../`. */
  path: string;
  /** UTF-8 file contents. */
  content: string;
}

/** plugin.json manifest shape — matches the marketplace builder. */
export interface RenderedManifest {
  slug: string;
  name: string;
  version: string;
  description: string;
  category: string;
  requiredGateways: GatewayType[];
  tags: string[];
  difficulty: "beginner" | "intermediate" | "advanced";
  configSchema: Record<string, unknown>;
  entryFile: string;
  layout: "single" | "directory";
  icon: string;
  author: string;
  isBuiltin: boolean;
  eventTypes: string[];
  eventRole: "responder" | "observer" | "initiator";
  inputSchema: Record<string, unknown> | null;
  outputSchema: Record<string, unknown> | null;
}

/** Successful render output. */
export interface TemplateRenderResult {
  /** The plugin.json manifest object (also serialised into `files`). */
  manifest: RenderedManifest;
  /** Source files including plugin.json. Caller writes these as-is. */
  files: RenderedFile[];
  /** Effective slug (after applying inputs / defaults). */
  slug: string;
  /** Entry file path inside the bundle. */
  entryFile: string;
}

/** Per-template language tag — used by the UI / Coder for syntax hints. */
export type TemplateLanguage = "typescript" | "javascript";

/**
 * A code template. Generic over `Inputs` so each template defines its own
 * strongly-typed input shape via Zod.
 */
export interface CodeTemplate<Inputs = unknown> {
  /** Stable id referenced by `BuildSpecGeneratedPluginInstall.template`. */
  readonly id: string;
  /** UI-facing display name. */
  readonly displayName: string;
  /** One-line summary. */
  readonly description: string;
  readonly language: TemplateLanguage;
  /** Gateway types this template targets (empty = gateway-agnostic). */
  readonly requiredGateways: GatewayType[];
  /**
   * Zod schema validating the `templateInputs` object. The render function
   * receives the parsed (typed) inputs.
   */
  readonly inputs: z.ZodType<Inputs>;
  /**
   * Pure render function — must NOT touch the filesystem, DB, or network.
   * Throws `TemplateInputError` for invalid inputs that the schema cannot
   * catch (e.g. cross-field constraints).
   */
  render: (args: TemplateRenderArgs<Inputs>) => TemplateRenderResult;
}

export interface TemplateRenderArgs<Inputs> {
  /** Slug for the new plugin (already validated against `^[a-z0-9-]+$`). */
  slug: string;
  /** Human-readable plugin name. */
  name: string;
  /** Optional description shown in the marketplace browser. */
  description?: string | null;
  /** Validated, typed template inputs. */
  inputs: Inputs;
}

/**
 * Thrown by `renderTemplate` when the inputs fail validation or a
 * cross-field rule. Callers should surface the message to the user.
 */
export class TemplateInputError extends Error {
  readonly issues: string[];
  constructor(message: string, issues: string[] = []) {
    super(message);
    this.name = "TemplateInputError";
    this.issues = issues;
  }
}

/**
 * Thrown when the requested template id is not registered.
 */
export class TemplateNotFoundError extends Error {
  readonly templateId: string;
  constructor(templateId: string) {
    super(`Code template "${templateId}" is not registered`);
    this.name = "TemplateNotFoundError";
    this.templateId = templateId;
  }
}
