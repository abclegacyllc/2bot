/**
 * Webhook Handler — Telegram + future gateway HTTP webhook handling
 *
 * Extracted from index.js to keep the bridge agent entry point focused on
 * WebSocket, health, and startup/shutdown orchestration.
 *
 * Usage:
 *   const { createWebhookHandler } = require('./webhook-handler');
 *   const handleWebhook = createWebhookHandler({ pluginRunner, log, emitEvent });
 *   // In HTTP server:
 *   const handled = await handleWebhook(req, res);
 *   if (handled) return;
 */

/* eslint-disable @typescript-eslint/no-require-imports */
'use strict';

const http = require('http');

// ===========================================
// Event Dedup + Claim Tracking
// ===========================================

/**
 * Container-side event deduplication.
 * Prevents processing the same platform update twice (e.g., Telegram retry).
 * Map<string, number> — key → timestamp
 */
const recentEventIds = new Map();
const EVENT_DEDUP_TTL = 120_000; // 2 minutes

/**
 * Check if an event was already seen (dedup) and mark it as seen.
 * @param {string} gatewayId
 * @param {string|number} uniqueId - Platform-specific unique ID (update_id, interaction.id, etc.)
 * @returns {boolean} true if this is a duplicate (already seen)
 */
function isDuplicateEvent(gatewayId, uniqueId) {
  const key = `${gatewayId}:${uniqueId}`;
  if (recentEventIds.has(key)) return true;
  recentEventIds.set(key, Date.now());
  return false;
}

/**
 * Periodic cleanup of stale dedup entries (runs every 60s).
 */
setInterval(() => {
  const cutoff = Date.now() - EVENT_DEDUP_TTL;
  for (const [key, ts] of recentEventIds) {
    if (ts < cutoff) recentEventIds.delete(key);
  }
}, 60_000).unref();

// ===========================================
// Webhook Secret Token Cache
// ===========================================

// Cache: gatewayId → { token: string | null, fetchedAt: number }
const webhookSecretTokenCache = new Map();
const SECRET_TOKEN_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// ===========================================
// Helper Functions
// ===========================================

/**
 * Collect request body as a Buffer.
 * @param {import('http').IncomingMessage} req
 * @param {number} maxBytes
 * @returns {Promise<Buffer>}
 */
function collectBody(req, maxBytes = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        req.destroy();
        reject(new Error('Body too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/**
 * Parse URL and extract route params.
 * Returns { platform, gatewayId } or null.
 */
function matchWebhookRoute(url) {
  // Match: /webhook/telegram/<uuid-like-id>
  const telegramMatch = url.match(/^\/webhook\/telegram\/([a-z0-9_-]+)$/i);
  if (telegramMatch) return { platform: 'telegram', gatewayId: telegramMatch[1] };

  // Match: /webhook/discord/<uuid-like-id>
  const discordMatch = url.match(/^\/webhook\/discord\/([a-z0-9_-]+)$/i);
  if (discordMatch) return { platform: 'discord', gatewayId: discordMatch[1] };

  // Match: /webhook/slack/<uuid-like-id>
  const slackMatch = url.match(/^\/webhook\/slack\/([a-z0-9_-]+)$/i);
  if (slackMatch) return { platform: 'slack', gatewayId: slackMatch[1] };

  // Match: /webhook/whatsapp/<uuid-like-id>
  const whatsappMatch = url.match(/^\/webhook\/whatsapp\/([a-z0-9_-]+)$/i);
  if (whatsappMatch) return { platform: 'whatsapp', gatewayId: whatsappMatch[1] };

  return null;
}

/**
 * Fetch the webhook secret token for a gateway from the REST credentials endpoint.
 * Caches the result for SECRET_TOKEN_CACHE_TTL.
 *
 * @param {string} gatewayId
 * @param {object} log - Logger instance
 * @returns {Promise<string|null>} The secret token or null if not configured
 */
async function getWebhookSecretToken(gatewayId, log) {
  const cached = webhookSecretTokenCache.get(gatewayId);
  if (cached && Date.now() - cached.fetchedAt < SECRET_TOKEN_CACHE_TTL) {
    return cached.token;
  }

  try {
    const bridgeToken = process.env.BRIDGE_AUTH_TOKEN;
    if (!bridgeToken) {
      log.warn({ gatewayId }, 'No BRIDGE_AUTH_TOKEN — cannot fetch webhook secret token');
      return null;
    }

    const apiHost = process.env.CREDENTIAL_API_HOST || '172.17.0.1';
    const apiPort = parseInt(process.env.CREDENTIAL_API_PORT || '3002', 10);

    const data = await new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: apiHost,
          port: apiPort,
          path: `/internal/credentials/${gatewayId}`,
          method: 'GET',
          headers: { 'X-Bridge-Token': bridgeToken, Accept: 'application/json' },
          timeout: 5000,
        },
        (res) => {
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => {
            try {
              resolve(JSON.parse(Buffer.concat(chunks).toString()));
            } catch {
              reject(new Error('Invalid JSON from credentials endpoint'));
            }
          });
          res.on('error', reject);
        },
      );
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
      req.end();
    });

    const token = (data && data.success && data.data?.webhookSecretToken) || null;
    webhookSecretTokenCache.set(gatewayId, { token, fetchedAt: Date.now() });
    return token;
  } catch (err) {
    log.warn({ gatewayId, error: err.message }, 'Failed to fetch webhook secret token');
    // If we had a previous cached value, keep using it
    if (cached) return cached.token;
    return null;
  }
}

/**
 * Determine Telegram event type from a raw update object.
 * @param {object} update - Raw Telegram Update
 * @returns {string} Event type string
 */
function detectTelegramEventType(update) {
  if (update.message) return 'telegram.message';
  if (update.callback_query) return 'telegram.callback';
  if (update.edited_message) return 'telegram.edited_message';
  if (update.channel_post) return 'telegram.channel_post';
  if (update.edited_channel_post) return 'telegram.edited_channel_post';
  if (update.inline_query) return 'telegram.inline_query';
  if (update.chosen_inline_result) return 'telegram.chosen_inline_result';
  if (update.my_chat_member) return 'telegram.my_chat_member';
  if (update.chat_member) return 'telegram.chat_member';
  if (update.chat_join_request) return 'telegram.chat_join_request';
  return 'telegram.unknown';
}

/**
 * Determine Discord event type from a raw interaction object.
 * @param {object} interaction - Raw Discord Interaction
 * @returns {string} Event type string
 */
function detectDiscordEventType(interaction) {
  switch (interaction.type) {
    case 1: return 'discord.ping';
    case 2: return 'discord.interaction'; // APPLICATION_COMMAND
    case 3: return 'discord.interaction'; // MESSAGE_COMPONENT
    case 4: return 'discord.interaction'; // AUTOCOMPLETE
    case 5: return 'discord.interaction'; // MODAL_SUBMIT
    default: return 'discord.unknown';
  }
}

/**
 * Determine Slack event type from a raw event payload.
 * @param {object} payload - Raw Slack Events API or interaction payload
 * @returns {string} Event type string
 */
function detectSlackEventType(payload) {
  // Event callback — look at inner event type
  if (payload.type === 'event_callback' && payload.event) {
    const eventType = payload.event.type;
    if (eventType === 'message') return 'slack.message';
    if (eventType === 'app_mention') return 'slack.app_mention';
    if (eventType === 'reaction_added') return 'slack.reaction_added';
    if (eventType === 'reaction_removed') return 'slack.reaction_removed';
    return `slack.${eventType}`;
  }
  // Interactions
  if (payload.type === 'block_actions') return 'slack.interaction';
  if (payload.type === 'shortcut' || payload.type === 'message_action') return 'slack.interaction';
  if (payload.type === 'view_submission' || payload.type === 'view_closed') return 'slack.interaction';
  // URL verification
  if (payload.type === 'url_verification') return 'slack.url_verification';
  return 'slack.unknown';
}

/**
 * Determine WhatsApp event type from a raw webhook payload.
 * @param {object} payload - Raw WhatsApp Cloud API webhook payload
 * @returns {string} Event type string
 */
function detectWhatsAppEventType(payload) {
  // WhatsApp payloads contain entry[].changes[].value with messages or statuses
  if (payload.entry) {
    for (const entry of payload.entry) {
      for (const change of (entry.changes || [])) {
        if (change.value?.messages?.length > 0) return 'whatsapp.message';
        if (change.value?.statuses?.length > 0) return 'whatsapp.status';
      }
    }
  }
  return 'whatsapp.unknown';
}

// ===========================================
// Factory
// ===========================================

/**
 * Create a webhook handler function.
 *
 * @param {{ pluginRunner: object, log: object, emitEvent: Function }} deps
 * @returns {(req: import('http').IncomingMessage, res: import('http').ServerResponse) => Promise<boolean>}
 *   Returns true if the request was handled, false otherwise.
 */
function createWebhookHandler({ pluginRunner, log, emitEvent }) {
  return async function handleWebhook(req, res) {
    const route = req.method === 'POST' ? matchWebhookRoute(req.url) : null;
    if (!route) return false;

    try {
      // Parse body first (shared by all platforms)
      const body = await collectBody(req);
      let payload;
      try {
        payload = JSON.parse(body.toString());
      } catch {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Invalid JSON' }));
        return true;
      }

      // ── Telegram handling ──
      if (route.platform === 'telegram') {
        return await handleTelegramWebhookEvent(route.gatewayId, payload, req, res, body, { pluginRunner, log, emitEvent });
      }

      // ── Discord handling ──
      if (route.platform === 'discord') {
        return await handleDiscordWebhookEvent(route.gatewayId, payload, req, res, body, { pluginRunner, log, emitEvent });
      }

      // ── Slack handling ──
      if (route.platform === 'slack') {
        return await handleSlackWebhookEvent(route.gatewayId, payload, req, res, body, { pluginRunner, log, emitEvent });
      }

      // ── WhatsApp handling ──
      if (route.platform === 'whatsapp') {
        return await handleWhatsAppWebhookEvent(route.gatewayId, payload, req, res, body, { pluginRunner, log, emitEvent });
      }

      return false;
    } catch (err) {
      log.error({ error: err.message }, 'Webhook handler error');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Internal error' }));
    }

    return true;
  };

  /**
   * Handle a Telegram webhook event
   */
  async function handleTelegramWebhookEvent(gatewayId, update, req, res, body, deps) {
    const { pluginRunner, log, emitEvent } = deps;

    // 1. Validate Telegram secret token
    const expectedToken = await getWebhookSecretToken(gatewayId, log);
    if (expectedToken) {
      const headerToken = req.headers['x-telegram-bot-api-secret-token'];
      if (headerToken !== expectedToken) {
        log.warn({ gatewayId }, 'Webhook secret token mismatch');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Invalid secret token' }));
        return true;
      }
    }

    // 2. Validate update
    if (!update || typeof update.update_id !== 'number') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Invalid update payload' }));
      return true;
    }

    // 3. Container-side dedup — skip if this update_id was already processed
    if (isDuplicateEvent(gatewayId, update.update_id)) {
      log.info({ gatewayId, updateId: update.update_id }, 'Duplicate Telegram update — skipping');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, data: { received: true, duplicate: true } }));
      return true;
    }

    log.info({ gatewayId, updateId: update.update_id }, 'Telegram webhook received directly');

    // 4. Determine event type
    const eventType = detectTelegramEventType(update);

    // 5. Build event envelope
    const event = {
      type: eventType,
      data: update,
      gatewayId,
    };

    // 6. Sequential dispatch with event claiming
    //    First plugin to return a truthy output "claims" the event.
    //    Subsequent plugins receive event._claimed = true so they can skip responding.
    const botDirPrefix = `bots/${gatewayId}/`;
    const running = pluginRunner.list().filter(p =>
      p.status === 'running' &&
      (p.file.startsWith(botDirPrefix) || p.gatewayId === gatewayId)
    );

    let pushed = 0;
    let claimed = false;
    for (const proc of running) {
      const enrichedEvent = claimed ? { ...event, _claimed: true } : event;
      try {
        const result = await pluginRunner.pushEvent(proc.file, enrichedEvent);
        if (result.success) {
          pushed++;
          // If plugin returned a truthy output, it claimed the event
          if (!claimed && result.output !== null && result.output !== undefined) {
            claimed = true;
          }
        }
      } catch (err) {
        log.warn({ plugin: proc.file, error: err.message }, 'Plugin event dispatch failed');
      }
    }

    log.info({ gatewayId, eventType, pushed, claimed, total: running.length }, 'Telegram webhook routed to plugins');

    // Emit inbound traffic log to platform
    emitEvent('traffic.inbound', {
      timestamp: new Date().toISOString(),
      domain: 'api.telegram.org',
      url: req.url,
      method: 'POST',
      httpStatus: 200,
      bytesTransferred: body.length,
      sourceType: 'telegram',
      gatewayId,
      eventType,
      pluginsDelivered: pushed,
    });

    // Always 200 to Telegram
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, data: { received: true, pushed } }));
    return true;
  }

  /**
   * Handle a Discord interaction webhook event
   */
  async function handleDiscordWebhookEvent(gatewayId, interaction, req, res, body, deps) {
    const { pluginRunner, log, emitEvent } = deps;

    // 1. Handle PING (type 1) — Discord URL verification
    if (interaction.type === 1) {
      log.info({ gatewayId }, 'Discord PING received in bridge-agent');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ type: 1 })); // PONG
      return true;
    }

    log.info({ gatewayId, interactionId: interaction.id, interactionType: interaction.type }, 'Discord interaction received directly');

    // Container-side dedup
    if (isDuplicateEvent(gatewayId, interaction.id)) {
      log.info({ gatewayId, interactionId: interaction.id }, 'Duplicate Discord interaction — skipping');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ type: 1 }));
      return true;
    }

    // 2. Determine event type
    const eventType = detectDiscordEventType(interaction);

    // 3. Build event envelope
    const event = {
      type: eventType,
      data: interaction,
      gatewayId,
    };

    // 4. Sequential dispatch with event claiming
    const botDirPrefix = `bots/${gatewayId}/`;
    const running = pluginRunner.list().filter(p =>
      p.status === 'running' &&
      (p.file.startsWith(botDirPrefix) || p.gatewayId === gatewayId)
    );

    let pushed = 0;
    let claimed = false;
    for (const proc of running) {
      const enrichedEvent = claimed ? { ...event, _claimed: true } : event;
      try {
        const result = await pluginRunner.pushEvent(proc.file, enrichedEvent);
        if (result.success) {
          pushed++;
          if (!claimed && result.output !== null && result.output !== undefined) {
            claimed = true;
          }
        }
      } catch (err) {
        log.warn({ plugin: proc.file, error: err.message }, 'Plugin event dispatch failed');
      }
    }

    log.info({ gatewayId, eventType, pushed, claimed, total: running.length }, 'Discord interaction routed to plugins');

    // Emit inbound traffic log
    emitEvent('traffic.inbound', {
      timestamp: new Date().toISOString(),
      domain: 'discord.com',
      url: req.url,
      method: 'POST',
      httpStatus: 200,
      bytesTransferred: body.length,
      sourceType: 'discord',
      gatewayId,
      eventType,
      pluginsDelivered: pushed,
    });

    // Return DEFERRED response for commands/components, PONG for others
    if (interaction.type === 2 || interaction.type === 3) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ type: 5 })); // DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ type: 1 }));
    }
    return true;
  }

  /**
   * Handle a Slack webhook event
   */
  async function handleSlackWebhookEvent(gatewayId, payload, req, res, body, deps) {
    const { pluginRunner, log, emitEvent } = deps;

    // 1. Handle url_verification challenge
    if (payload.type === 'url_verification') {
      log.info({ gatewayId }, 'Slack URL verification received in bridge-agent');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ challenge: payload.challenge }));
      return true;
    }

    // Parse interaction payloads (come as form-encoded `payload` field)
    let eventPayload = payload;
    if (typeof payload.payload === 'string') {
      try {
        eventPayload = JSON.parse(payload.payload);
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid interaction payload' }));
        return true;
      }
    }

    log.info({ gatewayId, payloadType: eventPayload.type }, 'Slack webhook received directly');

    // Container-side dedup (Slack uses event_id or trigger_id)
    const slackUniqueId = eventPayload.event_id || eventPayload.trigger_id || eventPayload.event?.event_ts;
    if (slackUniqueId && isDuplicateEvent(gatewayId, slackUniqueId)) {
      log.info({ gatewayId, slackUniqueId }, 'Duplicate Slack event — skipping');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return true;
    }

    // 2. Determine event type
    const eventType = detectSlackEventType(eventPayload);

    // 3. Build event envelope
    const event = {
      type: eventType,
      data: eventPayload,
      gatewayId,
    };

    // 4. Sequential dispatch with event claiming
    const botDirPrefix = `bots/${gatewayId}/`;
    const running = pluginRunner.list().filter(p =>
      p.status === 'running' &&
      (p.file.startsWith(botDirPrefix) || p.gatewayId === gatewayId)
    );

    let pushed = 0;
    let claimed = false;
    for (const proc of running) {
      const enrichedEvent = claimed ? { ...event, _claimed: true } : event;
      try {
        const result = await pluginRunner.pushEvent(proc.file, enrichedEvent);
        if (result.success) {
          pushed++;
          if (!claimed && result.output !== null && result.output !== undefined) {
            claimed = true;
          }
        }
      } catch (err) {
        log.warn({ plugin: proc.file, error: err.message }, 'Plugin event dispatch failed');
      }
    }

    log.info({ gatewayId, eventType, pushed, claimed, total: running.length }, 'Slack webhook routed to plugins');

    // Emit inbound traffic log
    emitEvent('traffic.inbound', {
      timestamp: new Date().toISOString(),
      domain: 'slack.com',
      url: req.url,
      method: 'POST',
      httpStatus: 200,
      bytesTransferred: body.length,
      sourceType: 'slack',
      gatewayId,
      eventType,
      pluginsDelivered: pushed,
    });

    // Return 200 immediately — Slack requires fast responses
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return true;
  }

  /**
   * Handle a WhatsApp Cloud API webhook event
   */
  async function handleWhatsAppWebhookEvent(gatewayId, payload, req, res, body, deps) {
    const { pluginRunner, log, emitEvent } = deps;

    log.info({ gatewayId, object: payload.object }, 'WhatsApp webhook received directly');

    // Validate this is a WhatsApp business account notification
    if (payload.object !== 'whatsapp_business_account') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return true;
    }

    // Container-side dedup (WhatsApp message ID from nested entry structure)
    const waMessages = payload.entry?.[0]?.changes?.[0]?.value?.messages;
    const waUniqueId = waMessages?.[0]?.id || payload.entry?.[0]?.id;
    if (waUniqueId && isDuplicateEvent(gatewayId, waUniqueId)) {
      log.info({ gatewayId, waUniqueId }, 'Duplicate WhatsApp event — skipping');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return true;
    }

    // 1. Determine event type
    const eventType = detectWhatsAppEventType(payload);

    // 2. Build event envelope
    const event = {
      type: eventType,
      data: payload,
      gatewayId,
    };

    // 3. Sequential dispatch with event claiming
    const botDirPrefix = `bots/${gatewayId}/`;
    const running = pluginRunner.list().filter(p =>
      p.status === 'running' &&
      (p.file.startsWith(botDirPrefix) || p.gatewayId === gatewayId)
    );

    let pushed = 0;
    let claimed = false;
    for (const proc of running) {
      const enrichedEvent = claimed ? { ...event, _claimed: true } : event;
      try {
        const result = await pluginRunner.pushEvent(proc.file, enrichedEvent);
        if (result.success) {
          pushed++;
          if (!claimed && result.output !== null && result.output !== undefined) {
            claimed = true;
          }
        }
      } catch (err) {
        log.warn({ plugin: proc.file, error: err.message }, 'Plugin event dispatch failed');
      }
    }

    log.info({ gatewayId, eventType, pushed, claimed, total: running.length }, 'WhatsApp webhook routed to plugins');

    // Emit inbound traffic log
    emitEvent('traffic.inbound', {
      timestamp: new Date().toISOString(),
      domain: 'graph.facebook.com',
      url: req.url,
      method: 'POST',
      httpStatus: 200,
      bytesTransferred: body.length,
      sourceType: 'whatsapp',
      gatewayId,
      eventType,
      pluginsDelivered: pushed,
    });

    // Return 200 immediately — Meta requires fast responses
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return true;
  }
}

module.exports = { createWebhookHandler };
