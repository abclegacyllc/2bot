'use strict';

/**
 * Auto Responder — Event-Driven
 *
 * Responds to messages containing specific keywords with
 * pre-configured replies. Events are pushed by the platform.
 */

const sdk = require('/bridge-agent/plugin-sdk');

// Default keyword-response pairs (can be customised via config or storage)
const DEFAULT_RULES = [
  { keyword: 'hello', response: 'Hey there! 👋 How can I help?' },
  { keyword: 'help', response: 'Available commands: hello, help, status' },
  { keyword: 'status', response: '✅ Bot is online and running!' },
];

async function loadRules() {
  const custom = await sdk.storage.get('rules');
  return custom || sdk.config.rules || DEFAULT_RULES;
}

sdk.onEvent(async (event) => {
  if (event.type !== 'telegram.message') return;

  const msg = event.data?.message;
  if (!msg?.text) return;

  const text = msg.text.toLowerCase();
  const rules = await loadRules();

  for (const rule of rules) {
    if (text.includes(rule.keyword.toLowerCase())) {
      await sdk.gateway.execute(event.gatewayId, 'sendMessage', {
        chat_id: msg.chat.id,
        text: rule.response,
      });

      await sdk.storage.increment('hits:' + rule.keyword);
      break; // Only first matching rule
    }
  }
});

console.log('[auto-responder] Ready — waiting for events');
