/**
 * JWT Utility
 *
 * Token generation and verification for authentication.
 *
 * @module lib/jwt
 */

import type { TokenPayload } from "@/modules/auth/auth.types";
import jwt, { type SignOptions } from "jsonwebtoken";

// Re-export for convenience
export type { TokenPayload } from "@/modules/auth/auth.types";

/**
 * JWT Configuration
 */
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-in-production";
const JWT_EXPIRES_IN = "7d";
const JWT_ISSUER = "2bot";
const JWT_AUDIENCE = "2bot-api";

/**
 * Token options interface
 */
export interface TokenOptions {
  expiresIn?: SignOptions["expiresIn"];
}

/**
 * Decoded token result
 */
export interface DecodedToken extends TokenPayload {
  iat: number;
  exp: number;
  iss: string;
  aud: string;
}

/**
 * Generate a JWT token
 *
 * @param payload - The token payload (userId, email, plan, sessionId)
 * @param options - Optional token options (expiresIn)
 * @returns The signed JWT token
 */
export function generateToken(
  payload: TokenPayload,
  options?: TokenOptions
): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: options?.expiresIn ?? JWT_EXPIRES_IN,
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });
}

/**
 * Verify and decode a JWT token
 *
 * @param token - The JWT token to verify
 * @returns The decoded payload or null if invalid
 */
export function verifyToken(token: string): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    }) as DecodedToken;

    // Return only the payload fields we care about
    return {
      userId: decoded.userId,
      email: decoded.email,
      plan: decoded.plan,
      sessionId: decoded.sessionId,
    };
  } catch {
    return null;
  }
}

/**
 * Decode a JWT token without verification
 * Useful for debugging or getting payload from expired tokens
 *
 * @param token - The JWT token to decode
 * @returns The decoded payload or null if malformed
 */
export function decodeToken(token: string): DecodedToken | null {
  try {
    const decoded = jwt.decode(token) as DecodedToken | null;
    return decoded;
  } catch {
    return null;
  }
}

/**
 * Get token expiration date
 *
 * @param token - The JWT token
 * @returns The expiration date or null if invalid
 */
export function getTokenExpiration(token: string): Date | null {
  const decoded = decodeToken(token);
  if (!decoded?.exp) return null;
  return new Date(decoded.exp * 1000);
}

/**
 * Check if a token is expired
 *
 * @param token - The JWT token
 * @returns true if expired or invalid, false if still valid
 */
export function isTokenExpired(token: string): boolean {
  const expiration = getTokenExpiration(token);
  if (!expiration) return true;
  return expiration.getTime() < Date.now();
}
