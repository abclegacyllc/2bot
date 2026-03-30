/**
 * Workspace Validation Tests
 *
 * Tests for Zod validation schemas, particularly the safePath
 * refinement that prevents path traversal attacks.
 *
 * @module modules/workspace/__tests__/workspace.validation.test
 */

import { describe, expect, it } from 'vitest';
import {
    fileDeleteSchema,
    fileListSchema,
    fileMkdirSchema,
    fileReadSchema,
    fileRenameSchema,
    fileWriteSchema,
    pluginStartSchema,
    pluginStopSchema,
} from '../workspace.validation';

// ===========================================
// Path Traversal Prevention (S4)
// ===========================================

describe('safePath validation', () => {
  const schemasUsingSafePath = [
    { name: 'fileReadSchema', schema: fileReadSchema, field: 'path' },
    { name: 'fileDeleteSchema', schema: fileDeleteSchema, field: 'path' },
    { name: 'fileMkdirSchema', schema: fileMkdirSchema, field: 'path' },
    { name: 'pluginStartSchema', schema: pluginStartSchema, field: 'file' },
    { name: 'pluginStopSchema', schema: pluginStopSchema, field: 'file' },
  ];

  describe.each(schemasUsingSafePath)('$name', ({ schema, field }) => {
    it('should accept valid relative paths', () => {
      const result = schema.safeParse({ [field]: 'plugins/echo.js' });
      expect(result.success).toBe(true);
    });

    it('should accept nested relative paths', () => {
      const result = schema.safeParse({ [field]: 'plugins/subdir/bot.js' });
      expect(result.success).toBe(true);
    });

    it('should reject path traversal with ..', () => {
      const result = schema.safeParse({ [field]: '../etc/passwd' });
      expect(result.success).toBe(false);
    });

    it('should reject embedded .. in middle of path', () => {
      const result = schema.safeParse({ [field]: 'plugins/../../etc/passwd' });
      expect(result.success).toBe(false);
    });

    it('should reject absolute paths', () => {
      const result = schema.safeParse({ [field]: '/etc/passwd' });
      expect(result.success).toBe(false);
    });

    it('should reject paths with null bytes', () => {
      const result = schema.safeParse({ [field]: 'plugins/test\0.js' });
      expect(result.success).toBe(false);
    });

    it('should reject empty string', () => {
      const result = schema.safeParse({ [field]: '' });
      expect(result.success).toBe(false);
    });
  });

  describe('fileWriteSchema', () => {
    it('should accept valid write with content', () => {
      const result = fileWriteSchema.safeParse({
        path: 'plugins/hello.js',
        content: 'console.log("hello");',
      });
      expect(result.success).toBe(true);
    });

    it('should reject path traversal', () => {
      const result = fileWriteSchema.safeParse({
        path: '../../etc/crontab',
        content: 'malicious',
      });
      expect(result.success).toBe(false);
    });

    it('should reject absolute path', () => {
      const result = fileWriteSchema.safeParse({
        path: '/root/.ssh/authorized_keys',
        content: 'ssh-rsa ...',
      });
      expect(result.success).toBe(false);
    });

    it('should reject content over 5MB', () => {
      const result = fileWriteSchema.safeParse({
        path: 'plugins/big.js',
        content: 'x'.repeat(5 * 1024 * 1024 + 1),
      });
      expect(result.success).toBe(false);
    });
  });

  describe('fileRenameSchema', () => {
    it('should accept valid rename', () => {
      const result = fileRenameSchema.safeParse({
        oldPath: 'plugins/old.js',
        newPath: 'plugins/new.js',
      });
      expect(result.success).toBe(true);
    });

    it('should reject traversal in oldPath', () => {
      const result = fileRenameSchema.safeParse({
        oldPath: '../secret.txt',
        newPath: 'plugins/renamed.js',
      });
      expect(result.success).toBe(false);
    });

    it('should reject traversal in newPath', () => {
      const result = fileRenameSchema.safeParse({
        oldPath: 'plugins/a.js',
        newPath: '../../etc/hack',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('fileListSchema', () => {
    it('should default path to / (allowed for list)', () => {
      const result = fileListSchema.safeParse({});
      expect(result.success).toBe(true);
      expect(result.data?.path).toBe('/');
    });

    it('should accept valid subdirectory', () => {
      const result = fileListSchema.safeParse({ path: 'plugins' });
      expect(result.success).toBe(true);
    });

    it('should reject path traversal', () => {
      const result = fileListSchema.safeParse({ path: 'plugins/../../etc' });
      expect(result.success).toBe(false);
    });

    it('should reject null bytes', () => {
      const result = fileListSchema.safeParse({ path: 'plugins\0' });
      expect(result.success).toBe(false);
    });
  });
});
