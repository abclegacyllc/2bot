-- Migration: scope_agent_memory_to_chat_thread
--
-- Changes CursorAgentMemory from user-global to chat-thread-scoped.
-- Adds chat_thread_id column; old rows are deleted (they were keyed
-- globally per user and would incorrectly pollute new chat sessions).
-- The unique constraint changes from (user_id, key) to
-- (user_id, chat_thread_id, key).

-- Drop old constraint and index
DROP INDEX IF EXISTS "cursor_agent_memories_user_id_key_key";
DROP INDEX IF EXISTS "cursor_agent_memories_user_id_idx";

-- Remove all legacy cross-session memories (they have no valid chatThreadId
-- and would be orphaned; better to start clean than inject stale context).
DELETE FROM "cursor_agent_memories";

-- Add chat_thread_id column (non-null — all future rows must provide it)
ALTER TABLE "cursor_agent_memories"
  ADD COLUMN "chat_thread_id" TEXT NOT NULL;

-- New unique constraint: one memory key per (user, chat thread)
CREATE UNIQUE INDEX "cursor_agent_memories_user_id_chat_thread_id_key_key"
  ON "cursor_agent_memories"("user_id", "chat_thread_id", "key");

-- Index for fast lookups by user + thread
CREATE INDEX "cursor_agent_memories_user_id_chat_thread_id_idx"
  ON "cursor_agent_memories"("user_id", "chat_thread_id");
