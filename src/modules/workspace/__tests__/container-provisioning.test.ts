/**
 * Unit tests for Phase 7.3c container provisioning helpers.
 */

import { describe, expect, it } from 'vitest';

import { containerSubdomain } from '../workspace.constants';

describe('containerSubdomain', () => {
  it('passes through DNS-safe ws-<id> names unchanged', () => {
    expect(containerSubdomain('ws-clxk9m000000abcdef12345')).toBe(
      'ws-clxk9m000000abcdef12345',
    );
  });

  it('lowercases and replaces non-DNS characters', () => {
    expect(containerSubdomain('WS_Alice@Org')).toBe('ws-alice-org');
  });

  it('collapses runs of hyphens and trims leading/trailing hyphens', () => {
    expect(containerSubdomain('--ws--alice---bob--')).toBe('ws-alice-bob');
  });

  it('clamps to 63 characters (max DNS label length)', () => {
    const long = 'ws-' + 'a'.repeat(100);
    const out = containerSubdomain(long);
    expect(out.length).toBeLessThanOrEqual(63);
    expect(out.startsWith('ws-')).toBe(true);
  });

  it('returns a fallback when the input collapses to empty', () => {
    const out = containerSubdomain('@@@___@@@');
    expect(out).toMatch(/^ws-/);
    expect(out.length).toBeGreaterThan(2);
  });

  it('preserves digit-only suffixes within ws- prefixes', () => {
    expect(containerSubdomain('ws-acme-42')).toBe('ws-acme-42');
  });
});
