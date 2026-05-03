-- CreateTable
CREATE TABLE "mcp_server_configs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "organization_id" TEXT,
    "name" VARCHAR(100) NOT NULL,
    "transport_type" VARCHAR(10) NOT NULL DEFAULT 'stdio',
    "config_enc" TEXT NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "status" VARCHAR(20) NOT NULL DEFAULT 'disconnected',
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mcp_server_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mcp_server_configs_user_id_name_key" ON "mcp_server_configs"("user_id", "name");

-- CreateIndex
CREATE INDEX "mcp_server_configs_user_id_idx" ON "mcp_server_configs"("user_id");

-- CreateIndex
CREATE INDEX "mcp_server_configs_organization_id_idx" ON "mcp_server_configs"("organization_id");

-- AddForeignKey
ALTER TABLE "mcp_server_configs" ADD CONSTRAINT "mcp_server_configs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mcp_server_configs" ADD CONSTRAINT "mcp_server_configs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
