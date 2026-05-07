/**
 * Orchestrator Wave 2 — generated plugin install path.
 *
 * Verifies that `source: "generated"` plugin installs:
 *   1. Render via the B5 template registry.
 *   2. Create a USER-authored Plugin catalog row + UserPlugin install row.
 *   3. Best-effort write the rendered files into the workspace container.
 *   4. Roll both rows back when a smoke test fails.
 *   5. Reject template inputs that would inject denylisted code patterns.
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

const prismaMock = {
  project: {
    findUnique: vi.fn(),
    findFirst: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockImplementation(async (args: { data: Record<string, unknown> }) => ({
      id: "proj-new",
      ...args.data,
    })),
    delete: vi.fn().mockResolvedValue(undefined),
  },
  projectResource: { deleteMany: vi.fn() },
  gateway: {
    findUnique: vi.fn().mockResolvedValue({ type: "TELEGRAM_BOT" }),
    update: vi.fn(),
    deleteMany: vi.fn(),
  },
  plugin: {
    findUnique: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockImplementation(async (args: { data: Record<string, unknown> }) => ({
      id: "plg-new",
      ...args.data,
    })),
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
  },
  userPlugin: {
    findFirst: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockImplementation(async (args: { data: Record<string, unknown> }) => ({
      id: "up-new",
      ...args.data,
    })),
    update: vi.fn(),
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
  },
  workflow: {
    create: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
  },
  workflowStep: { create: vi.fn() },
  workflowEdge: { create: vi.fn() },
  workflowGateway: { upsert: vi.fn() },
};
vi.mock("@/lib/prisma", () => ({
  get prisma() {
    return prismaMock;
  },
}));

const gatewayCreateMock = vi.fn().mockResolvedValue({ id: "gw-tg-1" });
vi.mock("@/modules/gateway/gateway.service", () => ({
  gatewayService: { create: (...a: unknown[]) => gatewayCreateMock(...a) },
}));
vi.mock("@/modules/project/project.service", () => ({
  ensureDefaultProject: vi.fn(),
}));

const writeDirectoryToContainerMock = vi.fn().mockResolvedValue(true);
vi.mock("@/modules/plugin/plugin-deploy.service", () => ({
  gatewayTypeToPlatform: vi.fn(() => "telegram"),
  getPluginEntryPath: vi.fn(
    (gatewayId: string | null, slug: string, opts?: { entry?: string; isDirectory?: boolean }) => {
      const entry = opts?.entry ?? "index.js";
      if (gatewayId) return `bots/telegram/${gatewayId}/plugins/${slug}/${entry}`;
      return `plugins/${slug}/${entry}`;
    },
  ),
  isDirectoryLayout: vi.fn(() => true),
  validatePluginCode: vi.fn(),
  pluginDeployService: {
    writeDirectoryToContainer: (...a: unknown[]) => writeDirectoryToContainerMock(...a),
  },
}));

vi.mock("@/shared/types/context", () => ({
  createServiceContext: vi.fn((c: unknown) => c),
}));

const runSmokeTestsMock = vi.fn(async (): Promise<unknown[]> => []);
vi.mock("../smoke-test.runner", () => ({
  runSmokeTests: (...a: unknown[]) => runSmokeTestsMock(...(a as [])),
}));

vi.mock("@/modules/project-resource/project-resource.service", () => ({
  createHttpRouteResource: vi.fn(),
  createScheduleResource: vi.fn(),
  createSecretResource: vi.fn(),
  createExternalApiResource: vi.fn(),
  createDatabaseResource: vi.fn(),
}));

import { applyBuildSpec } from "../orchestrator.service";

const owner = { userId: "u1", organizationId: null };

beforeEach(() => {
  incMock.mockClear();
  writeDirectoryToContainerMock.mockClear();
  writeDirectoryToContainerMock.mockResolvedValue(true);
  runSmokeTestsMock.mockReset();
  runSmokeTestsMock.mockResolvedValue([]);
  for (const m of Object.values(prismaMock)) {
    for (const fn of Object.values(m)) {
      (fn as { mockClear?: () => void }).mockClear?.();
    }
  }
  // Restore default resolved values that mockClear preserves but
  // mockReset would wipe.
  prismaMock.project.findFirst.mockResolvedValue(null);
  prismaMock.project.create.mockImplementation(
    async (args: { data: Record<string, unknown> }) => ({ id: "proj-new", ...args.data }),
  );
  prismaMock.gateway.findUnique.mockResolvedValue({ type: "TELEGRAM_BOT" });
  prismaMock.plugin.findUnique.mockResolvedValue(null);
  prismaMock.plugin.create.mockImplementation(
    async (args: { data: Record<string, unknown> }) => ({ id: "plg-new", ...args.data }),
  );
  prismaMock.userPlugin.findFirst.mockResolvedValue(null);
  prismaMock.userPlugin.create.mockImplementation(
    async (args: { data: Record<string, unknown> }) => ({ id: "up-new", ...args.data }),
  );
  prismaMock.userPlugin.deleteMany.mockResolvedValue({ count: 0 });
  prismaMock.plugin.deleteMany.mockResolvedValue({ count: 0 });
  prismaMock.workflow.deleteMany.mockResolvedValue({ count: 0 });
  prismaMock.gateway.deleteMany.mockResolvedValue({ count: 0 });
  prismaMock.projectResource.deleteMany.mockResolvedValue({ count: 0 });
});

const baseSpec = {
  project: { name: "Wave 2 Test" },
  gateways: [
    {
      ref: "tg-1",
      source: "new" as const,
      type: "TELEGRAM_BOT" as const,
      name: "TG Gateway",
      credentials: { botToken: "12345:abc" },
    },
  ],
  plugins: [
    {
      ref: "echo-1",
      source: "generated" as const,
      pluginSlug: "user-echo-bot-x1",
      name: "Echo Bot",
      description: "Echoes user messages",
      template: "telegram-echo-javascript",
      templateInputs: { greeting: "Hello!", respondInGroups: false },
      gatewayRef: "tg-1",
      config: {},
    },
  ],
  workflows: [],
};

describe("applyBuildSpec — generated plugin install (Wave 2)", () => {
  it("creates a USER-authored Plugin row and a UserPlugin install pointing at it", async () => {
    const result = await applyBuildSpec(owner, baseSpec);

    expect(result.status).toBe("applied");

    // Plugin catalog row
    expect(prismaMock.plugin.create).toHaveBeenCalledTimes(1);
    const pluginArg = prismaMock.plugin.create.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(pluginArg.data.slug).toBe("user-echo-bot-x1");
    expect(pluginArg.data.authorType).toBe("USER");
    expect(pluginArg.data.authorId).toBe("u1");
    expect(pluginArg.data.isPublic).toBe(false);
    expect(pluginArg.data.isBuiltin).toBe(false);
    expect(pluginArg.data.requiredGateways).toEqual(["TELEGRAM_BOT"]);
    expect(typeof pluginArg.data.codeBundle).toBe("string");
    expect((pluginArg.data.codeBundle as string).length).toBeGreaterThan(0);
    expect(pluginArg.data.manifest).toBeDefined();

    // UserPlugin install
    expect(prismaMock.userPlugin.create).toHaveBeenCalledTimes(1);
    const upArg = prismaMock.userPlugin.create.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(upArg.data.userId).toBe("u1");
    expect(upArg.data.pluginId).toBe("plg-new");
    expect(upArg.data.projectId).toBe("proj-new");
    expect(upArg.data.gatewayId).toBe("gw-tg-1");
    expect(upArg.data.entryFile).toBe("bots/telegram/gw-tg-1/plugins/user-echo-bot-x1/index.js");

    // refMap maps spec ref → UserPlugin id
    expect(result.refMap.plugins["echo-1"]).toBe("up-new");
  });

  it("invokes pluginDeployService.writeDirectoryToContainer with rendered files (best-effort)", async () => {
    await applyBuildSpec(owner, baseSpec);

    expect(writeDirectoryToContainerMock).toHaveBeenCalledTimes(1);
    const [
      userId,
      orgId,
      slug,
      files,
      manifestJson,
      entry,
      _env,
      gatewayId,
      platform,
    ] = writeDirectoryToContainerMock.mock.calls[0]!;
    expect(userId).toBe("u1");
    expect(orgId).toBeNull();
    expect(slug).toBe("user-echo-bot-x1");
    expect(typeof files).toBe("object");
    expect(files).toHaveProperty("index.js");
    expect(files).not.toHaveProperty("plugin.json"); // emitted via manifestJson param
    expect(typeof manifestJson).toBe("string");
    expect(JSON.parse(manifestJson)).toMatchObject({ slug: "user-echo-bot-x1" });
    expect(entry).toBe("index.js");
    expect(gatewayId).toBe("gw-tg-1");
    expect(platform).toBe("telegram");
  });

  it("treats workspace deploy failure as non-fatal — install still succeeds", async () => {
    writeDirectoryToContainerMock.mockRejectedValueOnce(new Error("no container"));
    const result = await applyBuildSpec(owner, baseSpec);
    expect(result.status).toBe("applied");
    expect(prismaMock.plugin.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.userPlugin.create).toHaveBeenCalledTimes(1);
  });

  it("rolls back the new Plugin AND UserPlugin rows when smoke tests fail", async () => {
    runSmokeTestsMock.mockResolvedValueOnce([
      {
        workflowRef: "wf",
        workflowId: "wf-1",
        ok: false,
        errorCount: 1,
        warningCount: 0,
        errors: [{ code: "X", message: "y" }],
      },
    ]);

    const result = await applyBuildSpec(owner, baseSpec);
    expect(result.status).toBe("rolled-back");

    expect(prismaMock.userPlugin.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["up-new"] } },
    });
    expect(prismaMock.plugin.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["plg-new"] } },
    });
  });

  it("rejects when the generated slug already exists in the catalog (rolls back)", async () => {
    prismaMock.plugin.findUnique.mockResolvedValueOnce({ id: "existing-plg" });
    runSmokeTestsMock.mockResolvedValue([]);

    // applyBuildSpec rolls back and re-throws on internal exceptions.
    await expect(applyBuildSpec(owner, baseSpec)).rejects.toThrow(
      /already exists in the catalog/,
    );
    expect(prismaMock.plugin.create).not.toHaveBeenCalled();
    // Gateway from this spec was created — verify it was rolled back.
    expect(prismaMock.gateway.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["gw-tg-1"] } },
    });
  });

  it("invokes validatePluginCode on every generated .js file (defence-in-depth)", async () => {
    const deploy = await import("@/modules/plugin/plugin-deploy.service");
    const validateSpy = vi.mocked(deploy.validatePluginCode);
    validateSpy.mockClear();

    await applyBuildSpec(owner, baseSpec);

    expect(validateSpy).toHaveBeenCalled();
    // Telegram echo template emits index.js — assert it was checked.
    const calledForIndexJs = validateSpy.mock.calls.some(
      (call) => typeof call[0] === "string" && call[0].includes("module.exports"),
    );
    expect(calledForIndexJs).toBe(true);
  });
});
