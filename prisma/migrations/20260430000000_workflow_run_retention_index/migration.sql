-- Phase 2.1: Composite index for fast "list runs of workflow X, newest first"
-- and for retention deletes by (workflowId, startedAt < cutoff).
-- Without this, large workflows degrade to sequential scans on workflow_runs.

CREATE INDEX IF NOT EXISTS "workflow_runs_workflow_id_started_at_idx"
  ON "workflow_runs" ("workflow_id", "started_at" DESC);

-- WorkflowStepRun deletes happen via ON DELETE CASCADE from WorkflowRun,
-- so no extra index needed there.
