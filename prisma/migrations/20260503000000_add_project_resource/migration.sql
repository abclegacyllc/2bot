-- Phase 7.2: ProjectResource polymorphic layer (Path C — additive)
--
-- This migration is FULLY ADDITIVE:
--   * Creates ProjectResourceKind + ProjectResourceStatus enums.
--   * Creates project_resources table with sidecar FK to gateways.
--   * Backfills one GATEWAY_BOT ProjectResource per existing gateway that
--     belongs to a project (gateways with NULL project_id are handled by
--     the Phase 6.2 finalize_project_layer migration and will get a
--     ProjectResource via the gateway.create() companion-write at runtime,
--     or by re-running this backfill after that migration).
--
-- Safe to roll back: DROP TABLE project_resources; DROP TYPE
-- ProjectResourceKind; DROP TYPE ProjectResourceStatus;

-- ───────────────────────────────────────────
-- Enums
-- ───────────────────────────────────────────
CREATE TYPE "ProjectResourceKind" AS ENUM (
  'GATEWAY_BOT',
  'HTTP_ROUTE',
  'SCHEDULE',
  'SECRET',
  'EXTERNAL_API',
  'DATABASE',
  'KV_STORE',
  'OBJECT_STORE'
);

CREATE TYPE "ProjectResourceStatus" AS ENUM (
  'ACTIVE',
  'PAUSED',
  'ERROR',
  'ARCHIVED'
);

-- ───────────────────────────────────────────
-- Table
-- ───────────────────────────────────────────
CREATE TABLE "project_resources" (
  "id"              TEXT NOT NULL,
  "project_id"      TEXT NOT NULL,
  "user_id"         TEXT NOT NULL,
  "organization_id" TEXT,
  "kind"            "ProjectResourceKind" NOT NULL,
  "name"            TEXT NOT NULL,
  "slug"            TEXT NOT NULL,
  "status"          "ProjectResourceStatus" NOT NULL DEFAULT 'ACTIVE',
  "config"          JSONB NOT NULL DEFAULT '{}',
  "metadata"        JSONB,
  "gateway_id"      TEXT,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"      TIMESTAMP(3) NOT NULL,

  CONSTRAINT "project_resources_pkey" PRIMARY KEY ("id")
);

-- ───────────────────────────────────────────
-- Constraints + indexes
-- ───────────────────────────────────────────
CREATE UNIQUE INDEX "project_resources_gateway_id_key"
  ON "project_resources"("gateway_id");

CREATE UNIQUE INDEX "project_resources_project_kind_slug_key"
  ON "project_resources"("project_id", "kind", "slug");

CREATE INDEX "project_resources_project_kind_idx"
  ON "project_resources"("project_id", "kind");

CREATE INDEX "project_resources_user_kind_idx"
  ON "project_resources"("user_id", "kind");

CREATE INDEX "project_resources_org_kind_idx"
  ON "project_resources"("organization_id", "kind");

CREATE INDEX "project_resources_kind_status_idx"
  ON "project_resources"("kind", "status");

ALTER TABLE "project_resources"
  ADD CONSTRAINT "project_resources_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "project_resources"
  ADD CONSTRAINT "project_resources_gateway_id_fkey"
  FOREIGN KEY ("gateway_id") REFERENCES "gateways"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ───────────────────────────────────────────
-- Backfill: one GATEWAY_BOT ProjectResource per existing gateway
-- that already has a project_id. Slug = first 60 chars of slugified name,
-- with -<gw-id-suffix> suffix to guarantee uniqueness within (project, kind).
-- ───────────────────────────────────────────
INSERT INTO "project_resources" (
  "id",
  "project_id",
  "user_id",
  "organization_id",
  "kind",
  "name",
  "slug",
  "status",
  "config",
  "gateway_id",
  "created_at",
  "updated_at"
)
SELECT
  'pr_' || substr(md5(g.id), 1, 24) AS id,
  g.project_id,
  g.user_id,
  g.organization_id,
  'GATEWAY_BOT'::"ProjectResourceKind",
  g.name,
  -- slug: lowercase, replace non-alnum with '-', trim, append short id suffix
  substr(
    regexp_replace(lower(g.name), '[^a-z0-9]+', '-', 'g'),
    1, 60
  ) || '-' || substr(g.id, 1, 6) AS slug,
  CASE
    WHEN g.status = 'CONNECTED' THEN 'ACTIVE'::"ProjectResourceStatus"
    WHEN g.status = 'ERROR'     THEN 'ERROR'::"ProjectResourceStatus"
    ELSE 'ACTIVE'::"ProjectResourceStatus"
  END,
  '{}'::jsonb,
  g.id,
  g.created_at,
  g.updated_at
FROM "gateways" g
WHERE g.project_id IS NOT NULL
ON CONFLICT ("gateway_id") DO NOTHING;
