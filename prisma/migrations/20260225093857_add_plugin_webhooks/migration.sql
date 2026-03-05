-- CreateTable
CREATE TABLE "plugin_webhooks" (
    "id" TEXT NOT NULL,
    "container_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "plugin_file" TEXT NOT NULL,
    "secret" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plugin_webhooks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "plugin_webhooks_container_id_idx" ON "plugin_webhooks"("container_id");

-- CreateIndex
CREATE INDEX "plugin_webhooks_active_idx" ON "plugin_webhooks"("active");

-- CreateIndex
CREATE UNIQUE INDEX "plugin_webhooks_container_id_name_key" ON "plugin_webhooks"("container_id", "name");

-- AddForeignKey
ALTER TABLE "plugin_webhooks" ADD CONSTRAINT "plugin_webhooks_container_id_fkey" FOREIGN KEY ("container_id") REFERENCES "workspace_containers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
