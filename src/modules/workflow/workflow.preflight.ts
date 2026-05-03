/**
 * Workflow Preflight
 *
 * Static validation that runs BEFORE executing a workflow. Used by the Test
 * button (Quick mode) and as the first phase of Standard / Deep test modes.
 *
 * Checks:
 *   1. Workflow has at least one step
 *   2. Trigger is configured (and gateway is bound for gateway triggers)
 *   3. All steps reference real plugins; UserPlugin is installed
 *   4. Step ordering has no gaps
 *   5. No disabled-then-enabled gaps in execution chain
 *   6. Per-step plugin file syntax + manifest + lint (via bridge agent)
 *
 * Returns a structured report — never throws for validation issues.
 *
 * @module modules/workflow/workflow.preflight
 */

import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { validatePluginInWorkspace } from "@/modules/plugin/plugin.executor";
import { NotFoundError } from "@/shared/errors";
// Side-effect import — ensures all built-in fix tasks are registered before
// any preflight report is produced.
import "@/modules/workflow/preflight-fix-registry";

const preflightLogger = logger.child({ module: "workflow-preflight" });

// ===========================================
// Types
// ===========================================

export interface PreflightProblem {
  severity: "error" | "warning" | "info";
  message: string;
  /** Optional file path (workspace-relative) when the problem is in a plugin file */
  file?: string;
  /** Optional 1-based line number */
  line?: number;
  /** Optional column */
  column?: number;
  /**
   * When set, a registered PreflightFixTask with this ID can repair the
   * problem automatically.  The UI shows a "Fix" button for these problems.
   */
  fixId?: string;
  /**
   * Extra context forwarded to the fix task's `execute()` call alongside
   * the workflowId (e.g. { stepId, stepOrder }).
   */
  fixContext?: Record<string, unknown>;
}

export interface StepPreflightReport {
  stepId: string;
  stepOrder: number;
  stepName: string;
  pluginSlug: string;
  entryFile: string | null;
  problems: PreflightProblem[];
  /** True when the bridge static-validation step ran successfully */
  bridgeChecked: boolean;
  /** True when the bridge wasn't reachable (workspace not running) */
  bridgeSkipped: boolean;
}

export interface PreflightReport {
  workflowId: string;
  workflowName: string;
  /** Overall outcome: ok = no errors anywhere; warnings allowed */
  ok: boolean;
  /** Aggregated workflow-level errors (empty when no problems) */
  errors: PreflightProblem[];
  warnings: PreflightProblem[];
  /** Per-step reports including plugin file validation */
  steps: StepPreflightReport[];
  /** Total time spent running the preflight, in ms */
  durationMs: number;
  /** Counts for at-a-glance display */
  summary: {
    stepsTotal: number;
    stepsEnabled: number;
    errorCount: number;
    warningCount: number;
  };
}

interface PreflightOwner {
  userId: string;
  organizationId?: string | null;
}

// ===========================================
// Main entry point
// ===========================================

/**
 * Run a full preflight check on a workflow.
 * The caller is responsible for ownership verification before invoking this.
 */
export async function preflightWorkflow(
  owner: PreflightOwner,
  workflowId: string,
): Promise<PreflightReport> {
  const startedAt = Date.now();

  const workflow = await prisma.workflow.findUnique({
    where: { id: workflowId },
    include: {
      steps: {
        orderBy: { order: "asc" },
        include: { plugin: { select: { id: true, slug: true, name: true } } },
      },
      edges: { select: { id: true, sourceStepId: true, targetStepId: true } },
    },
  });

  if (!workflow) throw new NotFoundError("Workflow not found");
  if (workflow.userId !== owner.userId) {
    throw new NotFoundError("Workflow not found"); // hide existence to non-owners
  }

  const errors: PreflightProblem[] = [];
  const warnings: PreflightProblem[] = [];

  // ─── Workflow-level checks ───────────────────────────────────────

  if (workflow.steps.length === 0) {
    errors.push({
      severity: "error",
      message: "Workflow has no steps — add at least one plugin step before testing.",
    });
  }

  const triggerConfig = workflow.triggerConfig as Record<string, unknown> | null;
  const triggerType = workflow.triggerType ?? "";

  // Trigger types where an empty / unconfigured config is a genuine problem:
  // - SCHEDULE with no cron expression → will never fire
  // - Any unrecognised trigger with nothing set → likely a mistake
  // Bot-message triggers (BOT_MESSAGE / *_MESSAGE / *_COMMAND) with blank
  // filters are valid — they mean "match all incoming messages".  We trust
  // that explicitly if `matchAll: true` is set, OR if the type is a known
  // bot-message trigger (the trigger editor sets the sentinel on save).
  const isSchedule = triggerType === "SCHEDULE";
  const isBotMessageTrigger =
    triggerType === "BOT_MESSAGE" ||
    triggerType.endsWith("_MESSAGE") ||
    triggerType.endsWith("_COMMAND");
  const isWebhook = triggerType === "WEBHOOK" || triggerType === "MANUAL";

  const configEmpty = !triggerConfig || Object.keys(triggerConfig).length === 0;
  const matchAllIntent = triggerConfig?.matchAll === true;

  if (isSchedule && (!triggerConfig?.cron || String(triggerConfig.cron).trim() === "")) {
    warnings.push({
      severity: "warning",
      message: "Schedule trigger has no cron expression — the workflow will never run automatically.",
    });
  } else if (!isWebhook && !isBotMessageTrigger && !isSchedule && configEmpty) {
    warnings.push({
      severity: "warning",
      message: "Trigger has no configuration. The workflow may not match any incoming events.",
    });
  } else if (isBotMessageTrigger && configEmpty && !matchAllIntent) {
    // Trigger editor always saves matchAll:true for bot-message with no filters.
    // If it's missing the sentinel, the user may have set triggerType directly
    // without going through the editor — offer a one-click fix.
    warnings.push({
      severity: "warning",
      message: "Trigger has no filter configured. Click Fix to confirm this should match all messages, or open the trigger editor and save.",
      fixId: "trigger.set-match-all",
    });
  }

  const gatewayTriggers = new Set([
    "TELEGRAM_MESSAGE", "TELEGRAM_CALLBACK",
    "DISCORD_MESSAGE", "DISCORD_COMMAND",
    "SLACK_MESSAGE", "SLACK_COMMAND",
    "WHATSAPP_MESSAGE", "BOT_MESSAGE",
  ]);
  if (gatewayTriggers.has(triggerType) && !workflow.gatewayId) {
    errors.push({
      severity: "error",
      message: `Trigger "${triggerType}" requires a gateway — bind a gateway to this workflow.`,
      fixId: "workflow.connect-gateway",
    });
  }

  if (workflow.gatewayId) {
    const gw = await prisma.gateway.findUnique({
      where: { id: workflow.gatewayId },
      select: { status: true, name: true },
    });
    if (!gw) {
      errors.push({
        severity: "error",
        message: `Bound gateway ${workflow.gatewayId} no longer exists.`,
      });
    } else if (gw.status !== "CONNECTED") {
      warnings.push({
        severity: "warning",
        message: `Gateway "${gw.name}" is ${gw.status}. Live test runs will fail until it reconnects.`,
      });
    }
  }

  if (workflow.steps.length > 0) {
    const orders = workflow.steps.map((s) => s.order);
    const hasGap = orders.some((o, i) => o !== i);
    if (hasGap) {
      // Auto-heal: compact step ordering in-place so subsequent runs are clean.
      // This fixes any gap left by a pre-existing delete before the on-delete
      // compaction was deployed.  Best-effort — never blocks the preflight.
      try {
        await prisma.$transaction(
          workflow.steps.map((s, idx) =>
            prisma.workflowStep.update({ where: { id: s.id }, data: { order: idx } })
          )
        );
        preflightLogger.info({ workflowId }, "Auto-compacted step ordering during preflight");
        // Re-apply corrected orders in-memory so the rest of preflight is consistent
        workflow.steps.forEach((s, idx) => { s.order = idx; });
      } catch (compactErr) {
        preflightLogger.warn({ workflowId, compactErr }, "Could not auto-compact step ordering");
        // Only emit the warning when we failed to fix it — offer a manual fix button
        warnings.push({
          severity: "warning",
          message: "Step ordering has gaps. Click Fix to renumber steps automatically.",
          fixId: "steps.compact-ordering",
        });
      }
    }
  }

  if (workflow.steps.length > 1) {
    let foundDisabled = false;
    for (const step of workflow.steps) {
      if (!step.isEnabled) {
        foundDisabled = true;
      } else if (foundDisabled) {
        warnings.push({
          severity: "warning",
          message: "There are disabled steps between enabled ones — execution may skip unexpectedly.",
        });
        break;
      }
    }
  }

  // ─── Parallel-execution warning for bot-message workflows ────────
  // When a workflow has multiple enabled steps but no edges connecting them,
  // the executor runs all steps in parallel in a single layer.  For bot-
  // message triggers this means EVERY plugin receives the same message and
  // every plugin replies — producing duplicate replies in chat.
  // Most users want sequential execution by default; warn + offer auto-fix.
  const enabledStepCount = workflow.steps.filter((s) => s.isEnabled).length;
  if (
    enabledStepCount > 1 &&
    workflow.edges.length === 0 &&
    isBotMessageTrigger
  ) {
    warnings.push({
      severity: "warning",
      message:
        `Workflow has ${enabledStepCount} steps but no connections between them — every step will run in parallel and reply to the same message, causing duplicate bot replies. Click Fix to chain steps sequentially (Step 0 → Step 1 → …).`,
      fixId: "steps.connect-sequential",
    });
  }

  // ─── Per-step checks (parallelized) ──────────────────────────────

  const installedPluginIds = new Set(
    (await prisma.userPlugin.findMany({
      where: { userId: owner.userId, isEnabled: true },
      select: { pluginId: true },
    })).map((up) => up.pluginId),
  );

  const stepReports: StepPreflightReport[] = await Promise.all(
    workflow.steps.map(async (step): Promise<StepPreflightReport> => {
      const problems: PreflightProblem[] = [];
      let bridgeChecked = false;
      let bridgeSkipped = false;

      const pluginSlug = step.plugin?.slug ?? "(unknown)";
      const stepName = step.name ?? step.plugin?.name ?? pluginSlug;

      if (!step.plugin) {
        problems.push({
          severity: "error",
          message: `Step ${step.order}: plugin "${step.pluginId}" not found in catalog.`,
        });
      } else if (!installedPluginIds.has(step.pluginId)) {
        problems.push({
          severity: "warning",
          message: `Plugin "${step.plugin.name}" is not in your installed plugins — may auto-install on first run.`,
        });
      }

      if (!step.isEnabled) {
        problems.push({
          severity: "info",
          message: "Step is disabled — it will be skipped during execution.",
        });
      }

      // Static plugin validation via bridge agent (only for steps with files)
      if (step.entryFile && step.plugin) {
        try {
          const result = await validatePluginInWorkspace(
            owner.userId,
            owner.organizationId,
            step.entryFile,
          );
          if (!result.bridgeAvailable) {
            bridgeSkipped = true;
            problems.push({
              severity: "info",
              message: "Workspace not running — plugin file checks skipped. Start your workspace for full validation.",
            });
          } else {
            bridgeChecked = true;
            for (const p of result.problems) {
              problems.push({
                severity: p.severity,
                message: p.message,
                file: step.entryFile,
                line: p.line,
                column: p.column,
              });
            }
          }
        } catch (err) {
          preflightLogger.warn(
            { workflowId, stepId: step.id, err: err instanceof Error ? err.message : String(err) },
            "Per-step preflight check failed",
          );
          problems.push({
            severity: "warning",
            message: `Could not validate plugin file: ${err instanceof Error ? err.message : "unknown error"}`,
            file: step.entryFile,
          });
        }
      }

      return {
        stepId: step.id,
        stepOrder: step.order,
        stepName,
        pluginSlug,
        entryFile: step.entryFile ?? null,
        problems,
        bridgeChecked,
        bridgeSkipped,
      };
    }),
  );

  // Aggregate counts
  let errorCount = errors.length;
  let warningCount = warnings.length;
  for (const sr of stepReports) {
    for (const p of sr.problems) {
      if (p.severity === "error") errorCount++;
      else if (p.severity === "warning") warningCount++;
    }
  }

  const enabledCount = workflow.steps.filter((s) => s.isEnabled).length;

  const report: PreflightReport = {
    workflowId: workflow.id,
    workflowName: workflow.name,
    ok: errorCount === 0,
    errors,
    warnings,
    steps: stepReports,
    durationMs: Date.now() - startedAt,
    summary: {
      stepsTotal: workflow.steps.length,
      stepsEnabled: enabledCount,
      errorCount,
      warningCount,
    },
  };

  preflightLogger.info(
    {
      workflowId,
      ok: report.ok,
      errorCount,
      warningCount,
      durationMs: report.durationMs,
    },
    "Workflow preflight complete",
  );

  return report;
}
