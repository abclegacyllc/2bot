'use strict';

/**
 * /status handler — returns service health info
 */

async function handleStatus(sdk, event) {
  const chatId = event.data.message.chat.id;
  const uptime = process.uptime();
  const requestCount = await sdk.storage.get('request_count') || 0;

  const hours = Math.floor(uptime / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);

  await sdk.gateway.execute(event.gatewayId, 'sendMessage', {
    chat_id: chatId,
    text: [
      '📊 *Service Status*',
      '',
      `⏱ Uptime: ${hours}h ${minutes}m`,
      `📨 Requests: ${requestCount}`,
      `💾 Memory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
    ].join('\n'),
    parse_mode: 'Markdown',
  });

  await sdk.storage.increment('request_count');
}

module.exports = { handleStatus };
