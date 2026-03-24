-- AlterTable: Add is_featured column for marketplace featured items
ALTER TABLE "plugins" ADD COLUMN IF NOT EXISTS "is_featured" BOOLEAN NOT NULL DEFAULT false;
