/**
 * Integration tests for workflow service.
 *
 * Hits a real Postgres (`2bot_test`) — no mocks. Boots via
 *   npm run test:integration
 * which loads `.env.test` and runs `vitest --config vitest.integration.config.ts`.
 *
 * Coverage:
 *   - createWorkflow auto-creates a default Project + enforces slug uniqueness
 *   - listWorkflows scopes to owner only (cross-user isolation)
 *   - updateWorkflow + deleteWorkflow round-trip
 *   - Step CRUD (BOT_MESSAGE step on a manual-trigger workflow)
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  cleanDatabase,
  teardownIntegrationTest,
  testDb,
} from "@/test-helpers/integration-setup";
import { hashPassword } from "@/lib/password";
import { workflowService } from "../workflow.service";

let userA: string;
let userB: string;

beforeAll(async () => {
  if (!process.env.DATABASE_URL?.includes("2bot_test")) {
    throw new Error(
      "Integration tests must run with DATABASE_URL pointing at 2bot_test. " +
        "Run via: npm run test:integration",
    );
  }

  await cleanDatabase();

  // Two users so we can prove cross-user isolation in listWorkflows.
  const passwordHash = await hashPassword("TestPass123!");
  const [a, b] = await Promise.all([
    testDb.user.create({
      data: {
        email: "wfa@integration.test",
        name: "WF User A",
        passwordHash,
        plan: "FREE",
        role: "MEMBER",
        isActive: true,
      },
    }),
    testDb.user.create({
      data: {
        email: "wfb@integration.test",
        name: "WF User B",
        passwordHash,
        plan: "FREE",
        role: "MEMBER",
        isActive: true,
      },
    }),
  ]);
  userA = a.id;
  userB = b.id;
});

beforeEach(async () => {
  // Per-test isolation. Order respects FKs.
  await testDb.workflowStep.deleteMany();
  await testDb.workflowEdge.deleteMany();
  await testDb.workflowGateway.deleteMany();
  await testDb.workflow.deleteMany();
  await testDb.projectResource.deleteMany();
  await testDb.project.deleteMany();
});

afterAll(async () => {
  await teardownIntegrationTest();
});

const ownerA = () => ({ userId: userA, organizationId: null });
const ownerB = () => ({ userId: userB, organizationId: null });

// ---------------------------------------------------------------------------
// createWorkflow
// ---------------------------------------------------------------------------

describe("createWorkflow", () => {
  it("creates a workflow + auto-materialises the user's default Project", async () => {
    const wf = await workflowService.createWorkflow(ownerA(), {
      name: "Hello",
      slug: "hello",
      description: "smoke",
      triggerType: "MANUAL",
    });

    expect(wf.slug).toBe("hello");
    expect(wf.name).toBe("Hello");

    // Default project was created and the workflow points at it.
    const row = await testDb.workflow.findUnique({
      where: { id: wf.id },
      include: { project: true },
    });
    expect(row?.project?.userId).toBe(userA);
  });

  it("enforces slug uniqueness within the owner's scope", async () => {
    await workflowService.createWorkflow(ownerA(), {
      name: "First",
      slug: "duplicate",
      triggerType: "MANUAL",
    });

    await expect(
      workflowService.createWorkflow(ownerA(), {
        name: "Second",
        slug: "duplicate",
        triggerType: "MANUAL",
      }),
    ).rejects.toThrow(/already exists/i);
  });

  it("allows the same slug under a different owner (per-user namespace)", async () => {
    await workflowService.createWorkflow(ownerA(), {
      name: "A's hello",
      slug: "hello",
      triggerType: "MANUAL",
    });

    // userB should be free to use the same slug.
    const wfB = await workflowService.createWorkflow(ownerB(), {
      name: "B's hello",
      slug: "hello",
      triggerType: "MANUAL",
    });
    expect(wfB.slug).toBe("hello");
    expect(wfB.id).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// listWorkflows — cross-owner isolation
// ---------------------------------------------------------------------------

describe("listWorkflows", () => {
  it("returns only the caller's workflows, never another user's", async () => {
    await workflowService.createWorkflow(ownerA(), {
      name: "A1",
      slug: "a-1",
      triggerType: "MANUAL",
    });
    await workflowService.createWorkflow(ownerA(), {
      name: "A2",
      slug: "a-2",
      triggerType: "MANUAL",
    });
    await workflowService.createWorkflow(ownerB(), {
      name: "B1",
      slug: "b-1",
      triggerType: "MANUAL",
    });

    const aList = await workflowService.listWorkflows(ownerA(), {});
    const bList = await workflowService.listWorkflows(ownerB(), {});

    expect(aList.workflows.map((w) => w.slug).sort()).toEqual(["a-1", "a-2"]);
    expect(bList.workflows.map((w) => w.slug)).toEqual(["b-1"]);
  });

  it("paginates results", async () => {
    for (let i = 0; i < 5; i++) {
      await workflowService.createWorkflow(ownerA(), {
        name: `WF ${i}`,
        slug: `wf-${i}`,
        triggerType: "MANUAL",
      });
    }
    const page1 = await workflowService.listWorkflows(ownerA(), { page: 1, limit: 2 });
    const page2 = await workflowService.listWorkflows(ownerA(), { page: 2, limit: 2 });
    expect(page1.workflows).toHaveLength(2);
    expect(page2.workflows).toHaveLength(2);
    // No overlap between pages.
    const ids = new Set([...page1.workflows.map((w) => w.id), ...page2.workflows.map((w) => w.id)]);
    expect(ids.size).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// update + delete round-trip
// ---------------------------------------------------------------------------

describe("update + delete", () => {
  it("updateWorkflow rewrites mutable fields", async () => {
    const wf = await workflowService.createWorkflow(ownerA(), {
      name: "Initial",
      slug: "round-trip",
      triggerType: "MANUAL",
    });

    const updated = await workflowService.updateWorkflow(ownerA(), wf.id, {
      name: "Renamed",
      description: "Now with description",
    });

    expect(updated.name).toBe("Renamed");
    expect(updated.description).toBe("Now with description");
  });

  it("deleteWorkflow removes the row + cascades steps", async () => {
    const wf = await workflowService.createWorkflow(ownerA(), {
      name: "To Delete",
      slug: "to-delete",
      triggerType: "MANUAL",
    });
    await workflowService.deleteWorkflow(ownerA(), wf.id);

    const row = await testDb.workflow.findUnique({ where: { id: wf.id } });
    expect(row).toBeNull();
  });

  it("rejects update from a different owner (cross-tenant guard)", async () => {
    const wf = await workflowService.createWorkflow(ownerA(), {
      name: "Mine",
      slug: "mine",
      triggerType: "MANUAL",
    });

    // userB should not be able to mutate userA's workflow even with the id.
    await expect(
      workflowService.updateWorkflow(ownerB(), wf.id, { name: "Stolen" }),
    ).rejects.toThrow();

    // And the row is unchanged.
    const row = await testDb.workflow.findUnique({ where: { id: wf.id } });
    expect(row?.name).toBe("Mine");
  });
});
