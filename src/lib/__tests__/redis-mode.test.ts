/**
 * Phase 5.7 — Redis client mode selection tests.
 *
 * Verifies that `createRedisClient()` picks the correct ioredis constructor
 * (single-node Redis, Sentinel, or Cluster) based on `REDIS_MODE` env config.
 * The constructors are mocked — we never open a real socket.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const RedisCtor = vi.fn(function (this: unknown, ..._args: unknown[]) {
    Object.assign(this as object, {
      _kind: "redis",
      on: vi.fn(),
      quit: vi.fn(async () => "OK"),
      ping: vi.fn(async () => "PONG"),
      status: "ready",
    });
  }) as unknown as ((...args: unknown[]) => unknown) & {
    Cluster: (...args: unknown[]) => unknown;
    mock: { calls: unknown[][]; results: unknown[] };
  };

  const ClusterCtor = vi.fn(function (this: unknown, ..._args: unknown[]) {
    Object.assign(this as object, {
      _kind: "cluster",
      on: vi.fn(),
      quit: vi.fn(async () => "OK"),
      ping: vi.fn(async () => "PONG"),
      status: "ready",
    });
  });

  // ioredis exports `Redis` as default with a static `Cluster` member.
  (RedisCtor as unknown as { Cluster: unknown }).Cluster = ClusterCtor;

  return { RedisCtor, ClusterCtor };
});

vi.mock("ioredis", () => ({
  default: mocks.RedisCtor,
  Redis: mocks.RedisCtor,
  Cluster: mocks.ClusterCtor,
}));

vi.mock("../logger", () => ({
  loggers: {
    server: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  },
  logger: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}));

const ENV_KEYS = [
  "REDIS_MODE",
  "REDIS_HOST",
  "REDIS_PORT",
  "REDIS_PASSWORD",
  "REDIS_DB",
  "REDIS_SENTINELS",
  "REDIS_SENTINEL_NAME",
  "REDIS_SENTINEL_PASSWORD",
  "REDIS_CLUSTER_NODES",
];

let saved: Record<string, string | undefined>;

describe("Phase 5.7 — Redis client mode selection", () => {
  beforeEach(() => {
    saved = {};
    for (const k of ENV_KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
    vi.resetModules();
    mocks.RedisCtor.mock.calls.length = 0;
    mocks.ClusterCtor.mock.calls.length = 0;
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("uses single-node Redis by default", async () => {
    process.env.REDIS_HOST = "rh";
    process.env.REDIS_PORT = "6300";

    const mod = await import("../redis");
    const client = mod.createRedisClient();

    expect(mocks.ClusterCtor).not.toHaveBeenCalled();
    // Module load already constructed the singleton (1) plus our explicit call (2).
    expect(mocks.RedisCtor.mock.calls.length).toBeGreaterThanOrEqual(1);
    const lastCall = mocks.RedisCtor.mock.calls.at(-1)!;
    const opts = lastCall[0] as { host: string; port: number };
    expect(opts.host).toBe("rh");
    expect(opts.port).toBe(6300);
    expect((client as unknown as { _kind: string })._kind).toBe("redis");
  });

  it("uses Sentinel mode when REDIS_MODE=sentinel", async () => {
    process.env.REDIS_MODE = "sentinel";
    process.env.REDIS_SENTINELS = "s1:26379,s2:26380";
    process.env.REDIS_SENTINEL_NAME = "mymaster";
    process.env.REDIS_SENTINEL_PASSWORD = "secret";

    const mod = await import("../redis");
    mocks.RedisCtor.mock.calls.length = 0;
    const client = mod.createRedisClient();

    expect(mocks.ClusterCtor).not.toHaveBeenCalled();
    const opts = mocks.RedisCtor.mock.calls.at(-1)![0] as {
      sentinels: Array<{ host: string; port: number }>;
      name: string;
      sentinelPassword?: string;
    };
    expect(opts.sentinels).toEqual([
      { host: "s1", port: 26379 },
      { host: "s2", port: 26380 },
    ]);
    expect(opts.name).toBe("mymaster");
    expect(opts.sentinelPassword).toBe("secret");
    expect((client as unknown as { _kind: string })._kind).toBe("redis");
  });

  it("uses Cluster mode when REDIS_MODE=cluster", async () => {
    process.env.REDIS_MODE = "cluster";
    process.env.REDIS_CLUSTER_NODES = "n1:6379,n2:6380,n3:6381";
    process.env.REDIS_PASSWORD = "clusterpw";

    const mod = await import("../redis");
    const client = mod.createRedisClient();

    expect(mocks.ClusterCtor).toHaveBeenCalled();
    const lastCall = mocks.ClusterCtor.mock.calls.at(-1)!;
    const nodes = lastCall[0] as Array<{ host: string; port: number }>;
    const opts = lastCall[1] as { redisOptions: { password: string } };
    expect(nodes).toEqual([
      { host: "n1", port: 6379 },
      { host: "n2", port: 6380 },
      { host: "n3", port: 6381 },
    ]);
    expect(opts.redisOptions.password).toBe("clusterpw");
    expect((client as unknown as { _kind: string })._kind).toBe("cluster");
  });

  it("throws when REDIS_MODE=cluster without REDIS_CLUSTER_NODES", async () => {
    const mod = await import("../redis");
    process.env.REDIS_MODE = "cluster";
    expect(() => mod.createRedisClient()).toThrow(/REDIS_CLUSTER_NODES/);
  });

  it("throws when REDIS_MODE=sentinel without REDIS_SENTINELS", async () => {
    const mod = await import("../redis");
    process.env.REDIS_MODE = "sentinel";
    process.env.REDIS_SENTINEL_NAME = "mymaster";
    expect(() => mod.createRedisClient()).toThrow(/REDIS_SENTINELS/);
  });

  it("throws when REDIS_MODE=sentinel without REDIS_SENTINEL_NAME", async () => {
    const mod = await import("../redis");
    process.env.REDIS_MODE = "sentinel";
    process.env.REDIS_SENTINELS = "s1:26379";
    expect(() => mod.createRedisClient()).toThrow(/REDIS_SENTINEL_NAME/);
  });

  it("falls back to single mode for unknown REDIS_MODE", async () => {
    process.env.REDIS_MODE = "bogus";
    const mod = await import("../redis");
    const client = mod.createRedisClient();
    expect(mocks.ClusterCtor).not.toHaveBeenCalled();
    expect((client as unknown as { _kind: string })._kind).toBe("redis");
  });

  it("parses cluster nodes with default port when port is omitted", async () => {
    process.env.REDIS_MODE = "cluster";
    process.env.REDIS_CLUSTER_NODES = "n1,n2:7000";

    const mod = await import("../redis");
    mod.createRedisClient();

    const nodes = mocks.ClusterCtor.mock.calls.at(-1)![0] as Array<{
      host: string;
      port: number;
    }>;
    expect(nodes).toEqual([
      { host: "n1", port: 6379 },
      { host: "n2", port: 7000 },
    ]);
  });
});
