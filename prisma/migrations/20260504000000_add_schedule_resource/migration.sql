-- Phase 7.4: SCHEDULE ProjectResource sidecar.
-- Cron-driven trigger that fires a target Workflow on a schedule.

CREATE TABLE "schedules" (
  "id"                 TEXT          NOT NULL,
  "resource_id"        TEXT          NOT NULL,
  "cron"               TEXT          NOT NULL,
  "timezone"           TEXT,
  "target_workflow_id" TEXT,
  "enabled"            BOOLEAN       NOT NULL DEFAULT true,
  "last_fired_at"      TIMESTAMP(3),
  "next_fire_at"       TIMESTAMP(3),
  "created_at"         TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"         TIMESTAMP(3)  NOT NULL,

  CONSTRAINT "schedules_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "schedules_resource_id_key"        ON "schedules" ("resource_id");
CREATE INDEX        "schedules_target_workflow_id_idx" ON "schedules" ("target_workflow_id");
CREATE INDEX        "schedules_enabled_next_fire_at_idx" ON "schedules" ("enabled", "next_fire_at");

ALTER TABLE "schedules"
  ADD CONSTRAINT "schedules_resource_id_fkey"
  FOREIGN KEY ("resource_id") REFERENCES "project_resources"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "schedules"
  ADD CONSTRAINT "schedules_target_workflow_id_fkey"
  FOREIGN KEY ("target_workflow_id") REFERENCES "workflows"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
