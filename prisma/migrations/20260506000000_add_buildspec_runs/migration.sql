-- =============================================================================
-- AI BuildSpec async run persistence
--
-- Adds a `buildspec_runs` table tracking asynchronous applyBuildSpec
-- executions. Rows are inserted at enqueue time and updated by the BullMQ
-- worker as the run transitions QUEUED → RUNNING → APPLIED/ROLLED_BACK/...
-- The original spec, the BuildSpecApplyResult, and any exception narrative
-- are persisted so callers can poll status and replay/audit afterwards.
-- =============================================================================

CREATE TYPE "BuildSpecRunStatus" AS ENUM (
  'QUEUED',
  'RUNNING',
  'APPLIED',
  'ROLLED_BACK',
  'VALIDATION_FAILED',
  'FAILED'
);

CREATE TABLE "buildspec_runs" (
  "id"                          TEXT NOT NULL,
  "user_id"                     TEXT NOT NULL,
  "organization_id"             TEXT,
  "status"                      "BuildSpecRunStatus" NOT NULL DEFAULT 'QUEUED',
  "source"                      TEXT NOT NULL DEFAULT 'api',
  "dry_run"                     BOOLEAN NOT NULL DEFAULT false,
  "rollback_on_smoke_failure"   BOOLEAN NOT NULL DEFAULT true,
  "spec"                        JSONB NOT NULL,
  "result"                      JSONB,
  "project_id"                  TEXT,
  "error"                       TEXT,
  "started_at"                  TIMESTAMP(3),
  "completed_at"                TIMESTAMP(3),
  "created_at"                  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"                  TIMESTAMP(3) NOT NULL,

  CONSTRAINT "buildspec_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "buildspec_runs_user_id_organization_id_idx"
  ON "buildspec_runs" ("user_id", "organization_id");
CREATE INDEX "buildspec_runs_status_idx"
  ON "buildspec_runs" ("status");
CREATE INDEX "buildspec_runs_created_at_idx"
  ON "buildspec_runs" ("created_at");

ALTER TABLE "buildspec_runs"
  ADD CONSTRAINT "buildspec_runs_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "buildspec_runs"
  ADD CONSTRAINT "buildspec_runs_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
