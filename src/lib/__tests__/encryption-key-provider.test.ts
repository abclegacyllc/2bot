/**
 * Encryption Key Provider Tests (Phase 5.4)
 *
 * Verifies the KeyProvider abstraction:
 *   - EnvKeyProvider preserves the legacy env-based behaviour
 *   - KmsKeyProvider caches data keys, validates length, expires on TTL
 *   - setKeyProvider/getKeyProvider swap providers cleanly
 *   - encrypt/decrypt continues to roundtrip via the active provider
 */

import crypto from "crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
    __resetEncryptionForTests,
    decrypt,
    encrypt,
} from "../encryption";
import {
    __resetKeyProviderForTests,
    EnvKeyProvider,
    getKeyProvider,
    KmsKeyProvider,
    setKeyProvider,
} from "../encryption-key-provider";

const HEX_KEY_64 = "a".repeat(64); // 32 bytes of 0xaa

beforeEach(() => {
  __resetEncryptionForTests();
  process.env.JWT_SECRET = "test-jwt-secret-for-encryption-at-least-32-chars";
  delete process.env.ENCRYPTION_KEY;
  delete process.env.ENCRYPTION_KEY_VERSION;
  for (const k of Object.keys(process.env)) {
    if (k.startsWith("ENCRYPTION_KEY_V")) delete process.env[k];
  }
});

afterEach(() => {
  __resetKeyProviderForTests();
  delete process.env.JWT_SECRET;
});

// ---------------------------------------------------------------------------
// EnvKeyProvider
// ---------------------------------------------------------------------------

describe("EnvKeyProvider", () => {
  it("uses ENCRYPTION_KEY for the current version", () => {
    process.env.ENCRYPTION_KEY = HEX_KEY_64;
    process.env.ENCRYPTION_KEY_VERSION = "5";
    const p = new EnvKeyProvider();
    expect(p.getCurrentVersion()).toBe("5");
    const key = p.getKey("5");
    expect(key.length).toBe(32);
    expect(key.toString("hex")).toBe(HEX_KEY_64);
  });

  it("loads historical ENCRYPTION_KEY_V<N> keys", () => {
    process.env.ENCRYPTION_KEY = HEX_KEY_64;
    process.env.ENCRYPTION_KEY_VERSION = "2";
    process.env.ENCRYPTION_KEY_V1 = "b".repeat(64);
    const p = new EnvKeyProvider();
    expect(p.getKey("2").toString("hex")).toBe(HEX_KEY_64);
    expect(p.getKey("1").toString("hex")).toBe("b".repeat(64));
  });

  it("derives from JWT_SECRET when ENCRYPTION_KEY is missing (dev fallback)", () => {
    const p = new EnvKeyProvider();
    expect(p.getKey(p.getCurrentVersion()).length).toBe(32);
  });

  it("throws on unknown version", () => {
    process.env.ENCRYPTION_KEY = HEX_KEY_64;
    const p = new EnvKeyProvider();
    expect(() => p.getKey("99")).toThrow(/No encryption key configured/);
  });
});

// ---------------------------------------------------------------------------
// KmsKeyProvider
// ---------------------------------------------------------------------------

describe("KmsKeyProvider", () => {
  it("warmup pre-fetches all known versions and serves them sync", async () => {
    const calls: string[] = [];
    const provider = new KmsKeyProvider({
      fetcher: async (v) => {
        calls.push(v);
        return crypto.randomBytes(32);
      },
      currentVersion: "kms-1",
      knownVersions: ["kms-1", "kms-0"],
    });
    await provider.warmup();
    expect(calls.sort()).toEqual(["kms-0", "kms-1"]);
    expect(provider.getKey("kms-1").length).toBe(32);
    expect(provider.getKey("kms-0").length).toBe(32);
  });

  it("getKey throws if version not warmed", () => {
    const provider = new KmsKeyProvider({
      fetcher: async () => crypto.randomBytes(32),
      currentVersion: "kms-1",
    });
    expect(() => provider.getKey("kms-1")).toThrow(/not warmed/);
  });

  it("rejects fetcher returning the wrong key length", async () => {
    const provider = new KmsKeyProvider({
      fetcher: async () => Buffer.alloc(16), // wrong size
      currentVersion: "kms-1",
    });
    await expect(provider.warmup()).rejects.toThrow(/expected 32/);
  });

  it("expires entries past TTL", async () => {
    const provider = new KmsKeyProvider({
      fetcher: async () => crypto.randomBytes(32),
      currentVersion: "kms-1",
      cacheTtlMs: 1,
    });
    await provider.warmup();
    await new Promise((r) => setTimeout(r, 5));
    expect(() => provider.getKey("kms-1")).toThrow(/cache expired/);
  });

  it("getCurrentVersion returns the configured version", () => {
    const provider = new KmsKeyProvider({
      fetcher: async () => crypto.randomBytes(32),
      currentVersion: "kms-7",
    });
    expect(provider.getCurrentVersion()).toBe("kms-7");
  });
});

// ---------------------------------------------------------------------------
// Provider singleton + encrypt/decrypt roundtrip
// ---------------------------------------------------------------------------

describe("setKeyProvider / encrypt-decrypt integration", () => {
  it("defaults to EnvKeyProvider", () => {
    expect(getKeyProvider()).toBeInstanceOf(EnvKeyProvider);
  });

  it("encrypt/decrypt roundtrips when active provider is KmsKeyProvider", async () => {
    const fixedKey = crypto.randomBytes(32);
    const kms = new KmsKeyProvider({
      fetcher: async () => fixedKey,
      currentVersion: "kms-1",
    });
    await kms.warmup();
    setKeyProvider(kms);

    const plaintext = "super-secret-credential";
    const ct = encrypt(plaintext);
    expect(ct.startsWith("v2:kms-1:")).toBe(true);
    expect(decrypt(ct)).toBe(plaintext);
  });

  it("decrypt works across providers when key bytes match", async () => {
    // Write under env, decrypt under KMS provider with the same byte key.
    const hex = HEX_KEY_64;
    process.env.ENCRYPTION_KEY = hex;
    process.env.ENCRYPTION_KEY_VERSION = "1";
    const ct = encrypt("hello");

    const kms = new KmsKeyProvider({
      fetcher: async () => Buffer.from(hex, "hex"),
      currentVersion: "1",
    });
    await kms.warmup();
    setKeyProvider(kms);

    expect(decrypt(ct)).toBe("hello");
  });
});
