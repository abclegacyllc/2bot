-- Phase 6.4 Wave 1: Project versioning + auto-rollback
--
-- Adds:
--   * enum ProjectVersionStatus { STAGING, ACTIVE, ROLLED_BACK }
--   * extends WorkflowStatus with STAGING value
--   * project_versions table
--   * projects.active_version_id (nullable FK)
--
-- All additive; no existing rows are modified. Behind FEATURE_PROJECT_VERSIONS flag.

-- 1. New enum: ProjectVersionStatus
CREATE TYPE "ProjectVersionStatus" AS ENUM ('STAGING', 'ACTIVE', 'ROLLED_BACK');

-- 2. Extend WorkflowStatus enum with STAGING (between DRAFT and ACTIVE)
ALTER TYPE "WorkflowStatus" ADD VALUE 'STAGING' BEFORE 'ACTIVE';

-- 3. project_versions table
CREATE TABLE "project_versions" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "version_number" INTEGER NOT NULL,
    "status" "ProjectVersionStatus" NOT NULL DEFAULT 'STAGING',
    "manifest" JSONB NOT NULL,
    "applied_by" TEXT,
    "source" TEXT,
    "buildspec_hash" TEXT,
    "rolled_back_at" TIMESTAMP(3),
    "rollback_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_versions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "project_versions_project_id_version_number_key"
    ON "project_versions"("project_id", "version_number");
CREATE INDEX "project_versions_project_id_idx" ON "project_versions"("project_id");
CREATE INDEX "project_versions_status_idx" ON "project_versions"("status");
CREATE INDEX "project_versions_project_id_status_idx" ON "project_versions"("project_id", "status");

ALTER TABLE "project_versions"
    ADD CONSTRAINT "project_versions_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- 4. projects.active_version_id (nullable, SetNull on FK)
ALTER TABLE "projects" ADD COLUMN "active_version_id" TEXT;
CREATE INDEX "projects_active_version_id_idx" ON "projects"("active_version_id");

ALTER TABLE "projects"
    ADD CONSTRAINT "projects_active_version_id_fkey"
    FOREIGN KEY ("active_version_id") REFERENCES "project_versions"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
