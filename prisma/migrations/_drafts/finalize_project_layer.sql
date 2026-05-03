-- Phase 6.2 Wave 2: Finalize project layer
--
-- ⚠️  PREPARED — DO NOT APPLY YET.
-- This migration is stored under `_drafts/` so Prisma does NOT auto-run it.
-- Move to `prisma/migrations/<timestamp>_finalize_project_layer/migration.sql`
-- AND update `prisma/schema.prisma` (drop `?` on the listed fields, drop the
-- legacy `Workflow.gatewayId` column) ONLY after:
--
--   1. `scripts/backfill-project-id.ts` (or equivalent one-shot) has run in
--      production and `SELECT count(*) FROM <table> WHERE project_id IS NULL`
--      returns 0 for every table below.
--   2. All read paths fall back to `WorkflowGateway` and no caller still
--      reads `Workflow.gateway_id` (telemetry: `legacy_workflow_gateway_id_reads_total = 0`
--      for ≥ 72 h).
--   3. A logical Postgres backup has been captured (PITR window verified).
--
-- Run with `prisma migrate deploy` AFTER schema.prisma is updated to match.

BEGIN;

-- 1) Sanity guard — abort if any row is still missing a project_id.
DO $$
DECLARE
  bad_gateways      bigint;
  bad_workflows     bigint;
  bad_user_plugins  bigint;
BEGIN
  SELECT count(*) INTO bad_gateways      FROM "gateways"      WHERE "project_id" IS NULL;
  SELECT count(*) INTO bad_workflows     FROM "workflows"     WHERE "project_id" IS NULL;
  SELECT count(*) INTO bad_user_plugins  FROM "user_plugins"  WHERE "project_id" IS NULL;

  IF bad_gateways + bad_workflows + bad_user_plugins > 0 THEN
    RAISE EXCEPTION
      'Refusing to finalize project layer: gateways=%, workflows=%, user_plugins=% rows still have NULL project_id',
      bad_gateways, bad_workflows, bad_user_plugins;
  END IF;
END $$;

-- 2) Promote project_id to NOT NULL on the three resource tables.
ALTER TABLE "gateways"      ALTER COLUMN "project_id" SET NOT NULL;
ALTER TABLE "workflows"     ALTER COLUMN "project_id" SET NOT NULL;
ALTER TABLE "user_plugins"  ALTER COLUMN "project_id" SET NOT NULL;

-- 3) Drop the legacy `workflows.gateway_id` column. The replacement is the
--    M:N `workflow_gateways` link table (added in 20260501000000_add_project_layer).
--    All read paths must already prefer workflow_gateways before this runs.
ALTER TABLE "workflows" DROP CONSTRAINT IF EXISTS "workflows_gateway_id_fkey";
DROP INDEX IF EXISTS "workflows_gateway_id_idx";
ALTER TABLE "workflows" DROP COLUMN IF EXISTS "gateway_id";

COMMIT;

-- Rollback notes:
--   ALTER TABLE "gateways"     ALTER COLUMN "project_id" DROP NOT NULL;
--   ALTER TABLE "workflows"    ALTER COLUMN "project_id" DROP NOT NULL;
--   ALTER TABLE "user_plugins" ALTER COLUMN "project_id" DROP NOT NULL;
--   ALTER TABLE "workflows" ADD COLUMN "gateway_id" varchar(255);
--   (re-add FK and index from the prior migration if needed)
