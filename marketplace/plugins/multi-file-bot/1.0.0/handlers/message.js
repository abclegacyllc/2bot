'use strict';

/**
 * Message Handler
 *
 * Processes incoming Telegram messages.
 * Separated for maintainability — import this from index.js.
 */

const { formatHelp } = require('../utils/formatter');

async function handleMessage(sdk, event) {
  const msg = event.data?.message;
  if (!msg?.text || !msg?.chat?.id) return;

  const chatId = msg.chat.id;
  const text = msg.text.trim();

  if (text === '/start' || text === '/help') {
    const helpText = formatHelp();
    await sdk.gateway.execute(event.gatewayId, 'sendMessage', {
      chat_id: chatId,
      text: helpText,
      parse_mode: 'Markdown',
    });
    return;
  }

  if (text === '/stats') {
    const count = await sdk.storage.get('message_count') || 0;
    await sdk.gateway.execute(event.gatewayId, 'sendMessage', {
      chat_id: chatId,
      text: `📊 Messages processed: ${count}`,
    });
    return;
  }

  // Track message count
  await sdk.storage.increment('message_count');

  // Echo the message back with formatting
  await sdk.gateway.execute(event.gatewayId, 'sendMessage', {
    chat_id: chatId,
    text: `You said: *${text}*`,
    parse_mode: 'Markdown',
  });
}

module.exports = { handleMessage };
