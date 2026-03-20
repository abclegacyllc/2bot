/**
 * Plugin Templates
 *
 * Starter code templates for user-created custom plugins.
 * Each template provides working JavaScript code that uses the
 * Plugin SDK (storage + gateway APIs) and can be deployed directly
 * via the Custom Plugin API.
 *
 * Templates target the workspace container runtime where plugins
 * run as child processes with access to `/bridge-agent/plugin-sdk.js`.
 *
 * @module modules/plugin/plugin-templates
 */

import type { GatewayType } from "@prisma/client";

import type { JSONSchema, PluginCategory } from "./plugin.types";

// ===========================================
// Template Definition
// ===========================================

export interface PluginTemplate {
  /** Unique template identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Short description of what the template does */
  description: string;
  /** Plugin category */
  category: PluginCategory;
  /** Required gateway types */
  requiredGateways: GatewayType[];
  /** Tags for filtering */
  tags: string[];
  /** Difficulty level */
  difficulty: "beginner" | "intermediate" | "advanced";
  /** Default config schema for this template */
  configSchema: JSONSchema;
  /** The JavaScript source code (single-file templates) */
  code: string;
  /** Whether this is a directory (multi-file) template */
  isDirectory?: false;
}

/**
 * A directory (multi-file) plugin template.
 * Instead of a single `code` string, provides a `files` map.
 */
export interface PluginDirectoryTemplate {
  /** Unique template identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Short description of what the template does */
  description: string;
  /** Plugin category */
  category: PluginCategory;
  /** Required gateway types */
  requiredGateways: GatewayType[];
  /** Tags for filtering */
  tags: string[];
  /** Difficulty level */
  difficulty: "beginner" | "intermediate" | "advanced";
  /** Default config schema for this template */
  configSchema: JSONSchema;
  /** This is a directory template */
  isDirectory: true;
  /** Entry file relative to the plugin directory (default: "index.js") */
  entry: string;
  /** Files to scaffold — key is relative path within the plugin dir, value is content */
  files: Record<string, string>;
}

/** Union type for both single-file and directory templates */
export type AnyPluginTemplate = PluginTemplate | PluginDirectoryTemplate;

/**
 * Template list item (without full code) for catalog listings
 */
export interface PluginTemplateListItem {
  id: string;
  name: string;
  description: string;
  category: PluginCategory;
  requiredGateways: GatewayType[];
  tags: string[];
  difficulty: "beginner" | "intermediate" | "advanced";
  /** Whether this is a directory (multi-file) template */
  isDirectory?: boolean;
}

// ===========================================
// Template Code Strings
// ===========================================

const BLANK_CODE = `'use strict';

/**
 * Blank Plugin Template
 *
 * A minimal starting point for your custom plugin.
 * Uses the 2Bot Plugin SDK — events are pushed to your plugin automatically.
 */

const sdk = require('/bridge-agent/plugin-sdk');

// Called when a Telegram message or callback arrives
sdk.onEvent(async (event) => {
  console.log('[my-plugin] Received event:', event.type);

  // event.type = 'telegram.message' | 'telegram.callback' | etc.
  // event.data = the full Telegram update payload
  // event.gatewayId = which gateway sent this event

  // Example: respond to messages
  // if (event.type === 'telegram.message') {
  //   const msg = event.data?.message;
  //   if (msg?.text) {
  //     await sdk.gateway.execute(event.gatewayId, 'sendMessage', {
  //       chat_id: msg.chat.id,
  //       text: 'Hello!',
  //     });
  //   }
  // }

  // Example: use storage
  // await sdk.storage.set('myKey', 'hello world');
  // const value = await sdk.storage.get('myKey');
});

console.log('[my-plugin] Plugin ready — waiting for events');
`;

const ECHO_BOT_CODE = `'use strict';

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
`;

const STORAGE_DEMO_CODE = `'use strict';

/**
 * Storage Demo Template
 *
 * Demonstrates all Plugin SDK storage operations:
 *   set, get, has, delete, increment, keys, getMany, setMany
 *
 * Runs the demo once on startup, then stays alive for events.
 */

const sdk = require('/bridge-agent/plugin-sdk');

async function runDemo() {
  console.log('[storage-demo] Running storage operations...');

  // 1. Set a value
  await sdk.storage.set('greeting', 'Hello from storage!');
  console.log('[storage-demo] Set greeting');

  // 2. Get a value
  const greeting = await sdk.storage.get('greeting');
  console.log('[storage-demo] Got greeting:', greeting);

  // 3. Set with TTL (auto-expires after 60 seconds)
  await sdk.storage.set('temporary', 'I will expire', 60);
  console.log('[storage-demo] Set temporary value with 60s TTL');

  // 4. Check existence
  const exists = await sdk.storage.has('greeting');
  console.log('[storage-demo] greeting exists:', exists);

  // 5. Increment a counter
  const count = await sdk.storage.increment('runCount');
  console.log('[storage-demo] Run count:', count);

  // 6. Increment by a custom amount
  const score = await sdk.storage.increment('score', 10);
  console.log('[storage-demo] Score:', score);

  // 7. Store a JSON object
  await sdk.storage.set('config', { theme: 'dark', language: 'en' });
  const config = await sdk.storage.get('config');
  console.log('[storage-demo] Config:', JSON.stringify(config));

  // 8. Delete a key
  await sdk.storage.delete('temporary');
  const deleted = await sdk.storage.has('temporary');
  console.log('[storage-demo] temporary exists after delete:', deleted);

  // 9. Find keys matching a pattern
  const keys = await sdk.storage.keys('*');
  console.log('[storage-demo] All keys:', keys);

  console.log('[storage-demo] All operations complete!');
}

// Run demo on startup
runDemo().catch((err) => {
  console.error('[storage-demo] Error:', err);
});

// Stay alive and log any events received
sdk.onEvent(async (event) => {
  console.log('[storage-demo] Received event:', event.type);
  await sdk.storage.increment('eventsReceived');
});
`;

const AUTO_RESPONDER_CODE = `'use strict';

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
`;

const SCHEDULED_REPORTER_CODE = `'use strict';

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
  ].join('\\n');

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
`;

const COMMAND_BOT_CODE = `'use strict';

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
    ].join('\\n');
  },

  '/stats': async () => {
    const totalUsers = (await sdk.storage.get('totalUsers')) || 0;
    const totalCommands = (await sdk.storage.get('totalCommands')) || 0;
    return '📊 Stats\\n\\nUsers: ' + totalUsers + '\\nCommands processed: ' + totalCommands;
  },

  '/ping': async () => {
    return '🏓 Pong! Latency: ' + (Date.now() % 1000) + 'ms';
  },
};

sdk.onEvent(async (event) => {
  if (event.type !== 'telegram.message') return;

  const msg = event.data?.message;
  if (!msg?.text || !msg.text.startsWith('/')) return;

  const parts = msg.text.trim().split(/\\s+/);
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
`;

// -------------------------------------------
// Channel Analytics (event-driven)
// -------------------------------------------
const CHANNEL_ANALYTICS_CODE = `'use strict';
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

  let text = '📊 *Channel Analytics*\\n\\n';
  text += '📨 Total messages: ' + totalMessages + '\\n';
  text += '📅 Today: ' + todayMessages + '\\n';
  text += '👥 Unique users: ' + userKeys.length + '\\n';
  text += '💬 Active chats: ' + chatKeys.length + '\\n';

  await gateway.execute(event.gatewayId, 'sendMessage', {
    chat_id: message.chat.id,
    text: text,
    parse_mode: 'Markdown',
  });
});

console.log('[analytics] Channel Analytics ready — tracking messages');
`;

const AI_CHAT_BOT_CODE = `'use strict';

/**
 * AI Chat Bot Template
 *
 * A Telegram bot powered by 2Bot AI. Responds to messages using
 * configurable AI models with conversation memory.
 *
 * In workflow mode: processes structured input and returns AI response as output.
 *
 * Config: { model: string, systemPrompt: string, maxHistory: number }
 */

const sdk = require('/bridge-agent/plugin-sdk');

sdk.onEvent(async (event) => {
  // Workflow mode: process input, return structured output (no gateway messages)
  if (sdk.isWorkflowStep(event)) {
    const input = sdk.getWorkflowInput(event);
    const prev = sdk.getWorkflowPreviousOutput(event);
    const text = (input && input.text) || (input && input.message) || (prev && prev.text) || '';
    const model = sdk.config.model || 'auto';
    const systemPrompt = sdk.config.systemPrompt || 'You are a helpful assistant.';

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: String(text) },
    ];

    const result = await sdk.ai.chat({ messages, model });
    return { content: result.content, model: result.model };
  }

  if (event.type !== 'telegram.message') return;

  const msg = event.data?.message;
  if (!msg?.text || msg.text.startsWith('/')) return;

  const chatId = msg.chat.id;
  const model = sdk.config.model || 'auto';
  const systemPrompt = sdk.config.systemPrompt || 'You are a helpful assistant.';
  const maxHistory = sdk.config.maxHistory ?? 10;

  try {
    // Load conversation history from storage
    const historyKey = 'chat:' + chatId;
    const history = (await sdk.storage.get(historyKey)) || [];

    // Build messages array with system prompt + history + new message
    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.slice(-maxHistory),
      { role: 'user', content: msg.text },
    ];

    // Call AI
    const result = await sdk.ai.chat({ messages, model });

    // Save updated history
    history.push({ role: 'user', content: msg.text });
    history.push({ role: 'assistant', content: result.content });
    await sdk.storage.set(historyKey, history.slice(-maxHistory * 2));

    // Send AI response to Telegram
    await sdk.gateway.execute(event.gatewayId, 'sendMessage', {
      chat_id: chatId,
      text: result.content,
    });
  } catch (err) {
    console.error('[ai-chat-bot] Error:', err.message);
    await sdk.gateway.execute(event.gatewayId, 'sendMessage', {
      chat_id: chatId,
      text: 'Sorry, I encountered an error. Please try again.',
    });
  }
});

console.log('[ai-chat-bot] AI Chat Bot ready — waiting for messages');
`;

const AI_IMAGE_BOT_CODE = `'use strict';

/**
 * AI Image Bot Template
 *
 * A Telegram bot that generates images from text prompts using 2Bot AI.
 * Users send a message and receive an AI-generated image in reply.
 *
 * Config: { model: string, triggerPrefix: string }
 */

const sdk = require('/bridge-agent/plugin-sdk');

sdk.onEvent(async (event) => {
  if (event.type !== 'telegram.message') return;

  const msg = event.data?.message;
  if (!msg?.text) return;

  const triggerPrefix = sdk.config.triggerPrefix || '/imagine ';

  // Only respond to messages starting with the trigger prefix
  if (!msg.text.startsWith(triggerPrefix)) return;

  const prompt = msg.text.slice(triggerPrefix.length).trim();
  if (!prompt) {
    await sdk.gateway.execute(event.gatewayId, 'sendMessage', {
      chat_id: msg.chat.id,
      text: 'Please provide a prompt after ' + triggerPrefix,
    });
    return;
  }

  const model = sdk.config.model || 'auto';

  try {
    // Send a "generating..." status
    await sdk.gateway.execute(event.gatewayId, 'sendMessage', {
      chat_id: msg.chat.id,
      text: '\u{1F3A8} Generating image...',
    });

    // Generate image via AI
    const result = await sdk.ai.generateImage({ prompt, model });

    if (result.images && result.images.length > 0) {
      await sdk.gateway.execute(event.gatewayId, 'sendPhoto', {
        chat_id: msg.chat.id,
        photo: result.images[0].url,
        caption: result.images[0].revisedPrompt || prompt,
      });
    }

    // Track usage
    await sdk.storage.increment('imagesGenerated');
  } catch (err) {
    console.error('[ai-image-bot] Error:', err.message);
    await sdk.gateway.execute(event.gatewayId, 'sendMessage', {
      chat_id: msg.chat.id,
      text: 'Sorry, image generation failed. Please try again.',
    });
  }
});

console.log('[ai-image-bot] AI Image Bot ready — send /imagine <prompt>');
`;

const WEATHER_BOT_CODE = `'use strict';

/**
 * Weather Bot — Telegram + Open-Meteo API
 *
 * Responds to /weather <city> commands with current weather data.
 * Uses the free Open-Meteo API (no API key required).
 *
 * SETUP:
 *   1. Go to the Workspace → Network → Allowed Domains tab
 *   2. Add these two domains:
 *      - geocoding-api.open-meteo.com
 *      - api.open-meteo.com
 *   3. Connect a Telegram bot gateway to this plugin
 *   4. Send /weather London (or any city)
 *
 * The plugin also demonstrates:
 *   - Making external HTTPS requests via sdk.fetch()
 *   - Using sdk.storage for caching and stats
 *   - Parsing Telegram commands with arguments
 */

const sdk = require('/bridge-agent/plugin-sdk');

/** Helper: fetch JSON from a URL using sdk.fetch() */
async function fetchJson(url) {
  const res = await sdk.fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status + ': ' + (await res.text()).slice(0, 200));
  return res.json();
}

// ── Weather code descriptions ──
const weatherDescriptions = {
  0: '☀️ Clear sky', 1: '🌤️ Mainly clear', 2: '⛅ Partly cloudy', 3: '☁️ Overcast',
  45: '🌫️ Fog', 48: '🌫️ Rime fog',
  51: '🌦️ Light drizzle', 53: '🌦️ Moderate drizzle', 55: '🌧️ Dense drizzle',
  61: '🌧️ Slight rain', 63: '🌧️ Moderate rain', 65: '🌧️ Heavy rain',
  71: '🌨️ Slight snow', 73: '🌨️ Moderate snow', 75: '❄️ Heavy snow',
  80: '🌦️ Rain showers', 81: '🌧️ Moderate showers', 82: '⛈️ Heavy showers',
  85: '🌨️ Snow showers', 86: '❄️ Heavy snow showers',
  95: '⛈️ Thunderstorm', 96: '⛈️ Thunderstorm + hail', 99: '⛈️ Severe thunderstorm',
};

sdk.onEvent(async (event) => {
  // Workflow mode: accept city as input, return weather data
  if (sdk.isWorkflowStep(event)) {
    const input = sdk.getWorkflowInput(event);
    const city = (input && (input.city || input.text)) || '';
    if (!city) return { error: 'No city provided in workflow input' };
    try {
      const geo = await fetchJson(
        'https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(city) + '&count=1'
      );
      if (!geo.results || geo.results.length === 0) return { error: 'City not found: ' + city };
      const loc = geo.results[0];
      const weather = await fetchJson(
        'https://api.open-meteo.com/v1/forecast?latitude=' + loc.latitude
        + '&longitude=' + loc.longitude
        + '&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code'
        + '&timezone=auto'
      );
      const c = weather.current;
      const desc = weatherDescriptions[c.weather_code] || 'Unknown';
      return {
        city: loc.name, country: loc.country,
        description: desc, temperature: c.temperature_2m,
        humidity: c.relative_humidity_2m, windSpeed: c.wind_speed_10m,
        time: weather.current.time,
      };
    } catch (err) {
      return { error: 'Weather fetch failed: ' + err.message };
    }
  }

  if (event.type !== 'telegram.message') return;

  const msg = event.data?.message;
  if (!msg?.text) return;

  const text = msg.text.trim();
  const chatId = msg.chat.id;

  // /start or /help
  if (text === '/start' || text === '/help') {
    await sdk.gateway.execute(event.gatewayId, 'sendMessage', {
      chat_id: chatId,
      text: '🌤️ *Weather Bot*\\n\\nSend me a city name to get the current weather:\\n\\n'
        + '/weather London\\n/weather Tokyo\\n/weather New York\\n\\n'
        + 'Powered by Open-Meteo (free, no API key needed).',
      parse_mode: 'Markdown',
    });
    return;
  }

  // /weather <city>
  if (!text.startsWith('/weather')) return;
  const city = text.replace(/^\\/weather\\s*/i, '').trim();
  if (!city) {
    await sdk.gateway.execute(event.gatewayId, 'sendMessage', {
      chat_id: chatId, text: 'Usage: /weather <city name>',
    });
    return;
  }

  try {
    // Step 1: Geocode city name to coordinates
    const geo = await fetchJson(
      'https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(city) + '&count=1'
    );
    if (!geo.results || geo.results.length === 0) {
      await sdk.gateway.execute(event.gatewayId, 'sendMessage', {
        chat_id: chatId, text: '❌ City not found: ' + city,
      });
      return;
    }

    const loc = geo.results[0];

    // Step 2: Get current weather
    const weather = await fetchJson(
      'https://api.open-meteo.com/v1/forecast?latitude=' + loc.latitude
      + '&longitude=' + loc.longitude
      + '&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code'
      + '&timezone=auto'
    );

    const c = weather.current;
    const desc = weatherDescriptions[c.weather_code] || 'Unknown';

    const reply = '🌍 *' + loc.name + '*, ' + (loc.country || '') + '\\n\\n'
      + desc + '\\n'
      + '🌡️ Temperature: *' + c.temperature_2m + '°C*\\n'
      + '💧 Humidity: ' + c.relative_humidity_2m + '%\\n'
      + '💨 Wind: ' + c.wind_speed_10m + ' km/h\\n'
      + '\\n🕐 ' + weather.current.time;

    await sdk.gateway.execute(event.gatewayId, 'sendMessage', {
      chat_id: chatId, text: reply, parse_mode: 'Markdown',
    });

    // Track usage
    await sdk.storage.increment('weather_lookups');
  } catch (err) {
    console.error('[weather-bot] Error:', err.message);
    await sdk.gateway.execute(event.gatewayId, 'sendMessage', {
      chat_id: chatId,
      text: '❌ Failed to fetch weather. Make sure geocoding-api.open-meteo.com and api.open-meteo.com are in your Allowed Domains.',
    });
  }
});

console.log('[weather-bot] Weather Bot ready — send /weather <city>');
`;

// ===========================================
// Directory Template File Contents
// ===========================================

/** Multi-file Bot — plugin.json (manifest generated by deploy service) */

/** Multi-file Bot — index.js (entry point) */
const DIR_MULTIFILE_INDEX = `'use strict';

/**
 * Multi-file Plugin — Entry Point
 *
 * This plugin splits logic into separate modules for maintainability.
 * The SDK is initialized here and event handling is delegated to handlers.
 */

const sdk = require('/bridge-agent/plugin-sdk');
const { handleMessage } = require('./handlers/message');
const { handleCallback } = require('./handlers/callback');

sdk.onEvent(async (event) => {
  console.log('[multi-file] Event received:', event.type);

  switch (event.type) {
    case 'telegram.message':
      await handleMessage(sdk, event);
      break;
    case 'telegram.callback':
      await handleCallback(sdk, event);
      break;
    default:
      console.log('[multi-file] Unhandled event type:', event.type);
  }
});

console.log('[multi-file] Multi-file plugin started');
`;

/** Multi-file Bot — handlers/message.js */
const DIR_MULTIFILE_MESSAGE_HANDLER = `'use strict';

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
      text: \`📊 Messages processed: \${count}\`,
    });
    return;
  }

  // Track message count
  await sdk.storage.increment('message_count');

  // Echo the message back with formatting
  await sdk.gateway.execute(event.gatewayId, 'sendMessage', {
    chat_id: chatId,
    text: \`You said: *\${text}*\`,
    parse_mode: 'Markdown',
  });
}

module.exports = { handleMessage };
`;

/** Multi-file Bot — handlers/callback.js */
const DIR_MULTIFILE_CALLBACK_HANDLER = `'use strict';

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
    text: \`Button pressed: \${cb.data}\`,
  });
}

module.exports = { handleCallback };
`;

/** Multi-file Bot — utils/formatter.js */
const DIR_MULTIFILE_FORMATTER = `'use strict';

/**
 * Formatting Utilities
 *
 * Shared formatting helpers used across handlers.
 */

function formatHelp() {
  return [
    '*Multi-file Plugin* 🤖',
    '',
    'This is a template showing how to structure a multi-file plugin.',
    '',
    '*Commands:*',
    '/start — Show this help message',
    '/help — Show this help message',
    '/stats — Show message statistics',
    '',
    'Send any message and I\\'ll echo it back!',
  ].join('\\n');
}

function formatError(error) {
  return \`❌ Error: \${error.message || 'Unknown error'}\`;
}

module.exports = { formatHelp, formatError };
`;

/** API Service — plugin.json (manifest generated by deploy service) */

/** API Service — index.js */
const DIR_API_SERVICE_INDEX = `'use strict';

/**
 * API Service Plugin — Entry Point
 *
 * A multi-file plugin demonstrating how to build an API-like service
 * with separate route handlers, middleware, and configuration.
 *
 * Messages are routed to different handlers based on commands.
 */

const sdk = require('/bridge-agent/plugin-sdk');
const { router } = require('./router');

// Load config from platform
const config = sdk.config || {};

sdk.onEvent(async (event) => {
  const msg = event.data?.message;
  if (!msg?.text || !msg?.chat?.id) return;

  try {
    await router(sdk, event, config);
  } catch (err) {
    console.error('[api-service] Handler error:', err.message);
    await sdk.gateway.execute(event.gatewayId, 'sendMessage', {
      chat_id: msg.chat.id,
      text: '❌ Internal error — check plugin logs.',
    });
  }
});

console.log('[api-service] API Service plugin started');
`;

/** API Service — router.js */
const DIR_API_SERVICE_ROUTER = `'use strict';

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
    text: \`Available commands: \${commands}\`,
  });
}

module.exports = { router };
`;

/** API Service — handlers/status.js */
const DIR_API_SERVICE_STATUS = `'use strict';

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
      \`⏱ Uptime: \${hours}h \${minutes}m\`,
      \`📨 Requests: \${requestCount}\`,
      \`💾 Memory: \${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB\`,
    ].join('\\n'),
    parse_mode: 'Markdown',
  });

  await sdk.storage.increment('request_count');
}

module.exports = { handleStatus };
`;

/** API Service — handlers/data.js */
const DIR_API_SERVICE_DATA = `'use strict';

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
  const parts = event.data.message.text.trim().split(/\\s+/);
  const action = (parts[1] || '').toLowerCase();
  const key = parts[2];
  const value = parts.slice(3).join(' ');

  await sdk.storage.increment('request_count');

  if (action === 'set' && key && value) {
    await sdk.storage.set(\`data:\${key}\`, value);
    await sdk.gateway.execute(event.gatewayId, 'sendMessage', {
      chat_id: chatId,
      text: \`✅ Stored: \${key} = \${value}\`,
    });
  } else if (action === 'get' && key) {
    const stored = await sdk.storage.get(\`data:\${key}\`);
    await sdk.gateway.execute(event.gatewayId, 'sendMessage', {
      chat_id: chatId,
      text: stored != null ? \`📦 \${key} = \${stored}\` : \`❌ Key not found: \${key}\`,
    });
  } else if (action === 'del' && key) {
    await sdk.storage.delete(\`data:\${key}\`);
    await sdk.gateway.execute(event.gatewayId, 'sendMessage', {
      chat_id: chatId,
      text: \`🗑️ Deleted: \${key}\`,
    });
  } else {
    await sdk.gateway.execute(event.gatewayId, 'sendMessage', {
      chat_id: chatId,
      text: [
        '*Data Commands:*',
        '/data set <key> <value>',
        '/data get <key>',
        '/data del <key>',
      ].join('\\n'),
      parse_mode: 'Markdown',
    });
  }
}

module.exports = { handleData };
`;

// ===========================================
// Directory Template Registry
// ===========================================

export const PLUGIN_DIRECTORY_TEMPLATES: PluginDirectoryTemplate[] = [
  {
    id: "multi-file-bot",
    name: "Multi-file Bot",
    description:
      "A structured Telegram bot split into handlers, utils, and a main entry point. Shows best practices for larger plugins.",
    category: "messaging",
    requiredGateways: ["TELEGRAM_BOT"] as GatewayType[],
    tags: ["telegram", "multi-file", "directory", "structured", "bot"],
    difficulty: "intermediate",
    isDirectory: true,
    entry: "index.js",
    configSchema: {},
    files: {
      "index.js": DIR_MULTIFILE_INDEX,
      "handlers/message.js": DIR_MULTIFILE_MESSAGE_HANDLER,
      "handlers/callback.js": DIR_MULTIFILE_CALLBACK_HANDLER,
      "utils/formatter.js": DIR_MULTIFILE_FORMATTER,
    },
  },
  {
    id: "api-service",
    name: "API Service",
    description:
      "A command-routing service plugin with separate route handlers, status tracking, and a simple key-value data store. Great starting point for complex bots.",
    category: "utilities",
    requiredGateways: ["TELEGRAM_BOT"] as GatewayType[],
    tags: ["telegram", "multi-file", "directory", "api", "router", "crud"],
    difficulty: "advanced",
    isDirectory: true,
    entry: "index.js",
    configSchema: {
      type: "object",
      properties: {
        serviceName: {
          type: "string",
          title: "Service Name",
          description: "Display name shown in status messages",
          default: "My API Service",
        },
      },
    },
    files: {
      "index.js": DIR_API_SERVICE_INDEX,
      "router.js": DIR_API_SERVICE_ROUTER,
      "handlers/status.js": DIR_API_SERVICE_STATUS,
      "handlers/data.js": DIR_API_SERVICE_DATA,
    },
  },
];

// ===========================================
// Template Registry
// ===========================================

export const PLUGIN_TEMPLATES: PluginTemplate[] = [
  {
    id: "blank",
    name: "Blank Plugin",
    description: "A minimal starting point — empty plugin skeleton with SDK imports ready.",
    category: "general",
    requiredGateways: [],
    tags: ["starter", "blank", "minimal"],
    difficulty: "beginner",
    configSchema: {},
    code: BLANK_CODE,
  },
  {
    id: "echo-bot",
    name: "Echo Bot",
    description:
      "A simple Telegram bot that echoes back every message. Great for learning the gateway API.",
    category: "messaging",
    requiredGateways: ["TELEGRAM_BOT"] as GatewayType[],
    tags: ["telegram", "echo", "bot", "messaging"],
    difficulty: "beginner",
    configSchema: {
      type: "object",
      properties: {
        prefix: {
          type: "string",
          title: "Echo Prefix",
          description: "Text to prepend to echoed messages",
          default: "Echo:",
        },
        ignoreCommands: {
          type: "boolean",
          title: "Ignore Commands",
          description: "Skip messages that start with / (slash commands)",
          default: false,
        },
      },
    },
    code: ECHO_BOT_CODE,
  },
  {
    id: "command-bot",
    name: "Command Bot",
    description:
      "A Telegram bot with slash command routing (/start, /help, /stats). Demonstrates command parsing and user tracking.",
    category: "messaging",
    requiredGateways: ["TELEGRAM_BOT"] as GatewayType[],
    tags: ["telegram", "commands", "bot", "slash"],
    difficulty: "intermediate",
    configSchema: {
      type: "object",
      properties: {
        welcomeMessage: {
          type: "string",
          title: "Welcome Message",
          description: "Message sent when user runs /start",
          default: "Welcome! \ud83e\udd16 Use /help to see available commands.",
        },
      },
    },
    code: COMMAND_BOT_CODE,
  },
  {
    id: "auto-responder",
    name: "Auto Responder",
    description:
      "Keyword-based auto-responder for Telegram. Matches incoming messages against configurable rules and sends pre-set replies.",
    category: "automation",
    requiredGateways: ["TELEGRAM_BOT"] as GatewayType[],
    tags: ["telegram", "auto-reply", "keyword", "automation"],
    difficulty: "intermediate",
    configSchema: {
      type: "object",
      properties: {
        rules: {
          type: "array",
          title: "Auto-Reply Rules",
          description: "Define keyword-response pairs. When a message contains the keyword, the bot will reply automatically.",
          items: {
            type: "object",
            properties: {
              keyword: { type: "string", title: "Keyword", description: "Keyword to match (case-insensitive)" },
              response: { type: "string", title: "Response", description: "Reply text to send when keyword matches" },
            },
          },
        },
      },
    },
    code: AUTO_RESPONDER_CODE,
  },
  {
    id: "storage-demo",
    name: "Storage Demo",
    description:
      "Demonstrates all storage SDK operations: set, get, has, delete, increment, TTL. Great reference for stateful plugins.",
    category: "utilities",
    requiredGateways: [],
    tags: ["storage", "demo", "tutorial", "reference"],
    difficulty: "beginner",
    configSchema: {},
    code: STORAGE_DEMO_CODE,
  },
  {
    id: "scheduled-reporter",
    name: "Scheduled Reporter",
    description:
      "Sends periodic summary reports to a Telegram chat. Demonstrates interval-based execution and storage aggregation.",
    category: "analytics",
    requiredGateways: ["TELEGRAM_BOT"] as GatewayType[],
    tags: ["telegram", "report", "schedule", "analytics"],
    difficulty: "advanced",
    configSchema: {
      type: "object",
      properties: {
        reportChatId: {
          type: "string",
          title: "Report Chat ID",
          description: "Telegram chat ID where reports will be sent",
        },
        intervalMinutes: {
          type: "number",
          title: "Report Interval",
          description: "How often to send reports (in minutes)",
          minimum: 5,
          maximum: 1440,
          default: 60,
        },
      },
    },
    code: SCHEDULED_REPORTER_CODE,
  },
  {
    id: "channel-analytics",
    name: "Channel Analytics",
    description:
      "Track message and user statistics for your Telegram bots. View total messages, unique users, daily trends, and top active users/chats. Fully customizable.",
    category: "analytics",
    requiredGateways: ["TELEGRAM_BOT"] as GatewayType[],
    tags: ["analytics", "statistics", "telegram", "tracking"],
    difficulty: "intermediate",
    configSchema: {
      type: "object",
      title: "Analytics Configuration",
      properties: {
        trackUsers: {
          type: "boolean",
          title: "Track Users",
          description: "Track individual user statistics",
          default: true,
        },
        trackChats: {
          type: "boolean",
          title: "Track Chats",
          description: "Track individual chat/channel statistics",
          default: true,
        },
        retentionDays: {
          type: "number",
          title: "Retention Period",
          description: "How long to keep detailed statistics (days)",
          minimum: 7,
          maximum: 365,
          default: 30,
        },
        enableHourlyStats: {
          type: "boolean",
          title: "Hourly Statistics",
          description: "Enable hourly granularity (uses more storage)",
          default: true,
        },
      },
    },
    code: CHANNEL_ANALYTICS_CODE,
  },
  {
    id: "ai-chat-bot",
    name: "AI Chat Bot",
    description:
      "A Telegram bot powered by 2Bot AI. Responds to messages with AI-generated replies using configurable models and system prompts. Includes conversation memory.",
    category: "messaging",
    requiredGateways: ["TELEGRAM_BOT"] as GatewayType[],
    tags: ["ai", "chat", "telegram", "bot", "gpt", "llm"],
    difficulty: "intermediate",
    configSchema: {
      type: "object",
      properties: {
        model: {
          type: "string",
          title: "AI Model",
          description: "The AI model to use for generating responses",
          default: "auto",
          uiComponent: "ai-model-selector",
        },
        systemPrompt: {
          type: "string",
          title: "System Prompt",
          description: "Instructions for the AI (personality, behavior, constraints)",
          default: "You are a helpful assistant.",
        },
        maxHistory: {
          type: "number",
          title: "Conversation Memory",
          description: "Number of past messages to include for context (0 = no memory)",
          minimum: 0,
          maximum: 50,
          default: 10,
        },
      },
    },
    code: AI_CHAT_BOT_CODE,
  },
  {
    id: "ai-image-bot",
    name: "AI Image Bot",
    description:
      "Generate images from text prompts via Telegram. Users send '/imagine <prompt>' and receive AI-generated images. Powered by 2Bot AI.",
    category: "messaging",
    requiredGateways: ["TELEGRAM_BOT"] as GatewayType[],
    tags: ["ai", "image", "telegram", "bot", "dalle", "generation"],
    difficulty: "intermediate",
    configSchema: {
      type: "object",
      properties: {
        model: {
          type: "string",
          title: "Image Model",
          description: "The AI model to use for image generation",
          default: "auto",
          uiComponent: "ai-model-selector",
        },
        triggerPrefix: {
          type: "string",
          title: "Trigger Prefix",
          description: "Message prefix that triggers image generation",
          default: "/imagine ",
        },
      },
    },
    code: AI_IMAGE_BOT_CODE,
  },
  {
    id: "weather-bot",
    name: "Weather Bot",
    description:
      "A Telegram bot that fetches live weather data from the free Open-Meteo API. Users send /weather <city> and get current temperature, humidity, wind, and conditions. Demonstrates external HTTPS requests through the proxy.",
    category: "utilities",
    requiredGateways: ["TELEGRAM_BOT"] as GatewayType[],
    tags: ["telegram", "weather", "api", "http", "bot", "open-meteo"],
    difficulty: "intermediate",
    configSchema: {
      type: "object",
      properties: {
        defaultCity: {
          type: "string",
          title: "Default City",
          description: "City to use when /weather is sent without a city name",
          default: "",
        },
      },
    },
    code: WEATHER_BOT_CODE,
  },
];

// ===========================================
// Template Accessors
// ===========================================

/**
 * Get all templates (without code/files) for listing — includes both single-file and directory templates
 */
export function getTemplateList(): PluginTemplateListItem[] {
  const singleFile: PluginTemplateListItem[] = PLUGIN_TEMPLATES.map(({ id, name, description, category, requiredGateways, tags, difficulty }) => ({
    id,
    name,
    description,
    category,
    requiredGateways,
    tags,
    difficulty,
  }));

  const directory: PluginTemplateListItem[] = PLUGIN_DIRECTORY_TEMPLATES.map(({ id, name, description, category, requiredGateways, tags, difficulty }) => ({
    id,
    name,
    description,
    category,
    requiredGateways,
    tags,
    difficulty,
    isDirectory: true,
  }));

  return [...singleFile, ...directory];
}

/**
 * Get a single-file template by ID (with code)
 */
export function getTemplateById(id: string): PluginTemplate | undefined {
  return PLUGIN_TEMPLATES.find((t) => t.id === id);
}

/**
 * Get a directory template by ID (with files)
 */
export function getDirectoryTemplateById(id: string): PluginDirectoryTemplate | undefined {
  return PLUGIN_DIRECTORY_TEMPLATES.find((t) => t.id === id);
}

/**
 * Get any template by ID (single-file or directory)
 */
export function getAnyTemplateById(id: string): AnyPluginTemplate | undefined {
  return getTemplateById(id) ?? getDirectoryTemplateById(id);
}

/**
 * Get templates filtered by category
 */
export function getTemplatesByCategory(category: PluginCategory): PluginTemplate[] {
  return PLUGIN_TEMPLATES.filter((t) => t.category === category);
}

/**
 * Get templates filtered by difficulty
 */
export function getTemplatesByDifficulty(
  difficulty: "beginner" | "intermediate" | "advanced"
): PluginTemplate[] {
  return PLUGIN_TEMPLATES.filter((t) => t.difficulty === difficulty);
}
