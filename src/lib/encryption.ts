/**
 * Credential Encryption Utility
 *
 * AES-256-GCM encryption for storing sensitive credentials in the DB.
 *
 * Key versioning: supports multiple keys to enable zero-downtime
 * rotation. Reads any version, writes only the latest.
 *
 * Wire formats:
 *   v1:<base64(iv|tag|ct)>             — legacy single-key (read-only after rotation)
 *   v2:<keyVersion>:<base64(iv|tag|ct)> — versioned, supports rotation
 *
 * Env config:
 *   ENCRYPTION_KEY            — primary key (64 hex chars). Used as the current
 *                               key with the version from `ENCRYPTION_KEY_VERSION`
 *                               (default "1"). Falls back to PBKDF2(JWT_SECRET) in dev.
 *   ENCRYPTION_KEY_VERSION    — current key version label (default "1").
 *   ENCRYPTION_KEY_V<N>       — additional historical keys (e.g. ENCRYPTION_KEY_V1=...)
 *                               used to read ciphertext written under those versions.
 *
 * Rotation flow:
 *   1. Set ENCRYPTION_KEY_V1=<old hex>, ENCRYPTION_KEY=<new hex>, ENCRYPTION_KEY_VERSION=2
 *   2. Deploy. New writes go out as v2:2:..., old data still decrypts via key V1.
 *   3. Optionally run a re-encryption job that calls `rewrap(ciphertext)` per row.
 *
 * @module lib/encryption
 */

import crypto from "crypto";

import {
    __resetKeyProviderForTests,
    EnvKeyProvider,
    getKeyProvider,
} from "./encryption-key-provider";
import { logger } from "./logger";

const encLogger = logger.child({ module: "encryption" });

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function getCurrentVersion(): string {
  return getKeyProvider().getCurrentVersion();
}

function getKeyByVersion(version: string): Buffer {
  return getKeyProvider().getKey(version);
}

/**
 * Encrypted data format (base64 encoded):
 * [IV (16 bytes)][Auth Tag (16 bytes)][Ciphertext]
 */
export interface EncryptedData {
  /** Base64-encoded encrypted data with IV and auth tag */
  encrypted: string;
  /** Encryption version for future algorithm changes */
  version: 1;
}

/**
 * Encrypt sensitive data using the current key version.
 *
 * @param plaintext - Data to encrypt (will be JSON.stringify'd if object)
 * @returns Encrypted data string (`v2:<keyVersion>:<base64>`)
 */
export function encrypt(plaintext: string | object): string {
  const data = typeof plaintext === "object" ? JSON.stringify(plaintext) : plaintext;
  const version = getCurrentVersion();
  const key = getKeyByVersion(version);

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  let encrypted = cipher.update(data, "utf8");
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  const authTag = cipher.getAuthTag();
  const combined = Buffer.concat([iv, authTag, encrypted]);

  return `v2:${version}:${combined.toString("base64")}`;
}

/**
 * Parse a stored ciphertext into its components. Throws on unknown format.
 */
function parseCiphertext(encryptedData: string): {
  format: "v1" | "v2";
  keyVersion: string;
  iv: Buffer;
  authTag: Buffer;
  ciphertext: Buffer;
} {
  if (encryptedData.startsWith("v2:")) {
    const rest = encryptedData.slice(3);
    const sepIdx = rest.indexOf(":");
    if (sepIdx <= 0) throw new Error("Malformed v2 ciphertext: missing key version");
    const keyVersion = rest.slice(0, sepIdx);
    const combined = Buffer.from(rest.slice(sepIdx + 1), "base64");
    return {
      format: "v2",
      keyVersion,
      iv: combined.subarray(0, IV_LENGTH),
      authTag: combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH),
      ciphertext: combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH),
    };
  }
  if (encryptedData.startsWith("v1:")) {
    const combined = Buffer.from(encryptedData.slice(3), "base64");
    return {
      format: "v1",
      // v1 predates rotation — assume it was written with the current/default key.
      keyVersion: getCurrentVersion(),
      iv: combined.subarray(0, IV_LENGTH),
      authTag: combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH),
      ciphertext: combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH),
    };
  }
  throw new Error("Unknown encryption version");
}

/**
 * Decrypt data written under any supported version.
 *
 * @throws Error if decryption fails (invalid key, tampered data, unknown key version)
 */
export function decrypt(encryptedData: string): string {
  try {
    const { keyVersion, iv, authTag, ciphertext } = parseCiphertext(encryptedData);
    const key = getKeyByVersion(keyVersion);

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertext);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString("utf8");
  } catch (error) {
    encLogger.error({ error }, "Decryption failed");
    throw new Error("Failed to decrypt credentials");
  }
}

/**
 * Decrypt data and parse as JSON.
 */
export function decryptJson<T>(encryptedData: string): T {
  return JSON.parse(decrypt(encryptedData)) as T;
}

/**
 * Returns true if `encryptedData` was written with an older key version than
 * the current one (or with the legacy v1 format). Use this in background
 * re-encryption jobs to find rows worth rewrapping.
 */
export function needsRewrap(encryptedData: string): boolean {
  try {
    const { format, keyVersion } = parseCiphertext(encryptedData);
    return format === "v1" || keyVersion !== getCurrentVersion();
  } catch {
    return false;
  }
}

/**
 * Decrypt with an old key, then re-encrypt with the current key. Returns the
 * new ciphertext (or the original if no rewrap was needed). Safe to call
 * unconditionally — call sites can store the return value back.
 */
export function rewrap(encryptedData: string): string {
  if (!needsRewrap(encryptedData)) return encryptedData;
  return encrypt(decrypt(encryptedData));
}

/**
 * Health check: returns true if at least the current key is loadable.
 */
export function isEncryptionAvailable(): boolean {
  try {
    getKeyByVersion(getCurrentVersion());
    return true;
  } catch {
    return false;
  }
}

/**
 * Test-only: clear the lazy key cache so env changes take effect between tests.
 */
export function __resetEncryptionForTests(): void {
  // Reset any cached EnvKeyProvider state then drop the active provider
  // so the next call rebuilds from current env.
  const active = getKeyProvider();
  if (active instanceof EnvKeyProvider) {
    active.reset();
  }
  __resetKeyProviderForTests();
}

/**
 * Returns true if `value` looks like a versioned ciphertext produced by
 * `encrypt()` (matches `v<digits>:`). Use this for backwards-compatibility at
 * call sites that may store either plaintext (legacy) or ciphertext (current).
 */
export function isEncryptedString(value: string): boolean {
  return /^v\d+:/.test(value);
}

/**
 * Decrypt only if `value` is a versioned ciphertext. Otherwise return as-is.
 * Convenience wrapper for migration paths where the column may still hold
 * plaintext from before encryption was enabled.
 */
export function decryptIfEncrypted(value: string): string {
  return isEncryptedString(value) ? decrypt(value) : value;
}

// re-export key provider primitives so callers can wire up KMS
// at app startup without reaching into the underlying module.
export {
    EnvKeyProvider,
    getKeyProvider,
    KmsKeyProvider,
    setKeyProvider,
    type KeyProvider,
    type KmsDataKeyFetcher,
    type KmsKeyProviderOptions
} from "./encryption-key-provider";
