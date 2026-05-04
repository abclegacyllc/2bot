-- Phase 7.5: ExternalApi + DatabaseConnection sidecars for ProjectResource.
-- Mirrors the SECRET pattern: 1:1 to ProjectResource, encrypted credentials,
-- versioned for rotation. No data backfill — these are additive sidecars.

-- CreateEnum
CREATE TYPE "ExternalApiAuthMode" AS ENUM ('NONE', 'API_KEY', 'BEARER', 'BASIC', 'HMAC');

-- CreateEnum
CREATE TYPE "DatabaseDriver" AS ENUM ('POSTGRES', 'MYSQL', 'SQLITE');

-- CreateEnum
CREATE TYPE "DatabaseSslMode" AS ENUM ('DISABLE', 'REQUIRE', 'VERIFY_CA', 'VERIFY_FULL');

-- CreateTable
CREATE TABLE "external_apis" (
    "id" TEXT NOT NULL,
    "resource_id" TEXT NOT NULL,
    "base_url" TEXT NOT NULL,
    "auth_mode" "ExternalApiAuthMode" NOT NULL DEFAULT 'NONE',
    "auth_config_enc" TEXT NOT NULL DEFAULT '',
    "default_headers" JSONB NOT NULL DEFAULT '{}',
    "timeout_ms" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "last_rotated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "external_apis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "database_connections" (
    "id" TEXT NOT NULL,
    "resource_id" TEXT NOT NULL,
    "driver" "DatabaseDriver" NOT NULL,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 0,
    "database" TEXT NOT NULL,
    "username" TEXT,
    "password_enc" TEXT NOT NULL DEFAULT '',
    "ssl_mode" "DatabaseSslMode" NOT NULL DEFAULT 'REQUIRE',
    "pool_min" INTEGER NOT NULL DEFAULT 0,
    "pool_max" INTEGER NOT NULL DEFAULT 10,
    "version" INTEGER NOT NULL DEFAULT 1,
    "last_rotated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "database_connections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "external_apis_resource_id_key" ON "external_apis"("resource_id");

-- CreateIndex
CREATE UNIQUE INDEX "database_connections_resource_id_key" ON "database_connections"("resource_id");

-- CreateIndex
CREATE INDEX "database_connections_driver_idx" ON "database_connections"("driver");

-- AddForeignKey
ALTER TABLE "external_apis" ADD CONSTRAINT "external_apis_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "project_resources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "database_connections" ADD CONSTRAINT "database_connections_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "project_resources"("id") ON DELETE CASCADE ON UPDATE CASCADE;
