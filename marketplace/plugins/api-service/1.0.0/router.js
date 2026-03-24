'use strict';

/**
 * Command Router
 *
 * Routes incoming messages to the appropriate handler
 * based on the command prefix.
 */

const { handleStatus } = require('./handlers/status');
const { handleData } = require('./handlers/data');

const routes = {
  '/status': handleStatus,
  '/data': handleData,
};

async function router(sdk, event, config) {
  const msg = event.data.message;
  const text = msg.text.trim();
  const command = text.split(' ')[0].toLowerCase();

  const handler = routes[command];
  if (handler) {
    await handler(sdk, event, config);
    return;
  }

  // Default: show available commands
  const commands = Object.keys(routes).join(', ');
  await sdk.gateway.execute(event.gatewayId, 'sendMessage', {
    chat_id: msg.chat.id,
    text: `Available commands: ${commands}`,
  });
}

module.exports = { router };
