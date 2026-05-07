/**
 * Integration tests for project-topology service.
 *
 * Builds a realistic project with one gateway, one workflow (with a step),
 * one user-plugin install, plus all five non-gateway ProjectResource kinds,
 * then verifies the topology service produces the expected nodes & edges
 * and never returns secret material.
 *
 * @module modules/project-resource/__tests__/project-topology.service.integration.test
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { encrypt } from "@/lib/encryption";
import {
    cleanDatabase,
    teardownIntegrationTest,
    testDb,
} from "@/test-helpers/integration-setup";

import {
    createDatabaseResource,
    createExternalApiResource,
    createHttpRouteResource,
    createScheduleResource,
    createSecretResource,
} from "../project-resource.service";
import {
    getProjectTopology,
    type TopologyNode,
} from "../project-topology.service";

// ──────────────────────────────────────────────────────────────────────────────
// Fixtures
// ──────────────────────────────────────────────────────────────────────────────

let userId: string;
let otherUserId: string;
let projectId: string;
let pluginCatalogId: string;
let gatewayId: string;
let workflowId: string;
let webhookWorkflowId: string;
let userPluginId: string;
const owner = () => ({ userId, organizationId: null });

beforeAll(async () => {
  if (!process.env.DATABASE_URL?.includes("2bot_test")) {
    throw new Error(
      "Integration tests must run with DATABASE_URL pointing at 2bot_test.",
    );
  }

  await cleanDatabase();

  const user = await testDb.user.create({
    data: {
      email: `topology+${Date.now()}@test.local`,
      name: "Topology Tester",
      passwordHash: "not-used",
      plan: "PRO",
      role: "MEMBER",
      isActive: true,
    },
  });
  userId = user.id;

  const otherUser = await testDb.user.create({
    data: {
      email: `topology-other+${Date.now()}@test.local`,
      name: "Other User",
      passwordHash: "not-used",
      plan: "PRO",
      role: "MEMBER",
      isActive: true,
    },
  });
  otherUserId = otherUser.id;

  const project = await testDb.project.create({
    data: {
      userId,
      organizationId: null,
      name: "Topology Test Project",
      slug: `topology-proj-${Date.now()}`,
      kind: "AUTOMATION",
      status: "ACTIVE",
      isDefault: false,
    },
  });
  projectId = project.id;

  // Catalog plugin row (required for UserPlugin + WorkflowStep FKs).
  const plugin = await testDb.plugin.create({
    data: {
      slug: `topology-plugin-${Date.now()}`,
      name: "Topology Plugin",
      description: "Test plugin",
      requiredGateways: [],
    },
  });
  pluginCatalogId = plugin.id;

  // Gateway
  const gateway = await testDb.gateway.create({
    data: {
      userId,
      projectId,
      name: "Test Telegram Bot",
      type: "TELEGRAM_BOT",
      status: "DISCONNECTED",
      credentialsEnc: encrypt("dummy:token:value"),
    },
  });
  gatewayId = gateway.id;

  // Workflow
  const workflow = await testDb.workflow.create({
    data: {
      userId,
      projectId,
      name: "Test Workflow",
      slug: `wf-${Date.now()}`,
      triggerType: "BOT_MESSAGE",
      status: "DRAFT",
      isEnabled: false,
    },
  });
  workflowId = workflow.id;

  // Webhook-trigger workflow (HTTP_ROUTE.targetWorkflowId requires WEBHOOK).
  const webhookWorkflow = await testDb.workflow.create({
    data: {
      userId,
      projectId,
      name: "Webhook Workflow",
      slug: `wf-webhook-${Date.now()}`,
      triggerType: "WEBHOOK",
      status: "DRAFT",
      isEnabled: false,
    },
  });
  webhookWorkflowId = webhookWorkflow.id;

  // UserPlugin install bound to the gateway
  const userPlugin = await testDb.userPlugin.create({
    data: {
      userId,
      projectId,
      pluginId: pluginCatalogId,
      gatewayId,
      isEnabled: true,
    },
  });
  userPluginId = userPlugin.id;

  // WorkflowGateway link (workflow ↔ gateway as trigger)
  await testDb.workflowGateway.create({
    data: { workflowId, gatewayId, role: "trigger" },
  });

  // WorkflowStep referencing the user-plugin install
  await testDb.workflowStep.create({
    data: {
      workflowId,
      pluginId: pluginCatalogId,
      userPluginId,
      order: 0,
    },
  });
});

afterAll(async () => {
  await teardownIntegrationTest();
});

// ──────────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────────

describe("getProjectTopology", () => {
  it("returns nodes for gateway / workflow / plugin and all resource kinds", async () => {
    // Create one resource of each non-gateway kind.
    const httpRoute = await createHttpRouteResource(owner(), {
      projectId,
      name: "Webhook In",
      httpRoute: {
        method: "POST",
        path: "/webhooks/in",
        authMode: "NONE",
        targetWorkflowId: webhookWorkflowId,
      },
    });

    const schedule = await createScheduleResource(owner(), {
      projectId,
      name: "Nightly",
      schedule: {
        cron: "0 3 * * *",
        timezone: "UTC",
        enabled: true,
        targetWorkflowId: workflowId,
      },
    });

    const secret = await createSecretResource(owner(), {
      projectId,
      name: "OpenAI Key",
      secret: { key: "OPENAI_API_KEY", value: "sk-secret-do-not-leak-12345" },
    });

    const externalApi = await createExternalApiResource(owner(), {
      projectId,
      name: "Stripe",
      externalApi: {
        baseUrl: "https://api.stripe.com",
        authMode: "BEARER",
        credentials: { token: "stripe-secret-do-not-leak" },
      },
    });

    const database = await createDatabaseResource(owner(), {
      projectId,
      name: "Analytics DB",
      database: {
        driver: "POSTGRES",
        host: "db.example.com",
        port: 5432,
        database: "analytics",
        username: "reader",
        password: "db-secret-do-not-leak",
      },
    });

    const topology = await getProjectTopology(owner(), projectId);

    // Project meta
    expect(topology.project.id).toBe(projectId);

    // ── Nodes ──
    const byKind: Record<string, TopologyNode[]> = {};
    for (const n of topology.nodes) {
      (byKind[n.kind] ??= []).push(n);
    }
    expect(byKind.GATEWAY?.length).toBe(1);
    expect(byKind.WORKFLOW?.length).toBe(2);
    expect(byKind.PLUGIN?.length).toBe(1);
    expect(byKind.HTTP_ROUTE?.length).toBe(1);
    expect(byKind.SCHEDULE?.length).toBe(1);
    expect(byKind.SECRET?.length).toBe(1);
    expect(byKind.EXTERNAL_API?.length).toBe(1);
    expect(byKind.DATABASE?.length).toBe(1);

    // refIds must point at underlying records
    expect(byKind.GATEWAY?.[0]?.refId).toBe(gatewayId);
    expect(byKind.WORKFLOW!.map((n) => n.refId).sort()).toEqual(
      [workflowId, webhookWorkflowId].sort(),
    );
    expect(byKind.PLUGIN?.[0]?.refId).toBe(userPluginId);
    expect(byKind.HTTP_ROUTE?.[0]?.refId).toBe(httpRoute.id);
    expect(byKind.SCHEDULE?.[0]?.refId).toBe(schedule.id);
    expect(byKind.SECRET?.[0]?.refId).toBe(secret.id);
    expect(byKind.EXTERNAL_API?.[0]?.refId).toBe(externalApi.id);
    expect(byKind.DATABASE?.[0]?.refId).toBe(database.id);

    // Counts match arrays
    expect(topology.counts.nodes).toBe(topology.nodes.length);
    expect(topology.counts.edges).toBe(topology.edges.length);

    // ── Edges ──
    const edgeKinds = topology.edges.map((e) => e.kind).sort();
    // Expected:
    //   ROUTE_TO_WORKFLOW    (httpRoute -> workflow)
    //   SCHEDULE_TO_WORKFLOW (schedule  -> workflow)
    //   WORKFLOW_TO_GATEWAY  (workflow  -> gateway)
    //   WORKFLOW_TO_PLUGIN   (workflow  -> plugin via step)
    //   PLUGIN_TO_GATEWAY    (plugin    -> gateway)
    expect(edgeKinds).toContain("ROUTE_TO_WORKFLOW");
    expect(edgeKinds).toContain("SCHEDULE_TO_WORKFLOW");
    expect(edgeKinds).toContain("WORKFLOW_TO_GATEWAY");
    expect(edgeKinds).toContain("WORKFLOW_TO_PLUGIN");
    expect(edgeKinds).toContain("PLUGIN_TO_GATEWAY");

    const wfGwEdge = topology.edges.find(
      (e) => e.kind === "WORKFLOW_TO_GATEWAY",
    );
    expect(wfGwEdge?.label).toBe("trigger");

    // ── Security: encrypted material must NOT appear anywhere in payload ──
    const payload = JSON.stringify(topology);
    expect(payload).not.toContain("sk-secret-do-not-leak-12345");
    expect(payload).not.toContain("stripe-secret-do-not-leak");
    expect(payload).not.toContain("db-secret-do-not-leak");
  });

  it("denies access when the requesting user does not own the project", async () => {
    await expect(
      getProjectTopology({ userId: otherUserId, organizationId: null }, projectId),
    ).rejects.toThrow(/access|forbidden/i);
  });

  it("throws NotFoundError for an unknown project id", async () => {
    await expect(
      getProjectTopology(owner(), "non-existent-project-id"),
    ).rejects.toThrow(/not found/i);
  });
});
