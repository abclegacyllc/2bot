import bcrypt from "bcrypt";

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
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Verify a password against a hash
 * @param password - Plain text password to verify
 * @param hash - Hashed password to compare against
 * @returns True if password matches, false otherwise
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Check if a password meets minimum security requirements
 * This is a quick check before hashing (validation should be done with Zod)
 * @param password - Password to check
 * @returns True if password meets requirements
 */
export function isPasswordSecure(password: string): boolean {
  if (password.length < 8 || password.length > 100) return false;
  if (!/[A-Z]/.test(password)) return false;
  if (!/[a-z]/.test(password)) return false;
  if (!/[0-9]/.test(password)) return false;
  return true;
}
