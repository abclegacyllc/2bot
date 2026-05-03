-- Phase 7.3a — Path C: HttpRoute sidecar + container HTTP exposure (additive)
--
-- Adds the HTTP_ROUTE subtype's typed sidecar (http_routes), wires
-- WorkspaceContainer.http_port + WorkspaceContainer.subdomain so a
-- container can serve user-app HTTP traffic alongside its bridge agent.
--
-- Fully additive — no NOT NULL backfill, no destructive changes. Bridge
-- agent listener + nginx wildcard come in 7.3b; this migration only
-- prepares the data model.

-- ───────────────────────────────────────────
-- Enums
-- ───────────────────────────────────────────
CREATE TYPE "HttpMethod" AS ENUM (
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'OPTIONS',
  'HEAD',
  'ANY'
);

CREATE TYPE "HttpAuthMode" AS ENUM (
  'NONE',
  'API_KEY',
  'HMAC',
  'BEARER_JWT'
);

-- ───────────────────────────────────────────
-- WorkspaceContainer: add HTTP exposure fields
-- ───────────────────────────────────────────
ALTER TABLE "workspace_containers"
  ADD COLUMN "http_port" INTEGER,
  ADD COLUMN "subdomain" TEXT;

CREATE UNIQUE INDEX "workspace_containers_subdomain_key"
  ON "workspace_containers"("subdomain");

-- ───────────────────────────────────────────
-- HttpRoute table
-- ───────────────────────────────────────────
CREATE TABLE "http_routes" (
  "id"                     TEXT NOT NULL,
  "resource_id"            TEXT NOT NULL,
  "method"                 "HttpMethod" NOT NULL DEFAULT 'ANY',
  "path"                   TEXT NOT NULL,
  "target_user_plugin_id"  TEXT,
  "target_export"          TEXT,
  "auth_mode"              "HttpAuthMode" NOT NULL DEFAULT 'NONE',
  "auth_config"            JSONB NOT NULL DEFAULT '{}',
  "max_body_kb"            INTEGER NOT NULL DEFAULT 0,
  "timeout_ms"             INTEGER NOT NULL DEFAULT 15000,
  "cors_origin"            TEXT,
  "passthrough_body"       BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"             TIMESTAMP(3) NOT NULL,

  CONSTRAINT "http_routes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "http_routes_resource_id_key"
  ON "http_routes"("resource_id");

CREATE INDEX "http_routes_target_user_plugin_id_idx"
  ON "http_routes"("target_user_plugin_id");

CREATE INDEX "http_routes_method_path_idx"
  ON "http_routes"("method", "path");

ALTER TABLE "http_routes"
  ADD CONSTRAINT "http_routes_resource_id_fkey"
  FOREIGN KEY ("resource_id") REFERENCES "project_resources"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "http_routes"
  ADD CONSTRAINT "http_routes_target_user_plugin_id_fkey"
  FOREIGN KEY ("target_user_plugin_id") REFERENCES "user_plugins"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
