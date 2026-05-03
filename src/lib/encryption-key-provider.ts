/**
 * Encryption Key Providers
 *
 * Abstracts where encryption keys come from so we can support:
 *   - `env`     — keys from `ENCRYPTION_KEY` / `ENCRYPTION_KEY_V<N>` env vars
 *                 (the legacy mechanism, still default).
 *   - `aws-kms` — data keys fetched via AWS KMS Decrypt of a wrapped DEK,
 *                 cached in memory. Wire-up provided by the host application
 *                 via `setKeyProvider(new KmsKeyProvider({ fetcher }))`.
 *   - `gcp-kms` — same shape as `aws-kms`; the fetcher abstraction is
 *                 cloud-agnostic.
 *
 * The wire format produced by `encrypt()` (`v2:<keyVersion>:<base64>`) is
 * unchanged — KMS-backed mode just changes how the bytes for `<keyVersion>`
 * are obtained.
 *
 * @module lib/encryption-key-provider
 */

import crypto from "crypto";

import { logger } from "./logger";

const log = logger.child({ module: "encryption:keyprovider" });

const KEY_LENGTH = 32;
const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_SALT = "2bot-credentials-salt";

/**
 * Synchronous key lookup contract used by encrypt/decrypt.
 *
 * Implementations that fetch from a remote KMS MUST cache keys and either
 * pre-warm via `warmup()` or be primed before the first `encrypt()` call.
 */
export interface KeyProvider {
  /** Stable label for logs/metrics (`env`, `aws-kms`, `gcp-kms`, ...). */
  readonly name: string;
  /** Return the current key version that new ciphertext should be tagged with. */
  getCurrentVersion(): string;
  /** Return the 32-byte AES-256 key for `version`. Throws if unknown. */
  getKey(version: string): Buffer;
  /**
   * Optional pre-fetch hook. KMS-backed providers should override this to
   * populate their cache before the app starts serving requests.
   */
  warmup?(): Promise<void>;
}

// ---------------------------------------------------------------------------
// EnvKeyProvider — current behavior, unchanged semantics.
// ---------------------------------------------------------------------------

const DEFAULT_KEY_VERSION = "1";

function materializeKeyFromEnv(value: string, label: string): Buffer {
  if (value.length === 64 && /^[0-9a-fA-F]+$/.test(value)) {
    return Buffer.from(value, "hex");
  }
  if (process.env.NODE_ENV === "production") {
    log.warn({ label }, "Encryption key is not 64 hex chars; deriving via PBKDF2");
  }
  return crypto.pbkdf2Sync(value, PBKDF2_SALT, PBKDF2_ITERATIONS, KEY_LENGTH, "sha256");
}

export class EnvKeyProvider implements KeyProvider {
  readonly name = "env";

  private registry: Map<string, Buffer> | null = null;
  private currentVersion: string | null = null;

  private build(): void {
    const registry = new Map<string, Buffer>();
    const current = process.env.ENCRYPTION_KEY_VERSION || DEFAULT_KEY_VERSION;

    const primary = process.env.ENCRYPTION_KEY;
    if (primary) {
      registry.set(current, materializeKeyFromEnv(primary, "ENCRYPTION_KEY"));
    } else {
      const jwtSecret = process.env.JWT_SECRET;
      if (!jwtSecret) {
        throw new Error("ENCRYPTION_KEY or JWT_SECRET must be set");
      }
      if (process.env.NODE_ENV === "production") {
        log.warn(
          "Using derived encryption key in production. Set ENCRYPTION_KEY for better security."
        );
      }
      registry.set(
        current,
        crypto.pbkdf2Sync(jwtSecret, PBKDF2_SALT, PBKDF2_ITERATIONS, KEY_LENGTH, "sha256")
      );
    }

    for (const [envKey, envVal] of Object.entries(process.env)) {
      const m = envKey.match(/^ENCRYPTION_KEY_V(.+)$/);
      if (!m || !envVal) continue;
      const version = m[1];
      if (!version) continue;
      if (registry.has(version)) continue;
      registry.set(version, materializeKeyFromEnv(envVal, envKey));
    }

    this.registry = registry;
    this.currentVersion = current;
  }

  private ensureBuilt(): Map<string, Buffer> {
    if (!this.registry) this.build();
    // build() always sets this.registry; the cast is to avoid a non-null assertion.
    return this.registry as Map<string, Buffer>;
  }

  getCurrentVersion(): string {
    this.ensureBuilt();
    return this.currentVersion as string;
  }

  getKey(version: string): Buffer {
    const key = this.ensureBuilt().get(version);
    if (!key) {
      throw new Error(
        `No encryption key configured for version "${version}". Set ENCRYPTION_KEY_V${version}.`
      );
    }
    return key;
  }

  /** Drop cached registry — used when env changes between tests. */
  reset(): void {
    this.registry = null;
    this.currentVersion = null;
  }
}

// ---------------------------------------------------------------------------
// KmsKeyProvider — pluggable KMS-backed provider with TTL cache.
// ---------------------------------------------------------------------------

/**
 * Async fetcher that returns the raw 32-byte data key for `keyVersion`.
 *
 * Typical AWS KMS implementation: store the encrypted data-key blob in a
 * config table or file, call `kms.decrypt({ CiphertextBlob }).Plaintext`, and
 * return that buffer.
 *
 * Typical GCP KMS implementation: call `client.decrypt({ name, ciphertext })`
 * and return `response.plaintext`.
 *
 * The fetcher MUST return exactly 32 bytes (AES-256). Anything else is a
 * misconfiguration and will throw.
 */
export type KmsDataKeyFetcher = (keyVersion: string) => Promise<Buffer>;

export interface KmsKeyProviderOptions {
  /** Async fetcher that resolves a data key for a given version. */
  fetcher: KmsDataKeyFetcher;
  /** Current key version that new writes should be tagged with. */
  currentVersion: string;
  /** Versions to pre-fetch on `warmup()` (defaults to `[currentVersion]`). */
  knownVersions?: string[];
  /** Cache TTL in ms; 0 disables expiry. Default: 1h. */
  cacheTtlMs?: number;
  /** Provider label for logs/metrics. Default: `aws-kms`. */
  name?: string;
}

interface CachedKey {
  key: Buffer;
  expiresAt: number; // epoch ms; Infinity if no TTL
}

export class KmsKeyProvider implements KeyProvider {
  readonly name: string;
  private readonly fetcher: KmsDataKeyFetcher;
  private readonly currentVersion: string;
  private readonly knownVersions: string[];
  private readonly cacheTtlMs: number;
  private cache = new Map<string, CachedKey>();

  constructor(opts: KmsKeyProviderOptions) {
    this.fetcher = opts.fetcher;
    this.currentVersion = opts.currentVersion;
    this.knownVersions = opts.knownVersions ?? [opts.currentVersion];
    this.cacheTtlMs = opts.cacheTtlMs ?? 60 * 60 * 1000;
    this.name = opts.name ?? "aws-kms";
  }

  getCurrentVersion(): string {
    return this.currentVersion;
  }

  /**
   * Synchronous key access. KMS keys must be pre-warmed via `warmup()` (or a
   * prior `prime(version)` call) before any encrypt/decrypt call. If the key
   * for `version` is not in cache (or expired) this throws — callers should
   * call `warmup()` at app startup.
   */
  getKey(version: string): Buffer {
    const entry = this.cache.get(version);
    if (!entry) {
      throw new Error(
        `KmsKeyProvider: key version "${version}" not warmed. ` +
          `Call warmup() at startup or prime(version).`
      );
    }
    if (Number.isFinite(entry.expiresAt) && Date.now() > entry.expiresAt) {
      this.cache.delete(version);
      throw new Error(
        `KmsKeyProvider: key version "${version}" cache expired. Call warmup() to refresh.`
      );
    }
    return entry.key;
  }

  /** Pre-fetch all `knownVersions` — call this at app startup. */
  async warmup(): Promise<void> {
    await Promise.all(this.knownVersions.map((v) => this.prime(v)));
    log.info(
      { provider: this.name, versions: this.knownVersions, current: this.currentVersion },
      "KMS key cache warmed"
    );
  }

  /** Fetch and cache a single version. Idempotent for in-flight refreshes. */
  async prime(version: string): Promise<void> {
    const key = await this.fetcher(version);
    if (!Buffer.isBuffer(key) || key.length !== KEY_LENGTH) {
      throw new Error(
        `KmsKeyProvider: fetcher for version "${version}" returned ${key?.length ?? 0} bytes; expected ${KEY_LENGTH}`
      );
    }
    const expiresAt = this.cacheTtlMs > 0 ? Date.now() + this.cacheTtlMs : Infinity;
    this.cache.set(version, { key, expiresAt });
  }

  /** Test helper: drop cache. */
  reset(): void {
    this.cache.clear();
  }
}

// ---------------------------------------------------------------------------
// Active provider singleton.
// ---------------------------------------------------------------------------

let activeProvider: KeyProvider | null = null;

/**
 * Set the active key provider. Apps that use KMS should construct a
 * `KmsKeyProvider` at startup, call `warmup()`, then call this.
 */
export function setKeyProvider(provider: KeyProvider): void {
  activeProvider = provider;
}

/** Get the active provider, defaulting to `EnvKeyProvider`. */
export function getKeyProvider(): KeyProvider {
  if (!activeProvider) activeProvider = new EnvKeyProvider();
  return activeProvider;
}

/** Test-only: clear the active provider so the env-default path is used again. */
export function __resetKeyProviderForTests(): void {
  activeProvider = null;
}
