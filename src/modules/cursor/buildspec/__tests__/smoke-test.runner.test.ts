/**
 * Smoke-test runner tests.
 *
 * Covers:
 *   • preflight kind (delegates to preflightWorkflow)
 *   • manual-run kind (executes via executeWorkflow with empty payload)
 *   • sample-payload kind (executes with caller-supplied payload)
 *   • workflow-not-applied skip when ref missing from workflowMap
 *   • thrown errors → smoke-exception result
 *   • completed run → ok=true
 *   • failed run → ok=false with run.error in message
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({
  logger: {
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

const findUniqueMock = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    workflowRun: {
      get findUnique() {
        return findUniqueMock;
      },
    },
  },
}));

const executeWorkflowMock = vi.fn();
vi.mock("@/modules/workflow/workflow.executor", () => ({
  executeWorkflow: (...a: unknown[]) => executeWorkflowMock(...a),
}));

const preflightWorkflowMock = vi.fn();
vi.mock("@/modules/workflow/workflow.preflight", () => ({
  preflightWorkflow: (...a: unknown[]) => preflightWorkflowMock(...a),
}));

import { runSmokeTests } from "../smoke-test.runner";

const owner = { userId: "u1", organizationId: null };

const minimalSpec = {
  project: { name: "P" },
  gateways: [],
  plugins: [],
  workflows: [],
  resources: [],
  smokeTests: [] as Array<Record<string, unknown>>,
};

beforeEach(() => {
  findUniqueMock.mockReset();
  executeWorkflowMock.mockReset();
  preflightWorkflowMock.mockReset();
});

describe("runSmokeTests — preflight kind", () => {
  it("delegates to preflightWorkflow and returns ok=true when no errors", async () => {
    preflightWorkflowMock.mockResolvedValue({ errors: [], warnings: [] });

    // Cast: test fixture; spec.smokeTests is iterated structurally by the runner.
    const results = await runSmokeTests(
      owner,
      {
        ...minimalSpec,
        smokeTests: [{ workflowRef: "wf-a", kind: "preflight" }],
      } as unknown as Parameters<typeof runSmokeTests>[1],
      { "wf-a": "wf-real-1" },
    );

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      workflowRef: "wf-a",
      workflowId: "wf-real-1",
      ok: true,
      errorCount: 0,
    });
    expect(preflightWorkflowMock).toHaveBeenCalledWith(
      { userId: "u1", organizationId: null },
      "wf-real-1",
    );
    expect(executeWorkflowMock).not.toHaveBeenCalled();
  });

  it("returns ok=false with mapped errors when preflight reports issues", async () => {
    preflightWorkflowMock.mockResolvedValue({
      errors: [{ fixId: "STEP_NO_PLUGIN", message: "Step 0 has no plugin" }],
      warnings: [{ message: "deprecated" }],
    });

    const results = await runSmokeTests(
      owner,
      {
        ...minimalSpec,
        smokeTests: [{ workflowRef: "wf-a", kind: "preflight" }],
      } as unknown as Parameters<typeof runSmokeTests>[1],
      { "wf-a": "wf-real-1" },
    );

    expect(results[0]!.ok).toBe(false);
    expect(results[0]!.errorCount).toBe(1);
    expect(results[0]!.warningCount).toBe(1);
    expect(results[0]!.errors[0]).toMatchObject({
      code: "STEP_NO_PLUGIN",
      message: "Step 0 has no plugin",
    });
  });
});

describe("runSmokeTests — manual-run kind", () => {
  it("executes the workflow with empty payload and returns ok=true on completed run", async () => {
    executeWorkflowMock.mockResolvedValue("run-1");
    findUniqueMock.mockResolvedValue({ status: "completed", error: null, failedStepOrder: null });

    const results = await runSmokeTests(
      owner,
      {
        ...minimalSpec,
        smokeTests: [{ workflowRef: "wf-a", kind: "manual-run" }],
      } as unknown as Parameters<typeof runSmokeTests>[1],
      { "wf-a": "wf-real-1" },
    );

    expect(results[0]!.ok).toBe(true);
    expect(executeWorkflowMock).toHaveBeenCalledWith(
      "wf-real-1",
      "buildspec-smoke-manual",
      {},
      { dryRun: true, allowDraft: true, captureLogs: true },
    );
  });

  it("uses inline payload when provided on manual-run", async () => {
    executeWorkflowMock.mockResolvedValue("run-1");
    findUniqueMock.mockResolvedValue({ status: "completed", error: null, failedStepOrder: null });

    await runSmokeTests(
      owner,
      {
        ...minimalSpec,
        smokeTests: [
          { workflowRef: "wf-a", kind: "manual-run", payload: { ping: true } },
        ],
      } as unknown as Parameters<typeof runSmokeTests>[1],
      { "wf-a": "wf-real-1" },
    );

    const [, , payload] = executeWorkflowMock.mock.calls[0]!;
    expect(payload).toEqual({ ping: true });
  });

  it("returns ok=false with run.error when workflow run fails", async () => {
    executeWorkflowMock.mockResolvedValue("run-2");
    findUniqueMock.mockResolvedValue({
      status: "failed",
      error: "Plugin threw",
      failedStepOrder: 1,
    });

    const results = await runSmokeTests(
      owner,
      {
        ...minimalSpec,
        smokeTests: [{ workflowRef: "wf-a", kind: "manual-run" }],
      } as unknown as Parameters<typeof runSmokeTests>[1],
      { "wf-a": "wf-real-1" },
    );

    expect(results[0]!.ok).toBe(false);
    expect(results[0]!.errors[0]!.code).toBe("smoke-manual-run-failed");
    expect(results[0]!.errors[0]!.message).toContain("Plugin threw");
    expect(results[0]!.errors[0]!.message).toContain("step #1");
  });
});

describe("runSmokeTests — sample-payload kind", () => {
  it("executes with the supplied payload and uses the sample triggeredBy label", async () => {
    executeWorkflowMock.mockResolvedValue("run-3");
    findUniqueMock.mockResolvedValue({ status: "completed", error: null, failedStepOrder: null });

    await runSmokeTests(
      owner,
      {
        ...minimalSpec,
        smokeTests: [
          {
            workflowRef: "wf-a",
            kind: "sample-payload",
            payload: { message: { text: "hi" }, gatewayId: "gw-1" },
          },
        ],
      } as unknown as Parameters<typeof runSmokeTests>[1],
      { "wf-a": "wf-real-1" },
    );

    expect(executeWorkflowMock).toHaveBeenCalledWith(
      "wf-real-1",
      "buildspec-smoke-sample",
      { message: { text: "hi" }, gatewayId: "gw-1" },
      { dryRun: true, allowDraft: true, captureLogs: true },
    );
  });
});

describe("runSmokeTests — error paths", () => {
  it("emits workflow-not-applied when ref is missing from workflowMap", async () => {
    const results = await runSmokeTests(
      owner,
      {
        ...minimalSpec,
        smokeTests: [{ workflowRef: "ghost", kind: "preflight" }],
      } as unknown as Parameters<typeof runSmokeTests>[1],
      {},
    );

    expect(results[0]!.ok).toBe(false);
    expect(results[0]!.errors[0]!.code).toBe("workflow-not-applied");
    expect(preflightWorkflowMock).not.toHaveBeenCalled();
    expect(executeWorkflowMock).not.toHaveBeenCalled();
  });

  it("captures thrown executor errors as smoke-exception", async () => {
    executeWorkflowMock.mockRejectedValue(new Error("executor exploded"));

    const results = await runSmokeTests(
      owner,
      {
        ...minimalSpec,
        smokeTests: [{ workflowRef: "wf-a", kind: "manual-run" }],
      } as unknown as Parameters<typeof runSmokeTests>[1],
      { "wf-a": "wf-real-1" },
    );

    expect(results[0]!.ok).toBe(false);
    expect(results[0]!.errors[0]).toMatchObject({
      code: "smoke-exception",
      message: "executor exploded",
    });
  });

  it("returns smoke-run-not-found when WorkflowRun row is missing", async () => {
    executeWorkflowMock.mockResolvedValue("run-x");
    findUniqueMock.mockResolvedValue(null);

    const results = await runSmokeTests(
      owner,
      {
        ...minimalSpec,
        smokeTests: [{ workflowRef: "wf-a", kind: "manual-run" }],
      } as unknown as Parameters<typeof runSmokeTests>[1],
      { "wf-a": "wf-real-1" },
    );

    expect(results[0]!.ok).toBe(false);
    expect(results[0]!.errors[0]!.code).toBe("smoke-run-not-found");
  });
});
