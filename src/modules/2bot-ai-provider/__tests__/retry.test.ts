/**
 * Retry Utility Tests
 *
 * Tests for the retry utility with exponential backoff.
 *
 * @module modules/2bot-ai-provider/__tests__/retry.test
 */

import { describe, expect, it, vi } from "vitest";
import { createRetryable, getRetryAfterMs, withRetry } from "../retry.util";

// ===========================================
// withRetry Tests
// ===========================================

describe("withRetry", () => {
  it("returns result on first try success", async () => {
    const fn = vi.fn().mockResolvedValue("success");

    const result = await withRetry(fn, { maxRetries: 3 });

    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on transient error and succeeds", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("rate limit exceeded"))
      .mockResolvedValue("success");

    const result = await withRetry(fn, {
      maxRetries: 3,
      initialDelayMs: 10, // Fast for tests
    });

    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("retries multiple times before success", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("Connection timeout"))
      .mockRejectedValueOnce(new Error("Connection timeout"))
      .mockResolvedValue("success");

    const result = await withRetry(fn, {
      maxRetries: 3,
      initialDelayMs: 10,
    });

    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("throws after max retries exceeded", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("Connection timeout"));

    await expect(
      withRetry(fn, {
        maxRetries: 2,
        initialDelayMs: 10,
      })
    ).rejects.toThrow("Connection timeout");

    expect(fn).toHaveBeenCalledTimes(3); // Initial + 2 retries
  });

  it("does not retry non-retryable errors", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("Invalid API key"));

    await expect(
      withRetry(fn, {
        maxRetries: 3,
        initialDelayMs: 10,
      })
    ).rejects.toThrow("Invalid API key");

    expect(fn).toHaveBeenCalledTimes(1); // No retries
  });

  it("uses custom isRetryable function", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("custom error"))
      .mockResolvedValue("success");

    const result = await withRetry(fn, {
      maxRetries: 3,
      initialDelayMs: 10,
      isRetryable: (error) => 
        error instanceof Error && error.message === "custom error",
    });

    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  describe("retryable error detection", () => {
    it("retries on rate limit error messages", async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error("Rate limit exceeded"))
        .mockResolvedValue("success");

      const result = await withRetry(fn, {
        maxRetries: 2,
        initialDelayMs: 10,
      });

      expect(result).toBe("success");
    });

    it("retries on 429 status code", async () => {
      const rateLimitError = Object.assign(new Error("Too Many Requests"), {
        status: 429,
      });
      const fn = vi
        .fn()
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValue("success");

      const result = await withRetry(fn, {
        maxRetries: 2,
        initialDelayMs: 10,
      });

      expect(result).toBe("success");
    });

    it("retries on 503 status code", async () => {
      const serviceUnavailable = Object.assign(new Error("Service Unavailable"), {
        status: 503,
      });
      const fn = vi
        .fn()
        .mockRejectedValueOnce(serviceUnavailable)
        .mockResolvedValue("success");

      const result = await withRetry(fn, {
        maxRetries: 2,
        initialDelayMs: 10,
      });

      expect(result).toBe("success");
    });

    it("retries on timeout errors", async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error("Request timeout"))
        .mockResolvedValue("success");

      const result = await withRetry(fn, {
        maxRetries: 2,
        initialDelayMs: 10,
      });

      expect(result).toBe("success");
    });

    it("retries on ECONNRESET", async () => {
      const connResetError = Object.assign(new Error("Connection reset"), {
        code: "ECONNRESET",
      });
      const fn = vi
        .fn()
        .mockRejectedValueOnce(connResetError)
        .mockResolvedValue("success");

      const result = await withRetry(fn, {
        maxRetries: 2,
        initialDelayMs: 10,
      });

      expect(result).toBe("success");
    });
  });

  describe("backoff timing", () => {
    it("applies exponential backoff", async () => {
      const delays: number[] = [];
      const originalSetTimeout = global.setTimeout;
      
      // Track delays
      vi.spyOn(global, "setTimeout").mockImplementation((fn, delay) => {
        delays.push(delay as number);
        return originalSetTimeout(fn, 0); // Execute immediately for tests
      });

      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error("rate limit"))
        .mockRejectedValueOnce(new Error("rate limit"))
        .mockResolvedValue("success");

      await withRetry(fn, {
        maxRetries: 3,
        initialDelayMs: 100,
        backoffMultiplier: 2,
        jitter: false, // Disable jitter for predictable testing
      });

      // First retry: 100 * 2^0 = 100
      // Second retry: 100 * 2^1 = 200
      expect(delays[0]).toBe(100);
      expect(delays[1]).toBe(200);

      vi.restoreAllMocks();
    });

    it("respects maxDelayMs", async () => {
      const delays: number[] = [];
      const originalSetTimeout = global.setTimeout;
      
      vi.spyOn(global, "setTimeout").mockImplementation((fn, delay) => {
        delays.push(delay as number);
        return originalSetTimeout(fn, 0);
      });

      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error("rate limit"))
        .mockRejectedValueOnce(new Error("rate limit"))
        .mockRejectedValueOnce(new Error("rate limit"))
        .mockResolvedValue("success");

      await withRetry(fn, {
        maxRetries: 4,
        initialDelayMs: 1000,
        maxDelayMs: 1500,
        backoffMultiplier: 2,
        jitter: false,
      });

      // Should be capped at maxDelayMs
      expect(Math.max(...delays)).toBeLessThanOrEqual(1500);

      vi.restoreAllMocks();
    });
  });
});

// ===========================================
// createRetryable Tests
// ===========================================

describe("createRetryable", () => {
  it("wraps a function with retry logic", async () => {
    const originalFn = vi
      .fn()
      .mockRejectedValueOnce(new Error("Connection timeout"))
      .mockResolvedValue("success");

    const retryableFn = createRetryable(originalFn, {
      maxRetries: 2,
      initialDelayMs: 10,
    });

    const result = await retryableFn("arg1", "arg2");

    expect(result).toBe("success");
    expect(originalFn).toHaveBeenCalledTimes(2);
    expect(originalFn).toHaveBeenCalledWith("arg1", "arg2");
  });

  it("preserves function arguments", async () => {
    const originalFn = vi.fn().mockResolvedValue("result");

    const retryableFn = createRetryable(originalFn, { maxRetries: 1 });

    await retryableFn({ complex: "object" }, [1, 2, 3], "string");

    expect(originalFn).toHaveBeenCalledWith(
      { complex: "object" },
      [1, 2, 3],
      "string"
    );
  });
});

// ===========================================
// getRetryAfterMs Tests
// ===========================================

describe("getRetryAfterMs", () => {
  it("extracts retry-after header in seconds", () => {
    const error = Object.assign(new Error("Rate limited"), {
      headers: { "retry-after": "30" },
    });

    const result = getRetryAfterMs(error);

    expect(result).toBe(30000); // 30 seconds in ms
  });

  it("returns null when no headers", () => {
    const error = new Error("Rate limited");

    const result = getRetryAfterMs(error);

    expect(result).toBeNull();
  });

  it("returns null when no retry-after header", () => {
    const error = Object.assign(new Error("Rate limited"), {
      headers: { "content-type": "application/json" },
    });

    const result = getRetryAfterMs(error);

    expect(result).toBeNull();
  });

  it("returns null for non-numeric retry-after", () => {
    const error = Object.assign(new Error("Rate limited"), {
      headers: { "retry-after": "invalid" },
    });

    const result = getRetryAfterMs(error);

    expect(result).toBeNull();
  });
});
