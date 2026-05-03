/**
 * Webhook Replay Cache Tests
 *
 * @module lib/__tests__/webhook-replay-cache.test
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock Redis singleton — must be hoisted before importing the module under test.
const mockSet = vi.fn();
const mockDel = vi.fn();

vi.mock("@/lib/redis", () => ({
  redis: {
    set: mockSet,
    del: mockDel,
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    child: () => ({
      warn: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

describe("webhook-replay-cache", () => {
  beforeEach(() => {
    mockSet.mockReset();
    mockDel.mockReset();
    delete process.env.WEBHOOK_REPLAY_FAIL_CLOSED;
    vi.resetModules();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("returns false (fresh) on first call when Redis SET NX succeeds", async () => {
    mockSet.mockResolvedValueOnce("OK");

    const { wasReplayed } = await import("../webhook-replay-cache");
    const result = await wasReplayed("stripe", "evt_123");

    expect(result).toBe(false);
    expect(mockSet).toHaveBeenCalledTimes(1);
    const args = mockSet.mock.calls[0]!;
    expect(args[0]).toMatch(/^webhook:replay:[0-9a-f]{64}$/); // hashed key
    expect(args[1]).toBe("1");
    expect(args[2]).toBe("EX");
    expect(typeof args[3]).toBe("number");
    expect(args[4]).toBe("NX");
  });

  it("returns true (replay) when Redis SET NX returns null (key existed)", async () => {
    mockSet.mockResolvedValueOnce(null);

    const { wasReplayed } = await import("../webhook-replay-cache");
    const result = await wasReplayed("stripe", "evt_123");

    expect(result).toBe(true);
  });

  it("uses custom TTL when provided", async () => {
    mockSet.mockResolvedValueOnce("OK");

    const { wasReplayed } = await import("../webhook-replay-cache");
    await wasReplayed("telegram", "update_42", 3600);

    expect(mockSet).toHaveBeenCalledWith(
      expect.any(String),
      "1",
      "EX",
      3600,
      "NX",
    );
  });

  it("hashes (provider, identifier) so the cache key is fixed-length", async () => {
    mockSet.mockResolvedValue("OK");

    const { wasReplayed } = await import("../webhook-replay-cache");
    await wasReplayed("stripe", "evt_a");
    await wasReplayed("stripe", "evt_b");

    const keyA = mockSet.mock.calls[0]![0];
    const keyB = mockSet.mock.calls[1]![0];
    expect(keyA).not.toBe(keyB);
    expect(keyA).toMatch(/^webhook:replay:[0-9a-f]{64}$/);
    expect(keyB).toMatch(/^webhook:replay:[0-9a-f]{64}$/);
  });

  it("treats different providers as separate namespaces", async () => {
    mockSet.mockResolvedValue("OK");

    const { wasReplayed } = await import("../webhook-replay-cache");
    await wasReplayed("stripe", "id_1");
    await wasReplayed("telegram", "id_1");

    expect(mockSet.mock.calls[0]![0]).not.toBe(mockSet.mock.calls[1]![0]);
  });

  it("returns false (allow) on Redis error by default — fail-open", async () => {
    mockSet.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const { wasReplayed } = await import("../webhook-replay-cache");
    const result = await wasReplayed("stripe", "evt_xyz");

    expect(result).toBe(false);
  });

  it("returns true (block) on Redis error when WEBHOOK_REPLAY_FAIL_CLOSED=true", async () => {
    process.env.WEBHOOK_REPLAY_FAIL_CLOSED = "true";
    mockSet.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const { wasReplayed } = await import("../webhook-replay-cache");
    const result = await wasReplayed("stripe", "evt_xyz");

    expect(result).toBe(true);
  });

  it("returns false without calling Redis when identifier is empty", async () => {
    const { wasReplayed } = await import("../webhook-replay-cache");
    const result = await wasReplayed("stripe", "");

    expect(result).toBe(false);
    expect(mockSet).not.toHaveBeenCalled();
  });

  it("returns false without calling Redis when provider is empty", async () => {
    const { wasReplayed } = await import("../webhook-replay-cache");
    const result = await wasReplayed("", "evt_1");

    expect(result).toBe(false);
    expect(mockSet).not.toHaveBeenCalled();
  });

  it("clearReplayKey calls redis.del with the hashed key", async () => {
    mockDel.mockResolvedValueOnce(1);

    const { clearReplayKey } = await import("../webhook-replay-cache");
    await clearReplayKey("stripe", "evt_123");

    expect(mockDel).toHaveBeenCalledTimes(1);
    expect(mockDel.mock.calls[0]![0]).toMatch(/^webhook:replay:[0-9a-f]{64}$/);
  });

  it("clearReplayKey swallows Redis errors", async () => {
    mockDel.mockRejectedValueOnce(new Error("redis down"));

    const { clearReplayKey } = await import("../webhook-replay-cache");
    await expect(clearReplayKey("stripe", "evt_123")).resolves.toBeUndefined();
  });
});
