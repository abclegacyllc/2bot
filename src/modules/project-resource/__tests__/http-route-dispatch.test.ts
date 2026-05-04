import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    httpRoute: {
      findMany: vi.fn(),
    },
    userPlugin: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/modules/workflow/workflow.triggers", () => ({
  handleWebhookTrigger: vi.fn(),
}));

vi.mock("@/modules/plugin/plugin.executor", () => ({
  getPluginExecutor: vi.fn(() => ({ execute: vi.fn() })),
}));

import { prisma } from "@/lib/prisma";
import { handleWebhookTrigger } from "@/modules/workflow/workflow.triggers";

import { dispatchHttpRoute } from "../http-route-dispatch";

const mockedPrisma = prisma as unknown as {
  httpRoute: { findMany: ReturnType<typeof vi.fn> };
  userPlugin: { findUnique: ReturnType<typeof vi.fn> };
};
const mockedHandleWebhookTrigger = handleWebhookTrigger as unknown as ReturnType<typeof vi.fn>;

function makeRoute(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "route-1",
    resourceId: "res-1",
    method: "ANY",
    path: "/hooks/run",
    targetUserPluginId: null,
    targetWorkflowId: null,
    targetExport: null,
    authMode: "NONE",
    authConfig: {},
    maxBodyKb: 0,
    timeoutMs: 15000,
    corsOrigin: null,
    passthroughBody: true,
    resource: {
      id: "res-1",
      projectId: "proj-1",
      userId: "user-1",
      organizationId: null,
    },
    ...overrides,
  };
}

describe("http-route-dispatch — workflow target", () => {
  beforeEach(() => {
    mockedPrisma.httpRoute.findMany.mockReset();
    mockedPrisma.userPlugin.findUnique.mockReset();
    mockedHandleWebhookTrigger.mockReset();
  });

  it("returns 202 and runId when route targets a workflow", async () => {
    mockedPrisma.httpRoute.findMany.mockResolvedValue([
      makeRoute({ targetWorkflowId: "wf-1" }),
    ]);
    mockedHandleWebhookTrigger.mockResolvedValue("run-abc");

    const res = await dispatchHttpRoute({
      projectId: "proj-1",
      method: "POST",
      path: "/hooks/run",
      headers: { "content-type": "application/json" },
      query: { foo: "bar" },
      body: { hello: "world" },
      rawBody: Buffer.from('{"hello":"world"}'),
    });

    expect(res.status).toBe(202);
    expect(res.body).toEqual({ runId: "run-abc" });
    expect(mockedHandleWebhookTrigger).toHaveBeenCalledTimes(1);
    const [workflowId, payload] = mockedHandleWebhookTrigger.mock.calls[0]!;
    expect(workflowId).toBe("wf-1");
    expect(payload).toMatchObject({
      method: "POST",
      headers: expect.objectContaining({ "content-type": "application/json" }),
      body: { hello: "world" },
      query: { foo: "bar" },
    });
    // UserPlugin path was not taken.
    expect(mockedPrisma.userPlugin.findUnique).not.toHaveBeenCalled();
  });

  it("returns 503 when handleWebhookTrigger throws", async () => {
    mockedPrisma.httpRoute.findMany.mockResolvedValue([
      makeRoute({ targetWorkflowId: "wf-1" }),
    ]);
    mockedHandleWebhookTrigger.mockRejectedValue(new Error("Workflow is not active"));

    const res = await dispatchHttpRoute({
      projectId: "proj-1",
      method: "POST",
      path: "/hooks/run",
      headers: {},
    });

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: "handler_unavailable" });
  });

  it("workflow target wins over userPlugin target when both are set", async () => {
    mockedPrisma.httpRoute.findMany.mockResolvedValue([
      makeRoute({ targetWorkflowId: "wf-1", targetUserPluginId: "up-1" }),
    ]);
    mockedHandleWebhookTrigger.mockResolvedValue("run-x");

    const res = await dispatchHttpRoute({
      projectId: "proj-1",
      method: "GET",
      path: "/hooks/run",
      headers: {},
    });

    expect(res.status).toBe(202);
    expect(mockedPrisma.userPlugin.findUnique).not.toHaveBeenCalled();
  });

  it("returns 503 'route_unbound' when no target is set", async () => {
    mockedPrisma.httpRoute.findMany.mockResolvedValue([makeRoute()]);

    const res = await dispatchHttpRoute({
      projectId: "proj-1",
      method: "GET",
      path: "/hooks/run",
      headers: {},
    });

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: "route_unbound" });
    expect(mockedHandleWebhookTrigger).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Phase 7.4: secrets injection into UserPlugin context
// ===========================================================================

vi.mock("@/lib/encryption", () => ({
  encrypt: vi.fn((v: string) => `v2:1:ENC(${v})`),
  decrypt: vi.fn((c: string) => {
    const m = c.match(/^v2:1:ENC\((.+)\)$/);
    if (!m) throw new Error("bad ciphertext");
    return m[1];
  }),
}));

describe("http-route-dispatch — UserPlugin target receives secrets in PluginContext", () => {
  it("loads project secrets and passes them in the plugin context", async () => {
    const executeMock = vi.fn().mockResolvedValue({
      success: true,
      output: { status: 200, body: { ok: true } },
      metrics: { durationMs: 1 },
    });

    // Override executor mock just for this test.
    const { getPluginExecutor } = await import("@/modules/plugin/plugin.executor");
    (getPluginExecutor as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      execute: executeMock,
    });

    // Add projectResource.findMany to the prisma mock for loadProjectSecrets.
    (prisma as unknown as { projectResource: { findMany: ReturnType<typeof vi.fn> } }).projectResource = {
      findMany: vi.fn().mockResolvedValue([
        { id: "r1", secret: { key: "OPENAI_API_KEY", valueEnc: "v2:1:ENC(sk-test)" } },
      ]),
    };

    mockedPrisma.httpRoute.findMany.mockResolvedValue([
      makeRoute({ targetUserPluginId: "up-1" }),
    ]);
    mockedPrisma.userPlugin.findUnique.mockResolvedValue({
      id: "up-1",
      userId: "user-1",
      organizationId: null,
      isEnabled: true,
      config: {},
      entryFile: "plugins/echo.js",
      plugin: { id: "p-1", slug: "echo", name: "Echo", requiredGateways: [], codeBundle: null, bundlePath: null },
    });

    const res = await dispatchHttpRoute({
      projectId: "proj-1",
      method: "GET",
      path: "/hooks/run",
      headers: {},
    });

    expect(res.status).toBe(200);
    expect(executeMock).toHaveBeenCalledTimes(1);
    const passedContext = executeMock.mock.calls[0]![2];
    expect(passedContext.secrets).toEqual({ OPENAI_API_KEY: "sk-test" });
  });
});
