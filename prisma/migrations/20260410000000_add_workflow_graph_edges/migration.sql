-- Add canvas position to workflow steps (for graph layout)
ALTER TABLE "workflow_steps" ADD COLUMN "position_x" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "workflow_steps" ADD COLUMN "position_y" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Create workflow edges table (graph connections between nodes)
CREATE TABLE "workflow_edges" (
    "id" TEXT NOT NULL,
    "workflow_id" TEXT NOT NULL,
    "source_step_id" TEXT,
    "target_step_id" TEXT NOT NULL,
    "source_port" TEXT NOT NULL DEFAULT 'output',
    "target_port" TEXT NOT NULL DEFAULT 'input',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_edges_pkey" PRIMARY KEY ("id")
);

-- Add step_id to workflow_step_runs (graph-based tracking)
ALTER TABLE "workflow_step_runs" ADD COLUMN "step_id" TEXT;

-- Indexes for workflow_edges
CREATE INDEX "workflow_edges_workflow_id_idx" ON "workflow_edges"("workflow_id");
CREATE INDEX "workflow_edges_source_step_id_idx" ON "workflow_edges"("source_step_id");
CREATE INDEX "workflow_edges_target_step_id_idx" ON "workflow_edges"("target_step_id");

-- Index for step_id in step_runs
CREATE INDEX "workflow_step_runs_step_id_idx" ON "workflow_step_runs"("step_id");

-- Unique constraint: no duplicate edges
CREATE UNIQUE INDEX "workflow_edges_workflow_id_source_step_id_target_step_id_sou_key" ON "workflow_edges"("workflow_id", "source_step_id", "target_step_id", "source_port", "target_port");

-- Foreign keys
ALTER TABLE "workflow_edges" ADD CONSTRAINT "workflow_edges_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workflow_edges" ADD CONSTRAINT "workflow_edges_source_step_id_fkey" FOREIGN KEY ("source_step_id") REFERENCES "workflow_steps"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workflow_edges" ADD CONSTRAINT "workflow_edges_target_step_id_fkey" FOREIGN KEY ("target_step_id") REFERENCES "workflow_steps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Migrate existing linear workflows to graph edges:
-- For each workflow, create edges: trigger→step0, step0→step1, step1→step2, etc.
-- Also set position_x based on step order (horizontal layout)

-- Set positions for existing steps
UPDATE "workflow_steps" SET 
  "position_x" = 600.0 + ("order" * 560.0),
  "position_y" = 60.0;

-- Create trigger→first-step edges
INSERT INTO "workflow_edges" ("id", "workflow_id", "source_step_id", "target_step_id", "source_port", "target_port")
SELECT 
  'edge_trig_' || ws."id",
  ws."workflow_id",
  NULL,
  ws."id",
  'output',
  'input'
FROM "workflow_steps" ws
WHERE ws."order" = 0;

-- Create step→next-step edges (for multi-step workflows)
INSERT INTO "workflow_edges" ("id", "workflow_id", "source_step_id", "target_step_id", "source_port", "target_port")
SELECT 
  'edge_' || src."id" || '_' || tgt."id",
  src."workflow_id",
  src."id",
  tgt."id",
  'output',
  'input'
FROM "workflow_steps" src
JOIN "workflow_steps" tgt 
  ON src."workflow_id" = tgt."workflow_id" 
  AND tgt."order" = src."order" + 1;
