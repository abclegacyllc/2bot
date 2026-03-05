-- CreateTable
CREATE TABLE "workspace_egress_logs" (
    "id" TEXT NOT NULL,
    "container_id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "domain" TEXT NOT NULL,
    "url" TEXT,
    "method" TEXT NOT NULL DEFAULT 'CONNECT',
    "http_status" INTEGER NOT NULL,
    "squid_status" TEXT NOT NULL,
    "bytes_transferred" INTEGER NOT NULL DEFAULT 0,
    "elapsed_ms" INTEGER NOT NULL DEFAULT 0,
    "action" TEXT NOT NULL DEFAULT 'ALLOWED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_egress_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "workspace_egress_logs_container_id_timestamp_idx" ON "workspace_egress_logs"("container_id", "timestamp");

-- CreateIndex
CREATE INDEX "workspace_egress_logs_container_id_domain_idx" ON "workspace_egress_logs"("container_id", "domain");

-- CreateIndex
CREATE INDEX "workspace_egress_logs_domain_timestamp_idx" ON "workspace_egress_logs"("domain", "timestamp");

-- CreateIndex
CREATE INDEX "workspace_egress_logs_action_timestamp_idx" ON "workspace_egress_logs"("action", "timestamp");

-- CreateIndex
CREATE INDEX "workspace_egress_logs_timestamp_idx" ON "workspace_egress_logs"("timestamp");

-- AddForeignKey
ALTER TABLE "workspace_egress_logs" ADD CONSTRAINT "workspace_egress_logs_container_id_fkey" FOREIGN KEY ("container_id") REFERENCES "workspace_containers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
