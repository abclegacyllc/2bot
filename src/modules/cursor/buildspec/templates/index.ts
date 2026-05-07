/**
 * Code Template Library — registry & top-level API.
 *
 * Wave 2 codegen calls `renderTemplate(templateId, args)`. The registry
 * is a pure in-memory map; adding a template = importing it here and
 * dropping it into `TEMPLATES`.
 *
 * @module modules/cursor/buildspec/templates
 */

import type { GatewayType } from "@prisma/client";

import { telegramEchoJavascriptTemplate } from "./telegram-echo-javascript";
import {
    TemplateInputError,
    TemplateNotFoundError,
    type CodeTemplate,
    type TemplateLanguage,
    type TemplateRenderResult,
} from "./types";
import { webhookHandlerJavascriptTemplate } from "./webhook-handler-javascript";

// Re-export the public types/errors so consumers only import from this barrel.
export {
    TemplateInputError, TemplateNotFoundError
} from "./types";
export type {
    CodeTemplate, RenderedFile,
    RenderedManifest, TemplateLanguage,
    TemplateRenderResult
} from "./types";

// ─────────────────────────────────────────────────────────────────────
// Registry
// ─────────────────────────────────────────────────────────────────────

/**
 * Frozen registry of all known code templates, keyed by `template.id`.
 * Order is preserved for `listTemplates()` (used by UI dropdowns).
 */
const REGISTRY: ReadonlyArray<CodeTemplate<unknown>> = Object.freeze([
  telegramEchoJavascriptTemplate as CodeTemplate<unknown>,
  webhookHandlerJavascriptTemplate as CodeTemplate<unknown>,
]);

const REGISTRY_BY_ID: ReadonlyMap<string, CodeTemplate<unknown>> = new Map(
  REGISTRY.map((t) => [t.id, t]),
);

// ─────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,118}[a-z0-9])?$/;
const FILE_PATH_RE = /^[A-Za-z0-9_.][A-Za-z0-9_./-]*$/;

function assertSafeSlug(slug: string): void {
  if (!SLUG_RE.test(slug)) {
    throw new TemplateInputError(
      `Invalid plugin slug "${slug}" — must match ${SLUG_RE.source}`,
    );
  }
}

function assertSafeFilePath(p: string): void {
  // Defence-in-depth — the templates control these strings, but callers
  // may pass through user input via `inputs`. Reject any path that escapes
  // the bundle root or contains backslashes / null bytes.
  if (!p || p.length > 512) {
    throw new TemplateInputError(`Rendered file path is empty or too long: "${p}"`);
  }
  if (p.includes("\\") || p.includes("\u0000")) {
    throw new TemplateInputError(`Rendered file path contains illegal characters: "${p}"`);
  }
  if (p.startsWith("/") || p.startsWith("..") || p.includes("/../") || p.endsWith("/..")) {
    throw new TemplateInputError(`Rendered file path escapes bundle root: "${p}"`);
  }
  if (!FILE_PATH_RE.test(p)) {
    throw new TemplateInputError(
      `Rendered file path contains illegal characters: "${p}"`,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────

/**
 * Lightweight description for UI listings — does not expose the
 * render function or zod schema.
 */
export interface TemplateSummary {
  id: string;
  displayName: string;
  description: string;
  language: TemplateLanguage;
  requiredGateways: GatewayType[];
}

/** Lists every registered template (registration order). */
export function listTemplates(): TemplateSummary[] {
  return REGISTRY.map((t) => ({
    id: t.id,
    displayName: t.displayName,
    description: t.description,
    language: t.language,
    requiredGateways: [...t.requiredGateways],
  }));
}

/** Returns true iff `templateId` is registered. */
export function hasTemplate(templateId: string): boolean {
  return REGISTRY_BY_ID.has(templateId);
}

/** Returns the registered template, or throws `TemplateNotFoundError`. */
export function getTemplate(templateId: string): CodeTemplate<unknown> {
  const t = REGISTRY_BY_ID.get(templateId);
  if (!t) throw new TemplateNotFoundError(templateId);
  return t;
}

export interface RenderTemplateArgs {
  templateId: string;
  /** Plugin slug used for the catalog row. Validated against `SLUG_RE`. */
  slug: string;
  /** Plugin display name. */
  name: string;
  description?: string | null;
  /** Free-form template inputs validated by the template's own zod schema. */
  inputs?: Record<string, unknown>;
}

/**
 * Materialise a template into a manifest + files.
 *
 * Throws:
 *  - `TemplateNotFoundError` — unknown templateId
 *  - `TemplateInputError`    — slug / inputs validation failure
 */
export function renderTemplate(args: RenderTemplateArgs): TemplateRenderResult {
  assertSafeSlug(args.slug);
  if (!args.name || args.name.length === 0 || args.name.length > 120) {
    throw new TemplateInputError(
      `Invalid plugin name (1–120 chars required): "${args.name}"`,
    );
  }

  const template = getTemplate(args.templateId);
  const parsed = template.inputs.safeParse(args.inputs ?? {});
  if (!parsed.success) {
    const issues = parsed.error.issues.map(
      (i) => `${i.path.join(".") || "<root>"}: ${i.message}`,
    );
    throw new TemplateInputError(
      `Invalid inputs for template "${template.id}"`,
      issues,
    );
  }

  const result = template.render({
    slug: args.slug,
    name: args.name,
    description: args.description ?? null,
    inputs: parsed.data,
  });

  // Defence-in-depth: validate every rendered path before returning.
  for (const f of result.files) {
    assertSafeFilePath(f.path);
  }
  // Every bundle must include a plugin.json
  if (!result.files.some((f) => f.path === "plugin.json")) {
    throw new TemplateInputError(
      `Template "${template.id}" did not emit plugin.json`,
    );
  }
  // Manifest slug + entryFile must match the result fields.
  if (result.manifest.slug !== result.slug) {
    throw new TemplateInputError(
      `Template "${template.id}" manifest.slug "${result.manifest.slug}" does not match result.slug "${result.slug}"`,
    );
  }
  if (result.manifest.entryFile !== result.entryFile) {
    throw new TemplateInputError(
      `Template "${template.id}" manifest.entryFile does not match result.entryFile`,
    );
  }

  return result;
}
