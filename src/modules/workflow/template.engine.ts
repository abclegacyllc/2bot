/**
 * Workflow Template Engine
 *
 * Resolves template strings like `{{trigger.message.text}}` or `{{steps.0.output.result}}`
 * against an execution context. Used for input mappings between workflow steps.
 *
 * @module modules/workflow/template.engine
 */

import type { TemplateContext } from "./workflow.types";

/** Maximum depth for nested property access to prevent abuse */
const MAX_PATH_DEPTH = 10;

/** Maximum template string length */
const MAX_TEMPLATE_LENGTH = 10_000;

/** Regex to match template expressions: {{path.to.value}} */
const TEMPLATE_REGEX = /\{\{([^}]+)\}\}/g;

/**
 * Safely resolve a dotted path (with bracket notation) against an object.
 * Returns undefined if any segment is missing.
 *
 * Supports both dot and bracket notation:
 * - `a.b.c`          → obj.a.b.c
 * - `steps[0].output` → obj.steps[0].output
 * - `steps.0.output`  → obj.steps["0"].output
 *
 * @example
 * resolvePath({ a: { b: 42 } }, "a.b") // 42
 * resolvePath({ steps: { 0: { output: "hi" } } }, "steps.0.output") // "hi"
 * resolvePath({ 0: "hi" }, "[0]") // "hi"
 */
function resolvePath(obj: unknown, path: string): unknown {
  // Normalise bracket notation: `steps[0].output` → `steps.0.output`
  const normalised = path.replace(/\[(\d+)\]/g, ".$1");
  const segments = normalised.split(".").filter(Boolean);
  if (segments.length > MAX_PATH_DEPTH) {
    return undefined;
  }

  let current: unknown = obj;
  for (const segment of segments) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

/**
 * Resolve a single template expression path against the context.
 *
 * Supported top-level keys: trigger, prev, steps, env, ctx
 */
function resolveExpression(expression: string, context: TemplateContext): unknown {
  const trimmed = expression.trim();
  if (!trimmed) return undefined;

  // Normalise bracket notation first so `steps[0].output` → `steps.0.output`
  const normalised = trimmed.replace(/\[(\d+)\]/g, ".$1");

  // Split into root key and rest
  const dotIdx = normalised.indexOf(".");
  const rootKey = dotIdx === -1 ? normalised : normalised.slice(0, dotIdx);
  const restPath = dotIdx === -1 ? "" : normalised.slice(dotIdx + 1);

  let root: unknown;
  switch (rootKey) {
    case "trigger":
      root = context.trigger;
      break;
    case "prev":
      root = context.prev;
      break;
    case "steps":
      root = context.steps;
      break;
    case "env":
      root = context.env;
      break;
    case "ctx":
      root = context.ctx;
      break;
    default:
      return undefined;
  }

  if (!restPath) return root;
  return resolvePath(root, restPath);
}

/**
 * Resolve all `{{...}}` expressions in a template string.
 *
 * If the entire string is a single expression (e.g. `{{trigger.message}}`),
 * returns the raw value (object, number, etc.) rather than stringifying it.
 * This allows passing structured data between steps.
 *
 * If the string mixes text and expressions (e.g. `Hello {{trigger.name}}`),
 * all expressions are stringified and interpolated.
 *
 * @returns The resolved value — could be any type for single-expression templates,
 *          or a string for mixed templates.
 */
export function resolveTemplate(
  template: string,
  context: TemplateContext
): unknown {
  if (typeof template !== "string") return template;
  if (template.length > MAX_TEMPLATE_LENGTH) {
    throw new Error(`Template string exceeds maximum length of ${MAX_TEMPLATE_LENGTH}`);
  }

  // Optimisation: if the entire string is a single expression, return the raw value
  const singleMatch = /^\{\{([^}]+)\}\}$/.exec(template);
  if (singleMatch && singleMatch[1]) {
    const value = resolveExpression(singleMatch[1], context);
    return value ?? "";
  }

  // Mixed template — interpolate all expressions as strings
  return template.replace(TEMPLATE_REGEX, (_match, expr: string) => {
    const value = resolveExpression(expr, context);
    if (value === undefined || value === null) return "";
    if (typeof value === "object") {
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    }
    return String(value);
  });
}

/**
 * Resolve an entire input mapping object.
 * Each value is a template string that gets resolved against the context.
 *
 * @returns A new object with all template values resolved.
 */
export function resolveInputMapping(
  mapping: Record<string, string>,
  context: TemplateContext
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, template] of Object.entries(mapping)) {
    result[key] = resolveTemplate(template, context);
  }
  return result;
}

/**
 * Evaluate a simple condition expression.
 *
 * Supports basic comparisons:
 * - `{{path}} == 'value'`
 * - `{{path}} != 'value'`
 * - `{{path}}` (truthy check)
 *
 * All template expressions inside the condition string are resolved first.
 * For safety, this does NOT use eval(). Only simple operators are supported.
 */
export function evaluateCondition(
  conditionExpr: string,
  context: TemplateContext
): boolean {
  if (!conditionExpr || typeof conditionExpr !== "string") return true;

  const trimmed = conditionExpr.trim();
  if (!trimmed) return true;

  // Try equality/inequality/contains comparison: left == right, left != right, left contains right
  const comparisonMatch = /^(.+?)\s*(==|!=|contains)\s+(.+)$/.exec(trimmed);
  if (comparisonMatch) {
    const [, leftExpr = "", operator, rightExpr = ""] = comparisonMatch;
    const left = resolveTemplateValue(leftExpr.trim(), context);
    const right = resolveTemplateValue(rightExpr.trim(), context);

    const leftStr = String(left ?? "");
    const rightStr = String(right ?? "");

    if (operator === "==") return leftStr === rightStr;
    if (operator === "!=") return leftStr !== rightStr;
    if (operator === "contains") return leftStr.includes(rightStr);
  }

  // Truthy check — resolve the whole thing and check truthiness
  const value = resolveTemplateValue(trimmed, context);
  return Boolean(value);
}

/**
 * Resolve a value that might be a template expression or a literal.
 * Strips surrounding quotes from string literals.
 */
function resolveTemplateValue(expr: string, context: TemplateContext): unknown {
  // String literal in single or double quotes
  const quotedMatch = /^(['"])(.*)(\1)$/.exec(expr);
  if (quotedMatch) {
    return quotedMatch[2];
  }

  // Numeric literal
  const num = Number(expr);
  if (!isNaN(num) && expr.trim() !== "") {
    return num;
  }

  // Boolean literals
  if (expr === "true") return true;
  if (expr === "false") return false;
  if (expr === "null") return null;

  // Template expression
  if (expr.includes("{{")) {
    return resolveTemplate(expr, context);
  }

  // Plain path (shorthand without braces)
  return resolveExpression(expr, context);
}

/**
 * Build a TemplateContext from workflow execution state.
 */
export function buildTemplateContext(
  triggerData: unknown,
  stepsResults: Record<number, { output: unknown; error?: string }>,
  currentStepOrder: number,
  meta: {
    userId: string;
    organizationId?: string;
    workflowId: string;
    runId: string;
  }
): TemplateContext {
  // Build steps map (step order → { output, error })
  const stepsOutput: Record<number, unknown> = {};
  for (const [order, result] of Object.entries(stepsResults)) {
    stepsOutput[Number(order)] = {
      output: result.output,
      error: result.error,
    };
  }

  // Previous step (step before current) — full object with output + error
  const prevOrder = currentStepOrder - 1;
  const prevResult = stepsResults[prevOrder];
  const prev = prevResult
    ? { output: prevResult.output, error: prevResult.error }
    : undefined;

  return {
    trigger: triggerData,
    prev,
    steps: stepsOutput,
    env: {}, // No user env vars exposed for now (security)
    ctx: {
      userId: meta.userId,
      organizationId: meta.organizationId,
      workflowId: meta.workflowId,
      runId: meta.runId,
      timestamp: new Date(),
    },
  };
}
