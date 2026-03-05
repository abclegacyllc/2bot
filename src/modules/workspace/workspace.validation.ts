/**
 * Workspace Validation Schemas
 * 
 * Zod schemas for workspace API request validation.
 * 
 * @module modules/workspace/workspace.validation
 */

import { z } from 'zod';

// ===========================================
// Workspace Create / Start
// ===========================================

export const createWorkspaceSchema = z.object({
  /** Optional auto-stop in minutes (null = never) */
  autoStopMinutes: z.number().int().min(5).max(1440).optional(),
  /** Organization ID (for org workspace) */
  organizationId: z.string().cuid().optional(),
});

export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>;

// ===========================================
// File Operations
// ===========================================

export const fileListSchema = z.object({
  path: z.string().default('/'),
  recursive: z.preprocess(
    (val) => {
      if (typeof val === 'string') return val === 'true';
      return val;
    },
    z.boolean().default(false)
  ),
});

export const fileReadSchema = z.object({
  path: z.string().min(1),
});

export const fileWriteSchema = z.object({
  path: z.string().min(1),
  content: z.string().max(5 * 1024 * 1024), // 5MB max
  createDirs: z.boolean().default(true),
});

export const fileDeleteSchema = z.object({
  path: z.string().min(1),
});

export const fileMkdirSchema = z.object({
  path: z.string().min(1),
});

export const fileRenameSchema = z.object({
  oldPath: z.string().min(1),
  newPath: z.string().min(1),
});

// ===========================================
// Plugin Operations
// ===========================================

export const pluginStartSchema = z.object({
  file: z.string().min(1),
  env: z.record(z.string(), z.string()).optional(),
});

export const pluginStopSchema = z.object({
  file: z.string().min(1),
  force: z.boolean().default(false),
});

// ===========================================
// Git Operations
// ===========================================

export const gitCloneSchema = z.object({
  url: z.string().url().refine(
    (url) => url.startsWith('https://'),
    { message: 'Only HTTPS Git URLs are allowed' }
  ),
  targetDir: z.string().optional(),
  branch: z.string().optional(),
  depth: z.number().int().min(1).max(100).default(1),
  credentials: z.object({
    username: z.string().min(1).max(200),
    token: z.string().min(1).max(500),
  }).optional(),
});

export const gitPullSchema = z.object({
  directory: z.string().default('/workspace/imports'),
  credentials: z.object({
    username: z.string().min(1).max(200),
    token: z.string().min(1).max(500),
  }).optional(),
});

// ===========================================
// Package Operations
// ===========================================

export const packageInstallSchema = z.object({
  packages: z.array(z.string().min(1).max(214)).min(1).max(20),
  dev: z.boolean().default(false),
  cwd: z.string().optional(),
});

export const packageUninstallSchema = z.object({
  packages: z.array(z.string().min(1)).min(1).max(20),
  cwd: z.string().optional(),
});

// ===========================================
// Terminal Operations
// ===========================================

export const terminalCreateSchema = z.object({
  cols: z.number().int().min(20).max(500).default(80),
  rows: z.number().int().min(5).max(200).default(24),
});

export const terminalResizeSchema = z.object({
  sessionId: z.string().min(1),
  cols: z.number().int().min(20).max(500),
  rows: z.number().int().min(5).max(200),
});

export const terminalWriteSchema = z.object({
  sessionId: z.string().min(1),
  data: z.string(),
});

export const terminalCloseSchema = z.object({
  sessionId: z.string().min(1),
});

// ===========================================
// Log Query
// ===========================================

export const logQuerySchema = z.object({
  level: z.enum(['debug', 'info', 'warn', 'error']).optional(),
  source: z.string().optional(),
  search: z.string().max(200).optional(),
  limit: z.number().int().min(1).max(500).default(100),
  since: z.number().int().optional(),
});

// ===========================================
// Backup Operations
// ===========================================

export const backupRestoreSchema = z.object({
  backupId: z.string().min(1).max(100),
});

// ===========================================
// Container Management (admin)
// ===========================================

export const containerResizeSchema = z.object({
  ramMb: z.number().int().min(256).max(32768).optional(),
  cpuCores: z.number().min(0.25).max(16).optional(),
  storageMb: z.number().int().min(1024).max(204800).optional(),
});

export const autoStopSchema = z.object({
  autoStopMinutes: z.number().int().min(5).max(1440).nullable(),
});
