/**
 * AI Response Caching Service
 *
 * Semantic caching for AI responses using Redis.
 * Dramatically reduces costs by returning cached responses for similar queries.
 *
 * Cost Savings Example:
 * - 100 users ask "Hello" = 100 OpenAI calls = $$$
 * - With cache: 1 OpenAI call + 99 cache hits = $0.00 for 99 requests
 *
 * Cache Key Strategy:
 * - System-only queries (no user context): model + hash (shared across users)
 * - Conversation-specific: model + conversationId + hash (isolated per conversation)
 *
 * @module modules/2bot-ai-provider/ai-cache.service
 */

import { logger } from "@/lib/logger";
import { redis } from "@/lib/redis";
import crypto from "crypto";

const log = logger.child({ module: "ai-cache" });

// Cache TTL in seconds (1 hour default)
const DEFAULT_CACHE_TTL = 3600;

// Cache key prefix
const CACHE_PREFIX = "2bot:ai:cache";

/**
 * Generate a hash for the prompt/messages
 * Uses SHA-256 for consistent, fast hashing
 */
function hashPrompt(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex").slice(0, 16);
}

/**
 * Normalize messages to a consistent string for hashing
 * @param messages - The conversation messages
 * @returns Normalized string for cache key generation
 */
function normalizeMessages(messages: Array<{ role: string; content: string }>): string {
  // Only use the last few messages for cache key (context window)
  const recentMessages = messages.slice(-5);
  return recentMessages
    .map((m) => {
      // 1. Lowercase and trim
      let content = (m.content || "").toLowerCase().trim();
      // 2. Remove common trailing punctuation (improves hit rate for "hello." vs "hello")
      content = content.replace(/[.,!?]+$/, "");
      return `${m.role}:${content}`;
    })
    .join("|");
}

/**
 * Build cache key with optional conversation isolation
 * @param model - The AI model used
 * @param hash - The message hash
 * @param conversationId - Optional conversation ID for isolation
 * @returns The cache key
 */
function buildCacheKey(model: string, hash: string, conversationId?: string): string {
  if (conversationId) {
    // Conversation-specific cache (isolated per conversation)
    return `${CACHE_PREFIX}:conv:${conversationId}:${model}:${hash}`;
  }
  // Shared cache (for system-only queries, stateless interactions)
  return `${CACHE_PREFIX}:shared:${model}:${hash}`;
}

/**
 * Check if a query is cacheable
 * Some queries shouldn't be cached (e.g., very long, time-sensitive)
 */
function isCacheable(messages: Array<{ role: string; content: string }>): boolean {
  const lastMessage = messages[messages.length - 1];
  if (!lastMessage) return false;

  const content = lastMessage.content.toLowerCase();

  // Don't cache if:
  // - Too short (likely incomplete)
  if (content.length < 3) return false;
  // - Too long (likely unique/specific)
  if (content.length > 500) return false;
  // - Contains time-sensitive keywords
  const timeSensitive = ["now", "today", "current", "latest", "время", "сегодня", "hozir", "bugun"];
  if (timeSensitive.some((word) => content.includes(word))) return false;
  // - Looks like a code request with specific variables
  if (content.includes("my code") || content.includes("this code")) return false;

  return true;
}

/**
 * AI Cache Service
 */
export const aiCacheService = {
  /**
   * Try to get cached response
   *
   * @param model - The AI model used
   * @param messages - The conversation messages
   * @param conversationId - Optional conversation ID for cache isolation
   * @returns Cached response or null
   */
  async get(
    model: string,
    messages: Array<{ role: string; content: string }>,
    conversationId?: string
  ): Promise<string | null> {
    if (!isCacheable(messages)) {
      return null;
    }

    try {
      const normalized = normalizeMessages(messages);
      const hash = hashPrompt(normalized);
      const cacheKey = buildCacheKey(model, hash, conversationId);

      const cached = await redis.get(cacheKey);

      if (cached) {
        log.info(
          { model, hash, conversationId: conversationId?.slice(0, 8) || "shared" },
          "AI cache hit - $0.00 cost!"
        );
        return cached;
      }

      log.debug(
        { model, hash, conversationId: conversationId?.slice(0, 8) || "shared" },
        "AI cache miss"
      );
      return null;
    } catch (error) {
      log.error({ error }, "AI cache get error");
      return null;
    }
  },

  /**
   * Store response in cache
   *
   * @param model - The AI model used
   * @param messages - The conversation messages
   * @param response - The AI response to cache
   * @param options - Cache options (ttl, conversationId)
   */
  async set(
    model: string,
    messages: Array<{ role: string; content: string }>,
    response: string,
    options: { ttl?: number; conversationId?: string } = {}
  ): Promise<void> {
    const { ttl = DEFAULT_CACHE_TTL, conversationId } = options;

    if (!isCacheable(messages)) {
      return;
    }

    try {
      const normalized = normalizeMessages(messages);
      const hash = hashPrompt(normalized);
      const cacheKey = buildCacheKey(model, hash, conversationId);

      await redis.set(cacheKey, response, "EX", ttl);

      log.info(
        { model, hash, ttl, conversationId: conversationId?.slice(0, 8) || "shared" },
        "AI response cached"
      );
    } catch (error) {
      log.error({ error }, "AI cache set error");
    }
  },

  /**
   * Clear cache for a specific model (both shared and conversation-specific)
   */
  async clearModel(model: string): Promise<number> {
    try {
      // Clear both shared and conversation-specific caches
      const sharedPattern = `${CACHE_PREFIX}:shared:${model}:*`;
      const convPattern = `${CACHE_PREFIX}:conv:*:${model}:*`;

      const [sharedKeys, convKeys] = await Promise.all([
        redis.keys(sharedPattern),
        redis.keys(convPattern),
      ]);

      const allKeys = [...sharedKeys, ...convKeys];
      if (allKeys.length > 0) {
        await redis.del(...allKeys);
      }
      log.info({ model, keysCleared: allKeys.length }, "AI cache cleared for model");
      return allKeys.length;
    } catch (error) {
      log.error({ error }, "AI cache clear error");
      return 0;
    }
  },

  /**
   * Clear cache for a specific conversation
   */
  async clearConversation(conversationId: string): Promise<number> {
    try {
      const pattern = `${CACHE_PREFIX}:conv:${conversationId}:*`;
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
      log.info({ conversationId: conversationId.slice(0, 8), keysCleared: keys.length }, "AI cache cleared for conversation");
      return keys.length;
    } catch (error) {
      log.error({ error }, "AI cache clear conversation error");
      return 0;
    }
  },

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{ totalKeys: number; memoryUsed: string }> {
    try {
      const pattern = `${CACHE_PREFIX}:*`;
      const keys = await redis.keys(pattern);
      const info = await redis.info("memory");
      const memoryMatch = info.match(/used_memory_human:([^\r\n]+)/);

      return {
        totalKeys: keys.length,
        memoryUsed: memoryMatch?.[1] || "unknown",
      };
    } catch (error) {
      log.error({ error }, "AI cache stats error");
      return { totalKeys: 0, memoryUsed: "error" };
    }
  },
};
