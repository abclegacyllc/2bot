/**
 * Workflow Trigger Tests
 *
 * Tests for unified BOT_MESSAGE trigger system, platform-specific delegates,
 * and the new callback trigger.
 *
 * @module modules/workflow/__tests__/workflow.triggers.test
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ===========================================
// Mock Dependencies
// ===========================================

vi.mock("@/lib/prisma", () => ({
  prisma: {
    workflow: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

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

const mockExecuteWorkflow = vi.fn().mockResolvedValue("run-123");
vi.mock("../workflow.executor", () => ({
  executeWorkflow: (...args: unknown[]) => mockExecuteWorkflow(...args),
}));

// Import after mocking
import { prisma } from "@/lib/prisma";
import {
  checkBotMessageTrigger,
  checkTelegramCallbackTrigger,
  checkTelegramMessageTrigger,
  checkDiscordMessageTrigger,
  checkSlackMessageTrigger,
  checkWhatsAppMessageTrigger,
} from "../workflow.triggers";

const mockedPrisma = prisma as unknown as {
  workflow: {
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
  };
};

// ===========================================
// Test Data
// ===========================================

const GATEWAY_ID = "gw-123";
const USER_ID = "user-123";
const ORG_ID = null;

const activeWorkflow = (id: string, triggerConfig: Record<string, unknown> = {}) => ({
  id,
  triggerConfig,
});

// ===========================================
// Setup / Teardown
// ===========================================

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ===========================================
// checkBotMessageTrigger
// ===========================================

describe("checkBotMessageTrigger", () => {
  it("returns false when no workflows match", async () => {
    mockedPrisma.workflow.findMany.mockResolvedValue([]);

    const result = await checkBotMessageTrigger(GATEWAY_ID, USER_ID, ORG_ID, "telegram", { text: "hello" });
    expect(result).toBe(false);
    expect(mockExecuteWorkflow).not.toHaveBeenCalled();
  });

  it("returns true and executes matching workflows", async () => {
    mockedPrisma.workflow.findMany.mockResolvedValue([
      activeWorkflow("wf-1"),
      activeWorkflow("wf-2"),
    ]);

    const result = await checkBotMessageTrigger(GATEWAY_ID, USER_ID, ORG_ID, "telegram", { text: "hello" });
    expect(result).toBe(true);
    expect(mockExecuteWorkflow).toHaveBeenCalledTimes(2);
    expect(mockExecuteWorkflow).toHaveBeenCalledWith("wf-1", "bot_message_telegram", expect.objectContaining({ gatewayId: GATEWAY_ID }));
    expect(mockExecuteWorkflow).toHaveBeenCalledWith("wf-2", "bot_message_telegram", expect.objectContaining({ gatewayId: GATEWAY_ID }));
  });

  it("queries with correct filters", async () => {
    mockedPrisma.workflow.findMany.mockResolvedValue([]);

    await checkBotMessageTrigger(GATEWAY_ID, USER_ID, ORG_ID, "discord", {});

    expect(mockedPrisma.workflow.findMany).toHaveBeenCalledWith({
      where: {
        userId: USER_ID,
        gatewayId: GATEWAY_ID,
        triggerType: "BOT_MESSAGE",
        status: "ACTIVE",
        isEnabled: true,
      },
      select: { id: true, triggerConfig: true },
    });
  });

  it("applies matchFn filter — skips non-matching workflows", async () => {
    mockedPrisma.workflow.findMany.mockResolvedValue([
      activeWorkflow("wf-match", { filterType: "command" }),
      activeWorkflow("wf-skip", { filterType: "command" }),
    ]);

    const matchFn = vi.fn()
      .mockReturnValueOnce(true)   // wf-match passes
      .mockReturnValueOnce(false); // wf-skip fails

    const result = await checkBotMessageTrigger(GATEWAY_ID, USER_ID, ORG_ID, "telegram", { text: "/start" }, matchFn);
    expect(result).toBe(true);
    expect(mockExecuteWorkflow).toHaveBeenCalledTimes(1);
    expect(mockExecuteWorkflow).toHaveBeenCalledWith("wf-match", "bot_message_telegram", expect.anything());
  });

  it("returns false when all workflows are filtered by matchFn", async () => {
    mockedPrisma.workflow.findMany.mockResolvedValue([activeWorkflow("wf-1")]);

    const matchFn = vi.fn().mockReturnValue(false);
    const result = await checkBotMessageTrigger(GATEWAY_ID, USER_ID, ORG_ID, "telegram", {}, matchFn);
    expect(result).toBe(false);
    expect(mockExecuteWorkflow).not.toHaveBeenCalled();
  });

  it("catches and logs errors without throwing", async () => {
    mockedPrisma.workflow.findMany.mockRejectedValue(new Error("DB error"));

    const result = await checkBotMessageTrigger(GATEWAY_ID, USER_ID, ORG_ID, "telegram", {});
    expect(result).toBe(false);
  });
});

// ===========================================
// checkTelegramMessageTrigger
// ===========================================

describe("checkTelegramMessageTrigger", () => {
  it("delegates to checkBotMessageTrigger with telegram source", async () => {
    mockedPrisma.workflow.findMany.mockResolvedValue([activeWorkflow("wf-1")]);

    const result = await checkTelegramMessageTrigger(GATEWAY_ID, USER_ID, ORG_ID, {
      text: "hello",
      chatType: "private",
      chatId: 12345,
    });

    expect(result).toBe(true);
    expect(mockExecuteWorkflow).toHaveBeenCalledWith("wf-1", "bot_message_telegram", expect.anything());
  });

  it("filters by chat type config", async () => {
    mockedPrisma.workflow.findMany.mockResolvedValue([
      activeWorkflow("wf-1", { chatTypes: ["group"] }),
    ]);

    // Message from private chat should NOT match
    const result = await checkTelegramMessageTrigger(GATEWAY_ID, USER_ID, ORG_ID, {
      text: "hello",
      chatType: "private",
    });

    expect(result).toBe(false);
    expect(mockExecuteWorkflow).not.toHaveBeenCalled();
  });

  it("filters by command prefix", async () => {
    mockedPrisma.workflow.findMany.mockResolvedValue([
      activeWorkflow("wf-1", { commandPrefix: "/start" }),
    ]);

    const result = await checkTelegramMessageTrigger(GATEWAY_ID, USER_ID, ORG_ID, {
      text: "/start hello",
      chatType: "private",
    });
    expect(result).toBe(true);

    vi.clearAllMocks();
    mockedPrisma.workflow.findMany.mockResolvedValue([
      activeWorkflow("wf-1", { commandPrefix: "/start" }),
    ]);

    const result2 = await checkTelegramMessageTrigger(GATEWAY_ID, USER_ID, ORG_ID, {
      text: "hello world",
      chatType: "private",
    });
    expect(result2).toBe(false);
  });

  it("filters by text pattern regex", async () => {
    mockedPrisma.workflow.findMany.mockResolvedValue([
      activeWorkflow("wf-1", { textPattern: "^hello" }),
    ]);

    const match = await checkTelegramMessageTrigger(GATEWAY_ID, USER_ID, ORG_ID, {
      text: "hello world",
      chatType: "private",
    });
    expect(match).toBe(true);

    vi.clearAllMocks();
    mockedPrisma.workflow.findMany.mockResolvedValue([
      activeWorkflow("wf-1", { textPattern: "^hello" }),
    ]);

    const noMatch = await checkTelegramMessageTrigger(GATEWAY_ID, USER_ID, ORG_ID, {
      text: "goodbye",
      chatType: "private",
    });
    expect(noMatch).toBe(false);
  });
});

// ===========================================
// checkTelegramCallbackTrigger
// ===========================================

describe("checkTelegramCallbackTrigger", () => {
  it("delegates to checkBotMessageTrigger with telegram_callback source", async () => {
    mockedPrisma.workflow.findMany.mockResolvedValue([activeWorkflow("wf-1")]);

    const result = await checkTelegramCallbackTrigger(GATEWAY_ID, USER_ID, ORG_ID, {
      data: "btn_confirm",
      chatId: 12345,
    });

    expect(result).toBe(true);
    expect(mockExecuteWorkflow).toHaveBeenCalledWith("wf-1", "bot_message_telegram_callback", expect.anything());
  });

  it("filters by dataValues", async () => {
    mockedPrisma.workflow.findMany.mockResolvedValue([
      activeWorkflow("wf-1", { dataValues: ["btn_yes", "btn_no"] }),
    ]);

    const match = await checkTelegramCallbackTrigger(GATEWAY_ID, USER_ID, ORG_ID, {
      data: "btn_yes",
    });
    expect(match).toBe(true);

    vi.clearAllMocks();
    mockedPrisma.workflow.findMany.mockResolvedValue([
      activeWorkflow("wf-1", { dataValues: ["btn_yes", "btn_no"] }),
    ]);

    const noMatch = await checkTelegramCallbackTrigger(GATEWAY_ID, USER_ID, ORG_ID, {
      data: "btn_cancel",
    });
    expect(noMatch).toBe(false);
  });

  it("filters by dataPattern (regex)", async () => {
    mockedPrisma.workflow.findMany.mockResolvedValue([
      activeWorkflow("wf-1", { dataPattern: "^btn_" }),
    ]);

    const match = await checkTelegramCallbackTrigger(GATEWAY_ID, USER_ID, ORG_ID, {
      data: "btn_confirm",
    });
    expect(match).toBe(true);

    vi.clearAllMocks();
    mockedPrisma.workflow.findMany.mockResolvedValue([
      activeWorkflow("wf-1", { dataPattern: "^btn_" }),
    ]);

    const noMatch = await checkTelegramCallbackTrigger(GATEWAY_ID, USER_ID, ORG_ID, {
      data: "action_delete",
    });
    expect(noMatch).toBe(false);
  });
});

// ===========================================
// checkDiscordMessageTrigger
// ===========================================

describe("checkDiscordMessageTrigger", () => {
  it("delegates to checkBotMessageTrigger with discord source", async () => {
    mockedPrisma.workflow.findMany.mockResolvedValue([activeWorkflow("wf-1")]);

    const result = await checkDiscordMessageTrigger(GATEWAY_ID, USER_ID, ORG_ID, {
      content: "hello",
      channel_id: "ch-1",
    });

    expect(result).toBe(true);
    expect(mockExecuteWorkflow).toHaveBeenCalledWith("wf-1", "bot_message_discord", expect.anything());
  });

  it("filters by channel IDs", async () => {
    mockedPrisma.workflow.findMany.mockResolvedValue([
      activeWorkflow("wf-1", { channelIds: ["ch-allowed"] }),
    ]);

    const noMatch = await checkDiscordMessageTrigger(GATEWAY_ID, USER_ID, ORG_ID, {
      content: "hello",
      channel_id: "ch-other",
    });
    expect(noMatch).toBe(false);
  });
});

// ===========================================
// checkSlackMessageTrigger
// ===========================================

describe("checkSlackMessageTrigger", () => {
  it("delegates to checkBotMessageTrigger with slack source", async () => {
    mockedPrisma.workflow.findMany.mockResolvedValue([activeWorkflow("wf-1")]);

    const result = await checkSlackMessageTrigger(GATEWAY_ID, USER_ID, ORG_ID, {
      type: "event_callback",
      event: { type: "message", text: "hello", channel: "C123" },
    });

    expect(result).toBe(true);
    expect(mockExecuteWorkflow).toHaveBeenCalledWith("wf-1", "bot_message_slack", expect.anything());
  });
});

// ===========================================
// checkWhatsAppMessageTrigger
// ===========================================

describe("checkWhatsAppMessageTrigger", () => {
  it("delegates to checkBotMessageTrigger with whatsapp source", async () => {
    mockedPrisma.workflow.findMany.mockResolvedValue([activeWorkflow("wf-1")]);

    const result = await checkWhatsAppMessageTrigger(GATEWAY_ID, USER_ID, ORG_ID, {
      type: "text",
      text: { body: "hello" },
      from: "1234567890",
    });

    expect(result).toBe(true);
    expect(mockExecuteWorkflow).toHaveBeenCalledWith("wf-1", "bot_message_whatsapp", expect.anything());
  });

  it("filters by message types", async () => {
    mockedPrisma.workflow.findMany.mockResolvedValue([
      activeWorkflow("wf-1", { messageTypes: ["text"] }),
    ]);

    const noMatch = await checkWhatsAppMessageTrigger(GATEWAY_ID, USER_ID, ORG_ID, {
      type: "image",
    });
    expect(noMatch).toBe(false);
  });
});
