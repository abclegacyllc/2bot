/**
 * Workspace Routes
 * 
 * API endpoints for the Docker workspace system (Phase 13).
 * All routes require authentication.
 * 
 * Routes:
 *   Lifecycle:
 *     POST   /workspace              - Create & start workspace
 *     GET    /workspace/status        - Get workspace status
 *     POST   /workspace/:id/start     - Start stopped workspace
 *     POST   /workspace/:id/stop      - Stop workspace
 *     DELETE /workspace/:id           - Destroy workspace
 * 
 *   File Operations:
 *     GET    /workspace/:id/files     - List files
 *     GET    /workspace/:id/files/read - Read file
 *     POST   /workspace/:id/files     - Write file
 *     DELETE /workspace/:id/files     - Delete file
 *     POST   /workspace/:id/files/mkdir - Create directory
 *     POST   /workspace/:id/files/rename - Rename file/dir
 * 
 *   Plugin Operations:
 *     POST   /workspace/:id/plugins/start   - Start plugin
 *     POST   /workspace/:id/plugins/stop    - Stop plugin
 *     POST   /workspace/:id/plugins/restart - Restart plugin
 *     GET    /workspace/:id/plugins         - List running plugins
 *     GET    /workspace/:id/plugins/logs    - Get plugin logs
 * 
 *   Git Operations:
 *     POST   /workspace/:id/git/clone  - Clone repository
 *     POST   /workspace/:id/git/pull   - Pull updates
 *     GET    /workspace/:id/git/status  - Git status
 * 
 *   Package Operations:
 *     POST   /workspace/:id/packages/install   - Install packages
 *     POST   /workspace/:id/packages/uninstall - Uninstall packages
 *     GET    /workspace/:id/packages           - List packages
 * 
 *   Terminal Operations:
 *     POST   /workspace/:id/terminal        - Create terminal session
 *     POST   /workspace/:id/terminal/resize  - Resize terminal
 *     POST   /workspace/:id/terminal/close   - Close terminal
 * 
 *   Backup:
 *     POST   /workspace/:id/backup          - Create a backup
 *     GET    /workspace/:id/backup           - List backups
 *     POST   /workspace/:id/backup/restore   - Restore from backup
 *     DELETE /workspace/:id/backup/:backupId - Delete a backup
 *
 *   System:
 *     GET    /workspace/:id/stats   - Get container stats
 *     GET    /workspace/:id/health  - Get container health
 *     GET    /workspace/:id/logs    - Get container logs
 *     GET    /workspace/:id/metrics          - Get container metrics time-series
 *     GET    /workspace/:id/metrics/summary  - Get container metrics summary
 * 
 * @module server/routes/workspace
 */

import { prisma } from '@/lib/prisma';
import { workspaceService } from '@/modules/workspace';
import { workspaceBackupService } from '@/modules/workspace/backup.service';
import { egressProxyService } from '@/modules/workspace/egress-proxy.service';
import { workspaceMetricsService } from '@/modules/workspace/metrics.service';
import {
  autoStopSchema,
  backupRestoreSchema,
  createWorkspaceSchema,
  fileDeleteSchema,
  fileListSchema,
  fileMkdirSchema,
  fileReadSchema,
  fileRenameSchema,
  fileWriteSchema,
  gitCloneSchema,
  gitPullSchema,
  logQuerySchema,
  packageInstallSchema,
  packageUninstallSchema,
  pluginStartSchema,
  pluginStopSchema,
  terminalCloseSchema,
  terminalCreateSchema,
  terminalResizeSchema,
} from '@/modules/workspace/workspace.validation';
import { BadRequestError, RateLimitError } from '@/shared/errors';
import type { ApiResponse } from '@/shared/types';
import { createServiceContext, type ServiceContext } from '@/shared/types/context';
import type { NextFunction } from 'express';
import { Router, type Request, type Response } from 'express';
import type { ZodError } from 'zod';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/error-handler';
import { createRateLimiter } from '../middleware/rate-limit';

export const workspaceRouter = Router();

// All workspace routes require authentication
workspaceRouter.use(requireAuth);

// ===========================================
// Rate Limiting
// ===========================================

const lifecycleLimiter = createRateLimiter({ keyPrefix: 'ws:lifecycle', points: 5, duration: 60, blockDuration: 120 });
const fileOpsLimiter = createRateLimiter({ keyPrefix: 'ws:files', points: 60, duration: 60 });
const heavyOpsLimiter = createRateLimiter({ keyPrefix: 'ws:heavy', points: 10, duration: 60, blockDuration: 60 });
const terminalLimiter = createRateLimiter({ keyPrefix: 'ws:terminal', points: 5, duration: 60, blockDuration: 60 });
const readOnlyLimiter = createRateLimiter({ keyPrefix: 'ws:readonly', points: 120, duration: 60 });

// Apply rate limiting to all workspace routes based on operation type
workspaceRouter.use(async (req: Request, _res: Response, next: NextFunction) => {
  const key = req.user?.id ?? req.ip ?? 'unknown';
  const p = req.path;

  let limiter = readOnlyLimiter; // default for GET/read operations

  // Lifecycle operations — most restrictive (5/min)
  if (
    (req.method === 'POST' && (p === '/' || p.endsWith('/start') || p.endsWith('/stop') || p.endsWith('/force-stop'))) ||
    (req.method === 'DELETE' && /^\/[^/]+$/.test(p))
  ) {
    limiter = lifecycleLimiter;
  }
  // File operations (60/min)
  else if (p.includes('/files')) {
    limiter = fileOpsLimiter;
  }
  // Heavy operations — git, packages, plugin lifecycle (10/min)
  else if (
    p.includes('/git/clone') || p.includes('/git/pull') ||
    p.includes('/packages/install') || p.includes('/packages/uninstall') ||
    p.includes('/plugins/start') || p.includes('/plugins/stop') || p.includes('/plugins/restart') || p.includes('/plugins/validate')
  ) {
    limiter = heavyOpsLimiter;
  }
  // Terminal operations (5/min)
  else if (p.includes('/terminal')) {
    limiter = terminalLimiter;
  }

  try {
    await limiter.consume(key);
    next();
  } catch {
    next(new RateLimitError('Too many workspace requests. Please slow down.', 60));
  }
});

// ===========================================
// Helpers
// ===========================================

/**
 * Create personal ServiceContext from request
 */
function getContext(req: Request): ServiceContext {
  if (!req.user) throw new BadRequestError('User not authenticated');

  return createServiceContext(
    {
      userId: req.user.id,
      role: req.user.role,
      plan: req.user.plan,
      activeContext: {
        type: 'personal',
        plan: req.user.plan,
      },
    },
    {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
      requestId: req.headers['x-request-id'] as string | undefined,
    },
  );
}

/**
 * Create organization-scoped ServiceContext from request
 */
function getOrgContext(req: Request, organizationId: string): ServiceContext {
  if (!req.user) throw new BadRequestError('User not authenticated');

  return createServiceContext(
    {
      userId: req.user.id,
      role: req.user.role,
      plan: req.user.plan,
    },
    {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
      requestId: req.headers['x-request-id'] as string | undefined,
    },
    {
      contextType: 'organization',
      organizationId,
    },
  );
}

/**
 * Format Zod errors into { field: [messages] }
 */
function formatZodErrors(error: ZodError): Record<string, string[]> {
  const errors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const path = issue.path.join('.') || 'general';
    if (!errors[path]) errors[path] = [];
    errors[path].push(issue.message);
  }
  return errors;
}

/**
 * Extract a route param safely as a string
 */
function param(req: Request, name: string): string {
  const value = req.params[name];
  if (typeof value !== 'string' || !value) {
    throw new BadRequestError(`Missing required parameter: ${name}`);
  }
  return value;
}

// ===========================================
// Lifecycle Routes (non-parameterized first)
// ===========================================

/**
 * POST /workspace - Create & start a workspace
 */
workspaceRouter.post(
  '/',
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const ctx = getContext(req);
    const parsed = createWorkspaceSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError(JSON.stringify(formatZodErrors(parsed.error)));
    }

    const result = await workspaceService.createWorkspace(ctx, parsed.data);
    res.status(result.success ? 201 : 500).json({
      success: result.success,
      data: result,
    });
  }),
);

/**
 * GET /workspace/status - Get workspace status (personal or org)
 */
workspaceRouter.get(
  '/status',
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const ctx = getContext(req);
    const organizationId = req.query.organizationId as string | undefined;

    const status = await workspaceService.getStatus(ctx, organizationId);
    res.json({
      success: true,
      data: status,
    });
  }),
);

// ===========================================
// Organization Workspace Routes
// (Must be before /:id to avoid matching "org" as :id)
// ===========================================

/**
 * GET /workspace/org/:orgId - List org workspaces
 */
workspaceRouter.get(
  '/org/:orgId',
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const orgId = param(req, 'orgId');
    const ctx = getOrgContext(req, orgId);
    const workspaces = await workspaceService.listOrgWorkspaces(ctx, orgId);
    res.json({ success: true, data: workspaces });
  }),
);

/**
 * GET /workspace/org/:orgId/pool - Get org workspace pool usage
 */
workspaceRouter.get(
  '/org/:orgId/pool',
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const orgId = param(req, 'orgId');
    const ctx = getOrgContext(req, orgId);
    const pool = await workspaceService.getOrgPoolUsage(ctx, orgId);
    res.json({ success: true, data: pool });
  }),
);

// ===========================================
// User Domain Allowlist Routes (must be before /:id routes)
// ===========================================

/**
 * GET /workspace/allowed-domains - Get user's allowed domains + system domains
 */
workspaceRouter.get(
  '/allowed-domains',
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const ctx = getContext(req);
    const domains = await egressProxyService.getUserDomains(ctx.userId);
    const systemDomains = egressProxyService.getSystemDomains();
    res.json({ success: true, data: { domains, systemDomains } });
  }),
);

/**
 * POST /workspace/allowed-domains - Add a domain to user's allowlist
 * Body: { domain: string, reason?: string }
 */
workspaceRouter.post(
  '/allowed-domains',
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const ctx = getContext(req);
    const { domain, reason } = req.body as { domain: string; reason?: string };

    if (!domain || typeof domain !== 'string') {
      res.status(400).json({ success: false, error: { code: 'INVALID_DOMAIN', message: 'Domain is required' } });
      return;
    }

    const result = await egressProxyService.addUserDomain(ctx.userId, domain, reason);
    res.json({ success: true, data: result });
  }),
);

/**
 * DELETE /workspace/allowed-domains/:domainId - Remove a domain from user's allowlist
 */
workspaceRouter.delete(
  '/allowed-domains/:domainId',
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const ctx = getContext(req);
    await egressProxyService.removeUserDomain(ctx.userId, param(req, 'domainId'));
    res.json({ success: true });
  }),
);

// ===========================================
// Parameterized /:id Routes
// ===========================================

/**
 * GET /workspace/:id - Get workspace details
 */
workspaceRouter.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const ctx = getContext(req);
    const workspace = await workspaceService.getWorkspace(ctx, param(req, 'id'));
    res.json({
      success: true,
      data: workspace,
    });
  }),
);

/**
 * POST /workspace/:id/start - Start a stopped workspace
 */
workspaceRouter.post(
  '/:id/start',
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const ctx = getContext(req);
    const result = await workspaceService.startWorkspace(ctx, param(req, 'id'));
    res.json({ success: result.success, data: result });
  }),
);

/**
 * POST /workspace/:id/stop - Stop a running workspace
 */
workspaceRouter.post(
  '/:id/stop',
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const ctx = getContext(req);
    const result = await workspaceService.stopWorkspace(ctx, param(req, 'id'));
    res.json({ success: result.success, data: result });
  }),
);

/**
 * DELETE /workspace/:id - Destroy a workspace
 */
workspaceRouter.delete(
  '/:id',
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const ctx = getContext(req);
    const deleteData = req.query.deleteData === 'true';
    const result = await workspaceService.destroyWorkspace(ctx, param(req, 'id'), { deleteData });
    res.json({ success: result.success, data: result });
  }),
);

/**
 * PATCH /workspace/:id/auto-stop - Update auto-stop setting
 * Body: { autoStopMinutes: number | null }
 * Free/Starter users get 403 (locked at 24h).
 * Paid users can set 5-1440 minutes or null (disabled).
 */
workspaceRouter.patch(
  '/:id/auto-stop',
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const ctx = getContext(req);
    const parsed = autoStopSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('autoStopMinutes must be a number (5-1440) or null');
    }

    const result = await workspaceService.updateAutoStop(ctx, param(req, 'id'), parsed.data.autoStopMinutes);
    res.json({ success: true, data: result });
  }),
);

// ===========================================
// File Operation Routes
// ===========================================

/**
 * GET /workspace/:id/files - List files
 */
workspaceRouter.get(
  '/:id/files',
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const ctx = getContext(req);
    const parsed = fileListSchema.safeParse(req.query);
    if (!parsed.success) throw new BadRequestError('Invalid query parameters');

    const files = await workspaceService.fileList(ctx, param(req, 'id'), parsed.data.path, parsed.data.recursive);
    res.json({ success: true, data: files });
  }),
);

/**
 * GET /workspace/:id/files/read - Read a file
 */
workspaceRouter.get(
  '/:id/files/read',
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const ctx = getContext(req);
    const parsed = fileReadSchema.safeParse(req.query);
    if (!parsed.success) throw new BadRequestError('Path is required');

    const content = await workspaceService.fileRead(ctx, param(req, 'id'), parsed.data.path);
    res.json({ success: true, data: content });
  }),
);

/**
 * POST /workspace/:id/files - Write a file
 */
workspaceRouter.post(
  '/:id/files',
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const ctx = getContext(req);
    const parsed = fileWriteSchema.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError(JSON.stringify(formatZodErrors(parsed.error)));

    const result = await workspaceService.fileWrite(ctx, param(req, 'id'), parsed.data.path, parsed.data.content);
    res.json({ success: true, data: result });
  }),
);

/**
 * DELETE /workspace/:id/files - Delete a file
 */
workspaceRouter.delete(
  '/:id/files',
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const ctx = getContext(req);
    const parsed = fileDeleteSchema.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError('Path is required');

    const result = await workspaceService.fileDelete(ctx, param(req, 'id'), parsed.data.path);
    res.json({ success: true, data: result });
  }),
);

/**
 * POST /workspace/:id/files/mkdir - Create a directory
 */
workspaceRouter.post(
  '/:id/files/mkdir',
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const ctx = getContext(req);
    const parsed = fileMkdirSchema.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError('Path is required');

    const result = await workspaceService.fileMkdir(ctx, param(req, 'id'), parsed.data.path);
    res.json({ success: true, data: result });
  }),
);

/**
 * POST /workspace/:id/files/rename - Rename a file or directory
 */
workspaceRouter.post(
  '/:id/files/rename',
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const ctx = getContext(req);
    const parsed = fileRenameSchema.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError(JSON.stringify(formatZodErrors(parsed.error)));

    const result = await workspaceService.fileRename(ctx, param(req, 'id'), parsed.data.oldPath, parsed.data.newPath);
    res.json({ success: true, data: result });
  }),
);

// ===========================================
// Plugin Operation Routes
// ===========================================

/**
 * GET /workspace/:id/plugins - List running plugins
 */
workspaceRouter.get(
  '/:id/plugins',
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const ctx = getContext(req);
    const plugins = await workspaceService.pluginList(ctx, param(req, 'id'));
    res.json({ success: true, data: plugins });
  }),
);

/**
 * POST /workspace/:id/plugins/start - Start a plugin
 */
workspaceRouter.post(
  '/:id/plugins/start',
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const ctx = getContext(req);
    const parsed = pluginStartSchema.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError(JSON.stringify(formatZodErrors(parsed.error)));

    const result = await workspaceService.pluginStart(ctx, param(req, 'id'), parsed.data.file, parsed.data.env);
    res.json({ success: true, data: result });
  }),
);

/**
 * POST /workspace/:id/plugins/stop - Stop a plugin
 */
workspaceRouter.post(
  '/:id/plugins/stop',
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const ctx = getContext(req);
    const parsed = pluginStopSchema.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError(JSON.stringify(formatZodErrors(parsed.error)));

    const result = await workspaceService.pluginStop(ctx, param(req, 'id'), parsed.data.file, parsed.data.force);
    res.json({ success: true, data: result });
  }),
);

/**
 * POST /workspace/:id/plugins/restart - Restart a plugin
 */
workspaceRouter.post(
  '/:id/plugins/restart',
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const ctx = getContext(req);
    const parsed = pluginStartSchema.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError(JSON.stringify(formatZodErrors(parsed.error)));

    const result = await workspaceService.pluginRestart(ctx, param(req, 'id'), parsed.data.file);
    res.json({ success: true, data: result });
  }),
);

/**
 * GET /workspace/:id/plugins/logs - Get plugin logs
 */
workspaceRouter.get(
  '/:id/plugins/logs',
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const ctx = getContext(req);
    const file = req.query.file as string;
    if (!file) throw new BadRequestError('Plugin file query param required');

    const logs = await workspaceService.pluginLogs(ctx, param(req, 'id'), file);
    res.json({ success: true, data: logs });
  }),
);

/**
 * POST /workspace/:id/plugins/validate - Validate a plugin file (pre-flight check)
 */
workspaceRouter.post(
  '/:id/plugins/validate',
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const ctx = getContext(req);
    const parsed = pluginStartSchema.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError(JSON.stringify(formatZodErrors(parsed.error)));

    const result = await workspaceService.pluginValidate(ctx, param(req, 'id'), parsed.data.file);
    res.json({ success: true, data: result });
  }),
);

// ===========================================
// Git Operation Routes
// ===========================================

/**
 * POST /workspace/:id/git/clone - Clone a repository
 */
workspaceRouter.post(
  '/:id/git/clone',
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const ctx = getContext(req);
    const parsed = gitCloneSchema.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError(JSON.stringify(formatZodErrors(parsed.error)));

    const result = await workspaceService.gitClone(ctx, param(req, 'id'), parsed.data.url, {
      targetDir: parsed.data.targetDir,
      branch: parsed.data.branch,
      depth: parsed.data.depth,
      credentials: parsed.data.credentials,
    });
    res.json({ success: true, data: result });
  }),
);

/**
 * POST /workspace/:id/git/pull - Pull updates
 */
workspaceRouter.post(
  '/:id/git/pull',
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const ctx = getContext(req);
    const parsed = gitPullSchema.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError(JSON.stringify(formatZodErrors(parsed.error)));

    const result = await workspaceService.gitPull(ctx, param(req, 'id'), parsed.data.directory, parsed.data.credentials);
    res.json({ success: true, data: result });
  }),
);

/**
 * GET /workspace/:id/git/status - Get git status
 */
workspaceRouter.get(
  '/:id/git/status',
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const ctx = getContext(req);
    const directory = req.query.directory as string | undefined;

    const status = await workspaceService.gitStatus(ctx, param(req, 'id'), directory);
    res.json({ success: true, data: status });
  }),
);

// ===========================================
// Package Operation Routes
// ===========================================

/**
 * GET /workspace/:id/packages - List installed packages
 */
workspaceRouter.get(
  '/:id/packages',
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const ctx = getContext(req);
    const cwd = req.query.cwd as string | undefined;

    const packages = await workspaceService.packageList(ctx, param(req, 'id'), cwd);
    res.json({ success: true, data: packages });
  }),
);

/**
 * POST /workspace/:id/packages/install - Install packages
 */
workspaceRouter.post(
  '/:id/packages/install',
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const ctx = getContext(req);
    const parsed = packageInstallSchema.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError(JSON.stringify(formatZodErrors(parsed.error)));

    const result = await workspaceService.packageInstall(ctx, param(req, 'id'), parsed.data.packages, {
      dev: parsed.data.dev,
      cwd: parsed.data.cwd,
    });
    res.json({ success: true, data: result });
  }),
);

/**
 * POST /workspace/:id/packages/uninstall - Uninstall packages
 */
workspaceRouter.post(
  '/:id/packages/uninstall',
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const ctx = getContext(req);
    const parsed = packageUninstallSchema.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError(JSON.stringify(formatZodErrors(parsed.error)));

    const result = await workspaceService.packageUninstall(ctx, param(req, 'id'), parsed.data.packages, parsed.data.cwd);
    res.json({ success: true, data: result });
  }),
);

// ===========================================
// Terminal Operation Routes
// ===========================================

/**
 * POST /workspace/:id/terminal - Create terminal session
 */
workspaceRouter.post(
  '/:id/terminal',
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const ctx = getContext(req);
    const parsed = terminalCreateSchema.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError(JSON.stringify(formatZodErrors(parsed.error)));

    const session = await workspaceService.terminalCreate(ctx, param(req, 'id'), parsed.data.cols, parsed.data.rows);
    res.status(201).json({ success: true, data: session });
  }),
);

/**
 * POST /workspace/:id/terminal/resize - Resize terminal
 */
workspaceRouter.post(
  '/:id/terminal/resize',
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const ctx = getContext(req);
    const parsed = terminalResizeSchema.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError(JSON.stringify(formatZodErrors(parsed.error)));

    await workspaceService.terminalResize(ctx, param(req, 'id'), parsed.data.sessionId, parsed.data.cols, parsed.data.rows);
    res.json({ success: true, data: { resized: true } });
  }),
);

/**
 * POST /workspace/:id/terminal/close - Close terminal session
 */
workspaceRouter.post(
  '/:id/terminal/close',
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const ctx = getContext(req);
    const parsed = terminalCloseSchema.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError('Session ID is required');

    await workspaceService.terminalClose(ctx, param(req, 'id'), parsed.data.sessionId);
    res.json({ success: true, data: { closed: true } });
  }),
);

// ===========================================
// System Routes
// ===========================================

/**
 * GET /workspace/:id/stats - Container resource stats
 */
workspaceRouter.get(
  '/:id/stats',
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const ctx = getContext(req);

    // Get container details to access resource limits for accurate % calculation
    const container = await workspaceService.getWorkspace(ctx, param(req, 'id'));

    const raw = await workspaceService.systemStats(ctx, param(req, 'id')) as {
      memory?: { system?: { used?: number; total?: number; percent?: number } };
      cpu?: { loadAvg?: { '1m'?: number }; usageCores?: number; allocatedCores?: number };
      disk?: { percent?: number };
      workspace?: { sizeMb?: number };
    };

    // Map raw bridge stats → WorkspaceResourceUsage shape expected by frontend
    const usedMemMb = (raw.memory?.system?.used ?? 0) / (1024 * 1024);
    const storageUsedMb = raw.workspace?.sizeMb ?? 0;
    
    // Calculate storage % based on container quota, NOT filesystem usage (df)
    const storageLimitMb = container.resources.storageMb;
    const storagePercentage = storageLimitMb > 0 
      ? Math.min(100, Math.round((storageUsedMb / storageLimitMb) * 100))
      : 0;

    // Use cgroup-based CPU usage (actual container CPU) instead of load average (host-wide)
    // usageCores: fraction of cores used (e.g. 0.35 means 35% of 1 core)
    const cpuUsageCores = raw.cpu?.usageCores ?? raw.cpu?.loadAvg?.['1m'] ?? 0;

    const data = {
      ramUsedMb: Math.round(usedMemMb * 10) / 10,
      ramPercentage: raw.memory?.system?.percent ?? 0,
      cpuPercentage: Math.round(cpuUsageCores * 100) / 100,
      storageUsedMb,
      storagePercentage,
      raw, // Include raw stats for advanced consumers
    };

    res.json({ success: true, data });
  }),
);

/**
 * GET /workspace/:id/storage-stats - Per-plugin KV storage usage
 *
 * Returns per-plugin key counts, byte usage, and quota info
 * by querying the bridge agent's local SQLite store.
 */
workspaceRouter.get(
  '/:id/storage-stats',
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const ctx = getContext(req);
    const stats = await workspaceService.storageStats(ctx, param(req, 'id'));
    res.json({ success: true, data: stats });
  }),
);

/**
 * GET /workspace/:id/health - Container health
 */
workspaceRouter.get(
  '/:id/health',
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const ctx = getContext(req);
    const health = await workspaceService.systemHealth(ctx, param(req, 'id'));
    res.json({ success: true, data: health });
  }),
);

/**
 * GET /workspace/:id/metrics - Container metrics time-series
 */
workspaceRouter.get(
  '/:id/metrics',
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const ctx = getContext(req);
    // Auth check — ensures user owns this container
    await workspaceService.getWorkspace(ctx, param(req, 'id'));
    const since = req.query.since ? new Date(req.query.since as string) : undefined;
    const until = req.query.until ? new Date(req.query.until as string) : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;

    const metrics = await workspaceMetricsService.getMetrics({ containerId: param(req, 'id'), since, until, limit });
    res.json({ success: true, data: metrics });
  }),
);

/**
 * GET /workspace/:id/metrics/summary - Container metrics summary
 */
workspaceRouter.get(
  '/:id/metrics/summary',
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const ctx = getContext(req);
    await workspaceService.getWorkspace(ctx, param(req, 'id'));
    const since = req.query.since ? new Date(req.query.since as string) : undefined;
    const until = req.query.until ? new Date(req.query.until as string) : undefined;

    const summary = await workspaceMetricsService.getSummary(param(req, 'id'), since, until);
    res.json({ success: true, data: summary });
  }),
);

/**
 * GET /workspace/:id/egress-logs - User: get their container's egress logs
 */
workspaceRouter.get(
  '/:id/egress-logs',
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const ctx = getContext(req);
    // Auth check — ensures user owns this container
    await workspaceService.getWorkspace(ctx, param(req, 'id'));

    const query = {
      containerId: param(req, 'id'),
      domain: req.query.domain as string | undefined,
      action: req.query.action as 'ALLOWED' | 'BLOCKED' | 'RATE_LIMITED' | undefined,
      direction: req.query.direction as 'INBOUND' | 'OUTBOUND' | undefined,
      since: req.query.since ? new Date(req.query.since as string) : undefined,
      until: req.query.until ? new Date(req.query.until as string) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : 50,
      offset: req.query.offset ? Number(req.query.offset) : 0,
    };

    const result = await egressProxyService.getLogs(query);
    res.json({ success: true, data: result });
  }),
);

/**
 * GET /workspace/:id/egress-logs/summary - User: get their egress summary
 */
workspaceRouter.get(
  '/:id/egress-logs/summary',
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const ctx = getContext(req);
    await workspaceService.getWorkspace(ctx, param(req, 'id'));

    const since = req.query.since ? new Date(req.query.since as string) : undefined;
    const summary = await egressProxyService.getSummary(param(req, 'id'), since);
    res.json({ success: true, data: summary });
  }),
);

// ===========================================
// Backup Routes
// ===========================================

/**
 * POST /workspace/:id/backup - Create a workspace backup
 */
workspaceRouter.post(
  '/:id/backup',
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const ctx = getContext(req);
    // Auth check — ensures user owns this container
    await workspaceService.getWorkspace(ctx, param(req, 'id'));

    const result = await workspaceBackupService.createBackup(param(req, 'id'), ctx.userId);
    res.status(result.success ? 201 : 500).json({ success: result.success, data: result });
  }),
);

/**
 * GET /workspace/:id/backup - List workspace backups
 */
workspaceRouter.get(
  '/:id/backup',
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const ctx = getContext(req);
    await workspaceService.getWorkspace(ctx, param(req, 'id'));

    const backups = await workspaceBackupService.listBackups(param(req, 'id'));
    res.json({ success: true, data: backups });
  }),
);

/**
 * POST /workspace/:id/backup/restore - Restore workspace from backup
 */
workspaceRouter.post(
  '/:id/backup/restore',
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const ctx = getContext(req);
    await workspaceService.getWorkspace(ctx, param(req, 'id'));

    const parsed = backupRestoreSchema.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError('Backup ID is required');

    const result = await workspaceBackupService.restoreBackup(param(req, 'id'), parsed.data.backupId);
    res.json({ success: result.success, data: result });
  }),
);

/**
 * DELETE /workspace/:id/backup/:backupId - Delete a backup
 */
workspaceRouter.delete(
  '/:id/backup/:backupId',
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const ctx = getContext(req);
    await workspaceService.getWorkspace(ctx, param(req, 'id'));

    const result = await workspaceBackupService.deleteBackup(param(req, 'id'), param(req, 'backupId'));
    res.json({ success: result.success, data: result });
  }),
);

/**
 * GET /workspace/:id/logs - Container logs (via bridge)
 */
workspaceRouter.get(
  '/:id/logs',
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const ctx = getContext(req);
    const parsed = logQuerySchema.safeParse({
      level: req.query.level,
      scope: req.query.scope,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      since: req.query.since,
    });
    if (!parsed.success) throw new BadRequestError('Invalid log query parameters');

    const result = await workspaceService.sendBridgeAction(ctx, param(req, 'id'), 'system.logs', parsed.data as Record<string, unknown>);
    res.json({ success: true, data: result });
  }),
);

// ===========================================
// Gateway Overview (read-only monitoring of ALL gateway types)
// ===========================================

/**
 * GET /workspace/:id/gateways-overview
 * Returns all gateways (Telegram, AI, Custom) with connected plugins
 * for monitoring in the workspace panel.
 *
 * Unified query — all gateway types live in the same gateways table.
 */
const handleGatewaysOverview = asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
  const ctx = getContext(req);
  const containerId = param(req, 'id');
  await workspaceService.getWorkspace(ctx, containerId);

  const CUSTOM_GW_BASE = process.env.WEBHOOK_BASE_URL || process.env.TELEGRAM_WEBHOOK_BASE_URL || 'https://webhook.2bot.org';

  const allGateways = await prisma.gateway.findMany({
    where: { userId: ctx.userId },
    select: {
      id: true,
      name: true,
      type: true,
      status: true,
      metadata: true,
      lastConnectedAt: true,
      userPlugins: {
        select: {
          id: true,
          entryFile: true,
          isEnabled: true,
          plugin: { select: { name: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  const gateways = allGateways.map(g => {
    const base: Record<string, unknown> = {
      id: g.id,
      name: g.name,
      type: g.type as string,
      status: g.status,
      lastConnectedAt: g.lastConnectedAt?.toISOString() ?? null,
      plugins: g.userPlugins.map(up => ({
        id: up.id,
        name: up.plugin.name,
        entryFile: up.entryFile,
        isEnabled: up.isEnabled,
      })),
    };

    // Add webhook URL for custom gateways
    if (g.type === 'CUSTOM_GATEWAY') {
      base.url = `${CUSTOM_GW_BASE}/custom/${g.id}`;
      const meta = (g.metadata ?? {}) as Record<string, unknown>;
      base.credentialKeys = (meta.credentialKeys as string[]) ?? [];
    }

    return base;
  });

  res.json({ success: true, data: { gateways } });
});
workspaceRouter.get('/:id/gateways-overview', handleGatewaysOverview);
