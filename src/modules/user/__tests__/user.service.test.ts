/**
 * User Service Tests
 *
 * Coverage for the lightweight user-context aggregator. Mocks Prisma and
 * the credit service module — credits is dynamically imported by the
 * service to avoid a hard dependency, so the mock has to match the
 * dynamic-import shape (default and named export).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    gateway: { count: vi.fn() },
    userPlugin: { count: vi.fn() },
    workspaceContainer: { findFirst: vi.fn() },
  },
}));

vi.mock("@/modules/credits/2bot-ai-credit.service", () => ({
  twoBotAICreditService: {
    getBalance: vi.fn(),
  },
}));

import { prisma } from "@/lib/prisma";
import { twoBotAICreditService } from "@/modules/credits/2bot-ai-credit.service";
import { userService } from "../user.service";

const mocked = prisma as unknown as {
  user: { findUnique: ReturnType<typeof vi.fn> };
  gateway: { count: ReturnType<typeof vi.fn> };
  userPlugin: { count: ReturnType<typeof vi.fn> };
  workspaceContainer: { findFirst: ReturnType<typeof vi.fn> };
};
const mockedCredits = twoBotAICreditService as unknown as {
  getBalance: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// getUserPlan
// ---------------------------------------------------------------------------

describe("userService.getUserPlan", () => {
  it("returns the user's plan", async () => {
    mocked.user.findUnique.mockResolvedValue({ plan: "PRO" });
    expect(await userService.getUserPlan("user-1")).toBe("PRO");
  });

  it("falls back to FREE when the user does not exist", async () => {
    mocked.user.findUnique.mockResolvedValue(null);
    expect(await userService.getUserPlan("user-missing")).toBe("FREE");
  });

  it("only selects the plan column (does not over-fetch)", async () => {
    mocked.user.findUnique.mockResolvedValue({ plan: "FREE" });
    await userService.getUserPlan("user-1");
    expect(mocked.user.findUnique).toHaveBeenCalledWith({
      where: { id: "user-1" },
      select: { plan: true },
    });
  });
});

// ---------------------------------------------------------------------------
// getUserWithPlan
// ---------------------------------------------------------------------------

describe("userService.getUserWithPlan", () => {
  it("returns the projected user", async () => {
    const fixture = {
      id: "user-1",
      plan: "PRO",
      email: "alice@example.com",
      name: "Alice",
      aiRoutingPreference: "balanced",
    };
    mocked.user.findUnique.mockResolvedValue(fixture);
    expect(await userService.getUserWithPlan("user-1")).toEqual(fixture);
  });

  it("returns null when the user does not exist", async () => {
    mocked.user.findUnique.mockResolvedValue(null);
    expect(await userService.getUserWithPlan("ghost")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getUserContext
// ---------------------------------------------------------------------------

describe("userService.getUserContext", () => {
  it("aggregates plan + counts + balance + workspace status", async () => {
    mocked.user.findUnique.mockResolvedValue({ plan: "PRO" });
    mocked.gateway.count.mockResolvedValue(3);
    mocked.userPlugin.count.mockResolvedValue(7);
    mockedCredits.getBalance.mockResolvedValue({ balance: 1234 });
    mocked.workspaceContainer.findFirst.mockResolvedValue({ id: "ctr-1" });

    const ctx = await userService.getUserContext("user-1");

    expect(ctx).toEqual({
      plan: "PRO",
      credits: 1234,
      gatewayCount: 3,
      pluginCount: 7,
      workspaceRunning: true,
    });
  });

  it("scopes gateway count to the supplied organizationId", async () => {
    mocked.user.findUnique.mockResolvedValue({ plan: "FREE" });
    mocked.gateway.count.mockResolvedValue(0);
    mocked.userPlugin.count.mockResolvedValue(0);
    mockedCredits.getBalance.mockResolvedValue({ balance: 100 });
    mocked.workspaceContainer.findFirst.mockResolvedValue(null);

    await userService.getUserContext("user-1", "org-1");

    expect(mocked.gateway.count).toHaveBeenCalledWith({
      where: { userId: "user-1", organizationId: "org-1" },
    });
    expect(mocked.workspaceContainer.findFirst).toHaveBeenCalledWith({
      where: { userId: "user-1", organizationId: "org-1", status: "RUNNING" },
      select: { id: true },
    });
  });

  it("falls back to FREE when the user row is missing", async () => {
    mocked.user.findUnique.mockResolvedValue(null);
    mocked.gateway.count.mockResolvedValue(0);
    mocked.userPlugin.count.mockResolvedValue(0);
    mockedCredits.getBalance.mockResolvedValue({ balance: 0 });
    mocked.workspaceContainer.findFirst.mockResolvedValue(null);

    const ctx = await userService.getUserContext("ghost");
    expect(ctx.plan).toBe("FREE");
  });

  it("returns credits=undefined when the credit-service call rejects", async () => {
    mocked.user.findUnique.mockResolvedValue({ plan: "FREE" });
    mocked.gateway.count.mockResolvedValue(0);
    mocked.userPlugin.count.mockResolvedValue(0);
    mockedCredits.getBalance.mockRejectedValue(new Error("credits down"));
    mocked.workspaceContainer.findFirst.mockResolvedValue(null);

    const ctx = await userService.getUserContext("user-1");
    expect(ctx.credits).toBeUndefined();
    expect(ctx.plan).toBe("FREE"); // other fields still resolve
  });

  it("skips the workspace probe when checkWorkspace=false", async () => {
    mocked.user.findUnique.mockResolvedValue({ plan: "PRO" });
    mocked.gateway.count.mockResolvedValue(0);
    mocked.userPlugin.count.mockResolvedValue(0);
    mockedCredits.getBalance.mockResolvedValue({ balance: 50 });

    const ctx = await userService.getUserContext("user-1", null, { checkWorkspace: false });
    expect(ctx.workspaceRunning).toBe(false);
    expect(mocked.workspaceContainer.findFirst).not.toHaveBeenCalled();
  });

  it("scopes gateway count to user only when no organizationId is given", async () => {
    mocked.user.findUnique.mockResolvedValue({ plan: "PRO" });
    mocked.gateway.count.mockResolvedValue(2);
    mocked.userPlugin.count.mockResolvedValue(0);
    mockedCredits.getBalance.mockResolvedValue({ balance: 1 });
    mocked.workspaceContainer.findFirst.mockResolvedValue(null);

    await userService.getUserContext("user-1");

    expect(mocked.gateway.count).toHaveBeenCalledWith({
      where: { userId: "user-1" },
    });
  });

  it("runs all of the queries in parallel (Promise.all, not sequentially)", async () => {
    // Resolve order is randomised, but they should all be in flight. We
    // assert this by gating each on a deferred promise — if the service
    // awaited sequentially, the second call would never start.
    let userResolve!: (v: { plan: string }) => void;
    let gatewayResolve!: (v: number) => void;
    mocked.user.findUnique.mockReturnValue(
      new Promise((res) => { userResolve = res; }),
    );
    mocked.gateway.count.mockReturnValue(
      new Promise((res) => { gatewayResolve = res; }),
    );
    mocked.userPlugin.count.mockResolvedValue(0);
    mockedCredits.getBalance.mockResolvedValue({ balance: 0 });
    mocked.workspaceContainer.findFirst.mockResolvedValue(null);

    const promise = userService.getUserContext("user-1");

    // Microtask flush — both the user and gateway calls should have been
    // initiated by now even though neither has resolved.
    await new Promise((r) => setImmediate(r));
    expect(mocked.user.findUnique).toHaveBeenCalled();
    expect(mocked.gateway.count).toHaveBeenCalled();

    userResolve({ plan: "PRO" });
    gatewayResolve(0);
    const ctx = await promise;
    expect(ctx.plan).toBe("PRO");
  });
});
