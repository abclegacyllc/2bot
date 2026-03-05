-- Phase 2: Replace UserPlugin.code_bundle with entry_file
-- Plugin code now lives on the workspace container filesystem only.
-- Plugin.code_bundle (catalog templates) is kept — only UserPlugin.code_bundle is removed.

-- Step 1: Add the new entry_file column
ALTER TABLE "user_plugins" ADD COLUMN "entry_file" VARCHAR(500);

-- Step 2: Populate entry_file from the plugin slug
-- Convention: plugins/{slug}.js (single-file legacy format)
UPDATE "user_plugins" up
SET "entry_file" = 'plugins/' || p."slug" || '.js'
FROM "plugins" p
WHERE up."plugin_id" = p."id"
  AND up."entry_file" IS NULL;

-- Step 3: Drop the code_bundle column from user_plugins
-- (Plugin.code_bundle on the plugins table is intentionally kept as template source)
ALTER TABLE "user_plugins" DROP COLUMN "code_bundle";
