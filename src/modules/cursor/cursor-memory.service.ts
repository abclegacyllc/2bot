/**
 * Cursor Agent Memory Service
 *
 * Chat-thread-scoped freeform memory for the AI agent. The agent can save
 * important discoveries within a chat session and recall them during that
 * same session. Memories are scoped to chatThreadId (the frontend's
 * activeSessionId) — a fresh chat always starts with a clean slate.
 *
 * Uses the same caching pattern as cursor-preferences.service.ts.
 *
 * @module modules/cursor/cursor-memory.service
 */

import { prisma } from "@/lib/prisma";

const MAX_MEMORIES = 20;
const MAX_CONTENT_LENGTH = 2000;
const MAX_KEY_LENGTH = 80;

// Cache key = `${userId}:${chatThreadId}`
const memoryCache = new Map<string, { data: MemoryEntry[]; expiry: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface MemoryEntry {
  key: string;
  content: string;
  updatedAt: Date;
}

function cacheKey(userId: string, chatThreadId: string): string {
  return `${userId}:${chatThreadId}`;
}

/**
 * Get all memories for a user+thread (cached).
 */
export async function getAgentMemories(userId: string, chatThreadId: string): Promise<MemoryEntry[]> {
  const ck = cacheKey(userId, chatThreadId);
  const cached = memoryCache.get(ck);
  if (cached && cached.expiry > Date.now()) {
    return cached.data;
  }

  const memories = await prisma.cursorAgentMemory.findMany({
    where: { userId, chatThreadId },
    orderBy: { updatedAt: "desc" },
    take: MAX_MEMORIES,
    select: { key: true, content: true, updatedAt: true },
  });

  memoryCache.set(ck, { data: memories, expiry: Date.now() + CACHE_TTL_MS });
  return memories;
}

/**
 * Format memories for prompt injection (only for the current chat thread).
 */
export async function getFormattedMemories(userId: string, chatThreadId: string): Promise<string | null> {
  const memories = await getAgentMemories(userId, chatThreadId);
  if (memories.length === 0) return null;

  return memories
    .map((m) => `- **${m.key}**: ${m.content}`)
    .join("\n");
}

/**
 * Get a single memory by key within the current chat thread.
 */
export async function getMemoryByKey(userId: string, chatThreadId: string, key: string): Promise<string | null> {
  const memories = await getAgentMemories(userId, chatThreadId);
  const match = memories.find((m) => m.key === key);
  return match?.content ?? null;
}

/**
 * Write (upsert) a memory scoped to the current chat thread.
 * Enforces max entries and content length per thread.
 */
export async function writeMemory(
  userId: string,
  chatThreadId: string,
  key: string,
  content: string,
): Promise<{ success: boolean; message: string }> {
  const sanitizedKey = key.trim().slice(0, MAX_KEY_LENGTH).toLowerCase().replace(/[^a-z0-9-_ ]/g, "");
  if (!sanitizedKey) {
    return { success: false, message: "Invalid key: must contain alphanumeric characters, hyphens, or underscores." };
  }
  const truncatedContent = content.slice(0, MAX_CONTENT_LENGTH);

  // Check if this thread already has a record for this key
  const existing = await prisma.cursorAgentMemory.findUnique({
    where: { userId_chatThreadId_key: { userId, chatThreadId, key: sanitizedKey } },
  });

  if (!existing) {
    const count = await prisma.cursorAgentMemory.count({ where: { userId, chatThreadId } });
    if (count >= MAX_MEMORIES) {
      // Delete oldest memory in this thread to make room
      const oldest = await prisma.cursorAgentMemory.findFirst({
        where: { userId, chatThreadId },
        orderBy: { updatedAt: "asc" },
      });
      if (oldest) {
        await prisma.cursorAgentMemory.delete({ where: { id: oldest.id } });
      }
    }
  }

  await prisma.cursorAgentMemory.upsert({
    where: { userId_chatThreadId_key: { userId, chatThreadId, key: sanitizedKey } },
    update: { content: truncatedContent },
    create: { userId, chatThreadId, key: sanitizedKey, content: truncatedContent },
  });

  // Invalidate cache for this thread
  memoryCache.delete(cacheKey(userId, chatThreadId));

  return {
    success: true,
    message: existing
      ? `Memory "${sanitizedKey}" updated (${truncatedContent.length} chars).`
      : `Memory "${sanitizedKey}" saved (${truncatedContent.length} chars).`,
  };
}

/**
 * Delete a memory by key within the current chat thread.
 */
export async function deleteMemory(
  userId: string,
  chatThreadId: string,
  key: string,
): Promise<{ success: boolean; message: string }> {
  try {
    await prisma.cursorAgentMemory.delete({
      where: { userId_chatThreadId_key: { userId, chatThreadId, key } },
    });
    memoryCache.delete(cacheKey(userId, chatThreadId));
    return { success: true, message: `Memory "${key}" deleted.` };
  } catch {
    return { success: false, message: `Memory "${key}" not found.` };
  }
}
