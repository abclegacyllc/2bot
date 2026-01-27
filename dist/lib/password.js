"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashPassword = hashPassword;
exports.verifyPassword = verifyPassword;
exports.isPasswordSecure = isPasswordSecure;
const bcrypt_1 = __importDefault(require("bcrypt"));
/**
 * Number of salt rounds for bcrypt hashing
 * 12 rounds provides a good balance of security and performance
 * ~250ms on modern hardware
 */
const SALT_ROUNDS = 12;
/**
 * Hash a plain text password
 * @param password - Plain text password to hash
 * @returns Hashed password string
 */
async function hashPassword(password) {
    return bcrypt_1.default.hash(password, SALT_ROUNDS);
}
/**
 * Verify a password against a hash
 * @param password - Plain text password to verify
 * @param hash - Hashed password to compare against
 * @returns True if password matches, false otherwise
 */
async function verifyPassword(password, hash) {
    return bcrypt_1.default.compare(password, hash);
}
/**
 * Check if a password meets minimum security requirements
 * This is a quick check before hashing (validation should be done with Zod)
 * @param password - Password to check
 * @returns True if password meets requirements
 */
function isPasswordSecure(password) {
    if (password.length < 8 || password.length > 100)
        return false;
    if (!/[A-Z]/.test(password))
        return false;
    if (!/[a-z]/.test(password))
        return false;
    if (!/[0-9]/.test(password))
        return false;
    return true;
}
//# sourceMappingURL=password.js.map