-- Rename pool columns to workspace_pool for clarity
-- This preserves all existing data

-- Rename pool_ram_mb to workspace_pool_ram_mb
ALTER TABLE "organizations" RENAME COLUMN "pool_ram_mb" TO "workspace_pool_ram_mb";

-- Rename pool_cpu_cores to workspace_pool_cpu_cores
ALTER TABLE "organizations" RENAME COLUMN "pool_cpu_cores" TO "workspace_pool_cpu_cores";

-- Rename pool_storage_mb to workspace_pool_storage_mb
ALTER TABLE "organizations" RENAME COLUMN "pool_storage_mb" TO "workspace_pool_storage_mb";
