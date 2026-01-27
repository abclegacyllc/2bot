/**
 * Encryption Utility Tests
 *
 * Tests for AES-256-GCM encryption/decryption of sensitive credentials.
 *
 * @module lib/__tests__/encryption.test
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { decrypt, decryptJson, encrypt, isEncryptionAvailable } from '../encryption';

// ===========================================
// Setup / Teardown - Set encryption key for tests
// ===========================================

beforeAll(() => {
  process.env.JWT_SECRET = 'test-jwt-secret-for-encryption-at-least-32-chars';
});

afterAll(() => {
  delete process.env.JWT_SECRET;
});

// ===========================================
// encrypt Tests
// ===========================================

describe('encrypt', () => {
  it('encrypts a string', () => {
    const plaintext = 'my-secret-api-key';
    const encrypted = encrypt(plaintext);

    expect(typeof encrypted).toBe('string');
    expect(encrypted).not.toBe(plaintext);
    expect(encrypted.startsWith('v1:')).toBe(true);
  });

  it('encrypts an object as JSON', () => {
    const data = { apiKey: 'secret', token: 'token123' };
    const encrypted = encrypt(data);

    expect(typeof encrypted).toBe('string');
    expect(encrypted.startsWith('v1:')).toBe(true);
    expect(encrypted).not.toContain('secret');
    expect(encrypted).not.toContain('token123');
  });

  it('generates different ciphertext for same plaintext', () => {
    const plaintext = 'same-secret';
    const encrypted1 = encrypt(plaintext);
    const encrypted2 = encrypt(plaintext);

    // Random IV ensures different ciphertext each time
    expect(encrypted1).not.toBe(encrypted2);
  });

  it('encrypts empty string', () => {
    const encrypted = encrypt('');

    expect(typeof encrypted).toBe('string');
    expect(encrypted.startsWith('v1:')).toBe(true);
  });

  it('encrypts long strings', () => {
    const longText = 'a'.repeat(10000);
    const encrypted = encrypt(longText);

    expect(typeof encrypted).toBe('string');
    expect(encrypted.startsWith('v1:')).toBe(true);
  });

  it('encrypts special characters', () => {
    const special = '!@#$%^&*(){}[]|\\:";\'<>?,./`~';
    const encrypted = encrypt(special);

    expect(typeof encrypted).toBe('string');
    expect(encrypted.startsWith('v1:')).toBe(true);
  });

  it('encrypts unicode characters', () => {
    const unicode = '中文字符🔐🔑密码';
    const encrypted = encrypt(unicode);

    expect(typeof encrypted).toBe('string');
    expect(encrypted.startsWith('v1:')).toBe(true);
  });

  it('encrypts newlines and whitespace', () => {
    const multiline = 'line1\nline2\r\nline3\ttabbed';
    const encrypted = encrypt(multiline);

    expect(typeof encrypted).toBe('string');
    expect(encrypted.startsWith('v1:')).toBe(true);
  });
});

// ===========================================
// decrypt Tests
// ===========================================

describe('decrypt', () => {
  it('decrypts encrypted string correctly', () => {
    const plaintext = 'my-secret-api-key';
    const encrypted = encrypt(plaintext);
    const decrypted = decrypt(encrypted);

    expect(decrypted).toBe(plaintext);
  });

  it('decrypts empty string', () => {
    const encrypted = encrypt('');
    const decrypted = decrypt(encrypted);

    expect(decrypted).toBe('');
  });

  it('decrypts long strings', () => {
    const longText = 'a'.repeat(10000);
    const encrypted = encrypt(longText);
    const decrypted = decrypt(encrypted);

    expect(decrypted).toBe(longText);
  });

  it('decrypts special characters', () => {
    const special = '!@#$%^&*(){}[]|\\:";\'<>?,./`~';
    const encrypted = encrypt(special);
    const decrypted = decrypt(encrypted);

    expect(decrypted).toBe(special);
  });

  it('decrypts unicode characters', () => {
    const unicode = '中文字符🔐🔑密码';
    const encrypted = encrypt(unicode);
    const decrypted = decrypt(encrypted);

    expect(decrypted).toBe(unicode);
  });

  it('decrypts newlines and whitespace', () => {
    const multiline = 'line1\nline2\r\nline3\ttabbed';
    const encrypted = encrypt(multiline);
    const decrypted = decrypt(encrypted);

    expect(decrypted).toBe(multiline);
  });

  it('throws error for invalid version prefix', () => {
    // The decrypt function wraps errors in a generic message
    expect(() => decrypt('v2:invaliddata')).toThrow('Failed to decrypt credentials');
    expect(() => decrypt('invaliddata')).toThrow('Failed to decrypt credentials');
  });

  it('throws error for tampered ciphertext', () => {
    const encrypted = encrypt('secret');
    // Tamper with base64 data
    const tampered = encrypted.replace('v1:', 'v1:AA');

    expect(() => decrypt(tampered)).toThrow();
  });

  it('throws error for truncated data', () => {
    const encrypted = encrypt('secret');
    const truncated = encrypted.slice(0, -10);

    expect(() => decrypt(truncated)).toThrow();
  });

  it('throws error for invalid base64', () => {
    expect(() => decrypt('v1:not-valid-base64!!!')).toThrow();
  });
});

// ===========================================
// decryptJson Tests
// ===========================================

describe('decryptJson', () => {
  it('decrypts and parses JSON object', () => {
    const data = { apiKey: 'secret', token: 'token123' };
    const encrypted = encrypt(data);
    const decrypted = decryptJson<typeof data>(encrypted);

    expect(decrypted).toEqual(data);
    expect(decrypted.apiKey).toBe('secret');
    expect(decrypted.token).toBe('token123');
  });

  it('decrypts nested JSON', () => {
    const data = {
      credentials: {
        primary: { key: 'pk_123', secret: 'sk_456' },
        backup: { key: 'pk_789', secret: 'sk_012' },
      },
      enabled: true,
      count: 42,
    };
    const encrypted = encrypt(data);
    const decrypted = decryptJson<typeof data>(encrypted);

    expect(decrypted).toEqual(data);
    expect(decrypted.credentials.primary.key).toBe('pk_123');
  });

  it('decrypts JSON array', () => {
    const data = ['item1', 'item2', 'item3'];
    const encrypted = encrypt(data);
    const decrypted = decryptJson<string[]>(encrypted);

    expect(decrypted).toEqual(data);
  });

  it('decrypts JSON with various types', () => {
    const data = {
      string: 'text',
      number: 123.45,
      boolean: true,
      null: null,
      array: [1, 2, 3],
      nested: { a: 'b' },
    };
    const encrypted = encrypt(data);
    const decrypted = decryptJson<typeof data>(encrypted);

    expect(decrypted).toEqual(data);
  });

  it('throws error for non-JSON encrypted data', () => {
    const encrypted = encrypt('not-json');

    expect(() => decryptJson(encrypted)).toThrow();
  });
});

// ===========================================
// Encryption Roundtrip Tests
// ===========================================

describe('Encryption roundtrip', () => {
  it('encrypts and decrypts correctly multiple times', () => {
    const testCases = [
      'simple string',
      'string with "quotes"',
      JSON.stringify({ key: 'value' }),
      'unicode: 日本語',
      '12345',
      ' leading/trailing spaces ',
    ];

    for (const testCase of testCases) {
      const encrypted = encrypt(testCase);
      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe(testCase);
    }
  });

  it('handles API credential workflow', () => {
    // Simulate storing API credentials
    const credentials = {
      openai: {
        apiKey: 'sk-proj-1234567890abcdef',
        organization: 'org-12345',
      },
      anthropic: {
        apiKey: 'sk-ant-1234567890',
      },
    };

    // Encrypt before storing in DB
    const encrypted = encrypt(credentials);

    // Verify it's not readable
    expect(encrypted).not.toContain('sk-proj');
    expect(encrypted).not.toContain('sk-ant');

    // Decrypt when needed
    const decrypted = decryptJson<typeof credentials>(encrypted);

    expect(decrypted.openai.apiKey).toBe('sk-proj-1234567890abcdef');
    expect(decrypted.anthropic.apiKey).toBe('sk-ant-1234567890');
  });
});

// ===========================================
// Security Tests
// ===========================================

describe('Security properties', () => {
  it('encrypted data is base64 encoded', () => {
    const encrypted = encrypt('secret');
    const base64Part = encrypted.slice(3); // Remove 'v1:'

    // Valid base64 should decode without error
    expect(() => Buffer.from(base64Part, 'base64')).not.toThrow();
  });

  it('ciphertext length is appropriate for plaintext', () => {
    const short = encrypt('a');
    const long = encrypt('a'.repeat(1000));

    // Longer plaintext = longer ciphertext
    expect(long.length).toBeGreaterThan(short.length);
  });

  it('authentication tag prevents modification', () => {
    const encrypted = encrypt('secret');

    // Any modification should fail decryption
    const bytes = Buffer.from(encrypted.slice(3), 'base64');
    bytes[20] = bytes[20]! ^ 0xff; // Flip bits in auth tag area
    const modified = 'v1:' + bytes.toString('base64');

    expect(() => decrypt(modified)).toThrow();
  });
});

// ===========================================
// isEncryptionAvailable Tests
// ===========================================

describe('isEncryptionAvailable', () => {
  it('returns true when encryption key is available', () => {
    // JWT_SECRET is set in beforeAll
    expect(isEncryptionAvailable()).toBe(true);
  });

  it('returns boolean type', () => {
    expect(typeof isEncryptionAvailable()).toBe('boolean');
  });
});
