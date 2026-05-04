-- Phase 7.3c: HTTP_ROUTE → Workflow target.
-- Allow an HttpRoute to fire a WEBHOOK-triggered Workflow run instead of
-- (or alongside the configurable absence of) a UserPlugin handler.

ALTER TABLE "http_routes"
  ADD COLUMN "target_workflow_id" TEXT;

CREATE INDEX "http_routes_target_workflow_id_idx"
  ON "http_routes" ("target_workflow_id");

ALTER TABLE "http_routes"
  ADD CONSTRAINT "http_routes_target_workflow_id_fkey"
  FOREIGN KEY ("target_workflow_id")
  REFERENCES "workflows"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
