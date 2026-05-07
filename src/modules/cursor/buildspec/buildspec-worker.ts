/**
 * BuildSpec Apply Worker
 *
 * BullMQ Worker that picks up jobs enqueued via `buildspec-queue.ts` and
 * runs the original synchronous `applyBuildSpec()` against the spec stored
 * on the persisted `BuildSpecRun` row. State transitions (RUNNING →
 * APPLIED / ROLLED_BACK / VALIDATION_FAILED / FAILED) and the full result
 * are written back to the row before the worker acks the job.
 *
 * Configuration:
 *   BUILDSPEC_WORKER_CONCURRENCY  jobs processed in parallel (default: 2)
 *
 * @module modules/cursor/buildspec/buildspec-worker
 */

import { Worker, type WorkerOptions } from "bullmq";

import { logger } from "@/lib/logger";

import {
    completeRun,
    failRun,
    getRunForWorker,
    markRunRunning,
} from "./buildspec-run.service";
import {
    BUILDSPEC_QUEUE_NAME,
    buildQueueConnection,
    type BuildSpecJobData,
    type BuildSpecJobResult,
} from "./buildspec-queue";
import { applyBuildSpec } from "./orchestrator.service";
import type { BuildSpec, BuildSpecOwner } from "./buildspec.types";

const workerLogger = logger.child({ module: "buildspec-worker" });

/**
 * Process a single queued apply. Loads the spec from the DB, transitions the
 * run state, calls applyBuildSpec, and persists the result.
 *
 * Exported for unit testing.
 */
export async function processBuildSpecJob(
  data: BuildSpecJobData,
): Promise<BuildSpecJobResult> {
  const run = await getRunForWorker(data.runId);

  // Idempotency: if the row is already terminal, BullMQ is replaying a job
  // we've already finished. Don't re-run the apply.
  if (run.status !== "QUEUED" && run.status !== "RUNNING") {
    workerLogger.info(
      { runId: run.id, status: run.status },
      "BuildSpec run already terminal — skipping",
    );
    return {
      runId: run.id,
      status:
        run.status === "APPLIED"
          ? "applied"
          : run.status === "ROLLED_BACK"
            ? "rolled-back"
            : run.status === "VALIDATION_FAILED"
              ? "validation-failed"
              : "failed",
    };
  }

  await markRunRunning(run.id);

  const owner: BuildSpecOwner = {
    userId: run.userId,
    organizationId: run.organizationId,
  };

  try {
    const result = await applyBuildSpec(owner, run.spec as BuildSpec, {
      dryRun: run.dryRun,
      rollbackOnSmokeFailure: run.rollbackOnSmokeFailure,
      source: run.source,
    });
    await completeRun(run.id, result);
    return { runId: run.id, status: result.status };
  } catch (err) {
    await failRun(run.id, err);
    // Rethrow so BullMQ records the job as failed and applies retry policy.
    throw err;
  }
}

/**
 * Build (and start) a BullMQ Worker bound to the buildspec queue.
 * Returns the worker so callers can `await worker.close()` on shutdown.
 */
export function createBuildSpecWorker(
  overrides: Partial<WorkerOptions> = {},
): Worker<BuildSpecJobData, BuildSpecJobResult> {
  const concurrency = Math.max(
    1,
    parseInt(process.env.BUILDSPEC_WORKER_CONCURRENCY ?? "2", 10),
  );

  const worker = new Worker<BuildSpecJobData, BuildSpecJobResult>(
    BUILDSPEC_QUEUE_NAME,
    async (job) => processBuildSpecJob(job.data),
    {
      connection: buildQueueConnection(),
      concurrency,
      ...overrides,
    },
  );

  worker.on("completed", (job, result) => {
    workerLogger.info(
      {
        jobId: job.id,
        runId: result?.runId,
        status: result?.status,
        attempts: job.attemptsMade,
      },
      "BuildSpec job completed",
    );
  });

  worker.on("failed", (job, err) => {
    workerLogger.error(
      {
        jobId: job?.id,
        runId: job?.data?.runId,
        attempts: job?.attemptsMade,
        err:
          err instanceof Error
            ? { message: err.message, stack: err.stack }
            : err,
      },
      "BuildSpec job failed",
    );
  });

  worker.on("error", (err) => {
    workerLogger.error({ err }, "BuildSpec worker error");
  });

  workerLogger.info(
    { queue: BUILDSPEC_QUEUE_NAME, concurrency },
    "BuildSpec worker started",
  );

  return worker;
}
