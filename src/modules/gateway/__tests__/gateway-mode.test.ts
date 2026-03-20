/**
 * Gateway Mode Validation Tests
 *
 * Tests for mode toggle validation — prevents switching modes
 * when conflicting resources (plugins/workflows) are active.
 *
 * @module modules/gateway/__tests__/gateway-mode.test
 */

import type { PlanType } from "@/shared/constants/plans";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ===========================================
// Mock Dependencies
// ===========================================

vi.mock("@/lib/prisma", () => ({
  prisma: {
    gateway: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    userPlugin: {
      findFirst: vi.fn(),
    },
    workflow: {
      findFirst: vi.fn(),
    },
    subscription: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/encryption", () => ({
  encrypt: vi.fn((data) => `encrypted:${JSON.stringify(data)}`),
  decryptJson: vi.fn((data) => {
    const json = data.replace("encrypted:", "");
    return JSON.parse(json);
  }),
}));

vi.mock("@/lib/audit", () => ({
  auditActions: {
    gatewayCreated: vi.fn(),
    gatewayUpdated: vi.fn(),
    gatewayDeleted: vi.fn(),
  },
}));

vi.mock("@/lib/plan-limits", () => ({
  enforceGatewayLimit: vi.fn(),
}));

// Import after mocking
import { prisma } from "@/lib/prisma";
import { ValidationError } from "@/shared/errors";
import { createServiceContext } from "@/shared/types/context";
import { gatewayService } from "../gateway.service";

const mockedPrisma = prisma as unknown as {
  gateway: {
    findUnique: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };
  userPlugin: {
    findFirst: ReturnType<typeof vi.fn>;
  };
  workflow: {
    findFirst: ReturnType<typeof vi.fn>;
  };
};

// ===========================================
// Test Data
// ===========================================

const mockGateway = {
  id: "gw-123",
  userId: "user-123",
  organizationId: null,
  name: "My Telegram Bot",
  type: "TELEGRAM_BOT" as const,
  status: "CONNECTED" as const,
  mode: "plugin",
  credentialsEnc: 'encrypted:{"botToken":"123456:ABC"}',
  config: {},
  lastConnectedAt: new Date(),
  lastError: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ===========================================
// Test Context Helper
// ===========================================

function createTestContext(
  options: {
    userId?: string;
    organizationId?: string;
    plan?: PlanType;
  } = {}
) {
  return createServiceContext(
    {
      userId: options.userId || "user-123",
      role: "MEMBER",
      plan: options.plan || "PRO",
    },
    {},
    {
      contextType: options.organizationId ? "organization" : "personal",
      organizationId: options.organizationId,
      effectivePlan: options.plan || "PRO",
    }
  );
}

// ===========================================
// Setup / Teardown
// ===========================================

beforeEach(() => {
  vi.clearAllMocks();
  // Default: no duplicate gateways, no conflicting resources
  mockedPrisma.gateway.findMany.mockResolvedValue([]);
  mockedPrisma.userPlugin.findFirst.mockResolvedValue(null);
  mockedPrisma.workflow.findFirst.mockResolvedValue(null);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ===========================================
// Mode Toggle Validation
// ===========================================

describe("gatewayService.update — mode toggle validation", () => {
  it("allows switching to workflow when no enabled plugins exist", async () => {
    mockedPrisma.gateway.findUnique.mockResolvedValue({ ...mockGateway, mode: "plugin" });
    mockedPrisma.userPlugin.findFirst.mockResolvedValue(null);
    mockedPrisma.gateway.update.mockResolvedValue({ ...mockGateway, mode: "workflow" });

    const ctx = createTestContext();
    const result = await gatewayService.update(ctx, "gw-123", { mode: "workflow" });

    expect(result).toBeDefined();
    expect(mockedPrisma.gateway.update).toHaveBeenCalledWith({
      where: { id: "gw-123" },
      data: expect.objectContaining({ mode: "workflow" }),
    });
  });

  it("rejects switching to workflow when enabled plugins exist", async () => {
    mockedPrisma.gateway.findUnique.mockResolvedValue({ ...mockGateway, mode: "plugin" });
    mockedPrisma.userPlugin.findFirst.mockResolvedValue({
      id: "up-1",
      gatewayId: "gw-123",
      isEnabled: true,
    });

    const ctx = createTestContext();

    await expect(
      gatewayService.update(ctx, "gw-123", { mode: "workflow" })
    ).rejects.toThrow(ValidationError);

    await expect(
      gatewayService.update(ctx, "gw-123", { mode: "workflow" })
    ).rejects.toThrow(/standalone plugin/i);

    expect(mockedPrisma.gateway.update).not.toHaveBeenCalled();
  });

  it("allows switching to plugin when no active workflows exist", async () => {
    mockedPrisma.gateway.findUnique.mockResolvedValue({ ...mockGateway, mode: "workflow" });
    mockedPrisma.workflow.findFirst.mockResolvedValue(null);
    mockedPrisma.gateway.update.mockResolvedValue({ ...mockGateway, mode: "plugin" });

    const ctx = createTestContext();
    const result = await gatewayService.update(ctx, "gw-123", { mode: "plugin" });

    expect(result).toBeDefined();
    expect(mockedPrisma.gateway.update).toHaveBeenCalledWith({
      where: { id: "gw-123" },
      data: expect.objectContaining({ mode: "plugin" }),
    });
  });

  it("rejects switching to plugin when active workflows exist", async () => {
    mockedPrisma.gateway.findUnique.mockResolvedValue({ ...mockGateway, mode: "workflow" });
    mockedPrisma.workflow.findFirst.mockResolvedValue({
      id: "wf-1",
      gatewayId: "gw-123",
      status: "ACTIVE",
    });

    const ctx = createTestContext();

    await expect(
      gatewayService.update(ctx, "gw-123", { mode: "plugin" })
    ).rejects.toThrow(ValidationError);

    await expect(
      gatewayService.update(ctx, "gw-123", { mode: "plugin" })
    ).rejects.toThrow(/workflow/i);

    expect(mockedPrisma.gateway.update).not.toHaveBeenCalled();
  });

  it("skips validation when mode is not being changed", async () => {
    mockedPrisma.gateway.findUnique.mockResolvedValue({ ...mockGateway, mode: "plugin" });
    mockedPrisma.gateway.update.mockResolvedValue({ ...mockGateway, name: "New Name" });

    const ctx = createTestContext();
    await gatewayService.update(ctx, "gw-123", { name: "New Name" });

    // Should NOT query for plugins or workflows
    expect(mockedPrisma.userPlugin.findFirst).not.toHaveBeenCalled();
    expect(mockedPrisma.workflow.findFirst).not.toHaveBeenCalled();
  });

  it("skips validation when mode is set to the same value", async () => {
    mockedPrisma.gateway.findUnique.mockResolvedValue({ ...mockGateway, mode: "plugin" });
    mockedPrisma.gateway.update.mockResolvedValue(mockGateway);

    const ctx = createTestContext();
    await gatewayService.update(ctx, "gw-123", { mode: "plugin" });

    expect(mockedPrisma.userPlugin.findFirst).not.toHaveBeenCalled();
    expect(mockedPrisma.workflow.findFirst).not.toHaveBeenCalled();
  });
});
