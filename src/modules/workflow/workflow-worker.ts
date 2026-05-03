/**
 * Workflow Worker
 *
 * BullMQ Worker that picks up jobs enqueued via `workflow-queue.ts` and
 * delegates each job to the existing `executeWorkflow()` function. Designed
 * to be run inside a dedicated worker container, scalable horizontally with
 * `docker-compose up --scale workflow-worker=N`.
 *
 * The worker imports `executeWorkflow` directly — there is no API call back
 * into the API service. Both the API and the worker share the same Postgres
 * (for `WorkflowRun` rows) and Redis (for the BullMQ queue + bridge
 * dispatch) so this is a single-process unit of work.
 *
 * Configuration:
 *   WORKFLOW_WORKER_CONCURRENCY  number of jobs processed in parallel (default: 5)
 *
 * @module modules/workflow/workflow-worker
 */

import { Worker, type WorkerOptions } from "bullmq";

import { logger } from "@/lib/logger";
import {
    workflowRunDurationMs,
    workflowRunsTotal,
} from "@/lib/metrics";

import { executeWorkflow } from "./workflow.executor";
import {
    WORKFLOW_QUEUE_NAME,
    buildQueueConnection,
    type WorkflowJobData,
    type WorkflowJobResult,
} from "./workflow-queue";

const workerLogger = logger.child({ module: "workflow-worker" });

/**
 * Process a single queued workflow run by calling the existing executor.
 * Exported separately for unit testing.
 */
export async function processWorkflowJob(
  data: WorkflowJobData
): Promise<WorkflowJobResult> {
  const start = Date.now();
  try {
    const runId = await executeWorkflow(
      data.workflowId,
      data.triggeredBy,
      data.triggerData,
      data.options,
      data.idempotencyKey
    );
    workflowRunsTotal.inc({ status: "success", trigger: data.triggeredBy });
    workflowRunDurationMs.observe({ status: "success" }, Date.now() - start);
    return { runId };
  } catch (err) {
    workflowRunsTotal.inc({ status: "failure", trigger: data.triggeredBy });
    workflowRunDurationMs.observe({ status: "failure" }, Date.now() - start);
    throw err;
  }
}

/**
 * Build (but do not start) a BullMQ Worker bound to the workflow queue.
 *
 * The Worker starts processing immediately on construction. Callers retain
 * the returned instance so they can `await worker.close()` on shutdown.
 */
export function createWorkflowWorker(
  overrides: Partial<WorkerOptions> = {}
): Worker<WorkflowJobData, WorkflowJobResult> {
  const concurrency = Math.max(
    1,
    parseInt(process.env.WORKFLOW_WORKER_CONCURRENCY ?? "5", 10)
  );

  const worker = new Worker<WorkflowJobData, WorkflowJobResult>(
    WORKFLOW_QUEUE_NAME,
    async (job) => processWorkflowJob(job.data),
    {
      connection: buildQueueConnection(),
      concurrency,
      ...overrides,
    }
  );

  worker.on("completed", (job, result) => {
    workerLogger.info(
      {
        jobId: job.id,
        workflowId: job.data.workflowId,
        runId: result?.runId,
        attempts: job.attemptsMade,
      },
      "Workflow job completed"
    );
  });

  worker.on("failed", (job, err) => {
    workerLogger.error(
      {
        jobId: job?.id,
        workflowId: job?.data?.workflowId,
        attempts: job?.attemptsMade,
        err: err instanceof Error ? { message: err.message, stack: err.stack } : err,
      },
      "Workflow job failed"
    );
  });

  worker.on("error", (err) => {
    workerLogger.error({ err }, "Workflow worker error");
  });

  workerLogger.info(
    { queue: WORKFLOW_QUEUE_NAME, concurrency },
    "Workflow worker started"
  );

  return worker;
}
