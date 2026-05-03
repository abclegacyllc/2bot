-- Phase 5.3: Idle workspace container suspend (pause)
--
-- Adds a PAUSED state to ContainerStatus and an `auto_suspend_minutes`
-- column. PAUSED is a freezer-cgroup pause (Docker pause/unpause),
-- distinct from STOPPED. Resume is instant; memory state is preserved.
--
-- Tier:
--   RUNNING -> PAUSED   (after auto_suspend_minutes idle)
--   PAUSED  -> STOPPED  (after auto_stop_minutes idle, existing behavior)
--   PAUSED  -> RUNNING  (on next bridge dispatch via ensureRunning)

ALTER TYPE "ContainerStatus" ADD VALUE IF NOT EXISTS 'PAUSED';

ALTER TABLE "workspace_containers"
  ADD COLUMN IF NOT EXISTS "auto_suspend_minutes" INTEGER;

-- Index for the suspend-cron sweep: "find RUNNING containers idle > N min".
CREATE INDEX IF NOT EXISTS "workspace_containers_status_last_activity_at_idx"
  ON "workspace_containers" ("status", "last_activity_at");
