-- Phase 7.4: SECRET ProjectResource sidecar.
-- AES-256-GCM-encrypted credentials referenced by plugins/workflows.

CREATE TABLE "secrets" (
  "id"              TEXT          NOT NULL,
  "resource_id"     TEXT          NOT NULL,
  "key"             TEXT          NOT NULL,
  "value_enc"       TEXT          NOT NULL,
  "description"     TEXT,
  "version"         INTEGER       NOT NULL DEFAULT 1,
  "last_rotated_at" TIMESTAMP(3),
  "created_at"      TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"      TIMESTAMP(3)  NOT NULL,

  CONSTRAINT "secrets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "secrets_resource_id_key" ON "secrets" ("resource_id");
CREATE INDEX        "secrets_key_idx"         ON "secrets" ("key");

ALTER TABLE "secrets"
  ADD CONSTRAINT "secrets_resource_id_fkey"
  FOREIGN KEY ("resource_id") REFERENCES "project_resources"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
