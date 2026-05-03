-- Fix entry_file paths for gateway-bound user_plugins that still use flat plugins/ format.
-- These should be bots/{platform}/{gatewayId}/plugins/{slug}.js (or /index.js for directories).
-- Also fix any remaining old bots/{gwId}/plugins/ format (without platform prefix).

-- 1. Migrate flat plugins/ → bots/{platform}/{gwId}/plugins/ for gateway-bound user_plugins
UPDATE user_plugins up
SET entry_file = 'bots/' ||
  CASE g.type::text
    WHEN 'TELEGRAM_BOT' THEN 'telegram'
    WHEN 'DISCORD_BOT' THEN 'discord'
    WHEN 'SLACK_BOT' THEN 'slack'
    WHEN 'WHATSAPP_BOT' THEN 'whatsapp'
    ELSE lower(replace(g.type::text, '_BOT', ''))
  END || '/' || up.gateway_id || '/plugins/' || substring(up.entry_file FROM 'plugins/(.+)')
FROM gateways g
WHERE up.gateway_id IS NOT NULL
  AND g.id = up.gateway_id
  AND up.entry_file LIKE 'plugins/%'
  AND up.entry_file NOT LIKE 'bots/%';

-- 2. Migrate old bots/{gwId}/plugins/ → bots/{platform}/{gwId}/plugins/ for any remaining entries
UPDATE user_plugins up
SET entry_file = 'bots/' ||
  CASE g.type::text
    WHEN 'TELEGRAM_BOT' THEN 'telegram'
    WHEN 'DISCORD_BOT' THEN 'discord'
    WHEN 'SLACK_BOT' THEN 'slack'
    WHEN 'WHATSAPP_BOT' THEN 'whatsapp'
    ELSE lower(replace(g.type::text, '_BOT', ''))
  END || '/' || substring(up.entry_file FROM 'bots/(.+)')
FROM gateways g
WHERE up.gateway_id IS NOT NULL
  AND g.id = up.gateway_id
  AND up.entry_file LIKE 'bots/%'
  AND up.entry_file NOT LIKE 'bots/telegram/%'
  AND up.entry_file NOT LIKE 'bots/discord/%'
  AND up.entry_file NOT LIKE 'bots/slack/%'
  AND up.entry_file NOT LIKE 'bots/whatsapp/%';

-- 3. Fix directory plugins that have .js extension instead of /index.js
UPDATE user_plugins up
SET entry_file = regexp_replace(up.entry_file, '([^/]+)\.js$', '\1/index.js')
FROM plugins p
WHERE up.plugin_id = p.id
  AND p.code_bundle IS NULL
  AND p.bundle_path IS NOT NULL
  AND up.entry_file LIKE '%.js'
  AND up.entry_file NOT LIKE '%/index.js';

-- 4. Same fixes for workflow_steps table (flat plugins/ → bots/{platform}/{gwId}/plugins/)
UPDATE workflow_steps ws
SET entry_file = 'bots/' ||
  CASE g.type::text
    WHEN 'TELEGRAM_BOT' THEN 'telegram'
    WHEN 'DISCORD_BOT' THEN 'discord'
    WHEN 'SLACK_BOT' THEN 'slack'
    WHEN 'WHATSAPP_BOT' THEN 'whatsapp'
    ELSE lower(replace(g.type::text, '_BOT', ''))
  END || '/' || COALESCE(ws.gateway_id, w.gateway_id) || '/plugins/' || substring(ws.entry_file FROM 'plugins/(.+)')
FROM workflows w, gateways g
WHERE ws.workflow_id = w.id
  AND g.id = COALESCE(ws.gateway_id, w.gateway_id)
  AND COALESCE(ws.gateway_id, w.gateway_id) IS NOT NULL
  AND ws.entry_file LIKE 'plugins/%'
  AND ws.entry_file NOT LIKE 'bots/%';

-- 5. workflow_steps: old bots/{gwId}/plugins/ → bots/{platform}/{gwId}/plugins/
UPDATE workflow_steps ws
SET entry_file = 'bots/' ||
  CASE g.type::text
    WHEN 'TELEGRAM_BOT' THEN 'telegram'
    WHEN 'DISCORD_BOT' THEN 'discord'
    WHEN 'SLACK_BOT' THEN 'slack'
    WHEN 'WHATSAPP_BOT' THEN 'whatsapp'
    ELSE lower(replace(g.type::text, '_BOT', ''))
  END || '/' || substring(ws.entry_file FROM 'bots/(.+)')
FROM workflows w, gateways g
WHERE ws.workflow_id = w.id
  AND g.id = COALESCE(ws.gateway_id, w.gateway_id)
  AND COALESCE(ws.gateway_id, w.gateway_id) IS NOT NULL
  AND ws.entry_file LIKE 'bots/%'
  AND ws.entry_file NOT LIKE 'bots/telegram/%'
  AND ws.entry_file NOT LIKE 'bots/discord/%'
  AND ws.entry_file NOT LIKE 'bots/slack/%'
  AND ws.entry_file NOT LIKE 'bots/whatsapp/%';

-- 6. workflow_steps: Fix directory plugins with .js extension
UPDATE workflow_steps ws
SET entry_file = regexp_replace(ws.entry_file, '([^/]+)\.js$', '\1/index.js')
FROM plugins p
WHERE ws.plugin_id = p.id
  AND p.code_bundle IS NULL
  AND p.bundle_path IS NOT NULL
  AND ws.entry_file LIKE '%.js'
  AND ws.entry_file NOT LIKE '%/index.js';
