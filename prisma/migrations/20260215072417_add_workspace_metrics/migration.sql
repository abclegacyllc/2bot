-- CreateTable
CREATE TABLE "workspace_metrics" (
    "id" TEXT NOT NULL,
    "container_id" TEXT NOT NULL,
    "memory_used_mb" DOUBLE PRECISION NOT NULL,
    "memory_percent" DOUBLE PRECISION NOT NULL,
    "cpu_percent" DOUBLE PRECISION NOT NULL,
    "disk_used_mb" DOUBLE PRECISION NOT NULL,
    "disk_percent" DOUBLE PRECISION NOT NULL,
    "running_plugins" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "workspace_metrics_container_id_created_at_idx" ON "workspace_metrics"("container_id", "created_at");

-- CreateIndex
CREATE INDEX "workspace_metrics_created_at_idx" ON "workspace_metrics"("created_at");
