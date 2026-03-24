'use strict';

/**
 * Scheduled Reporter — Event-Driven + Timer
 *
 * Sends periodic summary reports to a Telegram chat.
 * Also tracks incoming messages to build the report data.
 */

const sdk = require('/bridge-agent/plugin-sdk');

// Report interval (configurable, default 60 minutes)
const intervalMinutes = sdk.config.intervalMinutes || 60;
const REPORT_INTERVAL_MS = intervalMinutes * 60 * 1000;

// Track incoming events for reports
sdk.onEvent(async (event) => {
  if (event.type === 'telegram.message') {
    await sdk.storage.increment('totalMessages');
    const userId = event.data?.message?.from?.id;
    if (userId) {
      await sdk.storage.set('user:' + userId + ':last', new Date().toISOString(), 86400);
      await sdk.storage.increment('uniqueUsers');
    }
  }
});

async function sendReport() {
  const chatId = sdk.config.reportChatId || (await sdk.storage.get('reportChatId'));
  if (!chatId) {
    console.log('[reporter] No reportChatId configured — skipping report');
    return;
  }

  // Find gateway
  const gateways = await sdk.gateway.list();
  const boundId = process.env.PLUGIN_GATEWAY_ID;
  const tg = boundId
    ? gateways.find((g) => g.id === boundId)
    : gateways.find((g) => g.type === 'TELEGRAM_BOT');

  if (!tg) {
    console.log('[reporter] No Telegram gateway available');
    return;
  }

  const totalMessages = (await sdk.storage.get('totalMessages')) || 0;
  const uniqueUsers = (await sdk.storage.get('uniqueUsers')) || 0;

  const report = [
    '📊 *Periodic Report*',
    '',
    'Messages processed: ' + totalMessages,
    'Unique users: ' + uniqueUsers,
    'Report time: ' + new Date().toISOString(),
  ].join('\n');

  await sdk.gateway.execute(tg.id, 'sendMessage', {
    chat_id: String(chatId),
    text: report,
    parse_mode: 'Markdown',
  });

  await sdk.storage.set('lastReportAt', new Date().toISOString());
  console.log('[reporter] Report sent');
}

// Send periodic reports
setInterval(() => {
  sendReport().catch((err) => console.error('[reporter] Report error:', err.message));
}, REPORT_INTERVAL_MS);

// Send initial report after short delay
setTimeout(() => {
  sendReport().catch((err) => console.error('[reporter] Initial report error:', err.message));
}, 5000);

console.log('[reporter] Ready — reports every ' + intervalMinutes + ' minutes');
