/**
 * Telegram provider — webhook secret lifecycle.
 *
 * The secret Telegram echoes on every delivery is minted by the provider on
 * setWebhook and must end up inside the encrypted credentials, never in the
 * plaintext config blob. Rows from before that change carry it in config;
 * the provider moves it across on the next connect. These tests drive
 * `doConnect` with a stubbed Telegram API and a mocked Prisma client.
 */

import type { Mock } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    gateway: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/encryption", () => ({
  encrypt: vi.fn((data: unknown) => `encrypted:${JSON.stringify(data)}`),
  decryptJson: vi.fn((data: string) => JSON.parse(data.replace("encrypted:", ""))),
}));

// base.provider imports these for connect()/metrics; doConnect never
// reaches them, so keep the import graph small.
vi.mock("@/modules/gateway/gateway.service", () => ({
  gatewayService: { updateStatus: vi.fn(), updateMetadata: vi.fn() },
}));
vi.mock("@/modules/gateway/gateway-metrics.service", () => ({
  gatewayMetricService: {},
}));

import { prisma } from "@/lib/prisma";

import type { TelegramBotConfig, TelegramBotCredentials } from "../gateway.types";
import { TelegramBotProvider } from "../providers/telegram-bot.provider";

const mockedPrisma = prisma as unknown as {
  gateway: { findUnique: Mock; update: Mock };
};

const GATEWAY_ID = "gw-telegram-1";
const WEBHOOK_URL = `${process.env.TELEGRAM_WEBHOOK_BASE_URL || "https://webhook.2bot.org"}/telegram/${GATEWAY_ID}`;

interface ApiCall {
  method: string;
  body: Record<string, unknown> | undefined;
}

let apiCalls: ApiCall[];
/** What getWebhookInfo reports as the currently registered URL. */
let registeredWebhookUrl: string;

beforeEach(() => {
  vi.clearAllMocks();
  apiCalls = [];
  registeredWebhookUrl = WEBHOOK_URL;

  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: { body?: string }) => {
      const method = url.split("/").pop() ?? "";
      const body = init?.body ? (JSON.parse(init.body) as Record<string, unknown>) : undefined;
      apiCalls.push({ method, body });

      const result =
        method === "getMe"
          ? { id: 1, is_bot: true, username: "demo_bot" }
          : method === "getWebhookInfo"
            ? { url: registeredWebhookUrl }
            : true;
      return { json: async () => ({ ok: true, result }) };
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function connect(credentials: TelegramBotCredentials, config?: TelegramBotConfig): Promise<void> {
  const provider = new TelegramBotProvider();
  await (
    provider as unknown as {
      doConnect: (id: string, c: TelegramBotCredentials, cfg?: TelegramBotConfig) => Promise<void>;
    }
  ).doConnect(GATEWAY_ID, credentials, config);
}

const setWebhookCalls = () => apiCalls.filter((c) => c.method === "setWebhook");

describe("TelegramBotProvider webhook secret", () => {
  it("moves a legacy plaintext secret into the encrypted credentials without calling setWebhook", async () => {
    mockedPrisma.gateway.findUnique.mockResolvedValue({
      credentialsEnc: 'encrypted:{"botToken":"123:ABC"}',
      config: { allowedUpdates: ["message"], webhookSecretToken: "legacy-secret" },
    });

    await connect({ botToken: "123:ABC" }, { allowedUpdates: ["message"], webhookSecretToken: "legacy-secret" });

    expect(setWebhookCalls()).toHaveLength(0);
    expect(mockedPrisma.gateway.update).toHaveBeenCalledWith({
      where: { id: GATEWAY_ID },
      data: {
        credentialsEnc: 'encrypted:{"botToken":"123:ABC","webhookSecretToken":"legacy-secret"}',
        config: { allowedUpdates: ["message"] },
      },
    });
  });

  it("leaves the row alone when the secret already lives in the credentials", async () => {
    await connect({ botToken: "123:ABC", webhookSecretToken: "stored-secret" }, {});

    expect(setWebhookCalls()).toHaveLength(0);
    expect(mockedPrisma.gateway.findUnique).not.toHaveBeenCalled();
    expect(mockedPrisma.gateway.update).not.toHaveBeenCalled();
  });

  it("mints a 64-hex secret on first setWebhook and stores it encrypted", async () => {
    registeredWebhookUrl = "";
    mockedPrisma.gateway.findUnique.mockResolvedValue({
      credentialsEnc: 'encrypted:{"botToken":"123:ABC"}',
      config: {},
    });

    await connect({ botToken: "123:ABC" });

    const [call] = setWebhookCalls();
    expect(call?.body?.url).toBe(WEBHOOK_URL);
    const secret = call?.body?.secret_token;
    expect(secret).toMatch(/^[0-9a-f]{64}$/);

    expect(mockedPrisma.gateway.update).toHaveBeenCalledWith({
      where: { id: GATEWAY_ID },
      data: {
        credentialsEnc: `encrypted:{"botToken":"123:ABC","webhookSecretToken":"${secret}"}`,
        config: {},
      },
    });
    // Never written back to the plaintext config.
    const data = mockedPrisma.gateway.update.mock.calls[0]?.[0]?.data as { config: Record<string, unknown> };
    expect(data.config).not.toHaveProperty("webhookSecretToken");
  });

  it("re-points the webhook with the stored secret and does not rewrite the row", async () => {
    registeredWebhookUrl = "https://old.example.invalid/telegram/x";

    await connect({ botToken: "123:ABC", webhookSecretToken: "stored-secret" }, {});

    const [call] = setWebhookCalls();
    expect(call?.body?.secret_token).toBe("stored-secret");
    expect(mockedPrisma.gateway.update).not.toHaveBeenCalled();
  });

  it("prefers the encrypted secret over a stale legacy copy and strips the copy", async () => {
    mockedPrisma.gateway.findUnique.mockResolvedValue({
      credentialsEnc: 'encrypted:{"botToken":"123:ABC","webhookSecretToken":"stored-secret"}',
      config: { webhookSecretToken: "stale-legacy" },
    });

    await connect({ botToken: "123:ABC", webhookSecretToken: "stored-secret" }, { webhookSecretToken: "stale-legacy" });

    expect(mockedPrisma.gateway.update).toHaveBeenCalledWith({
      where: { id: GATEWAY_ID },
      data: {
        credentialsEnc: 'encrypted:{"botToken":"123:ABC","webhookSecretToken":"stored-secret"}',
        config: {},
      },
    });
  });

  it("keeps the gateway connected when persisting the secret fails", async () => {
    mockedPrisma.gateway.findUnique.mockRejectedValue(new Error("db down"));

    await expect(
      connect({ botToken: "123:ABC" }, { webhookSecretToken: "legacy-secret" }),
    ).resolves.toBeUndefined();
    expect(mockedPrisma.gateway.update).not.toHaveBeenCalled();
  });
});
