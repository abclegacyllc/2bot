/**
 * Password Utility Tests
 *
 * Tests for password hashing, verification, and security checks.
 *
 * @module lib/__tests__/password.test
 */

import { describe, expect, it } from 'vitest';
import { hashPassword, isPasswordSecure, verifyPassword } from '../password';

// ===========================================
// hashPassword Tests
// ===========================================

describe('hashPassword', () => {
  it('hashes a password', async () => {
    const password = 'SecurePass123';
    const hash = await hashPassword(password);

    expect(typeof hash).toBe('string');
    expect(hash.length).toBeGreaterThan(0);
    expect(hash).not.toBe(password);
  });

  it('generates different hashes for same password', async () => {
    const password = 'SecurePass123';
    const hash1 = await hashPassword(password);
    const hash2 = await hashPassword(password);

    expect(hash1).not.toBe(hash2);
  });

  it('generates bcrypt format hash', async () => {
    const hash = await hashPassword('SecurePass123');

    // bcrypt hashes start with $2b$ or $2a$
    expect(hash).toMatch(/^\$2[ab]\$/);
  });

  it('handles empty password', async () => {
    const hash = await hashPassword('');

    expect(typeof hash).toBe('string');
    expect(hash.length).toBeGreaterThan(0);
  });

  it('handles long password', async () => {
    const longPassword = 'A'.repeat(100) + '1a';
    const hash = await hashPassword(longPassword);

    expect(typeof hash).toBe('string');
    expect(hash.length).toBeGreaterThan(0);
  });

  it('handles unicode password', async () => {
    const password = 'Pässwörd123!中文🔐';
    const hash = await hashPassword(password);

    expect(typeof hash).toBe('string');
    const verified = await verifyPassword(password, hash);
    expect(verified).toBe(true);
  });
});

// ===========================================
// verifyPassword Tests
// ===========================================

describe('verifyPassword', () => {
  it('verifies correct password', async () => {
    const password = 'SecurePass123';
    const hash = await hashPassword(password);

    const result = await verifyPassword(password, hash);
    expect(result).toBe(true);
  });

  it('rejects incorrect password', async () => {
    const password = 'SecurePass123';
    const hash = await hashPassword(password);

    const result = await verifyPassword('WrongPass456', hash);
    expect(result).toBe(false);
  });

  it('rejects empty password against valid hash', async () => {
    const hash = await hashPassword('SecurePass123');

    const result = await verifyPassword('', hash);
    expect(result).toBe(false);
  });

  it('rejects password against empty hash', async () => {
    // bcrypt.compare returns false for empty hash, doesn't throw
    const result = await verifyPassword('SecurePass123', '');
    expect(result).toBe(false);
  });

  it('is case sensitive', async () => {
    const hash = await hashPassword('SecurePass123');

    expect(await verifyPassword('SecurePass123', hash)).toBe(true);
    expect(await verifyPassword('securepass123', hash)).toBe(false);
    expect(await verifyPassword('SECUREPASS123', hash)).toBe(false);
  });

  it('handles similar passwords correctly', async () => {
    const hash = await hashPassword('SecurePass123');

    expect(await verifyPassword('SecurePass123', hash)).toBe(true);
    expect(await verifyPassword('SecurePass124', hash)).toBe(false);
    expect(await verifyPassword('SecurePass12', hash)).toBe(false);
    expect(await verifyPassword('SecurePass1234', hash)).toBe(false);
    expect(await verifyPassword(' SecurePass123', hash)).toBe(false);
    expect(await verifyPassword('SecurePass123 ', hash)).toBe(false);
  });

  it('handles whitespace in passwords', async () => {
    const password = 'Secure Pass 123';
    const hash = await hashPassword(password);

    expect(await verifyPassword('Secure Pass 123', hash)).toBe(true);
    expect(await verifyPassword('SecurePass123', hash)).toBe(false);
  });
});

// ===========================================
// isPasswordSecure Tests
// ===========================================

describe('isPasswordSecure', () => {
  describe('valid passwords', () => {
    it('accepts password with all requirements', () => {
      expect(isPasswordSecure('SecurePass1')).toBe(true);
      expect(isPasswordSecure('Password123')).toBe(true);
      expect(isPasswordSecure('MyP4ssword')).toBe(true);
      expect(isPasswordSecure('abcdEFGH1234')).toBe(true);
    });

    it('accepts exactly 8 characters', () => {
      expect(isPasswordSecure('Abcdef1a')).toBe(true);
    });

    it('accepts 100 characters', () => {
      const password = 'A' + 'a'.repeat(97) + '1a';
      expect(password.length).toBe(100);
      expect(isPasswordSecure(password)).toBe(true);
    });

    it('accepts special characters', () => {
      expect(isPasswordSecure('Secure!@#1')).toBe(true);
      expect(isPasswordSecure('Pass$%^&1')).toBe(true);
    });
  });

  describe('invalid passwords - length', () => {
    it('rejects password shorter than 8 characters', () => {
      expect(isPasswordSecure('Pass1')).toBe(false);
      expect(isPasswordSecure('Abc123')).toBe(false);
      expect(isPasswordSecure('Abcdef1')).toBe(false);
    });

    it('rejects empty password', () => {
      expect(isPasswordSecure('')).toBe(false);
    });

    it('rejects password longer than 100 characters', () => {
      const password = 'A' + 'a'.repeat(99) + '1';
      expect(password.length).toBe(101);
      expect(isPasswordSecure(password)).toBe(false);
    });
  });

  describe('invalid passwords - missing uppercase', () => {
    it('rejects password without uppercase', () => {
      expect(isPasswordSecure('password123')).toBe(false);
      expect(isPasswordSecure('securepass1')).toBe(false);
    });
  });

  describe('invalid passwords - missing lowercase', () => {
    it('rejects password without lowercase', () => {
      expect(isPasswordSecure('PASSWORD123')).toBe(false);
      expect(isPasswordSecure('SECUREPASS1')).toBe(false);
    });
  });

  describe('invalid passwords - missing number', () => {
    it('rejects password without number', () => {
      expect(isPasswordSecure('SecurePass')).toBe(false);
      expect(isPasswordSecure('MyPassword')).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('handles whitespace in password', () => {
      // Space counts as neither upper, lower, nor number
      expect(isPasswordSecure('Secure 12')).toBe(true); // has all requirements
      expect(isPasswordSecure('        ')).toBe(false); // only spaces
    });

    it('handles unicode characters', () => {
      // Unicode letters don't count as A-Z or a-z
      expect(isPasswordSecure('Pässword1')).toBe(true); // P, s, word are latin
      expect(isPasswordSecure('密码Password1')).toBe(true); // English part meets reqs
    });

    it('handles numbers only at specific positions', () => {
      expect(isPasswordSecure('1Abcdefg')).toBe(true); // number at start
      expect(isPasswordSecure('Abcdefg1')).toBe(true); // number at end
      expect(isPasswordSecure('Abcd1efg')).toBe(true); // number in middle
    });
  });
});

// ===========================================
// Integration Tests
// ===========================================

describe('Password workflow integration', () => {
  it('complete password workflow: check, hash, verify', async () => {
    const password = 'SecurePass123';

    // 1. Check security
    expect(isPasswordSecure(password)).toBe(true);

    // 2. Hash
    const hash = await hashPassword(password);

    // 3. Verify
    expect(await verifyPassword(password, hash)).toBe(true);
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });

  it('rejects weak password before hashing', async () => {
    const weakPassword = 'weak';

    expect(isPasswordSecure(weakPassword)).toBe(false);
    // Should not hash weak passwords in production code
  });

  it('handles multiple users with same password', async () => {
    const password = 'SharedPass123';

    const hash1 = await hashPassword(password);
    const hash2 = await hashPassword(password);

    // Different hashes (different salts)
    expect(hash1).not.toBe(hash2);

    // Both verify correctly
    expect(await verifyPassword(password, hash1)).toBe(true);
    expect(await verifyPassword(password, hash2)).toBe(true);
  });
});
