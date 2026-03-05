-- AlterTable
ALTER TABLE "workspace_egress_logs" ADD COLUMN     "direction" TEXT NOT NULL DEFAULT 'OUTBOUND',
ADD COLUMN     "plugin_file" TEXT,
ADD COLUMN     "source_type" TEXT;

-- CreateIndex
CREATE INDEX "workspace_egress_logs_direction_container_id_timestamp_idx" ON "workspace_egress_logs"("direction", "container_id", "timestamp");
