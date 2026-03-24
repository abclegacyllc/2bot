'use strict';

/**
 * Blank Plugin Template
 *
 * A minimal starting point for your custom plugin.
 * Uses the 2Bot Plugin SDK — events are pushed to your plugin automatically.
 */

const sdk = require('/bridge-agent/plugin-sdk');

// Called when a Telegram message or callback arrives
sdk.onEvent(async (event) => {
  console.log('[my-plugin] Received event:', event.type);

  // event.type = 'telegram.message' | 'telegram.callback' | etc.
  // event.data = the full Telegram update payload
  // event.gatewayId = which gateway sent this event

  // Example: respond to messages
  // if (event.type === 'telegram.message') {
  //   const msg = event.data?.message;
  //   if (msg?.text) {
  //     await sdk.gateway.execute(event.gatewayId, 'sendMessage', {
  //       chat_id: msg.chat.id,
  //       text: 'Hello!',
  //     });
  //   }
  // }

  // Example: use storage
  // await sdk.storage.set('myKey', 'hello world');
  // const value = await sdk.storage.get('myKey');
});

console.log('[my-plugin] Plugin ready — waiting for events');
