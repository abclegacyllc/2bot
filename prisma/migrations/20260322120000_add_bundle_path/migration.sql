-- AlterTable: Add bundle_path column for marketplace plugin bundles
ALTER TABLE "plugins" ADD COLUMN IF NOT EXISTS "bundle_path" VARCHAR(500);
