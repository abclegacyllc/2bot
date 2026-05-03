-- Phase 7: provenance for workspace_allowed_domains entries.
-- "user"     -> manually added via Settings UI
-- "ai-agent" -> added by a Cursor agent tool call (request_domain_allowlist)
--               after explicit user confirmation in chat. Logged for admin audit.
ALTER TABLE "workspace_allowed_domains"
  ADD COLUMN IF NOT EXISTS "added_by" TEXT NOT NULL DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS "added_by_session_id" TEXT;
