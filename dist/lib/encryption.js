"use strict";
/**
 * Credential Encryption Utility
 *
 * Provides AES-256-GCM encryption for storing sensitive credentials
 * in the database. Uses a server-side encryption key from environment.
 *
 * @module lib/encryption
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.encrypt = encrypt;
exports.decrypt = decrypt;
exports.decryptJson = decryptJson;
exports.isEncryptionAvailable = isEncryptionAvailable;
const crypto_1 = __importDefault(require("crypto"));
const logger_1 = require("./logger");
const encLogger = logger_1.logger.child({ module: "encryption" });
// AES-256-GCM configuration
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16; // 128 bits for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits authentication tag
const KEY_LENGTH = 32; // 256 bits for AES-256
/**
 * Get the encryption key from environment
 * Falls back to a derived key from JWT_SECRET in development
 */
function getEncryptionKey() {
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
        encLogger.warn("Using derived encryption key in production. Set ENCRYPTION_KEY for better security.");
    }
    // Derive a 256-bit key from JWT_SECRET using PBKDF2
    return crypto_1.default.pbkdf2Sync(jwtSecret, "2bot-credentials-salt", 100000, KEY_LENGTH, "sha256");
}
// Lazy-load the key
let encryptionKey = null;
function getKey() {
    if (!encryptionKey) {
        encryptionKey = getEncryptionKey();
    }
    return encryptionKey;
}
/**
 * Encrypt sensitive data
 *
 * @param plaintext - Data to encrypt (will be JSON.stringify'd if object)
 * @returns Encrypted data string safe for database storage
 */
function encrypt(plaintext) {
    const data = typeof plaintext === "object" ? JSON.stringify(plaintext) : plaintext;
    const iv = crypto_1.default.randomBytes(IV_LENGTH);
    const cipher = crypto_1.default.createCipheriv(ALGORITHM, getKey(), iv, {
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
function decrypt(encryptedData) {
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
        const decipher = crypto_1.default.createDecipheriv(ALGORITHM, getKey(), iv, {
            authTagLength: AUTH_TAG_LENGTH,
        });
        decipher.setAuthTag(authTag);
        let decrypted = decipher.update(ciphertext);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString("utf8");
    }
    catch (error) {
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
function decryptJson(encryptedData) {
    const decrypted = decrypt(encryptedData);
    return JSON.parse(decrypted);
}
/**
 * Check if the encryption key is available
 * Useful for health checks
 */
function isEncryptionAvailable() {
    try {
        getKey();
        return true;
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=encryption.js.map