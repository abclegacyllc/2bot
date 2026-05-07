/**
 * BuildSpec Smoke Test Runner
 *
 * Supports three smoke-test kinds (declared in `spec.smokeTests[]`):
 *   • `kind: "preflight"`      — static graph + plugin-binding validation,
 *                                no execution. Wave 1.
 *   • `kind: "manual-run"`     — executes the workflow once with an empty
 *                                trigger payload, as if a user clicked
 *                                "Run now". Wave 2.
 *   • `kind: "sample-payload"` — executes the workflow once with a caller-
 *                                supplied `payload` used as the trigger
 *                                event body. Wave 2.
 *
 * Wave 2 execution kinds run via the existing workflow executor with
 * `{ dryRun: true, allowDraft: true }`:
 *   • dryRun=true skips real outbound gateway calls (no Telegram
 *     sendMessage etc.) and the gateway-status precondition,
 *   • allowDraft=true lets us target the freshly-created DRAFT workflow
 *     row (orchestrator only flips it to ACTIVE *after* smoke tests pass).
 *
 * @module modules/cursor/buildspec/smoke-test.runner
 */

import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { executeWorkflow } from "@/modules/workflow/workflow.executor";
import { preflightWorkflow } from "@/modules/workflow/workflow.preflight";

import type {
    BuildSpec,
    BuildSpecOwner,
    BuildSpecSmokeResult,
    BuildSpecSmokeTest,
} from "./buildspec.types";

const smokeLogger = logger.child({ module: "cursor-buildspec-smoke" });

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
      if (test.kind === "preflight") {
        results.push(await runPreflight(owner, test, workflowId));
      } else {
        // manual-run | sample-payload — both go through the executor with
        // dryRun semantics; the only difference is the trigger payload.
        results.push(await runExecution(test, workflowId));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      smokeLogger.warn(
        { workflowId, kind: test.kind, err: message },
        "smoke test threw",
      );
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

async function runPreflight(
  owner: BuildSpecOwner,
  test: BuildSpecSmokeTest,
  workflowId: string,
): Promise<BuildSpecSmokeResult> {
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

  return {
    workflowRef: test.workflowRef,
    workflowId,
    ok: report.errors.length === 0,
    errorCount: report.errors.length,
    warningCount: report.warnings.length,
    errors: errorProblems,
  };
}

async function runExecution(
  test: BuildSpecSmokeTest,
  workflowId: string,
): Promise<BuildSpecSmokeResult> {
  if (test.kind === "preflight") {
    throw new Error("runExecution called with kind=preflight (caller bug)");
  }

  // `payload` is required on sample-payload, optional on manual-run.
  const payload =
    test.kind === "sample-payload"
      ? test.payload
      : (test.payload ?? {});

  const triggeredBy =
    test.kind === "manual-run"
      ? "buildspec-smoke-manual"
      : "buildspec-smoke-sample";

  // Execute through the standard executor. dryRun=true suppresses real
  // gateway side-effects; allowDraft=true permits running the still-DRAFT
  // workflow created moments earlier by `resolveWorkflows`.
  const runId = await executeWorkflow(
    workflowId,
    triggeredBy,
    payload,
    { dryRun: true, allowDraft: true, captureLogs: true },
  );

  // executeWorkflow runs steps inline and updates WorkflowRun.status
  // before returning, so we can read final status immediately.
  const run = await prisma.workflowRun.findUnique({
    where: { id: runId },
    select: { status: true, error: true, failedStepOrder: true },
  });

  if (!run) {
    return {
      workflowRef: test.workflowRef,
      workflowId,
      ok: false,
      errorCount: 1,
      warningCount: 0,
      errors: [
        {
          code: "smoke-run-not-found",
          message: `WorkflowRun ${runId} not found after execution`,
        },
      ],
    };
  }

  if (run.status === "completed") {
    smokeLogger.info(
      { workflowId, runId, kind: test.kind },
      "Smoke execution completed successfully",
    );
    return {
      workflowRef: test.workflowRef,
      workflowId,
      ok: true,
      errorCount: 0,
      warningCount: 0,
      errors: [],
    };
  }

  // failed | cancelled | running (unexpected)
  const errMessage = run.error ?? `WorkflowRun ended with status="${run.status}"`;
  const stepInfo =
    run.failedStepOrder !== null && run.failedStepOrder !== undefined
      ? ` (failed at step #${run.failedStepOrder})`
      : "";

  smokeLogger.warn(
    { workflowId, runId, kind: test.kind, status: run.status, error: errMessage },
    "Smoke execution failed",
  );

  return {
    workflowRef: test.workflowRef,
    workflowId,
    ok: false,
    errorCount: 1,
    warningCount: 0,
    errors: [
      {
        code: `smoke-${test.kind}-failed`,
        message: `${errMessage}${stepInfo}`,
      },
    ],
  };
}
