'use strict';

/**
 * API Service Plugin — Entry Point
 *
 * A multi-file plugin demonstrating how to build an API-like service
 * with separate route handlers, middleware, and configuration.
 *
 * Messages are routed to different handlers based on commands.
 */

const sdk = require('/bridge-agent/plugin-sdk');
const { router } = require('./router');

// Load config from platform
const config = sdk.config || {};

sdk.onEvent(async (event) => {
  const msg = event.data?.message;
  if (!msg?.text || !msg?.chat?.id) return;

  try {
    await router(sdk, event, config);
  } catch (err) {
    console.error('[api-service] Handler error:', err.message);
    await sdk.gateway.execute(event.gatewayId, 'sendMessage', {
      chat_id: msg.chat.id,
      text: '❌ Internal error — check plugin logs.',
    });
  }
});

console.log('[api-service] API Service plugin started');
