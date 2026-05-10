/**
 * MFA Service Tests — TOTP enrollment, verify, and recovery codes.
 *
 * The recovery-code tests do 8 bcrypt comparisons per call (timing-stable
 * scan). With cost 12 that's ~2s per call; under full-suite CPU contention
 * the default 5s timeout is too tight, so we widen it for this file.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.setConfig({ testTimeout: 30_000 });
import {
  consumeRecoveryCode,
  generateRecoveryCodes,
  isMfaEnabled,
  startEnrollment,
  verifyTotp,
} from "../mfa.service";
import * as OTPAuth from "otpauth";

// The encryption layer derives a key from JWT_SECRET when no
// ENCRYPTION_KEY is configured (this is the dev/test fallback the
// existing encryption tests use too).
beforeAll(() => {
  process.env.JWT_SECRET = "test-jwt-secret-for-mfa-tests-min-32-chars";
});

afterAll(() => {
  delete process.env.JWT_SECRET;
});

// ---------------------------------------------------------------------------
// startEnrollment
// ---------------------------------------------------------------------------

describe("startEnrollment", () => {
  it("returns a base32 secret, otpauth URI, encrypted secret, and QR data URL", async () => {
    const out = await startEnrollment({ email: "alice@example.com" });

    // Plaintext secret: base32, length determined by 20-byte payload (32 chars).
    expect(out.secret).toMatch(/^[A-Z2-7]+$/);
    expect(out.secret.length).toBeGreaterThanOrEqual(32);

    // Encrypted blob uses the v2 wire format from lib/encryption.
    expect(out.encryptedSecret.startsWith("v2:")).toBe(true);

    // otpauth URI carries issuer + (percent-encoded) label + plaintext secret.
    expect(out.otpauthUri).toContain("otpauth://totp/");
    expect(out.otpauthUri).toContain("issuer=2bot");
    expect(out.otpauthUri).toContain("alice%40example.com");
    expect(out.otpauthUri).toContain(`secret=${out.secret}`);

    // QR data URL is a base64-encoded PNG.
    expect(out.qrDataUrl.startsWith("data:image/png;base64,")).toBe(true);
  });

  it("uses a custom issuer when supplied", async () => {
    const out = await startEnrollment({
      email: "bob@example.com",
      issuer: "AcmeCorp",
    });
    expect(out.otpauthUri).toContain("issuer=AcmeCorp");
  });

  it("produces a fresh secret on every call", async () => {
    const a = await startEnrollment({ email: "alice@example.com" });
    const b = await startEnrollment({ email: "alice@example.com" });
    expect(a.secret).not.toBe(b.secret);
    expect(a.encryptedSecret).not.toBe(b.encryptedSecret);
  });
});

// ---------------------------------------------------------------------------
// verifyTotp
// ---------------------------------------------------------------------------

/** Generate the current 6-digit code for a base32 secret. */
function currentCodeFor(secret: string, atMs?: number): string {
  const totp = new OTPAuth.TOTP({
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
  return totp.generate({ timestamp: atMs });
}

describe("verifyTotp", () => {
  it("accepts the code generated for the current step", async () => {
    const enrol = await startEnrollment({ email: "alice@example.com" });
    const code = currentCodeFor(enrol.secret);
    expect(verifyTotp(enrol.encryptedSecret, code)).toBe(true);
  });

  it("rejects a wrong 6-digit code", async () => {
    const enrol = await startEnrollment({ email: "alice@example.com" });
    expect(verifyTotp(enrol.encryptedSecret, "000000")).toBe(false);
  });

  it("rejects malformed codes (non-digits, wrong length)", async () => {
    const enrol = await startEnrollment({ email: "alice@example.com" });
    expect(verifyTotp(enrol.encryptedSecret, "")).toBe(false);
    expect(verifyTotp(enrol.encryptedSecret, "12345")).toBe(false);
    expect(verifyTotp(enrol.encryptedSecret, "abcdef")).toBe(false);
    expect(verifyTotp(enrol.encryptedSecret, "12 3456")).toBe(false);
  });

  it("tolerates ±1 step of clock drift", async () => {
    const enrol = await startEnrollment({ email: "alice@example.com" });
    const now = Date.now();
    const oneStepBack = now - 30_000;
    const oneStepForward = now + 30_000;

    expect(verifyTotp(enrol.encryptedSecret, currentCodeFor(enrol.secret, oneStepBack))).toBe(true);
    expect(verifyTotp(enrol.encryptedSecret, currentCodeFor(enrol.secret, oneStepForward))).toBe(true);
  });

  it("rejects a code from two steps ago (outside the drift window)", async () => {
    const enrol = await startEnrollment({ email: "alice@example.com" });
    const twoStepsBack = Date.now() - 90_000;
    const stale = currentCodeFor(enrol.secret, twoStepsBack);
    expect(verifyTotp(enrol.encryptedSecret, stale)).toBe(false);
  });

  it("returns false instead of throwing when the ciphertext is unreadable", () => {
    expect(verifyTotp("v2:1:not-actually-base64!!!", "123456")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// generateRecoveryCodes / consumeRecoveryCode
// ---------------------------------------------------------------------------

describe("generateRecoveryCodes", () => {
  it("returns 8 plaintext codes and 8 matching bcrypt hashes", async () => {
    const { plaintext, hashes } = await generateRecoveryCodes();
    expect(plaintext).toHaveLength(8);
    expect(hashes).toHaveLength(8);
    // Each plaintext is "XXXXX-XXXXX" using the legibility alphabet.
    for (const code of plaintext) {
      expect(code).toMatch(/^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/);
    }
    // bcrypt hashes start with $2 (a/b/y).
    for (const hash of hashes) {
      expect(hash).toMatch(/^\$2[aby]\$/);
    }
  });

  it("issues unique codes within a batch", async () => {
    const { plaintext } = await generateRecoveryCodes();
    expect(new Set(plaintext).size).toBe(plaintext.length);
  });
});

describe("consumeRecoveryCode", () => {
  it("returns the index of the matching code and ignores non-matches", async () => {
    const { plaintext, hashes } = await generateRecoveryCodes();
    const idx = await consumeRecoveryCode(hashes, plaintext[3]!);
    expect(idx).toBe(3);
  });

  it("normalises whitespace, hyphens, and case", async () => {
    const { plaintext, hashes } = await generateRecoveryCodes();
    const original = plaintext[2]!;
    const stripped = original.replace("-", "").toLowerCase();
    const padded = `  ${stripped}  `;
    expect(await consumeRecoveryCode(hashes, padded)).toBe(2);
  });

  it("returns null for codes that don't match anything", async () => {
    const { hashes } = await generateRecoveryCodes();
    expect(await consumeRecoveryCode(hashes, "ZZZZZ-ZZZZZ")).toBeNull();
  });

  it("returns null on malformed input", async () => {
    const { hashes } = await generateRecoveryCodes();
    expect(await consumeRecoveryCode(hashes, "")).toBeNull();
    expect(await consumeRecoveryCode(hashes, "too-short")).toBeNull();
    expect(await consumeRecoveryCode(hashes, "!!!")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// isMfaEnabled
// ---------------------------------------------------------------------------

describe("isMfaEnabled", () => {
  it("is false when neither field is set", () => {
    expect(isMfaEnabled({ totpSecret: null, totpEnabledAt: null })).toBe(false);
  });

  it("is false during enrollment (secret set, enabledAt still null)", () => {
    expect(
      isMfaEnabled({ totpSecret: "v2:1:...", totpEnabledAt: null }),
    ).toBe(false);
  });

  it("is true once enrollment has been confirmed", () => {
    expect(
      isMfaEnabled({ totpSecret: "v2:1:...", totpEnabledAt: new Date() }),
    ).toBe(true);
  });
});

// Small smoke test that the OTPAuth library is wired up correctly — guards
// against bundler/transitive issues on future dependency upgrades.
describe("library wiring", () => {
  it("OTPAuth.TOTP can generate and validate its own codes", () => {
    const totp = new OTPAuth.TOTP({
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32("JBSWY3DPEHPK3PXP"),
    });
    const code = totp.generate();
    expect(totp.validate({ token: code, window: 1 })).not.toBeNull();
  });
});

// silence the encryption-key-provider singleton warning between test files
afterAll(() => {
  vi.restoreAllMocks();
});
