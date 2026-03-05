-- Unify Custom Gateway into Gateway model
--
-- Custom gateways now live in the `gateways` table (type = 'CUSTOM_GATEWAY')
-- using the same Gateway model, UserPlugin.gatewayId relation, credentialsEnc
-- encryption, and event routing pipeline as Telegram bots and AI providers.
--
-- The old `plugin_webhooks` table had 0 rows in production, so this is a
-- clean removal with no data migration needed.

-- Drop the old table (0 rows — safe)
DROP TABLE IF EXISTS "plugin_webhooks";
