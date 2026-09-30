/**
 * A container marked ERROR is stopped, not left running.
 *
 * Health checks and auto-stop only query RUNNING rows, so before this a
 * container left running in ERROR was never touched again (one ran orphaned
 * for two weeks after a failed start on 2026-09-15).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

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
    stopContainer: vi.fn(),
    startContainer: vi.fn(),
    stopAfterError: vi.fn(),
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
import { dockerService } from '../workspace-docker.service';
import { MAX_HEALTH_FAILURES } from '../workspace.constants';

// handleUnhealthy is private; the tests drive it directly.
const handleUnhealthy = (c: ReturnType<typeof container>) =>
  (containerLifecycleService as unknown as { handleUnhealthy(c: unknown): Promise<void> }).handleUnhealthy(c);

const container = (healthCheckFails: number) => ({
  id: 'db-1',
  containerId: 'ctr-1',
  containerName: 'ws-test',
  userId: 'u-1',
  healthCheckFails,
  autoRestart: false, // so the decision is ERROR, not restart
  maxRestarts: 5,
  restartCount: 0,
  subdomain: null,
});

describe('handleUnhealthy — ERROR stops the container', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.workspaceContainer.update).mockResolvedValue({} as never);
  });

  it('stops the container when it is marked ERROR', async () => {
    await handleUnhealthy(container(MAX_HEALTH_FAILURES - 1));
    expect(prisma.workspaceContainer.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'ERROR' }) }),
    );
    expect(dockerService.stopAfterError).toHaveBeenCalledWith('ctr-1');
  });

  it('does not stop a container that is still under the failure threshold', async () => {
    await handleUnhealthy(container(0));
    expect(dockerService.stopAfterError).not.toHaveBeenCalled();
  });
});
