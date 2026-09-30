/**
 * Telegram webhook secret resolution + verification.
 *
 * The secret Telegram echoes in X-Telegram-Bot-Api-Secret-Token lives in
 * the encrypted credentials blob; rows written before that carried it in
 * the plaintext config JSON. These tests run the real AES-GCM layer (no
 * mocks) because "reads the wrong location" and "compares unsafely" are
 * exactly the failures that would let a forged update through.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { encrypt } from "@/lib/encryption";

import { resolveTelegramWebhookSecret, verifyTelegramSecretToken } from "../webhook";

// The encryption layer derives a key from JWT_SECRET when no
// ENCRYPTION_KEY is configured (the dev/test fallback the other
// encryption tests use too).
beforeAll(() => {
  process.env.JWT_SECRET = "test-jwt-secret-for-webhook-tests-min-32-chars";
});

afterAll(() => {
  delete process.env.JWT_SECRET;
});

const SECRET = "a".repeat(64);
const OTHER = "b".repeat(64);

function gatewayWith(opts: { stored?: string; legacy?: string; credentialsEnc?: string }) {
  return {
    credentialsEnc:
      opts.credentialsEnc ??
      encrypt({ botToken: "123456:ABC", ...(opts.stored ? { webhookSecretToken: opts.stored } : {}) }),
    config: {
      webhookUrl: "https://webhook.2bot.org/telegram/gw1",
      ...(opts.legacy ? { webhookSecretToken: opts.legacy } : {}),
    },
  };
}

describe("resolveTelegramWebhookSecret", () => {
  it("reads the secret from the encrypted credentials", () => {
    expect(resolveTelegramWebhookSecret(gatewayWith({ stored: SECRET }))).toBe(SECRET);
  });

  it("falls back to the legacy plaintext config location", () => {
    expect(resolveTelegramWebhookSecret(gatewayWith({ legacy: SECRET }))).toBe(SECRET);
  });

  it("prefers the encrypted value when both locations are set", () => {
    expect(resolveTelegramWebhookSecret(gatewayWith({ stored: SECRET, legacy: OTHER }))).toBe(SECRET);
  });

  it("uses the legacy value when the credentials cannot be decrypted", () => {
    expect(
      resolveTelegramWebhookSecret(gatewayWith({ credentialsEnc: "v2:1:not-ciphertext", legacy: SECRET })),
    ).toBe(SECRET);
  });

  it("returns undefined when neither location holds a secret", () => {
    expect(resolveTelegramWebhookSecret(gatewayWith({}))).toBeUndefined();
    expect(resolveTelegramWebhookSecret({ credentialsEnc: encrypt({ botToken: "x" }), config: null })).toBeUndefined();
  });
});

describe("verifyTelegramSecretToken", () => {
  it("accepts the matching header", () => {
    expect(verifyTelegramSecretToken(gatewayWith({ stored: SECRET }), SECRET)).toBe(true);
  });

  it("rejects a wrong, a truncated and a missing header", () => {
    const gateway = gatewayWith({ stored: SECRET });
    expect(verifyTelegramSecretToken(gateway, OTHER)).toBe(false);
    expect(verifyTelegramSecretToken(gateway, SECRET.slice(0, 63))).toBe(false);
    expect(verifyTelegramSecretToken(gateway, `${SECRET}a`)).toBe(false);
    expect(verifyTelegramSecretToken(gateway, undefined)).toBe(false);
    expect(verifyTelegramSecretToken(gateway, "")).toBe(false);
  });

  it("rejects the legacy value once the encrypted one differs", () => {
    // After the provider rotates into credentials, the stale plaintext copy
    // must not remain a valid credential.
    expect(verifyTelegramSecretToken(gatewayWith({ stored: SECRET, legacy: OTHER }), OTHER)).toBe(false);
  });

  it("still verifies legacy rows against the plaintext config value", () => {
    expect(verifyTelegramSecretToken(gatewayWith({ legacy: SECRET }), SECRET)).toBe(true);
    expect(verifyTelegramSecretToken(gatewayWith({ legacy: SECRET }), OTHER)).toBe(false);
  });

  it("accepts every delivery for a gateway with no secret configured (pre-secret rows)", () => {
    expect(verifyTelegramSecretToken(gatewayWith({}), undefined)).toBe(true);
    expect(verifyTelegramSecretToken(gatewayWith({}), "anything")).toBe(true);
  });
});
