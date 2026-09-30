/**
 * Healing a bridge token that went stale when the container restarted.
 *
 * The bridge agent keeps a rotated token only in memory; after a restart it
 * authenticates with the token baked into its env at creation, while the DB
 * holds the latest rotated one. Before this, every workspace that ran through
 * a daily rotation and was then stopped failed "Bridge auth" on its next
 * start (2026-09-15). getClient now retries with the creation token, rotates
 * straight to a fresh one, and saves it.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: { workspaceContainer: { findUnique: vi.fn(), update: vi.fn() } },
}));

vi.mock('@/lib/encryption', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  encrypt: (v: string) => `enc(${v})`,
}));

vi.mock('../bridge-lease.service', () => ({
  bridgeLeaseService: { acquire: vi.fn().mockResolvedValue(true), getHolder: vi.fn() },
  SERVER_INSTANCE_ID: 'test-instance',
}));

vi.mock('../workspace-docker.service', () => ({
  dockerService: { getEnvVar: vi.fn() },
}));

import { prisma } from '@/lib/prisma';
import { BridgeClient, bridgeClientManager } from '../bridge-client.service';
import { dockerService } from '../workspace-docker.service';

const AUTH_FAILED = 'Bridge auth failed: Unauthorized — send auth token first';

type FakeClient = { token: string; send: ReturnType<typeof vi.fn>; isConnected: boolean };
let created: string[];
let clients: FakeClient[];
let rejected: Set<string>;
let otherError: Error | null;
let n = 0;

const manager = bridgeClientManager as unknown as {
  _createClient(id: string, port: number, token: string): Promise<unknown>;
};

beforeEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  created = [];
  clients = [];
  rejected = new Set(['stale']);
  otherError = null;
  vi.mocked(prisma.workspaceContainer.findUnique).mockResolvedValue({ containerId: 'docker-1' } as never);
  vi.mocked(prisma.workspaceContainer.update).mockResolvedValue({} as never);
  vi.mocked(dockerService.getEnvVar).mockResolvedValue('creation');
  vi.spyOn(manager, '_createClient').mockImplementation(async (_id, _port, token) => {
    created.push(token);
    if (otherError) throw otherError;
    if (rejected.has(token)) throw new Error(AUTH_FAILED);
    const client = { token, send: vi.fn().mockResolvedValue({ rotated: true }), isConnected: true };
    clients.push(client);
    return client;
  });
});

// A fresh container id per call, so the manager's per-container state never leaks between tests.
const getClient = () => bridgeClientManager.getClient(`db-${++n}`, 32769, 'stale');

describe('getClient — stale token after a container restart', () => {
  it('heals with the creation token, rotates to a fresh one, and saves it', async () => {
    const client = (await getClient()) as unknown as FakeClient;

    const fresh = created[2];
    expect(created.slice(0, 2)).toEqual(['stale', 'creation']);
    expect(fresh).toMatch(/^[0-9a-f]{128}$/);
    expect(clients[0]?.send).toHaveBeenCalledWith('system.rotate-token', { token: fresh });
    expect(prisma.workspaceContainer.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { bridgeAuthToken: `enc(${fresh})` } }),
    );
    // The returned client holds the fresh token, so its reconnects authenticate.
    expect(client.token).toBe(fresh);
  });

  it('gives up when the creation token is the one that was just rejected', async () => {
    vi.mocked(dockerService.getEnvVar).mockResolvedValue('stale');
    await expect(getClient()).rejects.toThrow(AUTH_FAILED);
    expect(created).toEqual(['stale']);
    expect(prisma.workspaceContainer.update).not.toHaveBeenCalled();
  });

  it('gives up when the container has no creation token', async () => {
    vi.mocked(dockerService.getEnvVar).mockResolvedValue(null);
    await expect(getClient()).rejects.toThrow(AUTH_FAILED);
    expect(prisma.workspaceContainer.update).not.toHaveBeenCalled();
  });

  it('gives up when the creation token is rejected too', async () => {
    rejected.add('creation');
    await expect(getClient()).rejects.toThrow(AUTH_FAILED);
    expect(created).toEqual(['stale', 'creation']);
    expect(prisma.workspaceContainer.update).not.toHaveBeenCalled();
  });

  it('does not touch errors other than an auth failure', async () => {
    otherError = new Error('Bridge connection timeout for container db-x');
    await expect(getClient()).rejects.toThrow('timeout');
    expect(dockerService.getEnvVar).not.toHaveBeenCalled();
  });

  it('re-syncs the DB to the creation token when the rotation itself fails', async () => {
    vi.spyOn(manager, '_createClient').mockImplementation(async (_id, _port, token) => {
      created.push(token);
      if (token === 'stale') throw new Error(AUTH_FAILED);
      const client = { token, send: vi.fn().mockRejectedValue(new Error('bridge busy')), isConnected: true };
      clients.push(client);
      return client;
    });
    const client = (await getClient()) as unknown as FakeClient;
    expect(client.token).toBe('creation');
    expect(prisma.workspaceContainer.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { bridgeAuthToken: 'enc(creation)' } }),
    );
  });
});

describe('_createClient — a client that fails to connect does not linger', () => {
  it('disconnects the failed client instead of leaving it to reconnect with a rejected token', async () => {
    vi.restoreAllMocks(); // the real _createClient
    vi.spyOn(BridgeClient.prototype, 'connect').mockRejectedValue(new Error(AUTH_FAILED));
    const disconnect = vi.spyOn(BridgeClient.prototype, 'disconnect');
    await expect(manager._createClient('db-linger', 32769, 'stale')).rejects.toThrow(AUTH_FAILED);
    expect(disconnect).toHaveBeenCalledOnce();
  });
});
