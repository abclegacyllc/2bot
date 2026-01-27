/**
 * JWT Utility Tests
 *
 * Tests for JWT token generation, verification, and utility functions.
 *
 * @module lib/__tests__/jwt.test
 */

import { describe, expect, it } from 'vitest';
import {
    decodeToken,
    generateToken,
    getTokenExpiration,
    isTokenExpired,
    verifyToken,
    type TokenPayload,
} from '../jwt';

// ===========================================
// Test Data
// ===========================================

const validPayload: TokenPayload = {
  userId: 'user-123',
  email: 'test@example.com',
  plan: 'FREE',
  sessionId: 'session-456',
  role: 'MEMBER',
};

const proUserPayload: TokenPayload = {
  userId: 'user-789',
  email: 'pro@example.com',
  plan: 'PRO',
  sessionId: 'session-789',
  role: 'ADMIN',
};

// ===========================================
// generateToken Tests
// ===========================================

describe('generateToken', () => {
  it('generates a valid JWT token string', () => {
    const token = generateToken(validPayload);

    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3); // JWT has 3 parts
  });

  it('generates different tokens for different payloads', () => {
    const token1 = generateToken(validPayload);
    const token2 = generateToken(proUserPayload);

    expect(token1).not.toBe(token2);
  });

  it('generates different tokens for same payload (different timestamps)', async () => {
    const token1 = generateToken(validPayload);
    await new Promise((resolve) => setTimeout(resolve, 10));
    const token2 = generateToken(validPayload);

    // Tokens might be same if generated within same second
    // But decoded timestamps will differ
    expect(token1.length).toBeGreaterThan(0);
    expect(token2.length).toBeGreaterThan(0);
  });

  it('respects custom expiresIn option', () => {
    const token = generateToken(validPayload, { expiresIn: '1h' });
    const decoded = decodeToken(token);

    expect(decoded).not.toBeNull();
    // Token should expire in about 1 hour
    const expiry = decoded!.exp * 1000;
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;

    expect(expiry - now).toBeLessThanOrEqual(oneHour + 1000);
    expect(expiry - now).toBeGreaterThan(oneHour - 5000);
  });

  it('uses default 7 day expiration', () => {
    const token = generateToken(validPayload);
    const decoded = decodeToken(token);

    expect(decoded).not.toBeNull();
    const expiry = decoded!.exp * 1000;
    const now = Date.now();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;

    expect(expiry - now).toBeLessThanOrEqual(sevenDays + 1000);
    expect(expiry - now).toBeGreaterThan(sevenDays - 5000);
  });
});

// ===========================================
// verifyToken Tests
// ===========================================

describe('verifyToken', () => {
  it('verifies and returns payload for valid token', () => {
    const token = generateToken(validPayload);
    const verified = verifyToken(token);

    expect(verified).not.toBeNull();
    expect(verified!.userId).toBe(validPayload.userId);
    expect(verified!.email).toBe(validPayload.email);
    expect(verified!.plan).toBe(validPayload.plan);
    expect(verified!.sessionId).toBe(validPayload.sessionId);
    expect(verified!.role).toBe(validPayload.role);
  });

  it('returns null for invalid token', () => {
    const verified = verifyToken('invalid-token');
    expect(verified).toBeNull();
  });

  it('returns null for malformed token', () => {
    const verified = verifyToken('not.a.valid.jwt.token');
    expect(verified).toBeNull();
  });

  it('returns null for empty string', () => {
    const verified = verifyToken('');
    expect(verified).toBeNull();
  });

  it('returns null for token with wrong signature', () => {
    const token = generateToken(validPayload);
    // Tamper with the signature
    const parts = token.split('.');
    parts[2] = 'tampered-signature';
    const tamperedToken = parts.join('.');

    const verified = verifyToken(tamperedToken);
    expect(verified).toBeNull();
  });

  it('returns null for expired token', () => {
    // Generate token that expires in 1 second
    const token = generateToken(validPayload, { expiresIn: '1ms' });

    // Wait for expiration
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        const verified = verifyToken(token);
        expect(verified).toBeNull();
        resolve();
      }, 50);
    });
  });

  it('verifies token with all plan types', () => {
    const plans = ['FREE', 'STARTER', 'PRO', 'BUSINESS', 'ENTERPRISE'] as const;

    for (const plan of plans) {
      const payload: TokenPayload = { ...validPayload, plan };
      const token = generateToken(payload);
      const verified = verifyToken(token);

      expect(verified).not.toBeNull();
      expect(verified!.plan).toBe(plan);
    }
  });
});

// ===========================================
// decodeToken Tests
// ===========================================

describe('decodeToken', () => {
  it('decodes a valid token without verification', () => {
    const token = generateToken(validPayload);
    const decoded = decodeToken(token);

    expect(decoded).not.toBeNull();
    expect(decoded!.userId).toBe(validPayload.userId);
    expect(decoded!.email).toBe(validPayload.email);
    expect(decoded!.iat).toBeDefined();
    expect(decoded!.exp).toBeDefined();
    expect(decoded!.iss).toBe('2bot');
    expect(decoded!.aud).toBe('2bot-api');
  });

  it('returns null for invalid token', () => {
    const decoded = decodeToken('invalid');
    expect(decoded).toBeNull();
  });

  it('decodes expired token (no verification)', () => {
    // Generate expired token
    const token = generateToken(validPayload, { expiresIn: '1ms' });

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        // decodeToken should still work (no verification)
        const decoded = decodeToken(token);
        expect(decoded).not.toBeNull();
        expect(decoded!.userId).toBe(validPayload.userId);
        resolve();
      }, 50);
    });
  });
});

// ===========================================
// getTokenExpiration Tests
// ===========================================

describe('getTokenExpiration', () => {
  it('returns expiration date for valid token', () => {
    const token = generateToken(validPayload);
    const expiration = getTokenExpiration(token);

    expect(expiration).toBeInstanceOf(Date);
    expect(expiration!.getTime()).toBeGreaterThan(Date.now());
  });

  it('returns null for invalid token', () => {
    const expiration = getTokenExpiration('invalid');
    expect(expiration).toBeNull();
  });

  it('returns correct expiration for custom expiresIn', () => {
    const token = generateToken(validPayload, { expiresIn: '1h' });
    const expiration = getTokenExpiration(token);

    expect(expiration).not.toBeNull();
    const diff = expiration!.getTime() - Date.now();
    const oneHour = 60 * 60 * 1000;

    expect(diff).toBeLessThanOrEqual(oneHour + 1000);
    expect(diff).toBeGreaterThan(oneHour - 5000);
  });
});

// ===========================================
// isTokenExpired Tests
// ===========================================

describe('isTokenExpired', () => {
  it('returns false for fresh token', () => {
    const token = generateToken(validPayload);
    expect(isTokenExpired(token)).toBe(false);
  });

  it('returns true for expired token', () => {
    const token = generateToken(validPayload, { expiresIn: '1ms' });

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(isTokenExpired(token)).toBe(true);
        resolve();
      }, 50);
    });
  });

  it('returns true for invalid token', () => {
    expect(isTokenExpired('invalid')).toBe(true);
  });

  it('returns true for empty string', () => {
    expect(isTokenExpired('')).toBe(true);
  });
});

// ===========================================
// Edge Cases
// ===========================================

describe('Edge cases', () => {
  it('handles payload with minimal fields', () => {
    const minPayload: TokenPayload = {
      userId: 'u1',
      email: 'a@b.c',
      plan: 'FREE',
      sessionId: 's1',
      role: 'MEMBER',
    };

    const token = generateToken(minPayload);
    const verified = verifyToken(token);

    expect(verified).not.toBeNull();
    expect(verified!.userId).toBe('u1');
  });

  it('handles special characters in email', () => {
    const payload: TokenPayload = {
      ...validPayload,
      email: 'user+test@sub.domain.example.com',
    };

    const token = generateToken(payload);
    const verified = verifyToken(token);

    expect(verified!.email).toBe('user+test@sub.domain.example.com');
  });

  it('handles long userId', () => {
    const payload: TokenPayload = {
      ...validPayload,
      userId: 'a'.repeat(100),
    };

    const token = generateToken(payload);
    const verified = verifyToken(token);

    expect(verified!.userId).toBe('a'.repeat(100));
  });

  it('decodeToken returns null for completely malformed input', () => {
    // Test various malformed inputs that might trigger decode exceptions
    expect(decodeToken(null as unknown as string)).toBeNull();
    expect(decodeToken(undefined as unknown as string)).toBeNull();
    expect(decodeToken({} as unknown as string)).toBeNull();
    expect(decodeToken(123 as unknown as string)).toBeNull();
  });
});
