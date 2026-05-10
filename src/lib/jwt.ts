/**
 * JWT Utility
 *
 * Token generation and verification for authentication.
 *
 * @module lib/jwt
 */

import type { MfaChallengePayload, TokenPayload } from "@/modules/auth/auth.types";
import jwt, { type SignOptions } from "jsonwebtoken";

// Re-export for convenience
export type { MfaChallengePayload, TokenPayload } from "@/modules/auth/auth.types";

/**
 * JWT Configuration
 * Uses lazy initialization to avoid build-time errors
 */
let _jwtSecret: string | null = null;

function getJwtSecret(): string {
  if (_jwtSecret) {
    return _jwtSecret;
  }
  
  if (process.env.JWT_SECRET) {
    _jwtSecret = process.env.JWT_SECRET;
    return _jwtSecret;
  }
  
  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET environment variable is required in production");
  }
  
  _jwtSecret = "dev-secret-change-in-production";
  return _jwtSecret;
}

const JWT_EXPIRES_IN = "7d";
const JWT_ISSUER = "2bot";
const JWT_AUDIENCE = "2bot-api";

// Wave 2.1 — separate audience for short-lived MFA challenge tokens so
// they cannot be confused with normal session tokens.
const MFA_CHALLENGE_AUDIENCE = "2bot-mfa-challenge";
const MFA_CHALLENGE_EXPIRES_IN = "5m";

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
  return jwt.sign(payload, getJwtSecret(), {
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
    const decoded = jwt.verify(token, getJwtSecret(), {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    }) as DecodedToken;

    // Simplified token - only user identity fields
    // Context is determined by URL, not token
    return {
      userId: decoded.userId,
      email: decoded.email,
      plan: decoded.plan,
      sessionId: decoded.sessionId,
      role: decoded.role ?? 'MEMBER',
      mfa: (decoded as DecodedToken & { mfa?: boolean }).mfa ?? false,
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

// ---------------------------------------------------------------------------
// Wave 2.1 — MFA challenge tokens
// ---------------------------------------------------------------------------

/**
 * Issue a short-lived bearer that the client exchanges (with a TOTP code)
 * for a real session via /auth/mfa/challenge. Keep the lifetime tight —
 * 5 min is generous enough for a real user, short enough to be useless
 * to a thief.
 */
export function generateMfaChallengeToken(payload: MfaChallengePayload): string {
  return jwt.sign(payload, getJwtSecret(), {
    expiresIn: MFA_CHALLENGE_EXPIRES_IN,
    issuer: JWT_ISSUER,
    audience: MFA_CHALLENGE_AUDIENCE,
  });
}

/**
 * Verify an MFA challenge bearer and return its payload, or null on any
 * failure (expired, wrong audience, tampered, missing fields).
 */
export function verifyMfaChallengeToken(token: string): MfaChallengePayload | null {
  try {
    const decoded = jwt.verify(token, getJwtSecret(), {
      issuer: JWT_ISSUER,
      audience: MFA_CHALLENGE_AUDIENCE,
    }) as MfaChallengePayload & { iat: number; exp: number; iss: string; aud: string };

    if (decoded.scope !== "mfa-challenge") return null;
    if (typeof decoded.userId !== "string" || !decoded.userId) return null;
    if (typeof decoded.sessionId !== "string" || !decoded.sessionId) return null;

    return {
      userId: decoded.userId,
      sessionId: decoded.sessionId,
      scope: "mfa-challenge",
    };
  } catch {
    return null;
  }
}
