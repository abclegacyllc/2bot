/**
 * Orchestrator service tests (Phase 6.3 Wave 1)
 *
 * Focuses on validation behaviour, dry-run, and the validation-failed path —
 * full DB apply paths are exercised by integration tests (Wave 2).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

const incMock = vi.fn();
vi.mock("@/lib/metrics", () => ({
  buildspecApplyTotal: { inc: (...a: unknown[]) => incMock("apply", ...a) },
  buildspecSmokeFailuresTotal: { inc: (...a: unknown[]) => incMock("smoke", ...a) },
}));

// Prisma should never be called when dryRun=true or validation fails.
const prismaMock = {
  project: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), delete: vi.fn() },
  projectResource: { deleteMany: vi.fn() },
  gateway: { findUnique: vi.fn(), update: vi.fn(), deleteMany: vi.fn() },
  plugin: { findUnique: vi.fn() },
  userPlugin: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), deleteMany: vi.fn() },
  workflow: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn(), deleteMany: vi.fn() },
  workflowStep: { create: vi.fn() },
  workflowEdge: { create: vi.fn() },
  workflowGateway: { upsert: vi.fn() },
};
vi.mock("@/lib/prisma", () => ({
  get prisma() {
    return prismaMock;
  },
}));

vi.mock("@/modules/gateway/gateway.service", () => ({
  gatewayService: { create: vi.fn() },
}));
vi.mock("@/modules/project/project.service", () => ({
  ensureDefaultProject: vi.fn(),
}));
vi.mock("@/modules/plugin/plugin-deploy.service", () => ({
  gatewayTypeToPlatform: vi.fn(() => "telegram"),
  getPluginEntryPath: vi.fn(() => "plugins/echo-bot.js"),
  isDirectoryLayout: vi.fn(() => false),
}));
vi.mock("@/shared/types/context", () => ({
  createServiceContext: vi.fn((c: unknown) => c),
}));
vi.mock("../smoke-test.runner", () => ({
  runSmokeTests: vi.fn(async () => []),
}));

// Mocks for ProjectResource service used by `resolveResources`.
const createHttpRouteResourceMock = vi.fn();
const createScheduleResourceMock = vi.fn();
const createSecretResourceMock = vi.fn();
vi.mock("@/modules/project-resource/project-resource.service", () => ({
  createHttpRouteResource: (...a: unknown[]) => createHttpRouteResourceMock(...a),
  createScheduleResource: (...a: unknown[]) => createScheduleResourceMock(...a),
  createSecretResource: (...a: unknown[]) => createSecretResourceMock(...a),
}));

import { applyBuildSpec, validateBuildSpec } from "../orchestrator.service";

const owner = { userId: "u1", organizationId: null };

describe("validateBuildSpec", () => {
  it("returns ok=true for a minimal valid spec", () => {
    const r = validateBuildSpec({
      project: { name: "P" },
    });
    expect(r.ok).toBe(true);
  });

  it("returns ok=false with formatted errors for invalid spec", () => {
    const r = validateBuildSpec({ project: { name: "" } });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(typeof r.errors).toBe("object");
      // Should mention project.name
      const flat = JSON.stringify(r.errors);
      expect(flat).toMatch(/project|name/i);
    }
  });

  it("rejects unresolved gateway refs", () => {
    const r = validateBuildSpec({
      project: { name: "P" },
      workflows: [
        {
          ref: "wf",
          name: "WF",
          slug: "wf",
          triggerType: "BOT_MESSAGE",
          gateways: [{ gatewayRef: "missing", role: "trigger" }],
          steps: [],
          edges: [],
        },
      ],
    });
    expect(r.ok).toBe(false);
  });
});

describe("applyBuildSpec", () => {
  beforeEach(() => {
    incMock.mockClear();
    Object.values(prismaMock).forEach((m) => {
      Object.values(m).forEach((fn) => (fn as { mockClear?: () => void }).mockClear?.());
    });
  });

  it("validation-failed result skips all DB calls and increments validation-failed metric", async () => {
    const result = await applyBuildSpec(owner, { project: { name: "" } });
    expect(result.status).toBe("validation-failed");
    expect(result.validationErrors).toBeDefined();
    expect(prismaMock.project.create).not.toHaveBeenCalled();
    expect(incMock).toHaveBeenCalledWith("apply", { status: "validation-failed", source: "api" });
  });

  it("dryRun=true validates but never mutates", async () => {
    const result = await applyBuildSpec(
      owner,
      { project: { name: "Test Project" } },
      { dryRun: true },
    );
    expect(result.status).toBe("applied");
    expect(prismaMock.project.create).not.toHaveBeenCalled();
    expect(prismaMock.gateway.update).not.toHaveBeenCalled();
  });

  it("respects custom 'source' label in metrics", async () => {
    await applyBuildSpec(owner, { project: { name: "" } }, { source: "ai-agent" });
    expect(incMock).toHaveBeenCalledWith("apply", {
      status: "validation-failed",
      source: "ai-agent",
    });
  });
});

// ===========================================================================
// resolveResources integration (Phase 7.4)
// ===========================================================================

describe("applyBuildSpec — resolveResources", () => {
  const ORIGINAL_FLAG = process.env.FEATURE_PROJECT_RESOURCES;

  beforeEach(() => {
    process.env.FEATURE_PROJECT_RESOURCES = "enabled";
    incMock.mockClear();
    Object.values(prismaMock).forEach((m) => {
      Object.values(m).forEach((fn) => (fn as { mockClear?: () => void }).mockClear?.());
    });
    createHttpRouteResourceMock.mockReset();
    createScheduleResourceMock.mockReset();
    createSecretResourceMock.mockReset();

    // Default DB stubs: project create succeeds; workflow create returns id;
    // plugin lookup returns null (no plugin steps in these specs).
    prismaMock.project.findFirst.mockResolvedValue(null);
    prismaMock.project.create.mockImplementation(async (args: { data: Record<string, unknown> }) => ({
      id: "proj-new",
      ...args.data,
    }));
    prismaMock.workflow.findFirst.mockResolvedValue(null);
    prismaMock.workflow.create.mockImplementation(async (args: { data: Record<string, unknown> }) => ({
      id: `wf-${(args.data.slug as string) ?? "x"}`,
      ...args.data,
    }));
    prismaMock.plugin.findUnique.mockResolvedValue(null);
    prismaMock.project.delete.mockResolvedValue(undefined);
    prismaMock.projectResource.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.workflow.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.userPlugin.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.gateway.deleteMany.mockResolvedValue({ count: 0 });
  });

  afterEach(() => {
    if (ORIGINAL_FLAG === undefined) delete process.env.FEATURE_PROJECT_RESOURCES;
    else process.env.FEATURE_PROJECT_RESOURCES = ORIGINAL_FLAG;
  });

  it("creates HTTP_ROUTE resource and resolves targetWorkflowRef → workflow id", async () => {
    createHttpRouteResourceMock.mockResolvedValue({ id: "res-http-1" });

    const result = await applyBuildSpec(owner, {
      project: { name: "P" },
      workflows: [
        {
          ref: "wf-main",
          name: "Main",
          slug: "main",
          triggerType: "WEBHOOK",
          steps: [],
          edges: [],
        },
      ],
      resources: [
        {
          ref: "http-1",
          kind: "HTTP_ROUTE",
          name: "Webhook",
          httpRoute: {
            method: "POST",
            path: "/hooks/run",
            targetWorkflowRef: "wf-main",
            authMode: "NONE",
            authConfig: {},
            maxBodyKb: 1024,
            timeoutMs: 15000,
            passthroughBody: true,
          },
        },
      ],
    });

    expect(result.status).toBe("applied");
    expect(createHttpRouteResourceMock).toHaveBeenCalledTimes(1);
    const [, payload] = createHttpRouteResourceMock.mock.calls[0]!;
    expect(payload.projectId).toBe("proj-new");
    expect(payload.httpRoute.targetWorkflowId).toBe("wf-main");
    expect(payload.httpRoute.targetUserPluginId).toBeNull();
    expect(result.refMap.resources["http-1"]).toBe("res-http-1");
  });

  it("creates SCHEDULE resource and resolves targetWorkflowRef", async () => {
    createScheduleResourceMock.mockResolvedValue({ id: "res-sched-1" });

    const result = await applyBuildSpec(owner, {
      project: { name: "P" },
      workflows: [
        {
          ref: "wf-tick",
          name: "Tick",
          slug: "tick",
          triggerType: "SCHEDULE",
          steps: [],
          edges: [],
        },
      ],
      resources: [
        {
          ref: "sched-1",
          kind: "SCHEDULE",
          name: "Hourly",
          schedule: {
            cron: "0 * * * *",
            timezone: "UTC",
            targetWorkflowRef: "wf-tick",
            enabled: true,
          },
        },
      ],
    });

    expect(result.status).toBe("applied");
    expect(createScheduleResourceMock).toHaveBeenCalledTimes(1);
    const [, payload] = createScheduleResourceMock.mock.calls[0]!;
    expect(payload.schedule.cron).toBe("0 * * * *");
    expect(payload.schedule.targetWorkflowId).toBe("wf-tick");
    expect(result.refMap.resources["sched-1"]).toBe("res-sched-1");
  });

  it("creates SECRET resource without ref resolution", async () => {
    createSecretResourceMock.mockResolvedValue({ id: "res-sec-1" });

    const result = await applyBuildSpec(owner, {
      project: { name: "P" },
      resources: [
        {
          ref: "sec-1",
          kind: "SECRET",
          name: "OpenAI key",
          secret: {
            key: "OPENAI_API_KEY",
            value: "sk-test",
            description: "for the assistant",
          },
        },
      ],
    });

    expect(result.status).toBe("applied");
    expect(createSecretResourceMock).toHaveBeenCalledTimes(1);
    const [, payload] = createSecretResourceMock.mock.calls[0]!;
    expect(payload.secret).toEqual({
      key: "OPENAI_API_KEY",
      value: "sk-test",
      description: "for the assistant",
    });
    expect(result.refMap.resources["sec-1"]).toBe("res-sec-1");
  });

  it("rolls back created resources when a later step throws", async () => {
    createHttpRouteResourceMock.mockResolvedValue({ id: "res-http-2" });
    createSecretResourceMock.mockRejectedValue(new Error("boom"));

    let thrown: unknown;
    try {
      await applyBuildSpec(owner, {
        project: { name: "P" },
        resources: [
          {
            ref: "http-1",
            kind: "HTTP_ROUTE",
            name: "Webhook",
            httpRoute: {
              method: "POST",
              path: "/hooks/run",
              authMode: "NONE",
              authConfig: {},
              maxBodyKb: 1024,
              timeoutMs: 15000,
              passthroughBody: true,
            },
          },
          {
            ref: "sec-1",
            kind: "SECRET",
            name: "Key",
            secret: { key: "K", value: "v" },
          },
        ],
      });
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toBe("boom");
    // The previously-created http resource must be rolled back via deleteMany.
    expect(prismaMock.projectResource.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["res-http-2"] } },
    });
    // Project rollback also ran (createdProjectId set, so project.delete called).
    expect(prismaMock.project.delete).toHaveBeenCalledWith({
      where: { id: "proj-new" },
    });
  });

  it("rejects BuildSpecs with resources[] when FEATURE_PROJECT_RESOURCES is disabled", async () => {
    process.env.FEATURE_PROJECT_RESOURCES = "disabled";

    let thrown: unknown;
    try {
      await applyBuildSpec(owner, {
        project: { name: "P" },
        workflows: [
          {
            ref: "wf-main",
            name: "Main",
            slug: "main",
            triggerType: "WEBHOOK",
            steps: [],
            edges: [],
          },
        ],
        resources: [
          {
            ref: "http-1",
            kind: "HTTP_ROUTE",
            name: "Webhook",
            httpRoute: {
              method: "POST",
              path: "/hooks/run",
              targetWorkflowRef: "wf-main",
              authMode: "NONE",
              authConfig: {},
              maxBodyKb: 1024,
              timeoutMs: 15000,
              passthroughBody: true,
            },
          },
        ],
      });
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toMatch(/FEATURE_PROJECT_RESOURCES/);
    expect(createHttpRouteResourceMock).not.toHaveBeenCalled();
    // Anything created prior to resources (project + workflow) must be rolled back.
    expect(prismaMock.project.delete).toHaveBeenCalledWith({
      where: { id: "proj-new" },
    });
  });
});
