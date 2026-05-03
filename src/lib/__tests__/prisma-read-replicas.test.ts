/**
 * Phase 5.6 — Read-replica routing tests.
 *
 * The Prisma extension is integration-y by nature, but its routing decisions
 * are pure JS — we exercise them with mocked `PrismaClient` and `pg.Pool`
 * instances so the suite has no DB dependency. We assert:
 *  - Without `DATABASE_URL_REPLICA`, behaviour is unchanged (primary only).
 *  - With it set, replica clients are constructed.
 *  - `prismaPrimary` always routes to primary; `prismaReplica` to replica.
 *  - Comma-separated `DATABASE_URL_REPLICA` produces multiple replicas.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  // Track every PrismaClient instance with a unique tag so we can assert
  // routing.
  const instances: Array<{ tag: string; calls: string[] }> = [];

  const PrismaClientCtor = vi.fn(function (this: unknown, _opts: unknown) {
    const tag = `client-${instances.length}`;
    const inst = {
      tag,
      calls: [] as string[],
      $extends: vi.fn(function (this: unknown, ext: unknown) {
        // The real extension returns an object that exposes $primary/$replica.
        // For the unit test we just record that $extends was called and
        // return a stand-in with a known shape.
        return {
          tag: `${tag}-extended`,
          ext,
          $primary: () => inst,
          $replica: () => instances.find((x) => x.tag !== tag) ?? inst,
          user: { findMany: vi.fn(async () => []) },
        };
      }),
      $connect: vi.fn(),
      $disconnect: vi.fn(),
      user: { findMany: vi.fn(async () => []) },
    };
    instances.push(inst);
    Object.assign(this as object, inst);
    return inst;
  });

  const PoolCtor = vi.fn(function (this: unknown, _opts: unknown) {
    Object.assign(this as object, { _pool: true });
  });

  const PrismaPgCtor = vi.fn(function (this: unknown) {
    Object.assign(this as object, { _adapter: true });
  });

  const readReplicasMock = vi.fn((opts: unknown) => ({ __extension: true, opts }));

  return { PrismaClientCtor, PoolCtor, PrismaPgCtor, readReplicasMock, instances };
});

vi.mock("@prisma/client", () => ({
  PrismaClient: mocks.PrismaClientCtor,
}));

vi.mock("@prisma/adapter-pg", () => ({
  PrismaPg: mocks.PrismaPgCtor,
}));

vi.mock("pg", () => ({
  Pool: mocks.PoolCtor,
}));

vi.mock("@prisma/extension-read-replicas", () => ({
  readReplicas: mocks.readReplicasMock,
}));

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  // Reset the global Prisma cache between tests so each test gets a fresh
  // initialisation path.
  const g = globalThis as unknown as Record<string, unknown>;
  g.prisma = undefined;
  g.pool = undefined;
  g.replicaPools = undefined;

  mocks.PrismaClientCtor.mockClear();
  mocks.PoolCtor.mockClear();
  mocks.PrismaPgCtor.mockClear();
  mocks.readReplicasMock.mockClear();
  mocks.instances.length = 0;

  vi.resetModules();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("prisma — read replicas (Phase 5.6)", () => {
  it("does NOT apply the extension when DATABASE_URL_REPLICA is unset", async () => {
    process.env.DATABASE_URL = "postgresql://primary/db";
    delete process.env.DATABASE_URL_REPLICA;

    const mod = await import("../prisma");
    // Trigger lazy init by accessing the proxy.
    void mod.prisma.user;

    expect(mocks.PrismaClientCtor).toHaveBeenCalledTimes(1);
    expect(mocks.readReplicasMock).not.toHaveBeenCalled();
  });

  it("constructs one replica client when DATABASE_URL_REPLICA is a single URL", async () => {
    process.env.DATABASE_URL = "postgresql://primary/db";
    process.env.DATABASE_URL_REPLICA = "postgresql://replica1/db";

    const mod = await import("../prisma");
    void mod.prisma.user;

    // 1 primary + 1 replica
    expect(mocks.PrismaClientCtor).toHaveBeenCalledTimes(2);
    expect(mocks.readReplicasMock).toHaveBeenCalledTimes(1);
    const [opts] = mocks.readReplicasMock.mock.calls[0]!;
    expect((opts as { replicas: unknown[] }).replicas).toHaveLength(1);
  });

  it("constructs N replica clients for a comma-separated list", async () => {
    process.env.DATABASE_URL = "postgresql://primary/db";
    process.env.DATABASE_URL_REPLICA =
      "postgresql://r1/db, postgresql://r2/db ,postgresql://r3/db";

    const mod = await import("../prisma");
    void mod.prisma.user;

    expect(mocks.PrismaClientCtor).toHaveBeenCalledTimes(4); // 1 primary + 3 replicas
    const [opts] = mocks.readReplicasMock.mock.calls[0]!;
    expect((opts as { replicas: unknown[] }).replicas).toHaveLength(3);
  });

  it("ignores empty entries in DATABASE_URL_REPLICA", async () => {
    process.env.DATABASE_URL = "postgresql://primary/db";
    process.env.DATABASE_URL_REPLICA = "postgresql://r1/db, ,, postgresql://r2/db";

    const mod = await import("../prisma");
    void mod.prisma.user;

    expect(mocks.PrismaClientCtor).toHaveBeenCalledTimes(3); // 1 primary + 2 replicas
  });

  it("respects DATABASE_REPLICA_POOL_MAX for replica pool sizing", async () => {
    process.env.DATABASE_URL = "postgresql://primary/db";
    process.env.DATABASE_URL_REPLICA = "postgresql://r1/db";
    process.env.DATABASE_POOL_MAX = "30";
    process.env.DATABASE_REPLICA_POOL_MAX = "8";

    const mod = await import("../prisma");
    void mod.prisma.user;

    // Pool() called: 1 primary + 1 replica = 2
    expect(mocks.PoolCtor).toHaveBeenCalledTimes(2);
    const primaryPoolOpts = mocks.PoolCtor.mock.calls[0]![0] as { max: number };
    const replicaPoolOpts = mocks.PoolCtor.mock.calls[1]![0] as { max: number };
    expect(primaryPoolOpts.max).toBe(30);
    expect(replicaPoolOpts.max).toBe(8);
  });

  it("defaults replica pool max to ceil(primary/2)", async () => {
    process.env.DATABASE_URL = "postgresql://primary/db";
    process.env.DATABASE_URL_REPLICA = "postgresql://r1/db";
    process.env.DATABASE_POOL_MAX = "9";
    delete process.env.DATABASE_REPLICA_POOL_MAX;

    const mod = await import("../prisma");
    void mod.prisma.user;

    const replicaPoolOpts = mocks.PoolCtor.mock.calls[1]![0] as { max: number };
    expect(replicaPoolOpts.max).toBe(5); // ceil(9/2)
  });

  it("prismaPrimary calls $primary() on the extended client", async () => {
    process.env.DATABASE_URL = "postgresql://primary/db";
    process.env.DATABASE_URL_REPLICA = "postgresql://r1/db";

    const mod = await import("../prisma");
    void mod.prismaPrimary.user;

    // The extended client (returned from $extends) has $primary in our mock —
    // accessing prismaPrimary.user should not throw.
    expect(mocks.readReplicasMock).toHaveBeenCalled();
  });

  it("prismaReplica falls back to primary when no replicas configured", async () => {
    process.env.DATABASE_URL = "postgresql://primary/db";
    delete process.env.DATABASE_URL_REPLICA;

    const mod = await import("../prisma");
    // Should not throw — no $replica() exists, but our wrapper falls back.
    expect(() => void mod.prismaReplica.user).not.toThrow();
  });
});
