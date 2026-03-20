-- Bot-Centric Plugin Pipeline: Add BOT_MESSAGE trigger type + gateway mode
-- Phase 1 of Plugin Pipeline Architecture Fix

-- Step 1: Add BOT_MESSAGE to WorkflowTriggerType enum
ALTER TYPE "WorkflowTriggerType" ADD VALUE IF NOT EXISTS 'BOT_MESSAGE';

-- Step 2: Add mode column to gateways (default "plugin" for existing bots)
ALTER TABLE "gateways" ADD COLUMN IF NOT EXISTS "mode" TEXT NOT NULL DEFAULT 'plugin';

-- Step 3: Migrate existing platform-specific triggers to BOT_MESSAGE
-- All gateway-bound message triggers become the unified BOT_MESSAGE type
UPDATE "workflows"
SET "triggerType" = 'BOT_MESSAGE'::"WorkflowTriggerType"
WHERE "triggerType" IN ('TELEGRAM_MESSAGE', 'DISCORD_MESSAGE', 'SLACK_MESSAGE', 'WHATSAPP_MESSAGE')
  AND "gateway_id" IS NOT NULL;

-- Step 4: Auto-set gateway mode to "workflow" for gateways that already have workflows with steps
UPDATE "gateways" g
SET "mode" = 'workflow'
WHERE EXISTS (
  SELECT 1 FROM "workflows" w
  JOIN "workflow_steps" ws ON ws."workflow_id" = w."id"
  WHERE w."gateway_id" = g."id"
    AND w."status" IN ('ACTIVE', 'DRAFT')
);

-- Step 5: Add composite index for workflow trigger matching (performance critical)
CREATE INDEX IF NOT EXISTS "workflows_user_gateway_trigger_status_enabled_idx"
ON "workflows" ("user_id", "gateway_id", "triggerType", "status", "is_enabled");
