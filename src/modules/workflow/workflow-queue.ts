/**
 * Workflow Queue
 *
 * BullMQ-backed queue for workflow execution. Decouples trigger sites from
 * the workflow executor so runs can be processed by horizontally scalable
 * worker containers with retries, backoff, and a dead-letter queue.
 *
 * The queue is OPT-IN: code that wants async execution calls
 * `enqueueWorkflowRun(...)`. Existing inline callers (`executeWorkflow` in
 * `workflow.executor.ts`) are unchanged. This makes the migration from inline
 * to queued execution a deployment-time switch with no API surface change.
 *
 * Configuration:
 *   WORKFLOW_QUEUE_ENABLED       enable/disable lazy initialisation (default: false)
 *   WORKFLOW_QUEUE_NAME          BullMQ queue name (default: "workflow-runs")
 *   WORKFLOW_QUEUE_ATTEMPTS      job retry count (default: 3)
 *   WORKFLOW_QUEUE_BACKOFF_MS    initial backoff delay in ms (default: 5000)
 *   REDIS_HOST / REDIS_PORT / REDIS_PASSWORD / REDIS_DB
 *
 * @module modules/workflow/workflow-queue
 */

import { Queue, type ConnectionOptions, type JobsOptions } from "bullmq";

import { logger } from "@/lib/logger";

const queueLogger = logger.child({ module: "workflow-queue" });

/**
 * Job payload mirrors the arguments accepted by `executeWorkflow()` so the
 * worker can call straight through to the existing executor without any
 * additional adaptation layer.
 */
export interface WorkflowJobData {
  workflowId: string;
  triggeredBy: string;
  triggerData: unknown;
  options?: { dryRun?: boolean; captureLogs?: boolean; allowDraft?: boolean };
  idempotencyKey?: string;
}

export interface WorkflowJobResult {
  runId: string;
}

export const WORKFLOW_QUEUE_NAME =
  process.env.WORKFLOW_QUEUE_NAME ?? "workflow-runs";

/**
 * Build a BullMQ-compatible connection from REDIS_* env vars.
 *
 * BullMQ requires `maxRetriesPerRequest: null` and a non-blocking
 * `enableReadyCheck: false` for its blocking commands. We therefore do NOT
 * reuse the shared `src/lib/redis.ts` singleton here — that one is configured
 * with `maxRetriesPerRequest: 3` for the rate limiter / replay cache.
 */
export function buildQueueConnection(): ConnectionOptions {
  return {
    host: process.env.REDIS_HOST ?? "localhost",
    port: parseInt(process.env.REDIS_PORT ?? "6379", 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB ?? "0", 10),
    maxRetriesPerRequest: null,
  };
}

let queueSingleton: Queue<WorkflowJobData, WorkflowJobResult> | null = null;

/**
 * Lazily build (and cache) the workflow queue.
 *
 * Connecting to Redis happens at first call — calling `getWorkflowQueue` from
 * a route only opens the connection if and when it is actually used.
 */
export function getWorkflowQueue(): Queue<WorkflowJobData, WorkflowJobResult> {
  if (queueSingleton) return queueSingleton;

  queueSingleton = new Queue<WorkflowJobData, WorkflowJobResult>(
    WORKFLOW_QUEUE_NAME,
    {
      connection: buildQueueConnection(),
      defaultJobOptions: defaultJobOptions(),
    }
  );

  queueSingleton.on("error", (err) => {
    queueLogger.error({ err }, "workflow queue error");
  });

  queueLogger.info({ queue: WORKFLOW_QUEUE_NAME }, "Workflow queue initialised");

  return queueSingleton;
}

/**
 * Default per-job options. Callers can override via the `opts` parameter on
 * `enqueueWorkflowRun`.
 */
export function defaultJobOptions(): JobsOptions {
  const attempts = Math.max(1, parseInt(process.env.WORKFLOW_QUEUE_ATTEMPTS ?? "3", 10));
  const backoffMs = Math.max(0, parseInt(process.env.WORKFLOW_QUEUE_BACKOFF_MS ?? "5000", 10));
  return {
    attempts,
    backoff: { type: "exponential", delay: backoffMs },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  };
}

/**
 * Enqueue a workflow run for asynchronous execution.
 *
 * The `idempotencyKey` (when provided) is also used as the BullMQ `jobId`,
 * which makes BullMQ itself deduplicate concurrent enqueues — `add()` is a
 * no-op if a job with the same id already exists. This is in addition to the
 * Redis-lock `withIdempotency` guard that the executor already does.
 */
export async function enqueueWorkflowRun(
  data: WorkflowJobData,
  opts: JobsOptions = {}
): Promise<{ jobId: string }> {
  const queue = getWorkflowQueue();
  const jobOpts: JobsOptions = { ...defaultJobOptions(), ...opts };
  if (data.idempotencyKey && !jobOpts.jobId) {
    jobOpts.jobId = `wf:${data.idempotencyKey}`;
  }

  const job = await queue.add("run", data, jobOpts);
  if (!job.id) {
    // BullMQ always assigns an id; this branch is purely a type narrowing.
    throw new Error("BullMQ did not return a job id");
  }

  queueLogger.info(
    {
      jobId: job.id,
      workflowId: data.workflowId,
      triggeredBy: data.triggeredBy,
    },
    "Workflow run enqueued"
  );

  return { jobId: job.id };
}

/**
 * Close the queue connection. Call from process-shutdown hooks; otherwise the
 * Node process won't exit because BullMQ keeps a Redis connection open.
 */
export async function closeWorkflowQueue(): Promise<void> {
  if (!queueSingleton) return;
  try {
    await queueSingleton.close();
  } catch (err) {
    queueLogger.warn({ err }, "Error while closing workflow queue (ignored)");
  } finally {
    queueSingleton = null;
  }
}

/** Test-only hook — reset the singleton between tests. */
export function __resetWorkflowQueueForTests(): void {
  queueSingleton = null;
}
