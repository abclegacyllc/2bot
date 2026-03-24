'use strict';

/**
 * Callback Query Handler
 *
 * Processes inline button callbacks from Telegram.
 */

async function handleCallback(sdk, event) {
  const cb = event.data?.callback_query;
  if (!cb?.data || !cb?.message?.chat?.id) return;

  const chatId = cb.message.chat.id;

  // Acknowledge the callback
  await sdk.gateway.execute(event.gatewayId, 'answerCallbackQuery', {
    callback_query_id: cb.id,
    text: 'Got it!',
  });

  await sdk.gateway.execute(event.gatewayId, 'sendMessage', {
    chat_id: chatId,
    text: `Button pressed: ${cb.data}`,
  });
}

module.exports = { handleCallback };
