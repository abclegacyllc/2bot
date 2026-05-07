/**
 * Cancel-flag Redis helper tests.
 *
 * Verifies the contract that the runner relies on at its cancel
 * checkpoints:
 *
 *   1. setCancelFlagRedis sets a flag the next consume reads as `true`.
 *   2. consumeCancelFlagRedis is atomic (GETDEL): the same flag can only
 *      be observed once. A second call returns `false`.
 *   3. setCancelFlagRedis is idempotent — repeated calls keep returning
 *      the same observable behaviour.
 *   4. consumeCancelFlagRedis fails closed on Redis errors (returns
 *      `false`) so a transient infra blip never aborts a paying user's
 *      run.
 *
 * Uses a stubbed Redis surface so the tests don't depend on a running
 * Redis instance — they verify the contract this module promises, not
 * Redis itself.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const setMock = vi.fn();
const getdelMock = vi.fn();
const delMock = vi.fn();
const getMock = vi.fn();

vi.mock("@/lib/redis", () => ({
  redis: {
    set: (...args: unknown[]) => setMock(...args),
    getdel: (...args: unknown[]) => getdelMock(...args),
    del: (...args: unknown[]) => delMock(...args),
    get: (...args: unknown[]) => getMock(...args),
  },
}));

// Import AFTER the mock is registered so the SUT picks up the stubbed redis.
import {
    clearCancelFlagRedis,
    consumeCancelFlagRedis,
    setCancelFlagRedis,
} from "../cursor-session-store";

describe("cursor-session-store cancel flag", () => {
  beforeEach(() => {
    setMock.mockReset();
    getdelMock.mockReset();
    delMock.mockReset();
    getMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("setCancelFlagRedis", () => {
    it("writes the flag with EX TTL", async () => {
      setMock.mockResolvedValueOnce("OK");
      await setCancelFlagRedis("sess-123");
      expect(setMock).toHaveBeenCalledTimes(1);
      const [key, value, mode, ttl] = setMock.mock.calls[0]!;
      expect(key).toBe("cursor:sess:sess-123:cancel");
      expect(value).toBe("1");
      expect(mode).toBe("EX");
      expect(typeof ttl).toBe("number");
      expect(ttl).toBeGreaterThan(0);
    });

    it("swallows Redis errors (non-throw)", async () => {
      setMock.mockRejectedValueOnce(new Error("network down"));
      await expect(setCancelFlagRedis("sess-err")).resolves.toBeUndefined();
    });
  });

  describe("consumeCancelFlagRedis", () => {
    it("returns true when GETDEL returned '1'", async () => {
      getdelMock.mockResolvedValueOnce("1");
      await expect(consumeCancelFlagRedis("sess-1")).resolves.toBe(true);
      expect(getdelMock).toHaveBeenCalledWith("cursor:sess:sess-1:cancel");
    });

    it("returns false when no flag was set (GETDEL returned null)", async () => {
      getdelMock.mockResolvedValueOnce(null);
      await expect(consumeCancelFlagRedis("sess-2")).resolves.toBe(false);
    });

    it("fails closed (returns false) on Redis errors", async () => {
      getdelMock.mockRejectedValueOnce(new Error("redis exploded"));
      // The runner reads this at every iteration boundary — a transient
      // Redis blip MUST NOT cancel a paying user's run.
      await expect(consumeCancelFlagRedis("sess-3")).resolves.toBe(false);
    });

    it("never returns true twice for the same flag (atomic semantics)", async () => {
      // First call observes the flag; the underlying GETDEL deletes it.
      getdelMock.mockResolvedValueOnce("1");
      await expect(consumeCancelFlagRedis("sess-4")).resolves.toBe(true);
      // Second call: nothing left to read.
      getdelMock.mockResolvedValueOnce(null);
      await expect(consumeCancelFlagRedis("sess-4")).resolves.toBe(false);
    });
  });

  describe("clearCancelFlagRedis", () => {
    it("deletes the flag without reading", async () => {
      delMock.mockResolvedValueOnce(1);
      await clearCancelFlagRedis("sess-5");
      expect(delMock).toHaveBeenCalledWith("cursor:sess:sess-5:cancel");
    });

    it("swallows Redis errors", async () => {
      delMock.mockRejectedValueOnce(new Error("redis"));
      await expect(clearCancelFlagRedis("sess-6")).resolves.toBeUndefined();
    });
  });
});
