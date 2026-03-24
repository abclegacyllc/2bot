'use strict';

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
      text: '🌤️ *Weather Bot*\n\nSend me a city name to get the current weather:\n\n'
        + '/weather London\n/weather Tokyo\n/weather New York\n\n'
        + 'Powered by Open-Meteo (free, no API key needed).',
      parse_mode: 'Markdown',
    });
    return;
  }

  // /weather <city>
  if (!text.startsWith('/weather')) return;
  const city = text.replace(/^\/weather\s*/i, '').trim();
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

    const reply = '🌍 *' + loc.name + '*, ' + (loc.country || '') + '\n\n'
      + desc + '\n'
      + '🌡️ Temperature: *' + c.temperature_2m + '°C*\n'
      + '💧 Humidity: ' + c.relative_humidity_2m + '%\n'
      + '💨 Wind: ' + c.wind_speed_10m + ' km/h\n'
      + '\n🕐 ' + weather.current.time;

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
