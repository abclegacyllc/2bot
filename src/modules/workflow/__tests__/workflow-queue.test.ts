/**
 * Phase 5.5 — Workflow Queue + Worker tests
 *
 * BullMQ is mocked end-to-end so the suite has no Redis dependency. We assert
 * the integration contract: enqueue parameters, idempotent jobId derivation,
 * worker delegation to executeWorkflow, and metric emissions.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock bullmq before importing the modules under test (hoisted)
// ---------------------------------------------------------------------------
const mocks = vi.hoisted(() => {
  const queueAddMock = vi.fn();
  const queueOnMock = vi.fn();
  const queueCloseMock = vi.fn().mockResolvedValue(undefined);
  const QueueCtorMock = vi.fn(function (this: unknown) {
    return {
      add: queueAddMock,
      on: queueOnMock,
      close: queueCloseMock,
    };
  });

  const workerOnMock = vi.fn();
  const state: { workerProcessor: ((job: { data: unknown; id: string }) => Promise<unknown>) | null } = {
    workerProcessor: null,
  };
  const WorkerCtorMock = vi.fn(function (this: unknown, ..._args: unknown[]) {
    const processor = _args[1] as (job: { data: unknown; id: string }) => Promise<unknown>;
    state.workerProcessor = processor;
    return { on: workerOnMock, close: vi.fn().mockResolvedValue(undefined) };
  });

  const executeWorkflowMock = vi.fn();

  return {
    queueAddMock,
    queueOnMock,
    QueueCtorMock,
    workerOnMock,
    WorkerCtorMock,
    state,
    executeWorkflowMock,
  };
});

vi.mock("bullmq", () => ({
  Queue: mocks.QueueCtorMock,
  Worker: mocks.WorkerCtorMock,
}));

vi.mock("../workflow.executor", () => ({
  executeWorkflow: (...args: unknown[]) => mocks.executeWorkflowMock(...args),
}));

import {
    __resetWorkflowQueueForTests,
    enqueueWorkflowRun,
    getWorkflowQueue,
} from "../workflow-queue";
import { processWorkflowJob, createWorkflowWorker } from "../workflow-worker";

const {
  queueAddMock,
  queueOnMock,
  QueueCtorMock,
  workerOnMock,
  WorkerCtorMock,
  state,
  executeWorkflowMock,
} = mocks;

beforeEach(() => {
  queueAddMock.mockReset();
  queueOnMock.mockReset();
  QueueCtorMock.mockClear();
  WorkerCtorMock.mockClear();
  workerOnMock.mockReset();
  executeWorkflowMock.mockReset();
  state.workerProcessor = null;
  __resetWorkflowQueueForTests();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("workflow-queue", () => {
  it("getWorkflowQueue is lazy and singleton", () => {
    expect(QueueCtorMock).not.toHaveBeenCalled();

    const a = getWorkflowQueue();
    const b = getWorkflowQueue();

    expect(QueueCtorMock).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
  });

  it("enqueueWorkflowRun adds job with merged options and returns jobId", async () => {
    queueAddMock.mockResolvedValueOnce({ id: "job-1" });

    const result = await enqueueWorkflowRun({
      workflowId: "wf-1",
      triggeredBy: "manual",
      triggerData: { foo: "bar" },
    });

    expect(result).toEqual({ jobId: "job-1" });
    expect(queueAddMock).toHaveBeenCalledTimes(1);
    const [name, data, opts] = queueAddMock.mock.calls[0]!;
    expect(name).toBe("run");
    expect(data).toMatchObject({ workflowId: "wf-1", triggeredBy: "manual" });
    expect(opts).toBeDefined();
  });

  it("derives stable jobId from idempotencyKey", async () => {
    queueAddMock.mockResolvedValueOnce({ id: "wf:abc" });

    await enqueueWorkflowRun({
      workflowId: "wf-1",
      triggeredBy: "webhook",
      triggerData: {},
      idempotencyKey: "abc",
    });

    const [, , opts] = queueAddMock.mock.calls[0]!;
    expect(opts.jobId).toBe("wf:abc");
  });

  it("respects WORKFLOW_QUEUE_ATTEMPTS and BACKOFF env vars", async () => {
    vi.stubEnv("WORKFLOW_QUEUE_ATTEMPTS", "7");
    vi.stubEnv("WORKFLOW_QUEUE_BACKOFF_MS", "12000");
    queueAddMock.mockResolvedValueOnce({ id: "job-2" });

    await enqueueWorkflowRun({
      workflowId: "wf-2",
      triggeredBy: "schedule",
      triggerData: null,
    });

    const [, , opts] = queueAddMock.mock.calls[0]!;
    expect(opts.attempts).toBe(7);
    expect(opts.backoff).toEqual({ type: "exponential", delay: 12000 });
  });

  it("throws when bullmq does not return a job id (defensive)", async () => {
    queueAddMock.mockResolvedValueOnce({ id: undefined });

    await expect(
      enqueueWorkflowRun({
        workflowId: "wf-3",
        triggeredBy: "manual",
        triggerData: null,
      })
    ).rejects.toThrow(/did not return a job id/);
  });

  it("caller-supplied jobId wins over idempotencyKey", async () => {
    queueAddMock.mockResolvedValueOnce({ id: "explicit" });

    await enqueueWorkflowRun(
      {
        workflowId: "wf-4",
        triggeredBy: "manual",
        triggerData: null,
        idempotencyKey: "should-not-be-used",
      },
      { jobId: "explicit" }
    );

    const [, , opts] = queueAddMock.mock.calls[0]!;
    expect(opts.jobId).toBe("explicit");
  });
});

describe("workflow-worker", () => {
  it("processWorkflowJob delegates to executeWorkflow and returns runId", async () => {
    executeWorkflowMock.mockResolvedValueOnce("run-99");

    const result = await processWorkflowJob({
      workflowId: "wf-1",
      triggeredBy: "manual",
      triggerData: { ping: 1 },
      options: { dryRun: true },
      idempotencyKey: "k-1",
    });

    expect(result).toEqual({ runId: "run-99" });
    expect(executeWorkflowMock).toHaveBeenCalledWith(
      "wf-1",
      "manual",
      { ping: 1 },
      { dryRun: true },
      "k-1"
    );
  });

  it("processWorkflowJob propagates executor errors (so BullMQ can retry)", async () => {
    executeWorkflowMock.mockRejectedValueOnce(new Error("boom"));

    await expect(
      processWorkflowJob({
        workflowId: "wf-1",
        triggeredBy: "manual",
        triggerData: null,
      })
    ).rejects.toThrow("boom");
  });

  it("createWorkflowWorker starts a Worker bound to the queue", () => {
    createWorkflowWorker();

    expect(WorkerCtorMock).toHaveBeenCalledTimes(1);
    const call = WorkerCtorMock.mock.calls[0]!;
    const [name, processor] = call;
    const opts = call[2] as { concurrency: number };
    expect(name).toBe(process.env.WORKFLOW_QUEUE_NAME ?? "workflow-runs");
    expect(typeof processor).toBe("function");
    expect(opts.concurrency).toBeGreaterThanOrEqual(1);
  });

  it("worker processor invokes processWorkflowJob with job.data", async () => {
    executeWorkflowMock.mockResolvedValueOnce("run-77");
    createWorkflowWorker();

    expect(state.workerProcessor).not.toBeNull();
    const result = await state.workerProcessor!({
      id: "j1",
      data: {
        workflowId: "wf-x",
        triggeredBy: "schedule",
        triggerData: { tick: true },
      },
    });
    expect(result).toEqual({ runId: "run-77" });
    expect(executeWorkflowMock).toHaveBeenCalled();
  });

  it("respects WORKFLOW_WORKER_CONCURRENCY", () => {
    vi.stubEnv("WORKFLOW_WORKER_CONCURRENCY", "12");
    createWorkflowWorker();
    const opts = WorkerCtorMock.mock.calls[0]![2] as { concurrency: number };
    expect(opts.concurrency).toBe(12);
  });
});
