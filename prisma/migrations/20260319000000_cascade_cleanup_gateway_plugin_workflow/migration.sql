-- Workflow: Add onDelete SetNull for gateway reference
ALTER TABLE "workflows" DROP CONSTRAINT IF EXISTS "workflows_gateway_id_fkey";
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_gateway_id_fkey"
  FOREIGN KEY ("gateway_id") REFERENCES "gateways"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- WorkflowStep: Add onDelete SetNull for gateway reference
ALTER TABLE "workflow_steps" DROP CONSTRAINT IF EXISTS "workflow_steps_gateway_id_fkey";
ALTER TABLE "workflow_steps" ADD CONSTRAINT "workflow_steps_gateway_id_fkey"
  FOREIGN KEY ("gateway_id") REFERENCES "gateways"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- WorkflowStep: Add onDelete Cascade for plugin reference (deleting plugin removes its steps)
ALTER TABLE "workflow_steps" DROP CONSTRAINT IF EXISTS "workflow_steps_plugin_id_fkey";
ALTER TABLE "workflow_steps" ADD CONSTRAINT "workflow_steps_plugin_id_fkey"
  FOREIGN KEY ("plugin_id") REFERENCES "plugins"("id") ON DELETE CASCADE ON UPDATE CASCADE;
