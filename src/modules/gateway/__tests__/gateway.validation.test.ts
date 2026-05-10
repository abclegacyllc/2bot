/**
 * Gateway Validation Tests
 *
 * Pure-zod tests for the request shapes that hit `/gateways` and
 * `/gateways/:id`. These are the only validation between user input
 * and the service layer, so the suite focuses on:
 *   - the Telegram bot-token regex (specific format)
 *   - the discriminated union (rejects unknown types cleanly)
 *   - update-vs-create asymmetries (all fields optional on update)
 */

import { describe, expect, it } from "vitest";
import { GatewayType } from "@prisma/client";
import {
  createGatewaySchema,
  gatewayIdSchema,
  telegramBotCredentialsSchema,
  updateGatewaySchema,
  validateCreateGateway,
  validateUpdateGateway,
} from "../gateway.validation";

const VALID_TG_TOKEN = "123456789:ABCdefGHIjklMNOpqrsTUVwxyz_-1234";

// ---------------------------------------------------------------------------
// telegramBotCredentialsSchema
// ---------------------------------------------------------------------------

describe("telegramBotCredentialsSchema", () => {
  it("accepts a well-formed bot token", () => {
    const parsed = telegramBotCredentialsSchema.safeParse({ botToken: VALID_TG_TOKEN });
    expect(parsed.success).toBe(true);
  });

  it("rejects a token without a colon", () => {
    const parsed = telegramBotCredentialsSchema.safeParse({ botToken: "1234567890ABCdefGHIjklMN" });
    expect(parsed.success).toBe(false);
  });

  it("rejects a token whose prefix is not numeric", () => {
    const parsed = telegramBotCredentialsSchema.safeParse({ botToken: "abc:ABCdefGHIjklMNOpqrs" });
    expect(parsed.success).toBe(false);
  });

  it("rejects a token whose suffix has illegal characters", () => {
    const parsed = telegramBotCredentialsSchema.safeParse({
      botToken: "123456789:ABC$%^GHIjklMNOpqrs",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects an empty / missing token", () => {
    expect(telegramBotCredentialsSchema.safeParse({}).success).toBe(false);
    expect(telegramBotCredentialsSchema.safeParse({ botToken: "" }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// createGatewaySchema (discriminated union)
// ---------------------------------------------------------------------------

describe("createGatewaySchema", () => {
  it("accepts a minimal Telegram gateway create payload", () => {
    const ok = validateCreateGateway({
      name: "My Bot",
      type: GatewayType.TELEGRAM_BOT,
      credentials: { botToken: VALID_TG_TOKEN },
    });
    expect(ok.type).toBe("TELEGRAM_BOT");
    expect(ok.name).toBe("My Bot");
  });

  it("trims the gateway name", () => {
    const ok = validateCreateGateway({
      name: "  spaced  ",
      type: GatewayType.TELEGRAM_BOT,
      credentials: { botToken: VALID_TG_TOKEN },
    });
    expect(ok.name).toBe("spaced");
  });

  it("rejects names below the minimum length", () => {
    const r = createGatewaySchema.safeParse({
      name: "x",
      type: GatewayType.TELEGRAM_BOT,
      credentials: { botToken: VALID_TG_TOKEN },
    });
    expect(r.success).toBe(false);
  });

  it("rejects unknown gateway types via discriminated union", () => {
    const r = createGatewaySchema.safeParse({
      name: "Web bot",
      type: "FACEBOOK_PAGE",
      credentials: { token: "x" },
    });
    expect(r.success).toBe(false);
  });

  it("accepts an optional config sub-object", () => {
    const ok = validateCreateGateway({
      name: "Configured bot",
      type: GatewayType.TELEGRAM_BOT,
      credentials: { botToken: VALID_TG_TOKEN },
      config: {
        webhookUrl: "https://example.com/hook",
        allowedUpdates: ["message", "edited_message"],
        dropPendingUpdates: true,
      },
    });
    expect(ok.config?.webhookUrl).toContain("https://");
  });

  it("rejects a non-URL webhookUrl in config", () => {
    const r = createGatewaySchema.safeParse({
      name: "bad",
      type: GatewayType.TELEGRAM_BOT,
      credentials: { botToken: VALID_TG_TOKEN },
      config: { webhookUrl: "not-a-url" },
    });
    expect(r.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// updateGatewaySchema
// ---------------------------------------------------------------------------

describe("updateGatewaySchema", () => {
  it("accepts an empty payload (all fields optional)", () => {
    expect(updateGatewaySchema.safeParse({}).success).toBe(true);
  });

  it("accepts a name-only update", () => {
    const ok = validateUpdateGateway({ name: "New name" });
    expect(ok.name).toBe("New name");
  });

  it("accepts a credentials-only update with a valid Telegram token", () => {
    const ok = validateUpdateGateway({
      credentials: { botToken: VALID_TG_TOKEN },
    });
    expect(ok.credentials).toEqual({ botToken: VALID_TG_TOKEN });
  });

  it("rejects a credentials-only update with an invalid token", () => {
    const r = updateGatewaySchema.safeParse({
      credentials: { botToken: "garbage" },
    });
    expect(r.success).toBe(false);
  });

  it("accepts mode 'plugin' or 'workflow'", () => {
    expect(updateGatewaySchema.safeParse({ mode: "plugin" }).success).toBe(true);
    expect(updateGatewaySchema.safeParse({ mode: "workflow" }).success).toBe(true);
  });

  it("rejects an unknown mode", () => {
    expect(updateGatewaySchema.safeParse({ mode: "auto" }).success).toBe(false);
  });

  it("strips unknown keys when config matches the typed shape (z.object strip)", () => {
    // The discriminated union's first option is the typed Telegram-bot
    // config — its z.object() default is "strip", so unknown keys are
    // dropped rather than kept under the loose record alternate.
    const ok = validateUpdateGateway({ config: { something: "anything", count: 4 } });
    expect(ok.config).toEqual({});
  });

  it("preserves recognised typed-config fields", () => {
    const ok = validateUpdateGateway({
      config: { webhookUrl: "https://x.test/hook", dropPendingUpdates: true },
    });
    expect(ok.config?.webhookUrl).toBe("https://x.test/hook");
    expect(ok.config?.dropPendingUpdates).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// gatewayIdSchema
// ---------------------------------------------------------------------------

describe("gatewayIdSchema", () => {
  it("accepts a CUID", () => {
    const ok = gatewayIdSchema.safeParse({ id: "ckpqr5z3o0000fxprm5xj1k4q" });
    expect(ok.success).toBe(true);
  });

  it("rejects a UUID-shaped value (not a CUID)", () => {
    const r = gatewayIdSchema.safeParse({ id: "550e8400-e29b-41d4-a716-446655440000" });
    expect(r.success).toBe(false);
  });

  it("rejects a missing id", () => {
    expect(gatewayIdSchema.safeParse({}).success).toBe(false);
  });
});
