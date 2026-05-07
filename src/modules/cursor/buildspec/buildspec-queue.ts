/**
 * BuildSpec Apply Queue
 *
 * BullMQ queue for asynchronous `applyBuildSpec()` executions. Mirrors the
 * shape of `workflow-queue.ts` so the operational story (Redis connection,
 * retry knobs, container scaling) is the same: a worker process imports
 * `createBuildSpecWorker()` to process jobs.
 *
 * The job payload is just a runId — the spec, options, and owner tuple all
 * live on the persistent `BuildSpecRun` row created at enqueue time.
 *
 * Configuration:
 *   BUILDSPEC_QUEUE_NAME       BullMQ queue name (default: "buildspec-applies")
 *   BUILDSPEC_QUEUE_ATTEMPTS   job retry count (default: 1 — applies are
 *                              non-idempotent at the resource-creation layer)
 *   BUILDSPEC_QUEUE_BACKOFF_MS initial backoff delay in ms (default: 5000)
 *   REDIS_HOST / REDIS_PORT / REDIS_PASSWORD / REDIS_DB
 *
 * @module modules/cursor/buildspec/buildspec-queue
 */

import { Queue, type ConnectionOptions, type JobsOptions } from "bullmq";

import { logger } from "@/lib/logger";

const queueLogger = logger.child({ module: "buildspec-queue" });

export interface BuildSpecJobData {
  runId: string;
}

export interface BuildSpecJobResult {
  runId: string;
  status: "applied" | "rolled-back" | "validation-failed" | "failed";
}

export const BUILDSPEC_QUEUE_NAME =
  process.env.BUILDSPEC_QUEUE_NAME ?? "buildspec-applies";

/**
 * Build a BullMQ-compatible connection from REDIS_* env vars.
 *
 * Mirrors `workflow-queue.buildQueueConnection` — see that file for why we
 * don't reuse the shared rate-limiter Redis client (different
 * `maxRetriesPerRequest` requirement).
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

let queueSingleton: Queue<BuildSpecJobData, BuildSpecJobResult> | null = null;

export function getBuildSpecQueue(): Queue<BuildSpecJobData, BuildSpecJobResult> {
  if (queueSingleton) return queueSingleton;

  queueSingleton = new Queue<BuildSpecJobData, BuildSpecJobResult>(
    BUILDSPEC_QUEUE_NAME,
    {
      connection: buildQueueConnection(),
      defaultJobOptions: defaultJobOptions(),
    },
  );

  queueSingleton.on("error", (err) => {
    queueLogger.error({ err }, "buildspec queue error");
  });

  queueLogger.info(
    { queue: BUILDSPEC_QUEUE_NAME },
    "BuildSpec queue initialised",
  );

  return queueSingleton;
}

export function defaultJobOptions(): JobsOptions {
  // Default attempts=1: applyBuildSpec is not idempotent at the resource-
  // creation layer (each retry would create duplicate gateway/workflow rows
  // unless rollback completed cleanly). Operators can override via env if
  // they have an idempotency story for their flows.
  const attempts = Math.max(
    1,
    parseInt(process.env.BUILDSPEC_QUEUE_ATTEMPTS ?? "1", 10),
  );
  const backoffMs = Math.max(
    0,
    parseInt(process.env.BUILDSPEC_QUEUE_BACKOFF_MS ?? "5000", 10),
  );
  return {
    attempts,
    backoff: { type: "exponential", delay: backoffMs },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  };
}

/**
 * Enqueue a BuildSpec apply for asynchronous execution. The caller is
 * expected to have already inserted a `BuildSpecRun` row in QUEUED status.
 *
 * Uses `runId` as the BullMQ jobId so the queue dedupes accidental double-
 * enqueues — if the API layer is replayed for any reason, BullMQ silently
 * ignores the second `add()` instead of running the apply twice.
 */
export async function enqueueBuildSpecApply(
  data: BuildSpecJobData,
  opts: JobsOptions = {},
): Promise<{ jobId: string }> {
  const queue = getBuildSpecQueue();
  const jobOpts: JobsOptions = {
    ...defaultJobOptions(),
    jobId: `bs:${data.runId}`,
    ...opts,
  };

  const job = await queue.add("apply", data, jobOpts);
  if (!job.id) throw new Error("BullMQ did not return a job id");

  queueLogger.info(
    { jobId: job.id, runId: data.runId },
    "BuildSpec apply enqueued",
  );

  return { jobId: job.id };
}

export async function closeBuildSpecQueue(): Promise<void> {
  if (!queueSingleton) return;
  try {
    await queueSingleton.close();
  } catch (err) {
    queueLogger.warn(
      { err },
      "Error while closing buildspec queue (ignored)",
    );
  } finally {
    queueSingleton = null;
  }
}

/** Test-only hook — reset the singleton between tests. */
export function __resetBuildSpecQueueForTests(): void {
  queueSingleton = null;
}
