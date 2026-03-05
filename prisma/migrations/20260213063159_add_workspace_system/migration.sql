-- CreateEnum
CREATE TYPE "ContainerStatus" AS ENUM ('CREATING', 'STARTING', 'RUNNING', 'STOPPING', 'STOPPED', 'ERROR', 'DESTROYED');

-- CreateEnum
CREATE TYPE "WorkspaceFileType" AS ENUM ('FILE', 'DIRECTORY');

-- CreateEnum
CREATE TYPE "WorkspaceOwnerType" AS ENUM ('PERSONAL', 'ORGANIZATION');

-- CreateTable
CREATE TABLE "workspace_containers" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "organization_id" TEXT,
    "owner_type" "WorkspaceOwnerType" NOT NULL DEFAULT 'PERSONAL',
    "container_id" TEXT,
    "container_name" TEXT NOT NULL,
    "image_name" TEXT NOT NULL DEFAULT '2bot-workspace:latest',
    "status" "ContainerStatus" NOT NULL DEFAULT 'CREATING',
    "error_message" TEXT,
    "ram_mb" INTEGER NOT NULL,
    "cpu_cores" DOUBLE PRECISION NOT NULL,
    "storage_mb" INTEGER NOT NULL,
    "ip_address" TEXT,
    "bridge_port" INTEGER,
    "volume_path" TEXT,
    "last_health_check" TIMESTAMP(3),
    "health_check_fails" INTEGER NOT NULL DEFAULT 0,
    "auto_restart" BOOLEAN NOT NULL DEFAULT true,
    "max_restarts" INTEGER NOT NULL DEFAULT 5,
    "restart_count" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3),
    "stopped_at" TIMESTAMP(3),
    "last_activity_at" TIMESTAMP(3),
    "auto_stop_minutes" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspace_containers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_files" (
    "id" TEXT NOT NULL,
    "container_id" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "WorkspaceFileType" NOT NULL DEFAULT 'FILE',
    "size_bytes" INTEGER NOT NULL DEFAULT 0,
    "mime_type" TEXT,
    "is_plugin" BOOLEAN NOT NULL DEFAULT false,
    "plugin_status" TEXT,
    "plugin_pid" INTEGER,
    "source" TEXT NOT NULL DEFAULT 'upload',
    "source_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspace_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_logs" (
    "id" TEXT NOT NULL,
    "container_id" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'info',
    "source" TEXT NOT NULL DEFAULT 'system',
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "plugin_file" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "workspace_containers_container_name_key" ON "workspace_containers"("container_name");

-- CreateIndex
CREATE INDEX "workspace_containers_user_id_idx" ON "workspace_containers"("user_id");

-- CreateIndex
CREATE INDEX "workspace_containers_organization_id_idx" ON "workspace_containers"("organization_id");

-- CreateIndex
CREATE INDEX "workspace_containers_status_idx" ON "workspace_containers"("status");

-- CreateIndex
CREATE INDEX "workspace_containers_owner_type_idx" ON "workspace_containers"("owner_type");

-- CreateIndex
CREATE INDEX "workspace_containers_container_id_idx" ON "workspace_containers"("container_id");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_containers_user_id_organization_id_key" ON "workspace_containers"("user_id", "organization_id");

-- CreateIndex
CREATE INDEX "workspace_files_container_id_idx" ON "workspace_files"("container_id");

-- CreateIndex
CREATE INDEX "workspace_files_is_plugin_idx" ON "workspace_files"("is_plugin");

-- CreateIndex
CREATE INDEX "workspace_files_source_idx" ON "workspace_files"("source");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_files_container_id_path_key" ON "workspace_files"("container_id", "path");

-- CreateIndex
CREATE INDEX "workspace_logs_container_id_created_at_idx" ON "workspace_logs"("container_id", "created_at");

-- CreateIndex
CREATE INDEX "workspace_logs_container_id_level_idx" ON "workspace_logs"("container_id", "level");

-- CreateIndex
CREATE INDEX "workspace_logs_container_id_source_idx" ON "workspace_logs"("container_id", "source");

-- CreateIndex
CREATE INDEX "workspace_logs_created_at_idx" ON "workspace_logs"("created_at");

-- AddForeignKey
ALTER TABLE "workspace_containers" ADD CONSTRAINT "workspace_containers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_containers" ADD CONSTRAINT "workspace_containers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_files" ADD CONSTRAINT "workspace_files_container_id_fkey" FOREIGN KEY ("container_id") REFERENCES "workspace_containers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_logs" ADD CONSTRAINT "workspace_logs_container_id_fkey" FOREIGN KEY ("container_id") REFERENCES "workspace_containers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
