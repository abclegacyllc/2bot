/**
 * Preflight Fix Registry
 *
 * Each "fix task" is a named, self-contained action that can repair a specific
 * class of preflight problem automatically — without requiring human action.
 *
 * Architecture:
 *   - Each fix is registered with a stable string ID (e.g. "trigger.set-match-all").
 *   - The ID is embedded in the PreflightProblem returned by runPreflight().
 *   - The UI renders a "Fix" button next to any problem that carries a fixId.
 *   - POST /workflows/:id/preflight/fix dispatches to the registered task.
 *   - Tasks receive a typed FixContext so they can act on the exact resource.
 *
 * Adding a new fix:
 *   1. Write a `register({ id, label, description, execute })` call below.
 *   2. Attach the same `fixId` + any needed `fixContext` to the problem in
 *      workflow.preflight.ts.
 *   3. That's it — the API route and UI pick it up automatically.
 *
 * @module modules/workflow/preflight-fix-registry
 */

import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

const fixLogger = logger.child({ module: "preflight-fix-registry" });

// ============================================================================
// Types
// ============================================================================

export interface FixContext {
  workflowId: string;
  stepId?: string;
  stepOrder?: number;
  /** Any extra key-value context specific to the fix task */
  [key: string]: unknown;
}

export interface FixResult {
  /** Human-readable confirmation shown in the UI after the fix runs */
  message: string;
  /** When true, the caller should re-run preflight to refresh the report */
  rerunPreflight?: boolean;
}

export interface PreflightFixTask {
  /** Stable identifier — must match the fixId stored on the PreflightProblem */
  id: string;
  /** Short label displayed on the Fix button (e.g. "Apply fix") */
  label: string;
  /** One-sentence description shown as a tooltip */
  description: string;
  execute: (ctx: FixContext) => Promise<FixResult>;
}

// ============================================================================
// Registry
// ============================================================================

const registry = new Map<string, PreflightFixTask>();

export function registerFix(task: PreflightFixTask): void {
  if (registry.has(task.id)) {
    fixLogger.warn({ fixId: task.id }, "Preflight fix task already registered — overwriting");
  }
  registry.set(task.id, task);
}

export function getFix(id: string): PreflightFixTask | undefined {
  return registry.get(id);
}

export function listFixes(): PreflightFixTask[] {
  return Array.from(registry.values());
}

// ============================================================================
// Built-in fix tasks
// ============================================================================

// ── trigger.set-match-all ────────────────────────────────────────────────────
// Fires when a bot-message trigger has no filter config and is missing the
// `matchAll: true` sentinel that the trigger editor normally writes on save.
// Fix: write the sentinel directly so the warning disappears immediately.
registerFix({
  id: "trigger.set-match-all",
  label: "Confirm match-all",
  description: "Marks this trigger as intentionally matching all incoming messages.",
  async execute({ workflowId }) {
    const wf = await prisma.workflow.findUniqueOrThrow({
      where: { id: workflowId },
      select: { triggerConfig: true },
    });
    const config = ((wf.triggerConfig ?? {}) as Record<string, unknown>);
    config.matchAll = true;
    await prisma.workflow.update({
      where: { id: workflowId },
      data: { triggerConfig: config as Prisma.InputJsonValue },
    });
    fixLogger.info({ workflowId }, "Fix trigger.set-match-all applied");
    return {
      message: "Trigger is now set to match all incoming messages.",
      rerunPreflight: true,
    };
  },
});

// ── steps.compact-ordering ───────────────────────────────────────────────────
// Fires when step `order` values have gaps (e.g. after a delete before the
// auto-compact was deployed). Fix: renumber steps 0, 1, 2, …
registerFix({
  id: "steps.compact-ordering",
  label: "Fix step order",
  description: "Renumbers workflow steps to remove ordering gaps (0, 1, 2, …).",
  async execute({ workflowId }) {
    const steps = await prisma.workflowStep.findMany({
      where: { workflowId },
      select: { id: true },
      orderBy: { order: "asc" },
    });
    await prisma.$transaction(
      steps.map((s, idx) =>
        prisma.workflowStep.update({ where: { id: s.id }, data: { order: idx } })
      )
    );
    fixLogger.info({ workflowId, count: steps.length }, "Fix steps.compact-ordering applied");
    return {
      message: "Step ordering has been compacted.",
      rerunPreflight: true,
    };
  },
});

// ── workflow.connect-gateway ─────────────────────────────────────────────────
// Fires when a gateway-dependent trigger type has no gatewayId.
// This fix cannot auto-select a gateway (the user must choose one), but it can
// return a rich message that guides them — it is intentionally UI-only guidance.
// We keep it registered so future code can swap in a real auto-assign if there
// is exactly one available gateway.
registerFix({
  id: "workflow.connect-gateway",
  label: "Connect gateway",
  description: "Opens the gateway selector so you can bind a gateway to this workflow.",
  async execute({ workflowId }) {
    // Inform the caller to open the gateway selector panel instead of
    // silently mutating — we cannot guess which gateway the user wants.
    fixLogger.info({ workflowId }, "Fix workflow.connect-gateway invoked (UI-only guidance)");
    return {
      message: "Open Settings → Gateway and select the gateway to connect to this workflow.",
      rerunPreflight: false,
    };
  },
});

// ── steps.connect-sequential ─────────────────────────────────────────────────
// Fires when a workflow has multiple steps but no edges connecting them.
// Without edges the executor runs every step in parallel — for bot-message
// triggers this means each plugin receives the same message and replies,
// producing duplicate bot replies in chat.
// Fix: create a linear chain of edges trigger → step0 → step1 → step2 → …
// so steps execute sequentially, each one only firing after the previous
// step's output is available.
registerFix({
  id: "steps.connect-sequential",
  label: "Connect steps",
  description: "Chains workflow steps in order so they run sequentially instead of in parallel.",
  async execute({ workflowId }) {
    const steps = await prisma.workflowStep.findMany({
      where: { workflowId },
      select: { id: true, order: true },
      orderBy: { order: "asc" },
    });
    if (steps.length < 2) {
      return {
        message: "Workflow has fewer than 2 steps — no connections needed.",
        rerunPreflight: true,
      };
    }
    // Create edges step[i] → step[i+1].  We deliberately do NOT add a
    // trigger → step[0] edge here; the executor treats step 0 as the
    // entry point when no inbound edge exists, which matches existing
    // single-step workflow behaviour.
    const edgeData = [];
    for (let i = 0; i < steps.length - 1; i++) {
      edgeData.push({
        workflowId,
        sourceStepId: steps[i]!.id,
        targetStepId: steps[i + 1]!.id,
      });
    }
    await prisma.workflowEdge.createMany({
      data: edgeData,
      skipDuplicates: true,
    });
    fixLogger.info(
      { workflowId, edgesCreated: edgeData.length },
      "Fix steps.connect-sequential applied"
    );
    return {
      message: `Connected ${steps.length} steps sequentially. Steps now run one after another.`,
      rerunPreflight: true,
    };
  },
});
