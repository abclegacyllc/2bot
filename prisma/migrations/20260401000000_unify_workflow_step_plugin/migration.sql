-- Phase 1: Unified Workflow Engine
-- Absorb UserPlugin fields into WorkflowStep so each step is self-contained.
-- user_plugins table is preserved (soft-deprecated) for backward compatibility.

-- 1. Add new columns to workflow_steps (IF NOT EXISTS for idempotency)
ALTER TABLE "workflow_steps" ADD COLUMN IF NOT EXISTS "entry_file" VARCHAR(500);
ALTER TABLE "workflow_steps" ADD COLUMN IF NOT EXISTS "storage_quota_mb" INTEGER NOT NULL DEFAULT 50;
ALTER TABLE "workflow_steps" ADD COLUMN IF NOT EXISTS "user_plugin_id" TEXT;
ALTER TABLE "workflow_steps" ADD COLUMN IF NOT EXISTS "execution_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "workflow_steps" ADD COLUMN IF NOT EXISTS "last_executed_at" TIMESTAMP(3);
ALTER TABLE "workflow_steps" ADD COLUMN IF NOT EXISTS "last_error" TEXT;

-- 2. Copy data from user_plugins into matching workflow_steps.
--    Match by pluginId + gatewayId (workflow step's gateway override OR workflow's default gateway).
--    Uses comma-separated FROM (PostgreSQL UPDATE...FROM cannot JOIN against target table).
UPDATE "workflow_steps"
SET
  "entry_file"       = up."entry_file",
  "storage_quota_mb" = up."storage_quota_mb",
  "user_plugin_id"   = up."id",
  "execution_count"  = up."execution_count",
  "last_executed_at" = up."last_executed_at",
  "last_error"       = up."last_error"
FROM "user_plugins" up, "workflows" w
WHERE w."id" = "workflow_steps"."workflow_id"
  AND up."plugin_id" = "workflow_steps"."plugin_id"
  AND up."user_id" = w."user_id"
  AND (up."organization_id" IS NOT DISTINCT FROM w."organization_id")
  AND (
    -- Match on step-level gateway override
    ("workflow_steps"."gateway_id" IS NOT NULL AND up."gateway_id" = "workflow_steps"."gateway_id")
    OR
    -- Match on workflow's default gateway when step has no override
    ("workflow_steps"."gateway_id" IS NULL AND up."gateway_id" = w."gateway_id")
  );
