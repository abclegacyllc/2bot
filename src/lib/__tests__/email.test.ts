/**
 * Email Service Tests
 *
 * Tests for email sending functions.
 * Uses mocked fetch for API calls.
 *
 * @module lib/__tests__/email.test
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Store original env
const originalEnv = { ...process.env };

// ===========================================
// Setup / Teardown
// ===========================================

beforeEach(() => {
  vi.clearAllMocks();
  // Reset env for each test
  delete process.env.RESEND_API_KEY;
  process.env.EMAIL_FROM = 'test@2bot.org';
  process.env.NEXT_PUBLIC_APP_URL = 'https://test.2bot.org';
  process.env.NEXT_PUBLIC_DASHBOARD_URL = 'https://dash.test.2bot.org';
});

afterEach(() => {
  vi.restoreAllMocks();
  // Restore original env
  Object.keys(process.env).forEach(key => {
    if (!(key in originalEnv)) {
      delete process.env[key];
    }
  });
  Object.assign(process.env, originalEnv);
});

// ===========================================
// Import after env setup
// ===========================================

import {
    sendEmail,
    sendOrganizationInviteEmail,
    sendPasswordResetEmail,
    sendPendingInviteEmail,
    sendWelcomeEmail,
} from '../email';

// ===========================================
// sendEmail Tests
// ===========================================

describe('sendEmail', () => {
  describe('Development Mode (no API key)', () => {
    it('returns success in dev mode without API key', async () => {
      const result = await sendEmail({
        to: 'user@example.com',
        subject: 'Test Subject',
        html: '<p>Hello</p>',
        text: 'Hello',
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toMatch(/^dev-\d+$/);
    });

    it('logs email content to console in dev mode', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await sendEmail({
        to: 'user@example.com',
        subject: 'Test Subject',
        html: '<p>Hello World</p>',
      });

      expect(consoleSpy).toHaveBeenCalled();
      // Check that email info was logged
      const logCalls = consoleSpy.mock.calls.flat().join(' ');
      expect(logCalls).toContain('user@example.com');
      expect(logCalls).toContain('Test Subject');

      consoleSpy.mockRestore();
    });
  });

  describe('Production Mode (with API key)', () => {
    beforeEach(() => {
      process.env.RESEND_API_KEY = 'test-api-key';
    });

    it('sends email via Resend API', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 'email-123' }),
      });
      global.fetch = mockFetch;

      const result = await sendEmail({
        to: 'user@example.com',
        subject: 'Test Subject',
        html: '<p>Hello</p>',
        text: 'Hello',
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('email-123');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.resend.com/emails',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-api-key',
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('returns error on API failure', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        text: () => Promise.resolve('Invalid API key'),
      });
      global.fetch = mockFetch;

      const result = await sendEmail({
        to: 'user@example.com',
        subject: 'Test',
        html: '<p>Test</p>',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Resend API error');
    });

    it('returns error on network failure', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
      global.fetch = mockFetch;

      const result = await sendEmail({
        to: 'user@example.com',
        subject: 'Test',
        html: '<p>Test</p>',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });

    it('includes reply_to in API request', async () => {
      process.env.EMAIL_REPLY_TO = 'reply@2bot.org';
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 'email-123' }),
      });
      global.fetch = mockFetch;

      await sendEmail({
        to: 'user@example.com',
        subject: 'Test',
        html: '<p>Test</p>',
      });

      const callArgs = mockFetch.mock.calls[0] as [string, RequestInit];
      const callBody = JSON.parse(callArgs[1].body as string);
      expect(callBody.reply_to).toBe('reply@2bot.org');
    });
  });
});

// ===========================================
// sendPasswordResetEmail Tests
// ===========================================

describe('sendPasswordResetEmail', () => {
  it('sends password reset email with correct token URL', async () => {
    const result = await sendPasswordResetEmail(
      'user@example.com',
      'reset-token-123'
    );

    expect(result.success).toBe(true);
  });

  it('includes reset URL with token', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await sendPasswordResetEmail('user@example.com', 'my-token-xyz');

    const logOutput = consoleSpy.mock.calls.flat().join(' ');
    expect(logOutput).toContain('https://test.2bot.org/auth/reset-password?token=my-token-xyz');

    consoleSpy.mockRestore();
  });

  it('has correct subject line', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await sendPasswordResetEmail('user@example.com', 'token');

    const logOutput = consoleSpy.mock.calls.flat().join(' ');
    expect(logOutput).toContain('Reset your 2Bot password');

    consoleSpy.mockRestore();
  });
});

// ===========================================
// sendWelcomeEmail Tests
// ===========================================

describe('sendWelcomeEmail', () => {
  it('sends welcome email successfully', async () => {
    const result = await sendWelcomeEmail('newuser@example.com', 'John');

    expect(result.success).toBe(true);
  });

  it('personalizes with user name', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await sendWelcomeEmail('user@example.com', 'Alice');

    const logOutput = consoleSpy.mock.calls.flat().join(' ');
    expect(logOutput).toContain('Alice');

    consoleSpy.mockRestore();
  });

  it('uses fallback when name is null', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await sendWelcomeEmail('user@example.com', null);

    const logOutput = consoleSpy.mock.calls.flat().join(' ');
    expect(logOutput).toContain('there');

    consoleSpy.mockRestore();
  });

  it('includes dashboard URL', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await sendWelcomeEmail('user@example.com');

    const logOutput = consoleSpy.mock.calls.flat().join(' ');
    expect(logOutput).toContain('dash.test.2bot.org');

    consoleSpy.mockRestore();
  });
});

// ===========================================
// sendOrganizationInviteEmail Tests
// ===========================================

describe('sendOrganizationInviteEmail', () => {
  it('sends invite email successfully', async () => {
    const result = await sendOrganizationInviteEmail(
      'invited@example.com',
      'Acme Corp',
      'John Admin',
      'ORG_MEMBER'
    );

    expect(result.success).toBe(true);
  });

  it('includes organization name', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await sendOrganizationInviteEmail(
      'user@example.com',
      'My Organization',
      'Inviter',
      'ORG_ADMIN'
    );

    const logOutput = consoleSpy.mock.calls.flat().join(' ');
    expect(logOutput).toContain('My Organization');

    consoleSpy.mockRestore();
  });

  it('includes inviter name', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await sendOrganizationInviteEmail(
      'user@example.com',
      'Org',
      'Jane Smith',
      'ORG_MEMBER'
    );

    const logOutput = consoleSpy.mock.calls.flat().join(' ');
    expect(logOutput).toContain('Jane Smith');

    consoleSpy.mockRestore();
  });

  it('formats role display correctly', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await sendOrganizationInviteEmail(
      'user@example.com',
      'Org',
      'Inviter',
      'ORG_ADMIN'
    );

    const logOutput = consoleSpy.mock.calls.flat().join(' ');
    // ORG_ADMIN becomes 'admin'
    expect(logOutput).toContain('admin');

    consoleSpy.mockRestore();
  });
});

// ===========================================
// sendPendingInviteEmail Tests
// ===========================================

describe('sendPendingInviteEmail', () => {
  it('sends pending invite email with registration link', async () => {
    const result = await sendPendingInviteEmail(
      'newuser@example.com',
      'Acme Corp',
      'John Admin',
      'ORG_MEMBER',
      'invite-token-abc'
    );

    expect(result.success).toBe(true);
  });

  it('includes invite token in URL', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await sendPendingInviteEmail(
      'user@example.com',
      'Org',
      'Inviter',
      'ORG_MEMBER',
      'unique-token-123'
    );

    const logOutput = consoleSpy.mock.calls.flat().join(' ');
    expect(logOutput).toContain('https://test.2bot.org/invite/unique-token-123');

    consoleSpy.mockRestore();
  });

  it('mentions 7 day expiration', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await sendPendingInviteEmail(
      'user@example.com',
      'Org',
      'Inviter',
      'ORG_MEMBER',
      'token'
    );

    const logOutput = consoleSpy.mock.calls.flat().join(' ');
    expect(logOutput).toContain('7 days');

    consoleSpy.mockRestore();
  });

  it('includes all required information', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await sendPendingInviteEmail(
      'user@example.com',
      'Test Org',
      'Admin User',
      'ORG_ADMIN',
      'test-token'
    );

    const logOutput = consoleSpy.mock.calls.flat().join(' ');
    expect(logOutput).toContain('Test Org');
    expect(logOutput).toContain('Admin User');
    expect(logOutput).toContain('admin'); // formatted role

    consoleSpy.mockRestore();
  });
});

// ===========================================
// Email Configuration Tests
// ===========================================

describe('Email Configuration', () => {
  it('uses default from address when not configured', async () => {
    delete process.env.EMAIL_FROM;
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await sendEmail({
      to: 'user@example.com',
      subject: 'Test',
      html: '<p>Test</p>',
    });

    const logOutput = consoleSpy.mock.calls.flat().join(' ');
    expect(logOutput).toContain('2Bot');

    consoleSpy.mockRestore();
  });

  it('uses default base URL when not configured', async () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await sendPasswordResetEmail('user@example.com', 'token');

    const logOutput = consoleSpy.mock.calls.flat().join(' ');
    expect(logOutput).toContain('2bot.org');

    consoleSpy.mockRestore();
  });
});
