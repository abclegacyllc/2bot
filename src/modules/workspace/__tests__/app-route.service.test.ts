/**
 * Unit tests for app-route.service (Phase 7.3c).
 *
 * Verifies the in-memory map is updated correctly, the file write produces
 * the expected nginx-include content, and that the feature flag gates the
 * service at every public entry point.
 */

import * as fs from 'fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    workspaceContainer: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

vi.mock('fs/promises', async () => ({
  default: { writeFile: vi.fn().mockResolvedValue(undefined) },
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

// Stub child_process.execFile (used via promisify) so no real `nginx -s reload`
// is invoked during unit tests.
vi.mock('child_process', () => ({
  execFile: (
    _cmd: string,
    _args: string[],
    cb: (err: Error | null, stdout: string, stderr: string) => void,
  ) => cb(null, '', ''),
}));

import { prisma } from '@/lib/prisma';
import { appRouteService } from '../app-route.service';

const mockedPrisma = prisma as unknown as {
  workspaceContainer: {
    findUnique: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
  };
};

const writeFileMock = fs.writeFile as unknown as ReturnType<typeof vi.fn>;

describe('app-route.service', () => {
  const ORIGINAL_FLAG = process.env.FEATURE_PROJECT_RESOURCES;

  beforeEach(async () => {
    process.env.FEATURE_PROJECT_RESOURCES = 'enabled';
    writeFileMock.mockClear();
    mockedPrisma.workspaceContainer.findUnique.mockReset();
    mockedPrisma.workspaceContainer.findMany.mockReset();
    // Reset internal state by rebuilding from an empty DB.
    mockedPrisma.workspaceContainer.findMany.mockResolvedValue([]);
    await appRouteService.rebuildRoutes();
    // Clear call counts from the rebuild so each test asserts on its own writes.
    writeFileMock.mockClear();
    mockedPrisma.workspaceContainer.findUnique.mockReset();
    mockedPrisma.workspaceContainer.findMany.mockReset();
  });

  afterEach(() => {
    if (ORIGINAL_FLAG === undefined) delete process.env.FEATURE_PROJECT_RESOURCES;
    else process.env.FEATURE_PROJECT_RESOURCES = ORIGINAL_FLAG;
  });

  it('activateRoutes adds a host → 127.0.0.1:port entry and writes the map', async () => {
    mockedPrisma.workspaceContainer.findUnique.mockResolvedValueOnce({
      subdomain: 'alice-todo',
      httpPort: 32831,
      status: 'RUNNING',
    });

    await appRouteService.activateRoutes('container-1');

    expect(appRouteService.routeCount).toBe(1);
    expect(writeFileMock).toHaveBeenCalledTimes(1);
    const call = writeFileMock.mock.calls[0]!;
    const contents = call[1];
    expect(contents).toMatch(/"alice-todo\.2bot\.org" "127\.0\.0\.1:32831";/);
  });

  it('skips activation when subdomain or httpPort is missing', async () => {
    mockedPrisma.workspaceContainer.findUnique.mockResolvedValueOnce({
      subdomain: null,
      httpPort: null,
      status: 'RUNNING',
    });

    await appRouteService.activateRoutes('container-1');

    expect(writeFileMock).not.toHaveBeenCalled();
  });

  it('skips activation when container is not RUNNING', async () => {
    mockedPrisma.workspaceContainer.findUnique.mockResolvedValueOnce({
      subdomain: 'alice',
      httpPort: 8000,
      status: 'STOPPED',
    });

    await appRouteService.activateRoutes('container-1');
    expect(writeFileMock).not.toHaveBeenCalled();
  });

  it('deactivateRoutes removes the matching host', async () => {
    // First: register the route.
    mockedPrisma.workspaceContainer.findUnique.mockResolvedValueOnce({
      subdomain: 'svc',
      httpPort: 9001,
      status: 'RUNNING',
    });
    await appRouteService.activateRoutes('container-2');
    expect(appRouteService.routeCount).toBe(1);

    // Then: deactivate using subdomain-only payload.
    mockedPrisma.workspaceContainer.findUnique.mockResolvedValueOnce({
      subdomain: 'svc',
    });
    await appRouteService.deactivateRoutes('container-2');

    expect(appRouteService.routeCount).toBe(0);
  });

  it('rebuildRoutes seeds the map from RUNNING containers with subdomain+httpPort', async () => {
    mockedPrisma.workspaceContainer.findMany.mockResolvedValue([
      { subdomain: 'a', httpPort: 8001 },
      { subdomain: 'b', httpPort: 8002 },
    ]);

    await appRouteService.rebuildRoutes();

    expect(appRouteService.routeCount).toBe(2);
    const [, contents] = writeFileMock.mock.calls.at(-1)!;
    expect(contents).toMatch(/"a\.2bot\.org" "127\.0\.0\.1:8001";/);
    expect(contents).toMatch(/"b\.2bot\.org" "127\.0\.0\.1:8002";/);
  });

  it('all public methods are no-ops when FEATURE_PROJECT_RESOURCES is disabled', async () => {
    process.env.FEATURE_PROJECT_RESOURCES = 'disabled';

    await appRouteService.activateRoutes('container-x');
    await appRouteService.deactivateRoutes('container-x');
    await appRouteService.rebuildRoutes();

    expect(mockedPrisma.workspaceContainer.findUnique).not.toHaveBeenCalled();
    expect(mockedPrisma.workspaceContainer.findMany).not.toHaveBeenCalled();
    expect(writeFileMock).not.toHaveBeenCalled();
  });
});
