/**
 * AI Cache Service Tests
 *
 * Tests for semantic caching functionality.
 * Uses mocked Redis to test cache logic without actual Redis connection.
 *
 * @module modules/2bot-ai-provider/__tests__/ai-cache.test
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock Redis before importing the module
vi.mock("@/lib/redis", () => ({
  redis: {
    get: vi.fn(),
    set: vi.fn(),
    keys: vi.fn(),
    del: vi.fn(),
    dbsize: vi.fn(),
  },
}));

// Import after mocking
import { redis } from "@/lib/redis";
import { aiCacheService } from "../ai-cache.service";

// ===========================================
// Test Helpers
// ===========================================

const mockRedis = redis as unknown as {
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  keys: ReturnType<typeof vi.fn>;
  del: ReturnType<typeof vi.fn>;
  dbsize: ReturnType<typeof vi.fn>;
};

function createMessages(content: string): Array<{ role: string; content: string }> {
  return [{ role: "user", content }];
}

// ===========================================
// aiCacheService.get Tests
// ===========================================

describe("aiCacheService.get", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns cached response when available", async () => {
    mockRedis.get.mockResolvedValue("Hello there! How can I help you?");

    const result = await aiCacheService.get("gpt-4o-mini", createMessages("hello"));

    expect(result).toBe("Hello there! How can I help you?");
    expect(mockRedis.get).toHaveBeenCalledTimes(1);
  });

  it("returns null on cache miss", async () => {
    mockRedis.get.mockResolvedValue(null);

    const result = await aiCacheService.get("gpt-4o-mini", createMessages("hello"));

    expect(result).toBeNull();
  });

  it("returns null for non-cacheable messages (too short)", async () => {
    const result = await aiCacheService.get("gpt-4o-mini", createMessages("hi"));

    expect(result).toBeNull();
    expect(mockRedis.get).not.toHaveBeenCalled();
  });

  it("returns null for non-cacheable messages (too long)", async () => {
    const longMessage = "a".repeat(600);
    const result = await aiCacheService.get("gpt-4o-mini", createMessages(longMessage));

    expect(result).toBeNull();
    expect(mockRedis.get).not.toHaveBeenCalled();
  });

  it("returns null for time-sensitive queries", async () => {
    const timeSensitiveMessages = [
      "What time is it now?",
      "What's happening today?",
      "What is the current weather?",
    ];

    for (const msg of timeSensitiveMessages) {
      const result = await aiCacheService.get("gpt-4o-mini", createMessages(msg));
      expect(result).toBeNull();
    }
    expect(mockRedis.get).not.toHaveBeenCalled();
  });

  it("includes conversationId in cache key when provided", async () => {
    mockRedis.get.mockResolvedValue(null);

    await aiCacheService.get("gpt-4o-mini", createMessages("hello"), "conv-123");

    expect(mockRedis.get).toHaveBeenCalledWith(
      expect.stringContaining("conv:conv-123")
    );
  });

  it("uses shared cache when no conversationId", async () => {
    mockRedis.get.mockResolvedValue(null);

    await aiCacheService.get("gpt-4o-mini", createMessages("hello"));

    expect(mockRedis.get).toHaveBeenCalledWith(
      expect.stringContaining(":shared:")
    );
  });

  it("handles Redis errors gracefully", async () => {
    mockRedis.get.mockRejectedValue(new Error("Redis connection failed"));

    const result = await aiCacheService.get("gpt-4o-mini", createMessages("hello"));

    expect(result).toBeNull();
  });
});

// ===========================================
// aiCacheService.set Tests
// ===========================================

describe("aiCacheService.set", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("stores response in cache", async () => {
    mockRedis.set.mockResolvedValue("OK");

    await aiCacheService.set(
      "gpt-4o-mini",
      createMessages("hello"),
      "Hello! How can I help?",
      {}
    );

    expect(mockRedis.set).toHaveBeenCalledTimes(1);
    expect(mockRedis.set).toHaveBeenCalledWith(
      expect.stringContaining("2bot:ai:cache"),
      "Hello! How can I help?",
      "EX",
      expect.any(Number)
    );
  });

  it("uses custom TTL when provided", async () => {
    mockRedis.set.mockResolvedValue("OK");

    await aiCacheService.set(
      "gpt-4o-mini",
      createMessages("hello"),
      "Response",
      { ttl: 7200 }
    );

    expect(mockRedis.set).toHaveBeenCalledWith(
      expect.any(String),
      "Response",
      "EX",
      7200
    );
  });

  it("uses default TTL when not provided", async () => {
    mockRedis.set.mockResolvedValue("OK");

    await aiCacheService.set(
      "gpt-4o-mini",
      createMessages("hello"),
      "Response"
    );

    expect(mockRedis.set).toHaveBeenCalledWith(
      expect.any(String),
      "Response",
      "EX",
      3600 // Default 1 hour
    );
  });

  it("includes conversationId in cache key", async () => {
    mockRedis.set.mockResolvedValue("OK");

    await aiCacheService.set(
      "gpt-4o-mini",
      createMessages("hello"),
      "Response",
      { conversationId: "conv-456" }
    );

    expect(mockRedis.set).toHaveBeenCalledWith(
      expect.stringContaining("conv:conv-456"),
      expect.any(String),
      "EX",
      expect.any(Number)
    );
  });

  it("does not cache non-cacheable messages", async () => {
    await aiCacheService.set("gpt-4o-mini", createMessages("hi"), "Response");

    expect(mockRedis.set).not.toHaveBeenCalled();
  });

  it("handles Redis errors gracefully", async () => {
    mockRedis.set.mockRejectedValue(new Error("Redis connection failed"));

    // Should not throw
    await expect(
      aiCacheService.set("gpt-4o-mini", createMessages("hello"), "Response")
    ).resolves.not.toThrow();
  });
});

// ===========================================
// aiCacheService.clearModel Tests
// ===========================================

describe("aiCacheService.clearModel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("clears all cache entries for a model", async () => {
    mockRedis.keys.mockResolvedValue([
      "2bot:ai:cache:shared:gpt-4o-mini:abc123",
      "2bot:ai:cache:shared:gpt-4o-mini:def456",
    ]);
    mockRedis.del.mockResolvedValue(2);

    const count = await aiCacheService.clearModel("gpt-4o-mini");

    expect(count).toBeGreaterThanOrEqual(0);
    expect(mockRedis.keys).toHaveBeenCalled();
  });

  it("returns 0 when no keys found", async () => {
    mockRedis.keys.mockResolvedValue([]);

    const count = await aiCacheService.clearModel("nonexistent-model");

    expect(count).toBe(0);
    expect(mockRedis.del).not.toHaveBeenCalled();
  });
});

// ===========================================
// aiCacheService.clearConversation Tests
// ===========================================

describe("aiCacheService.clearConversation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("clears all cache entries for a conversation", async () => {
    mockRedis.keys.mockResolvedValue([
      "2bot:ai:cache:conv:conv-123:gpt-4o-mini:abc",
    ]);
    mockRedis.del.mockResolvedValue(1);

    const count = await aiCacheService.clearConversation("conv-123");

    expect(mockRedis.keys).toHaveBeenCalledWith(
      expect.stringContaining("conv:conv-123")
    );
    expect(count).toBeGreaterThanOrEqual(0);
  });
});

// ===========================================
// Cache Key Normalization Tests
// ===========================================

describe("cache key normalization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRedis.get.mockResolvedValue(null);
  });

  it("generates same key for similar messages", async () => {
    const calls: string[] = [];
    mockRedis.get.mockImplementation((key: string) => {
      calls.push(key);
      return Promise.resolve(null);
    });

    // These should generate the same cache key
    await aiCacheService.get("gpt-4o-mini", createMessages("Hello"));
    await aiCacheService.get("gpt-4o-mini", createMessages("hello"));
    await aiCacheService.get("gpt-4o-mini", createMessages("HELLO"));

    // All calls should use the same normalized key
    expect(calls[0]).toBe(calls[1]);
    expect(calls[1]).toBe(calls[2]);
  });

  it("generates same key with trailing punctuation variations", async () => {
    const calls: string[] = [];
    mockRedis.get.mockImplementation((key: string) => {
      calls.push(key);
      return Promise.resolve(null);
    });

    await aiCacheService.get("gpt-4o-mini", createMessages("hello"));
    await aiCacheService.get("gpt-4o-mini", createMessages("hello."));
    await aiCacheService.get("gpt-4o-mini", createMessages("hello!"));

    // All should match due to punctuation normalization
    expect(calls[0]).toBe(calls[1]);
    expect(calls[1]).toBe(calls[2]);
  });

  it("generates different keys for different models", async () => {
    const calls: string[] = [];
    mockRedis.get.mockImplementation((key: string) => {
      calls.push(key);
      return Promise.resolve(null);
    });

    await aiCacheService.get("gpt-4o-mini", createMessages("hello"));
    await aiCacheService.get("gpt-4o", createMessages("hello"));

    // Different models should have different keys
    expect(calls[0]).not.toBe(calls[1]);
  });
});
