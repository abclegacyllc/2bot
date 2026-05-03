/**
 * Phase 5.3 — Idle Suspend Tests
 *
 * Verifies the new pause/resume tier of the container lifecycle:
 *   - runSuspendChecks() pauses RUNNING containers idle longer than threshold
 *   - ensureRunning() resumes PAUSED containers and is a no-op for RUNNING
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/prisma', () => ({
  prisma: {
    workspaceContainer: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('@/lib/redis', () => ({
  redis: { ping: vi.fn(), get: vi.fn(), set: vi.fn(), del: vi.fn() },
}));

vi.mock('../workspace-docker.service', () => ({
  dockerService: {
    pauseContainer: vi.fn(),
    unpauseContainer: vi.fn(),
    stopContainer: vi.fn(),
    killContainer: vi.fn(),
  },
}));

vi.mock('../workspace-audit.service', () => ({
  workspaceAuditService: { log: vi.fn() },
}));

vi.mock('../bridge-client.service', () => ({
  bridgeClientManager: { removeClient: vi.fn(), getExistingClient: vi.fn() },
}));

vi.mock('../../plugin/plugin-deploy.service', () => ({
  pluginDeployService: { redeployContainerPlugins: vi.fn() },
}));

vi.mock('../../workflow/workflow-cache.service', () => ({
  workflowCacheService: { invalidate: vi.fn(), invalidateAll: vi.fn() },
}));

import { prisma } from '@/lib/prisma';
import { containerLifecycleService } from '../container-lifecycle.service';
import { workspaceAuditService } from '../workspace-audit.service';
import { dockerService } from '../workspace-docker.service';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runSuspendChecks (Phase 5.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('pauses a RUNNING container idle past autoSuspendMinutes', async () => {
    const tenMinAgo = new Date(Date.now() - 10 * 60_000);
    vi.mocked(prisma.workspaceContainer.findMany).mockResolvedValue([
      {
        id: 'c1',
        containerId: 'docker-c1',
        containerName: 'ws-c1',
        lastActivityAt: tenMinAgo,
        autoSuspendMinutes: 5,
      },
    ] as any);
    vi.mocked(dockerService.pauseContainer).mockResolvedValue(undefined);
    vi.mocked(prisma.workspaceContainer.update).mockResolvedValue({} as any);

    await containerLifecycleService.runSuspendChecks();

    expect(dockerService.pauseContainer).toHaveBeenCalledWith('docker-c1');
    expect(prisma.workspaceContainer.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { status: 'PAUSED' },
    });
    expect(workspaceAuditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'AUTO_SUSPEND', containerId: 'c1' }),
    );
  });

  it('skips containers idle below threshold', async () => {
    const oneMinAgo = new Date(Date.now() - 60_000);
    vi.mocked(prisma.workspaceContainer.findMany).mockResolvedValue([
      {
        id: 'c2',
        containerId: 'docker-c2',
        containerName: 'ws-c2',
        lastActivityAt: oneMinAgo,
        autoSuspendMinutes: 5,
      },
    ] as any);

    await containerLifecycleService.runSuspendChecks();

    expect(dockerService.pauseContainer).not.toHaveBeenCalled();
    expect(prisma.workspaceContainer.update).not.toHaveBeenCalled();
  });

  it('continues sweep when one container fails to pause', async () => {
    const tenMinAgo = new Date(Date.now() - 10 * 60_000);
    vi.mocked(prisma.workspaceContainer.findMany).mockResolvedValue([
      {
        id: 'c-bad',
        containerId: 'docker-bad',
        containerName: 'ws-bad',
        lastActivityAt: tenMinAgo,
        autoSuspendMinutes: 5,
      },
      {
        id: 'c-ok',
        containerId: 'docker-ok',
        containerName: 'ws-ok',
        lastActivityAt: tenMinAgo,
        autoSuspendMinutes: 5,
      },
    ] as any);
    vi.mocked(dockerService.pauseContainer)
      .mockRejectedValueOnce(new Error('docker error'))
      .mockResolvedValueOnce(undefined);
    vi.mocked(prisma.workspaceContainer.update).mockResolvedValue({} as any);

    await containerLifecycleService.runSuspendChecks();

    expect(dockerService.pauseContainer).toHaveBeenCalledTimes(2);
    expect(prisma.workspaceContainer.update).toHaveBeenCalledWith({
      where: { id: 'c-ok' },
      data: { status: 'PAUSED' },
    });
  });
});

describe('ensureRunning (Phase 5.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns RUNNING and is a no-op when container is already RUNNING', async () => {
    vi.mocked(prisma.workspaceContainer.findUnique).mockResolvedValue({
      id: 'c1',
      containerId: 'docker-c1',
      status: 'RUNNING',
      containerName: 'ws-c1',
    } as any);

    const result = await containerLifecycleService.ensureRunning('c1');

    expect(result).toBe('RUNNING');
    expect(dockerService.unpauseContainer).not.toHaveBeenCalled();
    expect(prisma.workspaceContainer.update).not.toHaveBeenCalled();
  });

  it('unpauses a PAUSED container and updates status', async () => {
    vi.mocked(prisma.workspaceContainer.findUnique).mockResolvedValue({
      id: 'c1',
      containerId: 'docker-c1',
      status: 'PAUSED',
      containerName: 'ws-c1',
    } as any);
    vi.mocked(dockerService.unpauseContainer).mockResolvedValue(undefined);
    vi.mocked(prisma.workspaceContainer.update).mockResolvedValue({} as any);

    const result = await containerLifecycleService.ensureRunning('c1');

    expect(result).toBe('RUNNING');
    expect(dockerService.unpauseContainer).toHaveBeenCalledWith('docker-c1');
    expect(prisma.workspaceContainer.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: expect.objectContaining({ status: 'RUNNING' }),
    });
    expect(workspaceAuditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'AUTO_RESUME' }),
    );
  });

  it('returns OTHER when container does not exist', async () => {
    vi.mocked(prisma.workspaceContainer.findUnique).mockResolvedValue(null);
    const result = await containerLifecycleService.ensureRunning('missing');
    expect(result).toBe('OTHER');
  });

  it('returns OTHER for STOPPED containers', async () => {
    vi.mocked(prisma.workspaceContainer.findUnique).mockResolvedValue({
      id: 'c1',
      containerId: 'docker-c1',
      status: 'STOPPED',
      containerName: 'ws-c1',
    } as any);

    const result = await containerLifecycleService.ensureRunning('c1');

    expect(result).toBe('OTHER');
    expect(dockerService.unpauseContainer).not.toHaveBeenCalled();
  });

  it('returns PAUSED if unpause fails', async () => {
    vi.mocked(prisma.workspaceContainer.findUnique).mockResolvedValue({
      id: 'c1',
      containerId: 'docker-c1',
      status: 'PAUSED',
      containerName: 'ws-c1',
    } as any);
    vi.mocked(dockerService.unpauseContainer).mockRejectedValue(new Error('docker err'));

    const result = await containerLifecycleService.ensureRunning('c1');

    expect(result).toBe('PAUSED');
    expect(prisma.workspaceContainer.update).not.toHaveBeenCalled();
  });
});
