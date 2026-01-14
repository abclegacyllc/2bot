/**
 * Credential Encryption Utility
 *
 * Provides AES-256-GCM encryption for storing sensitive credentials
 * in the database. Uses a server-side encryption key from environment.
 *
 * @module lib/encryption
 */

import crypto from "crypto";

import { logger } from "./logger";

const encLogger = logger.child({ module: "encryption" });

// AES-256-GCM configuration
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16; // 128 bits for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits authentication tag
const KEY_LENGTH = 32; // 256 bits for AES-256

/**
 * Get the encryption key from environment
 * Falls back to a derived key from JWT_SECRET in development
 */
function getEncryptionKey(): Buffer {
  const encryptionKey = process.env.ENCRYPTION_KEY;

  if (encryptionKey) {
    // Use provided key (must be 32 bytes / 64 hex chars)
    if (encryptionKey.length !== 64) {
      throw new Error("ENCRYPTION_KEY must be 64 hex characters (32 bytes)");
    }
    return Buffer.from(encryptionKey, "hex");
  }

  // In development, derive from JWT_SECRET
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error("ENCRYPTION_KEY or JWT_SECRET must be set");
  }

  if (process.env.NODE_ENV === "production") {
    encLogger.warn(
      "Using derived encryption key in production. Set ENCRYPTION_KEY for better security."
    );
  }

  // Derive a 256-bit key from JWT_SECRET using PBKDF2
  return crypto.pbkdf2Sync(jwtSecret, "2bot-credentials-salt", 100000, KEY_LENGTH, "sha256");
}

// Lazy-load the key
let encryptionKey: Buffer | null = null;

function getKey(): Buffer {
  if (!encryptionKey) {
    encryptionKey = getEncryptionKey();
  }
  return encryptionKey;
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
 * Encrypt sensitive data
 *
 * @param plaintext - Data to encrypt (will be JSON.stringify'd if object)
 * @returns Encrypted data string safe for database storage
 */
export function encrypt(plaintext: string | object): string {
  const data = typeof plaintext === "object" ? JSON.stringify(plaintext) : plaintext;

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  let encrypted = cipher.update(data, "utf8");
  encrypted = Buffer.concat([encrypted, cipher.final()]);

  const authTag = cipher.getAuthTag();

  // Combine IV + authTag + ciphertext into single buffer
  const combined = Buffer.concat([iv, authTag, encrypted]);

  // Return as base64 with version prefix for future compatibility
  return `v1:${combined.toString("base64")}`;
}

/**
 * Decrypt data
 *
 * @param encryptedData - Encrypted string from database
 * @returns Decrypted data
 * @throws Error if decryption fails (invalid key, tampered data, etc.)
 */
export function decrypt(encryptedData: string): string {
  try {
    // Parse version prefix
    if (!encryptedData.startsWith("v1:")) {
      throw new Error("Unknown encryption version");
    }

    const data = encryptedData.slice(3); // Remove "v1:" prefix
    const combined = Buffer.from(data, "base64");

    // Extract IV, auth tag, and ciphertext
    const iv = combined.subarray(0, IV_LENGTH);
    const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv, {
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
 * Decrypt data and parse as JSON
 *
 * @param encryptedData - Encrypted string from database
 * @returns Parsed JSON object
 */
export function decryptJson<T>(encryptedData: string): T {
  const decrypted = decrypt(encryptedData);
  return JSON.parse(decrypted) as T;
}

/**
 * Check if the encryption key is available
 * Useful for health checks
 */
export function isEncryptionAvailable(): boolean {
  try {
    getKey();
    return true;
  } catch {
    return false;
  }
}
