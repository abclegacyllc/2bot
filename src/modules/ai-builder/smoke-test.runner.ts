/**
 * BuildSpec Smoke Test Runner (Wave 1)
 *
 * Wave 1 only supports `kind: "preflight"` — runs the existing workflow
 * preflight (static graph + plugin-binding validation, no execution).
 *
 * Wave 2 will add:
 *   • `kind: "manual-run"` — execute the workflow with a synthetic event.
 *   • `kind: "sample-payload"` — execute against a stored fixture.
 *
 * @module modules/ai-builder/smoke-test.runner
 */

import { logger } from "@/lib/logger";
import { preflightWorkflow } from "@/modules/workflow/workflow.preflight";

import type { BuildSpec, BuildSpecOwner, BuildSpecSmokeResult } from "./buildspec.types";

const smokeLogger = logger.child({ module: "ai-builder-smoke" });

/**
 * Runs the smoke tests declared in `spec.smokeTests` against the workflows
 * created during this apply. `workflowMap` maps spec-local refs to real
 * workflow ids.
 *
 * Returns one result per smoke test in spec order. If a smoke test references
 * a workflow that's missing from `workflowMap`, an `ok: false` result is
 * produced with code `"workflow-not-applied"`.
 */
export async function runSmokeTests(
  owner: BuildSpecOwner,
  spec: BuildSpec,
  workflowMap: Record<string, string>,
): Promise<BuildSpecSmokeResult[]> {
  const results: BuildSpecSmokeResult[] = [];

  for (const test of spec.smokeTests) {
    const workflowId = workflowMap[test.workflowRef];
    if (!workflowId) {
      results.push({
        workflowRef: test.workflowRef,
        workflowId: "",
        ok: false,
        errorCount: 1,
        warningCount: 0,
        errors: [
          {
            code: "workflow-not-applied",
            message: `Workflow ref "${test.workflowRef}" was not created during apply`,
          },
        ],
      });
      continue;
    }

    try {
      const report = await preflightWorkflow(
        {
          userId: owner.userId,
          organizationId: owner.organizationId ?? null,
        },
        workflowId,
      );

      const errorProblems = report.errors.map((e) => ({
        code: e.fixId ?? "preflight-error",
        message: e.message,
      }));

      results.push({
        workflowRef: test.workflowRef,
        workflowId,
        ok: report.errors.length === 0,
        errorCount: report.errors.length,
        warningCount: report.warnings.length,
        errors: errorProblems,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      smokeLogger.warn({ workflowId, err: message }, "smoke test threw");
      results.push({
        workflowRef: test.workflowRef,
        workflowId,
        ok: false,
        errorCount: 1,
        warningCount: 0,
        errors: [{ code: "smoke-exception", message }],
      });
    }
  }

  return results;
}
