'use strict';
const sdk = require('/bridge-agent/plugin-sdk');
const { storage, gateway, config } = sdk;

const trackUsers = config.trackUsers !== false;
const trackChats = config.trackChats !== false;
const enableHourly = config.enableHourlyStats !== false;

function todayKey() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function hourKey() {
  return new Date().toISOString().slice(0, 13); // YYYY-MM-DDTHH
}

sdk.onEvent(async (event) => {
  const message = event.data?.message;
  if (!message) return;

  const chatId = String(message.chat?.id || '');
  const userId = String(message.from?.id || '');
  const username = message.from?.username || message.from?.first_name || 'unknown';
  const chatTitle = message.chat?.title || chatId;
  const day = todayKey();

  // Global counters
  await storage.increment('stats:totalMessages');
  await storage.increment('stats:daily:' + day);

  if (enableHourly) {
    await storage.increment('stats:hourly:' + hourKey());
  }

  // Track unique users
  if (trackUsers && userId) {
    const userData = await storage.get('user:' + userId);
    const user = userData ? JSON.parse(userData) : { username, messageCount: 0, firstSeen: new Date().toISOString() };
    user.username = username;
    user.messageCount = (user.messageCount || 0) + 1;
    user.lastSeen = new Date().toISOString();
    await storage.set('user:' + userId, JSON.stringify(user));

    // Track unique user count
    await storage.set('userIndex:' + userId, '1');
  }

  // Track chats
  if (trackChats && chatId) {
    const chatData = await storage.get('chat:' + chatId);
    const chat = chatData ? JSON.parse(chatData) : { title: chatTitle, messageCount: 0, firstSeen: new Date().toISOString() };
    chat.title = chatTitle;
    chat.messageCount = (chat.messageCount || 0) + 1;
    chat.lastActivity = new Date().toISOString();
    await storage.set('chat:' + chatId, JSON.stringify(chat));

    await storage.set('chatIndex:' + chatId, '1');
  }

  console.log('[analytics] Tracked message from user=' + userId + ' chat=' + chatId);
});

// Respond to /stats command
sdk.onEvent(async (event) => {
  const message = event.data?.message;
  if (!message?.text?.startsWith('/stats')) return;

  const totalMessages = await storage.get('stats:totalMessages') || '0';
  const today = todayKey();
  const todayMessages = await storage.get('stats:daily:' + today) || '0';

  // Count unique users
  const userKeys = await storage.keys('userIndex:*');
  const chatKeys = await storage.keys('chatIndex:*');

  let text = '📊 *Channel Analytics*\n\n';
  text += '📨 Total messages: ' + totalMessages + '\n';
  text += '📅 Today: ' + todayMessages + '\n';
  text += '👥 Unique users: ' + userKeys.length + '\n';
  text += '💬 Active chats: ' + chatKeys.length + '\n';

  await gateway.execute(event.gatewayId, 'sendMessage', {
    chat_id: message.chat.id,
    text: text,
    parse_mode: 'Markdown',
  });
});

console.log('[analytics] Channel Analytics ready — tracking messages');
