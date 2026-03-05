-- Add credentials JSON column for flexible key-value credential storage
ALTER TABLE "plugin_webhooks" ADD COLUMN "credentials" JSONB NOT NULL DEFAULT '{}';
