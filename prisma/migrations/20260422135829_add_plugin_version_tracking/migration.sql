-- Plugin version tracking
-- Adds columns required for the republish / update-installed flow:
--   * plugins.code_bundle_updated_at: set when author pushes a new codeBundle
--   * user_plugins.installed_version: version deployed into this user's container
--   * user_plugins.needs_update: true when code_bundle_updated_at > deploy time

-- AlterTable
ALTER TABLE "plugins" ADD COLUMN "code_bundle_updated_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "user_plugins"
    ADD COLUMN "installed_version" VARCHAR(50),
    ADD COLUMN "needs_update" BOOLEAN NOT NULL DEFAULT false;
