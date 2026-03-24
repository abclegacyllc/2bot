'use strict';

/**
 * /data handler — simple CRUD for stored data
 *
 * Usage:
 *   /data set <key> <value> — Store a value
 *   /data get <key>         — Retrieve a value
 *   /data del <key>         — Delete a value
 */

async function handleData(sdk, event) {
  const chatId = event.data.message.chat.id;
  const parts = event.data.message.text.trim().split(/\s+/);
  const action = (parts[1] || '').toLowerCase();
  const key = parts[2];
  const value = parts.slice(3).join(' ');

  await sdk.storage.increment('request_count');

  if (action === 'set' && key && value) {
    await sdk.storage.set(`data:${key}`, value);
    await sdk.gateway.execute(event.gatewayId, 'sendMessage', {
      chat_id: chatId,
      text: `✅ Stored: ${key} = ${value}`,
    });
  } else if (action === 'get' && key) {
    const stored = await sdk.storage.get(`data:${key}`);
    await sdk.gateway.execute(event.gatewayId, 'sendMessage', {
      chat_id: chatId,
      text: stored != null ? `📦 ${key} = ${stored}` : `❌ Key not found: ${key}`,
    });
  } else if (action === 'del' && key) {
    await sdk.storage.delete(`data:${key}`);
    await sdk.gateway.execute(event.gatewayId, 'sendMessage', {
      chat_id: chatId,
      text: `🗑️ Deleted: ${key}`,
    });
  } else {
    await sdk.gateway.execute(event.gatewayId, 'sendMessage', {
      chat_id: chatId,
      text: [
        '*Data Commands:*',
        '/data set <key> <value>',
        '/data get <key>',
        '/data del <key>',
      ].join('\n'),
      parse_mode: 'Markdown',
    });
  }
}

module.exports = { handleData };
