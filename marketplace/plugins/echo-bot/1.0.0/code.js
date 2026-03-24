'use strict';

/**
 * Echo Bot — Event-Driven
 *
 * Echoes back every Telegram message with a configurable prefix.
 * Events are pushed by the platform — no polling needed.
 *
 * In workflow mode: returns the echoed text as structured output.
 *
 * Config: { prefix: string, ignoreCommands: boolean }
 */

const sdk = require('/bridge-agent/plugin-sdk');

sdk.onEvent(async (event) => {
  // Workflow mode: process input and return output (no gateway messages)
  if (sdk.isWorkflowStep(event)) {
    const input = sdk.getWorkflowInput(event);
    const text = (input && input.text) || (event.data?.message?.text) || '';
    const prefix = sdk.config.prefix ?? 'Echo:';
    return { text: prefix + ' ' + text };
  }

  if (event.type !== 'telegram.message') return;

  const msg = event.data?.message;
  if (!msg?.text) return;

  const prefix = sdk.config.prefix ?? 'Echo:';
  if (sdk.config.ignoreCommands && msg.text.startsWith('/')) return;

  await sdk.gateway.execute(event.gatewayId, 'sendMessage', {
    chat_id: msg.chat.id,
    text: prefix + ' ' + msg.text,
  });

  await sdk.storage.increment('totalMessages');
});

sdk.onInstall(async () => {
  console.log('[echo-bot] Installed — will echo messages when events arrive');
});

console.log('[echo-bot] Ready — waiting for events');
