'use strict';

/**
 * Command Bot — Event-Driven
 *
 * A Telegram bot that responds to slash commands (/start, /help, etc.).
 * Demonstrates: command parsing, multi-command routing, user tracking.
 */

const sdk = require('/bridge-agent/plugin-sdk');

// Command handlers
const commands = {
  '/start': async (chatId, _args, userId) => {
    await sdk.storage.set('user:' + userId + ':joined', new Date().toISOString());
    await sdk.storage.increment('totalUsers');
    return sdk.config.welcomeMessage || 'Welcome! 🤖 Use /help to see available commands.';
  },

  '/help': async () => {
    return [
      '📋 *Available Commands*',
      '',
      '/start — Register and get started',
      '/help — Show this help message',
      '/stats — View bot statistics',
      '/ping — Check bot responsiveness',
    ].join('\n');
  },

  '/stats': async () => {
    const totalUsers = (await sdk.storage.get('totalUsers')) || 0;
    const totalCommands = (await sdk.storage.get('totalCommands')) || 0;
    return '📊 Stats\n\nUsers: ' + totalUsers + '\nCommands processed: ' + totalCommands;
  },

  '/ping': async () => {
    return '🏓 Pong! Latency: ' + (Date.now() % 1000) + 'ms';
  },
};

sdk.onEvent(async (event) => {
  if (event.type !== 'telegram.message') return;

  const msg = event.data?.message;
  if (!msg?.text || !msg.text.startsWith('/')) return;

  const parts = msg.text.trim().split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const args = parts.slice(1);

  const handler = commands[cmd];
  if (handler) {
    const userId = msg.from?.id || 'unknown';
    const response = await handler(msg.chat.id, args, userId);
    await sdk.gateway.execute(event.gatewayId, 'sendMessage', {
      chat_id: msg.chat.id,
      text: response,
      parse_mode: 'Markdown',
    });
    await sdk.storage.increment('totalCommands');
  }
});

console.log('[command-bot] Ready — waiting for commands');
