-- CreateTable
CREATE TABLE "workspace_audit_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "container_id" TEXT NOT NULL,
    "container_name" TEXT,
    "action" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "error_message" TEXT,
    "metadata" JSONB,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "workspace_audit_logs_user_id_idx" ON "workspace_audit_logs"("user_id");

-- CreateIndex
CREATE INDEX "workspace_audit_logs_container_id_idx" ON "workspace_audit_logs"("container_id");

-- CreateIndex
CREATE INDEX "workspace_audit_logs_action_idx" ON "workspace_audit_logs"("action");

-- CreateIndex
CREATE INDEX "workspace_audit_logs_created_at_idx" ON "workspace_audit_logs"("created_at");
