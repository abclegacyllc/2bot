"use strict";
/**
 * JWT Utility
 *
 * Token generation and verification for authentication.
 *
 * @module lib/jwt
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateToken = generateToken;
exports.verifyToken = verifyToken;
exports.decodeToken = decodeToken;
exports.getTokenExpiration = getTokenExpiration;
exports.isTokenExpired = isTokenExpired;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
/**
 * JWT Configuration
 * Uses lazy initialization to avoid build-time errors
 */
let _jwtSecret = null;
function getJwtSecret() {
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
/**
 * Generate a JWT token
 *
 * @param payload - The token payload (userId, email, plan, sessionId)
 * @param options - Optional token options (expiresIn)
 * @returns The signed JWT token
 */
function generateToken(payload, options) {
    return jsonwebtoken_1.default.sign(payload, getJwtSecret(), {
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
function verifyToken(token) {
    try {
        const decoded = jsonwebtoken_1.default.verify(token, getJwtSecret(), {
            issuer: JWT_ISSUER,
            audience: JWT_AUDIENCE,
        });
        // Phase 6.7: Simplified token - only user identity fields
        // Context is determined by URL, not token
        return {
            userId: decoded.userId,
            email: decoded.email,
            plan: decoded.plan,
            sessionId: decoded.sessionId,
            role: decoded.role ?? 'MEMBER',
        };
    }
    catch {
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
function decodeToken(token) {
    try {
        const decoded = jsonwebtoken_1.default.decode(token);
        return decoded;
    }
    catch {
        return null;
    }
}
/**
 * Get token expiration date
 *
 * @param token - The JWT token
 * @returns The expiration date or null if invalid
 */
function getTokenExpiration(token) {
    const decoded = decodeToken(token);
    if (!decoded?.exp)
        return null;
    return new Date(decoded.exp * 1000);
}
/**
 * Check if a token is expired
 *
 * @param token - The JWT token
 * @returns true if expired or invalid, false if still valid
 */
function isTokenExpired(token) {
    const expiration = getTokenExpiration(token);
    if (!expiration)
        return true;
    return expiration.getTime() < Date.now();
}
//# sourceMappingURL=jwt.js.map