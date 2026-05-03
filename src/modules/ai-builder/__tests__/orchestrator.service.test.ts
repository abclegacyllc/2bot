/**
 * Orchestrator service tests (Phase 6.3 Wave 1)
 *
 * Focuses on validation behaviour, dry-run, and the validation-failed path —
 * full DB apply paths are exercised by integration tests (Wave 2).
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

const incMock = vi.fn();
vi.mock("@/lib/metrics", () => ({
  buildspecApplyTotal: { inc: (...a: unknown[]) => incMock("apply", ...a) },
  buildspecSmokeFailuresTotal: { inc: (...a: unknown[]) => incMock("smoke", ...a) },
}));

// Prisma should never be called when dryRun=true or validation fails.
const prismaMock = {
  project: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
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
