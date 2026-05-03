-- Phase 6.2: Project layer + Workflow-as-canvas (additive, with backfill)
--
-- This migration is FULLY ADDITIVE:
--   * Creates Project, ProjectKind, ProjectStatus, WorkflowGateway.
--   * Adds nullable project_id to gateways, workflows, user_plugins.
--   * Backfills one "Default" Project per (user_id, organization_id) tuple
--     that owns at least one gateway, workflow, or user_plugin.
--   * Backfills WorkflowGateway rows from existing workflows.gateway_id
--     (role = 'trigger' for BOT_MESSAGE / TELEGRAM_* / DISCORD_* / SLACK_* /
--     WHATSAPP_* / WEBHOOK; role = 'action-target' otherwise).
--
-- The legacy workflows.gateway_id column is KEPT during this transition.
-- Phase 6.2 Wave 2 will drop it once the service layer reads from
-- workflow_gateways exclusively.

-- ─────────────────────────────────────────────────────────────────────
-- 1. Enums
-- ─────────────────────────────────────────────────────────────────────
CREATE TYPE "ProjectKind" AS ENUM ('BOT', 'WEB_APP', 'AUTOMATION', 'HYBRID');
CREATE TYPE "ProjectStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ARCHIVED');

-- ─────────────────────────────────────────────────────────────────────
-- 2. projects table
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE "projects" (
    "id"              TEXT          NOT NULL,
    "user_id"         TEXT          NOT NULL,
    "organization_id" TEXT,
    "name"            TEXT          NOT NULL,
    "slug"            TEXT          NOT NULL,
    "description"     TEXT,
    "kind"            "ProjectKind" NOT NULL DEFAULT 'HYBRID',
    "status"          "ProjectStatus" NOT NULL DEFAULT 'ACTIVE',
    "icon"            TEXT,
    "color"           TEXT,
    "is_default"      BOOLEAN       NOT NULL DEFAULT false,
    "created_at"      TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"      TIMESTAMP(3)  NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "projects_user_id_organization_id_slug_key"
    ON "projects" ("user_id", "organization_id", "slug");
CREATE INDEX "projects_user_id_idx"              ON "projects" ("user_id");
CREATE INDEX "projects_organization_id_idx"      ON "projects" ("organization_id");
CREATE INDEX "projects_kind_idx"                 ON "projects" ("kind");
CREATE INDEX "projects_status_idx"               ON "projects" ("status");
CREATE INDEX "projects_user_id_organization_id_is_default_idx"
    ON "projects" ("user_id", "organization_id", "is_default");

ALTER TABLE "projects"
    ADD CONSTRAINT "projects_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "projects"
    ADD CONSTRAINT "projects_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────
-- 3. workflow_gateways link table
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE "workflow_gateways" (
    "id"          TEXT         NOT NULL,
    "workflow_id" TEXT         NOT NULL,
    "gateway_id"  TEXT         NOT NULL,
    "role"        TEXT         NOT NULL DEFAULT 'trigger',
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_gateways_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "workflow_gateways_workflow_id_gateway_id_role_key"
    ON "workflow_gateways" ("workflow_id", "gateway_id", "role");
CREATE INDEX "workflow_gateways_workflow_id_idx" ON "workflow_gateways" ("workflow_id");
CREATE INDEX "workflow_gateways_gateway_id_idx"  ON "workflow_gateways" ("gateway_id");
CREATE INDEX "workflow_gateways_role_idx"        ON "workflow_gateways" ("role");

ALTER TABLE "workflow_gateways"
    ADD CONSTRAINT "workflow_gateways_workflow_id_fkey"
    FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workflow_gateways"
    ADD CONSTRAINT "workflow_gateways_gateway_id_fkey"
    FOREIGN KEY ("gateway_id") REFERENCES "gateways"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────
-- 4. project_id columns + indexes + FKs (nullable for now)
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE "gateways"     ADD COLUMN "project_id" TEXT;
ALTER TABLE "workflows"    ADD COLUMN "project_id" TEXT;
ALTER TABLE "user_plugins" ADD COLUMN "project_id" TEXT;

CREATE INDEX "gateways_project_id_idx"     ON "gateways"     ("project_id");
CREATE INDEX "workflows_project_id_idx"    ON "workflows"    ("project_id");
CREATE INDEX "user_plugins_project_id_idx" ON "user_plugins" ("project_id");

ALTER TABLE "gateways"
    ADD CONSTRAINT "gateways_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "workflows"
    ADD CONSTRAINT "workflows_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "user_plugins"
    ADD CONSTRAINT "user_plugins_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────
-- 5. Backfill: one Default project per (user_id, organization_id)
-- ─────────────────────────────────────────────────────────────────────
-- Generate a "Default" Project for every distinct (user, org) tuple that
-- owns at least one gateway, workflow, or user_plugin.
INSERT INTO "projects" (
    "id", "user_id", "organization_id",
    "name", "slug", "description",
    "kind", "status", "is_default",
    "created_at", "updated_at"
)
SELECT
    'pj_' || md5(coalesce(t.user_id, '') || ':' || coalesce(t.organization_id, '')) AS id,
    t.user_id,
    t.organization_id,
    'Default',
    'default',
    'Auto-created on Phase 6.2 migration. Holds resources that pre-date the Project layer.',
    'HYBRID'::"ProjectKind",
    'ACTIVE'::"ProjectStatus",
    true,
    NOW(),
    NOW()
FROM (
    SELECT DISTINCT user_id, organization_id FROM "gateways"
    UNION
    SELECT DISTINCT user_id, organization_id FROM "workflows"
    UNION
    SELECT DISTINCT user_id, organization_id FROM "user_plugins"
) AS t
WHERE NOT EXISTS (
    SELECT 1 FROM "projects" p
    WHERE p.user_id = t.user_id
      AND ((p.organization_id IS NULL AND t.organization_id IS NULL)
           OR p.organization_id = t.organization_id)
      AND p.is_default = true
);

-- ─────────────────────────────────────────────────────────────────────
-- 6. Backfill project_id on existing rows
-- ─────────────────────────────────────────────────────────────────────
UPDATE "gateways" g
SET "project_id" = p.id
FROM "projects" p
WHERE p.user_id = g.user_id
  AND ((p.organization_id IS NULL AND g.organization_id IS NULL)
       OR p.organization_id = g.organization_id)
  AND p.is_default = true
  AND g.project_id IS NULL;

UPDATE "workflows" w
SET "project_id" = p.id
FROM "projects" p
WHERE p.user_id = w.user_id
  AND ((p.organization_id IS NULL AND w.organization_id IS NULL)
       OR p.organization_id = w.organization_id)
  AND p.is_default = true
  AND w.project_id IS NULL;

UPDATE "user_plugins" u
SET "project_id" = p.id
FROM "projects" p
WHERE p.user_id = u.user_id
  AND ((p.organization_id IS NULL AND u.organization_id IS NULL)
       OR p.organization_id = u.organization_id)
  AND p.is_default = true
  AND u.project_id IS NULL;

-- ─────────────────────────────────────────────────────────────────────
-- 7. Backfill WorkflowGateway from legacy workflows.gateway_id
-- ─────────────────────────────────────────────────────────────────────
-- Trigger types that mean "the gateway is the trigger source"
INSERT INTO "workflow_gateways" ("id", "workflow_id", "gateway_id", "role", "created_at")
SELECT
    'wg_' || w.id || '_trig',
    w.id,
    w.gateway_id,
    'trigger',
    w.created_at
FROM "workflows" w
WHERE w.gateway_id IS NOT NULL
  AND w."triggerType" IN (
      'BOT_MESSAGE', 'TELEGRAM_MESSAGE', 'TELEGRAM_CALLBACK',
      'DISCORD_MESSAGE', 'DISCORD_COMMAND',
      'SLACK_MESSAGE', 'SLACK_COMMAND',
      'WHATSAPP_MESSAGE', 'WEBHOOK'
  )
ON CONFLICT ("workflow_id", "gateway_id", "role") DO NOTHING;

-- All other trigger types (SCHEDULE, MANUAL): the bound gateway is an
-- action target, not the trigger source.
INSERT INTO "workflow_gateways" ("id", "workflow_id", "gateway_id", "role", "created_at")
SELECT
    'wg_' || w.id || '_act',
    w.id,
    w.gateway_id,
    'action-target',
    w.created_at
FROM "workflows" w
WHERE w.gateway_id IS NOT NULL
  AND w."triggerType" IN ('SCHEDULE', 'MANUAL')
ON CONFLICT ("workflow_id", "gateway_id", "role") DO NOTHING;
