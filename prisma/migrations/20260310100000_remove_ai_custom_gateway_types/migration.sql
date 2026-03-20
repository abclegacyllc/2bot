-- Remove AI and CUSTOM_GATEWAY from GatewayType enum
-- Step 1: Archive any existing AI/CUSTOM_GATEWAY rows
-- Step 2: Delete archived rows from main table
-- Step 3: Recreate enum without AI/CUSTOM_GATEWAY

-- Create archive table for removed gateway types
CREATE TABLE IF NOT EXISTS "gateway_archive" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "credentials" JSONB,
    "config" JSONB,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archive_reason" TEXT NOT NULL DEFAULT 'GatewayType enum cleanup: AI and CUSTOM_GATEWAY removed',

    CONSTRAINT "gateway_archive_pkey" PRIMARY KEY ("id")
);

-- Archive existing AI and CUSTOM_GATEWAY rows (cast type to text to preserve value)
INSERT INTO "gateway_archive" ("id", "workspace_id", "name", "type", "status", "credentials", "config", "metadata", "created_at", "updated_at")
SELECT "id", "workspace_id", "name", "type"::text, "status"::text, "credentials", "config", "metadata", "created_at", "updated_at"
FROM "gateways"
WHERE "type" IN ('AI', 'CUSTOM_GATEWAY');

-- Remove linked plugin_gateways for archived gateways
DELETE FROM "plugin_gateways"
WHERE "gateway_id" IN (SELECT "id" FROM "gateways" WHERE "type" IN ('AI', 'CUSTOM_GATEWAY'));

-- Delete the archived rows from the main table
DELETE FROM "gateways" WHERE "type" IN ('AI', 'CUSTOM_GATEWAY');

-- Recreate enum without AI and CUSTOM_GATEWAY
-- PostgreSQL requires: create new type, alter column, drop old type
ALTER TYPE "GatewayType" RENAME TO "GatewayType_old";

CREATE TYPE "GatewayType" AS ENUM ('TELEGRAM_BOT', 'DISCORD_BOT', 'SLACK_BOT', 'WHATSAPP_BOT');

ALTER TABLE "gateways" ALTER COLUMN "type" TYPE "GatewayType" USING ("type"::text::"GatewayType");

DROP TYPE "GatewayType_old";
