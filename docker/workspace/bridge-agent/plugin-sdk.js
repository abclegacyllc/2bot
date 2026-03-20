/**
 * 2Bot Plugin SDK
 *
 * Provides event handling, storage, gateway, config, fetch, and lifecycle APIs
 * for plugins running inside workspace containers.
 *
 * Communicates with the platform via IPC (Node.js child process messaging).
 *
 * === Event-Driven Plugin Pattern (recommended) ===
 *
 *   const sdk = require('/bridge-agent/plugin-sdk');
 *
 *   sdk.onEvent(async (event) => {
 *     // event.type = 'telegram.message' | 'telegram.callback' | etc.
 *     const msg = event.data?.message;
 *     if (!msg?.text) return;
 *
 *     await sdk.gateway.execute(event.gatewayId, 'sendMessage', {
 *       chat_id: msg.chat.id,
 *       text: `Echo: ${msg.text}`,
 *     });
 *   });
 *
 * === Legacy Polling Pattern (still supported) ===
 *
 *   const { storage, gateway } = require('/bridge-agent/plugin-sdk');
 *   // ... while(true) { getUpdates } polling loop
 *
 * @module plugin-sdk
 */

/* eslint-disable @typescript-eslint/no-require-imports */
'use strict';

const http = require('http');
const https = require('https');
const tls = require('tls');

// ===========================================
// IPC Transport
// ===========================================

/** Pending IPC requests: Map<id, { resolve, reject, timer }> */
const pending = new Map();

/** Auto-incrementing request counter */
let requestCounter = 0;

/**
 * Send an IPC request to the plugin runner and wait for a response.
 *
 * @param {string} method - IPC method (e.g., 'storage.get')
 * @param {object} data - Method-specific data
 * @param {number} [timeoutMs=15000] - Timeout in ms
 * @returns {Promise<unknown>} The result from the platform
 */
function ipcRequest(method, data, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    if (typeof process.send !== 'function') {
      reject(new Error(
        '2Bot SDK: process.send not available. ' +
        'Plugin must be run as a forked child process (not spawned).'
      ));
      return;
    }

    const id = `sdk-${++requestCounter}-${Date.now()}`;

    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`2Bot SDK: IPC request timeout (${timeoutMs}ms): ${method}`));
    }, timeoutMs);

    pending.set(id, { resolve, reject, timer });

    process.send({
      type: 'ipc.request',
      id,
      method,
      data: data || {},
    });
  });
}

// ===========================================
// Event Handlers Registry
// ===========================================

/** Registered event/lifecycle handlers */
const handlers = {};

/** Array of event handlers (supports multiple onEvent calls) */
const eventHandlers = [];

/** Buffer for events that arrive before handlers are registered */
const eventBuffer = [];

/** Whether handler registration is complete (set after a short startup delay) */
let handlersReady = false;

/**
 * Process a buffered/incoming event through all registered handlers.
 * Captures the return value of the last handler as the event output.
 */
async function dispatchEvent(event) {
  const errors = [];
  let lastOutput = undefined;
  for (const handler of eventHandlers) {
    try {
      const result = await handler(event);
      if (result !== undefined) {
        lastOutput = result;
      }
    } catch (err) {
      console.error('[plugin-sdk] onEvent handler error:', err.message || err);
      errors.push(err.message || String(err));
    }
  }
  if (typeof process.send === 'function') {
    if (errors.length === 0) {
      process.send({ type: 'plugin.event.result', success: true, output: lastOutput ?? null });
    } else {
      process.send({ type: 'plugin.event.result', success: false, error: errors.join('; ') });
    }
  }
}

/**
 * Flush buffered events once handlers are registered.
 */
function flushEventBuffer() {
  handlersReady = true;
  while (eventBuffer.length > 0) {
    const event = eventBuffer.shift();
    dispatchEvent(event);
  }
}

// ===========================================
// IPC Message Listener (responses + pushed events)
// ===========================================

process.on('message', async (msg) => {
  if (!msg || !msg.type) return;

  // Handle IPC responses (for storage/gateway calls)
  if (msg.type === 'ipc.response' && msg.id) {
    const entry = pending.get(msg.id);
    if (!entry) return;

    pending.delete(msg.id);
    clearTimeout(entry.timer);

    if (msg.success) {
      entry.resolve(msg.result);
    } else {
      entry.reject(new Error(msg.error || 'IPC request failed'));
    }
    return;
  }

  // Handle pushed events from platform (via bridge agent)
  if (msg.type === 'plugin.event' && msg.event) {
    if (handlersReady && eventHandlers.length > 0) {
      dispatchEvent(msg.event);
    } else {
      // Buffer events until handlers are registered (startup race condition)
      eventBuffer.push(msg.event);
    }
    return;
  }

  // Handle lifecycle hooks
  if (msg.type === 'plugin.lifecycle') {
    const hook = msg.hook; // 'install' | 'uninstall' | 'enable' | 'disable'
    if (typeof handlers[hook] === 'function') {
      try {
        await handlers[hook](msg.data || {});
      } catch (err) {
        console.error(`[plugin-sdk] on${hook} handler error:`, err.message || err);
      }
    }
    return;
  }
});

// ===========================================
// Config
// ===========================================

/**
 * Plugin configuration from user settings.
 * Parsed from PLUGIN_CONFIG env var set by the platform on deploy.
 */
let config = {};
try {
  if (process.env.PLUGIN_CONFIG) {
    config = JSON.parse(process.env.PLUGIN_CONFIG);
  }
} catch {
  // Invalid config JSON — use empty
}

// ===========================================
// Storage API
// ===========================================

const storage = {
  /**
   * Get a value from persistent storage.
   * @param {string} key
   * @returns {Promise<*>} The stored value, or null if not found
   */
  async get(key) {
    return ipcRequest('storage.get', { key });
  },

  /**
   * Set a value in persistent storage.
   * @param {string} key
   * @param {*} value - Must be JSON-serializable
   * @param {number} [ttlSeconds] - Optional expiration in seconds
   */
  async set(key, value, ttlSeconds) {
    return ipcRequest('storage.set', { key, value, ttlSeconds });
  },

  /**
   * Delete a value from storage.
   * @param {string} key
   */
  async delete(key) {
    return ipcRequest('storage.delete', { key });
  },

  /**
   * Check if a key exists in storage.
   * @param {string} key
   * @returns {Promise<boolean>}
   */
  async has(key) {
    return ipcRequest('storage.has', { key });
  },

  /**
   * Increment a numeric value atomically.
   * If the key doesn't exist, it starts at 0.
   * @param {string} key
   * @param {number} [by=1] - Amount to increment by
   * @returns {Promise<number>} The new value
   */
  async increment(key, by) {
    return ipcRequest('storage.increment', { key, by });
  },

  /**
   * Find all keys matching a glob pattern.
   * @param {string} pattern - Glob pattern (e.g., 'stats:*')
   * @returns {Promise<string[]>} Matching keys (without the internal prefix)
   */
  async keys(pattern) {
    return ipcRequest('storage.keys', { pattern });
  },

  /**
   * Get multiple values at once.
   * @param {string[]} keys - Array of keys
   * @returns {Promise<Record<string, *>>} Key-value map
   */
  async getMany(keys) {
    return ipcRequest('storage.getMany', { keys });
  },

  /**
   * Set multiple values at once.
   * @param {Array<{ key: string, value: *, ttlSeconds?: number }>} entries
   */
  async setMany(entries) {
    return ipcRequest('storage.setMany', { entries });
  },

  /**
   * Delete ALL keys belonging to this plugin (factory reset).
   * This clears both local and server-side storage.
   * @returns {Promise<{ deleted: number }>}
   */
  async clear() {
    return ipcRequest('storage.clear', {});
  },
};

// ===========================================
// Database API (per-plugin SQLite)
// ===========================================

const database = {
  /**
   * Execute a SQL statement that modifies data (INSERT, UPDATE, DELETE, CREATE TABLE, etc.).
   * @param {string} sql - SQL statement with ? placeholders
   * @param {Array} [params] - Parameters for ? placeholders
   * @returns {Promise<{ changes: number, lastInsertRowid: number }>}
   */
  async run(sql, params) {
    return ipcRequest('database.run', { sql, params: params || [] });
  },

  /**
   * Query rows from the database. Returns an array of row objects.
   * @param {string} sql - SELECT query with ? placeholders
   * @param {Array} [params] - Parameters for ? placeholders
   * @returns {Promise<Array<object>>}
   */
  async query(sql, params) {
    return ipcRequest('database.query', { sql, params: params || [] });
  },

  /**
   * Get a single row from the database. Returns the first matching row or null.
   * @param {string} sql - SELECT query with ? placeholders
   * @param {Array} [params] - Parameters for ? placeholders
   * @returns {Promise<object|null>}
   */
  async get(sql, params) {
    return ipcRequest('database.get', { sql, params: params || [] });
  },

  /**
   * Run pending SQL migrations from the plugin's migrations/ folder.
   * Migrations are .sql files sorted alphabetically (e.g. 001-create-table.sql).
   * Each migration runs inside a transaction and is tracked so it only executes once.
   *
   * Works for both single-file and directory-based plugins:
   * - Directory plugins: reads migrations/ inside the plugin directory
   * - Single-file plugins: reads migrations/ in a sibling folder named after the plugin
   *
   * @returns {Promise<{ applied: string[], alreadyRun: string[] }>}
   *
   * @example
   * // plugins/my-bot/migrations/001-create-users.sql
   * // plugins/my-bot/migrations/002-add-email.sql
   * const result = await sdk.database.migrate();
   * console.log(`Applied ${result.applied.length} new migrations`);
   */
  async migrate() {
    return ipcRequest('database.migrate', {});
  },
};

// ===========================================
// Direct Telegram API (Container Isolation)
// ===========================================

/**
 * Credential cache: gatewayId → { creds, fetchedAt }
 * Avoids repeated IPC calls to the main server for the bot token.
 * TTL: 5 minutes. Cleared on 401 (token rotated).
 */
const CREDENTIAL_CACHE_TTL = 5 * 60 * 1000;
const credentialCache = new Map();

/**
 * Fetch credentials via the REST fallback endpoint on the main API server.
 * Used when the WebSocket IPC channel is unavailable (e.g. during webhook direct delivery).
 *
 * @param {string} gatewayId
 * @returns {Promise<{ type: string, botToken?: string }>}
 */
function fetchCredentialsViaRest(gatewayId) {
  return new Promise((resolve, reject) => {
    const bridgeToken = process.env.BRIDGE_AUTH_TOKEN;
    if (!bridgeToken) {
      reject(new Error('No BRIDGE_AUTH_TOKEN — cannot call REST credentials endpoint'));
      return;
    }

    // The host API server runs on the Docker host.
    // From inside the container network, we reach it via the gateway IP or host.docker.internal.
    // We use the NO_PROXY-safe path: the API port on the host.
    const apiHost = process.env.CREDENTIAL_API_HOST || '172.17.0.1';
    const apiPort = process.env.CREDENTIAL_API_PORT || '3002';

    const req = http.request(
      {
        hostname: apiHost,
        port: parseInt(apiPort, 10),
        path: `/internal/credentials/${gatewayId}`,
        method: 'GET',
        headers: {
          'X-Bridge-Token': bridgeToken,
          'Accept': 'application/json',
        },
        timeout: 10000,
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          try {
            const body = JSON.parse(Buffer.concat(chunks).toString());
            if (body.success && body.data) {
              resolve(body.data);
            } else {
              reject(new Error(body.error?.message || 'REST credential fetch failed'));
            }
          } catch {
            reject(new Error('Invalid JSON from REST credential endpoint'));
          }
        });
        res.on('error', reject);
      },
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('REST credential fetch timeout'));
    });
    req.end();
  });
}

/**
 * Fetch (or return cached) gateway credentials from the platform.
 * Primary path: IPC over WebSocket.
 * Fallback: REST HTTP call to the API server (for when WS is down,
 * e.g. during direct webhook delivery before bridge client reconnects).
 *
 * @param {string} gatewayId
 * @returns {Promise<{ type: string, botToken?: string }>}
 */
async function getGatewayCredentials(gatewayId) {
  const cached = credentialCache.get(gatewayId);
  if (cached && Date.now() - cached.fetchedAt < CREDENTIAL_CACHE_TTL) {
    return cached.creds;
  }

  // Try IPC first (primary path)
  try {
    const creds = await ipcRequest('gateway.getCredentials', { gatewayId });
    credentialCache.set(gatewayId, { creds, fetchedAt: Date.now() });
    return creds;
  } catch (ipcErr) {
    // IPC unavailable — try REST fallback
    try {
      const creds = await fetchCredentialsViaRest(gatewayId);
      credentialCache.set(gatewayId, { creds, fetchedAt: Date.now() });
      return creds;
    } catch (restErr) {
      // Both paths failed — throw the more informative error
      throw new Error(
        `Credential fetch failed — IPC: ${ipcErr.message}; REST: ${restErr.message}`
      );
    }
  }
}

// ===========================================
// HTTP Fetch — Proxy-Aware (sdk.fetch)
// ===========================================

/** Default timeout for sdk.fetch() requests (30 seconds) */
const FETCH_TIMEOUT_MS = 30000;

/**
 * Lightweight response object returned by sdk.fetch().
 * Mirrors the Web Fetch API response interface.
 */
class FetchResponse {
  /**
   * @param {number} status - HTTP status code
   * @param {string} statusText - HTTP status message
   * @param {object} headers - Response headers (lowercased keys)
   * @param {Buffer} body - Raw response body
   */
  constructor(status, statusText, headers, body) {
    /** @type {number} HTTP status code */
    this.status = status;
    /** @type {string} HTTP status message */
    this.statusText = statusText;
    /** @type {boolean} True if status is 200-299 */
    this.ok = status >= 200 && status < 300;
    /** @type {object} Response headers (lowercased keys) */
    this.headers = headers;
    /** @type {Buffer} Raw response body */
    this._body = body;
    /** @type {boolean} Whether the body has been consumed */
    this._consumed = false;
  }

  /** Parse body as JSON. @returns {Promise<*>} */
  async json() {
    return JSON.parse(this._body.toString('utf-8'));
  }

  /** Get body as string. @returns {Promise<string>} */
  async text() {
    return this._body.toString('utf-8');
  }

  /** Get body as Buffer. @returns {Promise<Buffer>} */
  async buffer() {
    return this._body;
  }

  /** Get body as ArrayBuffer. @returns {Promise<ArrayBuffer>} */
  async arrayBuffer() {
    return this._body.buffer.slice(
      this._body.byteOffset,
      this._body.byteOffset + this._body.byteLength,
    );
  }
}

/**
 * Collect the full body of an HTTP response as a Buffer.
 * @param {import('http').IncomingMessage} res
 * @returns {Promise<Buffer>}
 */
function _collectBody(res) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    res.on('data', (chunk) => chunks.push(chunk));
    res.on('end', () => resolve(Buffer.concat(chunks)));
    res.on('error', reject);
  });
}

/**
 * Collect an HTTP response body and parse as JSON.
 * Used internally by telegramApiCall().
 * @param {import('http').IncomingMessage} res
 * @returns {Promise<object>}
 */
function _collectJson(res) {
  return _collectBody(res).then((buf) => {
    const raw = buf.toString();
    try {
      return JSON.parse(raw);
    } catch {
      return { ok: false, description: `Non-JSON response: ${raw.slice(0, 200)}` };
    }
  });
}

/**
 * Low-level proxy-aware HTTP request.
 * Handles both HTTP and HTTPS URLs, routing through HTTPS_PROXY when available.
 * Returns the raw IncomingMessage for response processing.
 *
 * @param {string} urlStr - Full URL to request
 * @param {object} [opts] - Request options
 * @param {string} [opts.method='GET'] - HTTP method
 * @param {object} [opts.headers={}] - Request headers
 * @param {string|Buffer|null} [opts.body=null] - Request body
 * @param {number} [opts.timeout=30000] - Timeout in ms
 * @returns {Promise<import('http').IncomingMessage>} Raw HTTP response
 */
function _proxyRequest(urlStr, opts = {}) {
  const parsed = new URL(urlStr);
  const method = (opts.method || 'GET').toUpperCase();
  const reqHeaders = { ...opts.headers };
  const bodyData = opts.body || null;
  const timeout = opts.timeout || FETCH_TIMEOUT_MS;
  const isHttps = parsed.protocol === 'https:';

  // Ensure Host header
  if (!reqHeaders['Host'] && !reqHeaders['host']) {
    reqHeaders['Host'] = parsed.host;
  }

  // Auto-set Content-Length for bodies
  if (bodyData && !reqHeaders['Content-Length'] && !reqHeaders['content-length']) {
    reqHeaders['Content-Length'] = String(Buffer.byteLength(bodyData));
  }

  const proxyUrl = isHttps
    ? (process.env.HTTPS_PROXY || process.env.https_proxy)
    : (process.env.HTTP_PROXY || process.env.http_proxy);

  const requestPath = parsed.pathname + parsed.search;

  // ── No proxy: direct request ──
  if (!proxyUrl) {
    const mod = isHttps ? https : http;
    return new Promise((resolve, reject) => {
      const req = mod.request(
        {
          hostname: parsed.hostname,
          port: parsed.port || (isHttps ? 443 : 80),
          path: requestPath,
          method,
          headers: reqHeaders,
        },
        resolve,
      );
      req.setTimeout(timeout, () => { req.destroy(); reject(new Error(`Request timeout (${timeout}ms)`)); });
      req.on('error', reject);
      if (bodyData) req.end(bodyData); else req.end();
    });
  }

  const proxy = new URL(proxyUrl);
  const proxyPort = parseInt(proxy.port || '3128', 10);

  // ── HTTP through proxy: standard proxy request ──
  if (!isHttps) {
    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: proxy.hostname,
          port: proxyPort,
          path: urlStr, // full URL for HTTP proxy
          method,
          headers: reqHeaders,
        },
        resolve,
      );
      req.setTimeout(timeout, () => { req.destroy(); reject(new Error(`Request timeout (${timeout}ms)`)); });
      req.on('error', reject);
      if (bodyData) req.end(bodyData); else req.end();
    });
  }

  // ── HTTPS through CONNECT proxy tunnel ──
  return new Promise((resolve, reject) => {
    let settled = false;
    const settle = (fn, val) => { if (!settled) { settled = true; fn(val); } };

    const connectReq = http.request({
      host: proxy.hostname,
      port: proxyPort,
      method: 'CONNECT',
      path: `${parsed.hostname}:${parsed.port || 443}`,
    });

    connectReq.setTimeout(timeout, () => {
      connectReq.destroy();
      settle(reject, new Error(`Proxy CONNECT timeout (${timeout}ms)`));
    });

    connectReq.on('connect', (connectRes, socket) => {
      if (connectRes.statusCode === 403) {
        socket.destroy();
        settle(reject, new Error(
          `Domain "${parsed.hostname}" is not in your allowed domains. `
          + 'Add it in Workspace → Network → Allowed Domains before making requests.'
        ));
        return;
      }
      if (connectRes.statusCode !== 200) {
        socket.destroy();
        settle(reject, new Error(`Proxy CONNECT failed: ${connectRes.statusCode}`));
        return;
      }

      // Establish TLS over the tunnel
      const tlsSocket = tls.connect({ socket, servername: parsed.hostname }, () => {
        const req = http.request(
          {
            hostname: parsed.hostname,
            path: requestPath,
            method,
            headers: reqHeaders,
            createConnection: () => tlsSocket,
          },
          (res) => settle(resolve, res),
        );
        req.on('error', (err) => settle(reject, err));
        if (bodyData) req.end(bodyData); else req.end();
      });

      tlsSocket.on('error', (err) => settle(reject, err));
    });

    connectReq.on('error', (err) => settle(reject, err));
    connectReq.end();
  });
}

/**
 * Fetch a URL from inside the container.
 * Automatically routes through the Squid egress proxy (HTTPS_PROXY) if configured.
 * Mirrors the Web Fetch API signature for familiarity.
 *
 * All outbound HTTP/HTTPS requests from plugins should use this function.
 * The proxy enforces domain whitelisting — only domains added in
 * Workspace → Network → Allowed Domains (plus system defaults) are reachable.
 *
 * @param {string} url - The URL to fetch (http:// or https://)
 * @param {object} [options] - Fetch options
 * @param {string} [options.method='GET'] - HTTP method (GET, POST, PUT, DELETE, PATCH, etc.)
 * @param {object} [options.headers={}] - Request headers
 * @param {string|object|Buffer|null} [options.body=null] - Request body.
 *   Objects are auto-serialized to JSON with Content-Type: application/json.
 * @param {number} [options.timeout=30000] - Request timeout in milliseconds
 * @returns {Promise<FetchResponse>} Response with .ok, .status, .headers, .json(), .text(), .buffer()
 *
 * @example
 * // Simple GET
 * const res = await sdk.fetch('https://api.example.com/data');
 * const data = await res.json();
 *
 * @example
 * // POST with JSON body
 * const res = await sdk.fetch('https://api.example.com/submit', {
 *   method: 'POST',
 *   headers: { 'Authorization': 'Bearer my-token' },
 *   body: { key: 'value' }, // auto-serialized to JSON
 * });
 * if (!res.ok) throw new Error(`HTTP ${res.status}`);
 *
 * @example
 * // If the domain is not whitelisted, you'll get a clear error:
 * // "Domain 'xxx.com' is not in your allowed domains.
 * //  Add it in Workspace → Network → Allowed Domains before making requests."
 */
async function sdkFetch(url, options = {}) {
  if (!url || typeof url !== 'string') {
    throw new Error('sdk.fetch() requires a URL string as the first argument');
  }

  const { method, headers: rawHeaders, body: rawBody, timeout } = options;
  const headers = rawHeaders || {};
  let body = rawBody;

  // Auto-serialize object bodies to JSON
  if (body && typeof body === 'object' && !Buffer.isBuffer(body)) {
    body = JSON.stringify(body);
    if (!headers['Content-Type'] && !headers['content-type']) {
      headers['Content-Type'] = 'application/json';
    }
  }

  const rawRes = await _proxyRequest(url, { method, headers, body, timeout });
  const resBody = await _collectBody(rawRes);

  // Normalize headers to a plain object with lowercased keys
  const resHeaders = {};
  const rawHeaders = rawRes.headers;
  for (const key of Object.keys(rawHeaders)) {
    resHeaders[key.toLowerCase()] = rawHeaders[key];
  }

  return new FetchResponse(
    rawRes.statusCode,
    rawRes.statusMessage || '',
    resHeaders,
    resBody,
  );
}

// ===========================================
// Outbound Rate Limiter (per-gateway token bucket)
// ===========================================

/**
 * Platform-aware rate limiting for outbound API calls.
 *
 * Telegram limits:
 *   - 30 messages/second globally per bot
 *   - ~1 message/second to the same chat (group: ~20/min)
 *   - 429 responses include retry_after in seconds
 *
 * We use a conservative token bucket that refills at the platform rate.
 * Each gateway (bot) gets its own bucket. Per-chat throttling prevents
 * flooding a single conversation.
 */
const RATE_LIMITS = {
  TELEGRAM_BOT: { tokensPerSecond: 25, maxBurst: 30, perChatMs: 1000 },
  DISCORD_BOT:  { tokensPerSecond: 4,  maxBurst: 5,  perChatMs: 250 },
  SLACK_BOT:    { tokensPerSecond: 1,  maxBurst: 1,  perChatMs: 1000 },
  WHATSAPP:     { tokensPerSecond: 60, maxBurst: 80, perChatMs: 100 },
};
const DEFAULT_RATE = { tokensPerSecond: 10, maxBurst: 15, perChatMs: 500 };

/** Max retries on 429 before giving up */
const MAX_429_RETRIES = 3;

/**
 * Per-gateway rate limiter state.
 * Key: gatewayId, Value: { tokens, lastRefill, chatTimestamps }
 */
const gatewayBuckets = new Map();

function getOrCreateBucket(gatewayId, gatewayType) {
  let bucket = gatewayBuckets.get(gatewayId);
  if (!bucket) {
    const limits = RATE_LIMITS[gatewayType] || DEFAULT_RATE;
    bucket = {
      tokens: limits.maxBurst,
      maxBurst: limits.maxBurst,
      tokensPerSecond: limits.tokensPerSecond,
      perChatMs: limits.perChatMs,
      lastRefill: Date.now(),
      chatTimestamps: new Map(), // chatId → last send timestamp
      backoffUntil: 0,           // 429 backoff deadline (epoch ms)
    };
    gatewayBuckets.set(gatewayId, bucket);
  }
  return bucket;
}

/**
 * Wait until the rate limiter allows sending.
 * Returns immediately if a token is available; otherwise waits.
 *
 * @param {string} gatewayId
 * @param {string} gatewayType - e.g. 'TELEGRAM_BOT'
 * @param {string|number|null} chatId - Target chat (for per-chat throttle)
 * @returns {Promise<void>}
 */
async function acquireSendToken(gatewayId, gatewayType, chatId) {
  const bucket = getOrCreateBucket(gatewayId, gatewayType);

  // Respect 429 backoff
  const now = Date.now();
  if (bucket.backoffUntil > now) {
    const waitMs = bucket.backoffUntil - now;
    await new Promise(r => setTimeout(r, waitMs));
  }

  // Refill tokens based on elapsed time
  const elapsed = (Date.now() - bucket.lastRefill) / 1000;
  bucket.tokens = Math.min(bucket.maxBurst, bucket.tokens + elapsed * bucket.tokensPerSecond);
  bucket.lastRefill = Date.now();

  // Wait for a token if bucket is empty
  if (bucket.tokens < 1) {
    const waitMs = ((1 - bucket.tokens) / bucket.tokensPerSecond) * 1000;
    await new Promise(r => setTimeout(r, Math.ceil(waitMs)));
    bucket.tokens = 0;
    bucket.lastRefill = Date.now();
  }

  // Per-chat throttle: ensure minimum gap between messages to the same chat
  if (chatId !== null && chatId !== undefined) {
    const chatKey = String(chatId);
    const lastSent = bucket.chatTimestamps.get(chatKey) || 0;
    const chatWait = bucket.perChatMs - (Date.now() - lastSent);
    if (chatWait > 0) {
      await new Promise(r => setTimeout(r, chatWait));
    }
    bucket.chatTimestamps.set(chatKey, Date.now());

    // Prune old chat timestamps (keep only last 5 minutes)
    if (bucket.chatTimestamps.size > 500) {
      const cutoff = Date.now() - 5 * 60 * 1000;
      for (const [k, v] of bucket.chatTimestamps) {
        if (v < cutoff) bucket.chatTimestamps.delete(k);
      }
    }
  }

  // Consume a token
  bucket.tokens = Math.max(0, bucket.tokens - 1);
}

/**
 * Notify the rate limiter that a 429 was received.
 * Sets a backoff period based on the retry_after header.
 *
 * @param {string} gatewayId
 * @param {number} retryAfterSeconds
 */
function handle429(gatewayId, retryAfterSeconds) {
  const bucket = gatewayBuckets.get(gatewayId);
  if (bucket) {
    const backoffMs = (retryAfterSeconds || 1) * 1000;
    bucket.backoffUntil = Date.now() + backoffMs;
    bucket.tokens = 0; // Drain tokens so subsequent calls also wait
    console.warn(`[plugin-sdk] Rate limited on gateway ${gatewayId}, backing off ${retryAfterSeconds}s`);
  }
}

// ===========================================
// Direct Telegram API Call
// ===========================================

/**
 * Call the Telegram Bot API directly from the container.
 * Routes through the Squid egress proxy via _proxyRequest().
 *
 * Includes automatic 429 retry: if Telegram returns Too Many Requests,
 * waits for retry_after seconds and retries up to MAX_429_RETRIES times.
 *
 * @param {string} botToken - The bot token
 * @param {string} method - Telegram API method (e.g., 'sendMessage')
 * @param {object} params - Method parameters
 * @returns {Promise<object>} Telegram API response
 */
async function telegramApiCall(botToken, method, params) {
  const url = `https://api.telegram.org/bot${botToken}/${method}`;
  const body = JSON.stringify(params);
  const headers = {
    'Content-Type': 'application/json',
  };

  for (let attempt = 0; attempt <= MAX_429_RETRIES; attempt++) {
    const res = await _proxyRequest(url, { method: 'POST', headers, body, timeout: 15000 });
    const json = await _collectJson(res);

    // Handle 429 Too Many Requests
    if (json.error_code === 429 && attempt < MAX_429_RETRIES) {
      const retryAfter = json.parameters?.retry_after || 1;
      // Extract gatewayId from the URL for bucket tracking
      // Token format: bot<token>/method — we use the token hash as key
      const tokenHash = botToken.slice(-8);
      handle429(tokenHash, retryAfter);
      console.warn(
        `[plugin-sdk] Telegram 429 on ${method} — retry_after=${retryAfter}s (attempt ${attempt + 1}/${MAX_429_RETRIES})`
      );
      await new Promise(r => setTimeout(r, retryAfter * 1000));
      continue;
    }

    return json;
  }

  // Should not reach here, but safety return
  return { ok: false, error_code: 429, description: 'Rate limit exceeded after max retries' };
}

// ===========================================
// Circuit Breaker — Per-Gateway Failure Protection
// ===========================================
//
// States:
//   CLOSED  — normal operation, all calls go through
//   OPEN    — too many consecutive failures, calls rejected immediately
//   HALF_OPEN — cooldown expired, allow one test call to probe recovery
//
// Transitions:
//   CLOSED  → OPEN      — after FAILURE_THRESHOLD consecutive failures
//   OPEN    → HALF_OPEN — after OPEN_DURATION_MS elapsed
//   HALF_OPEN → CLOSED  — on test call success
//   HALF_OPEN → OPEN    — on test call failure (resets timer)
//

const CIRCUIT_FAILURE_THRESHOLD = 5;   // Consecutive failures to trip
const CIRCUIT_OPEN_DURATION_MS = 30_000; // 30s before testing again

/** Per-gateway circuit state */
const gatewayCircuits = new Map();

/**
 * Get or create circuit breaker state for a gateway.
 * @param {string} gatewayId
 * @returns {{ state: string, failures: number, openedAt: number, lastFailure: number }}
 */
function getCircuit(gatewayId) {
  let circuit = gatewayCircuits.get(gatewayId);
  if (!circuit) {
    circuit = { state: 'CLOSED', failures: 0, openedAt: 0, lastFailure: 0 };
    gatewayCircuits.set(gatewayId, circuit);
  }
  return circuit;
}

/**
 * Check if a gateway call is allowed by the circuit breaker.
 * @param {string} gatewayId
 * @returns {{ allowed: boolean, state: string }}
 */
function circuitAllows(gatewayId) {
  const circuit = getCircuit(gatewayId);

  if (circuit.state === 'CLOSED') {
    return { allowed: true, state: 'CLOSED' };
  }

  if (circuit.state === 'OPEN') {
    // Check if cooldown has elapsed → transition to HALF_OPEN
    if (Date.now() - circuit.openedAt >= CIRCUIT_OPEN_DURATION_MS) {
      circuit.state = 'HALF_OPEN';
      console.warn(`[plugin-sdk] Circuit HALF_OPEN for gateway ${gatewayId} — allowing test call`);
      return { allowed: true, state: 'HALF_OPEN' };
    }
    return { allowed: false, state: 'OPEN' };
  }

  // HALF_OPEN — allow single test call
  return { allowed: true, state: 'HALF_OPEN' };
}

/**
 * Record a successful gateway call — resets failure count, closes circuit.
 * @param {string} gatewayId
 */
function circuitSuccess(gatewayId) {
  const circuit = getCircuit(gatewayId);
  if (circuit.state === 'HALF_OPEN') {
    console.warn(`[plugin-sdk] Circuit CLOSED for gateway ${gatewayId} — recovery confirmed`);
  }
  circuit.state = 'CLOSED';
  circuit.failures = 0;
}

/**
 * Record a failed gateway call — may trip the circuit to OPEN.
 * @param {string} gatewayId
 * @param {string} reason - Failure reason for logging
 */
function circuitFailure(gatewayId, reason) {
  const circuit = getCircuit(gatewayId);
  circuit.failures++;
  circuit.lastFailure = Date.now();

  if (circuit.state === 'HALF_OPEN') {
    // Test call failed — reopen
    circuit.state = 'OPEN';
    circuit.openedAt = Date.now();
    console.warn(
      `[plugin-sdk] Circuit re-OPENED for gateway ${gatewayId} — ` +
      `test call failed: ${reason}`
    );
    return;
  }

  if (circuit.failures >= CIRCUIT_FAILURE_THRESHOLD) {
    circuit.state = 'OPEN';
    circuit.openedAt = Date.now();
    console.warn(
      `[plugin-sdk] Circuit OPENED for gateway ${gatewayId} — ` +
      `${circuit.failures} consecutive failures (last: ${reason})`
    );
  }
}

// ===========================================
// AI API
// ===========================================

/**
 * Default timeout for AI operations (longer than storage/gateway).
 * Text generation can take 10-30s depending on model and prompt size.
 */
const AI_TIMEOUT_MS = 60000;

const ai = {
  /**
   * Generate a text response using 2Bot AI.
   * Credits are automatically deducted from the user's wallet.
   *
   * @param {object} options - Chat options
   * @param {Array<{ role: 'system'|'user'|'assistant', content: string }>} options.messages
   *   Conversation messages. At minimum, provide one user message.
   * @param {string} [options.model='auto'] - Model ID: "auto" (cheapest), real model ID, or legacy 2Bot tier
   * @param {number} [options.temperature] - Sampling temperature (0-2)
   * @param {number} [options.maxTokens] - Max output tokens (capped at 4096 server-side)
   * @returns {Promise<{ content: string, model: string, usage: { inputTokens: number, outputTokens: number, totalTokens: number }, creditsUsed: number }>}
   *
   * @example
   * const result = await sdk.ai.chat({
   *   messages: [
   *     { role: 'system', content: 'You are a helpful assistant.' },
   *     { role: 'user', content: 'What is 2+2?' },
   *   ],
   * });
   * console.log(result.content); // "4"
   *
   * @example
   * // With model and temperature
   * const result = await sdk.ai.chat({
   *   messages: [{ role: 'user', content: 'Write a poem about coding.' }],
   *   model: '2bot-ai-text-pro', // or 'auto' for cheapest
   *   temperature: 0.8,
   * });
   */
  async chat(options) {
    const messages = options && options.messages;
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new Error('sdk.ai.chat() requires { messages: [...] } with at least one message');
    }
    return ipcRequest('ai.chat', {
      messages,
      model: options.model,
      temperature: options.temperature,
      maxTokens: options.maxTokens,
    }, AI_TIMEOUT_MS);
  },

  /**
   * Generate an image using 2Bot AI.
   * Credits are automatically deducted from the user's wallet.
   *
   * @param {object} options - Image generation options
   * @param {string} options.prompt - Image description
   * @param {string} [options.model='auto'] - Model ID: "auto" (cheapest), real model ID, or legacy 2Bot tier
   * @param {string} [options.size='1024x1024'] - Image size: '1024x1024' | '1792x1024' | '1024x1792'
   * @param {string} [options.quality='standard'] - Image quality: 'standard' | 'hd'
   * @param {number} [options.n=1] - Number of images (max 4)
   * @returns {Promise<{ images: Array<{ url: string, revisedPrompt?: string }>, model: string, creditsUsed: number }>}
   *
   * @example
   * const result = await sdk.ai.generateImage({ prompt: 'A cat sitting on a rainbow' });
   * console.log(result.images[0].url);
   */
  async generateImage(options) {
    const prompt = options && options.prompt;
    if (!prompt || typeof prompt !== 'string') {
      throw new Error('sdk.ai.generateImage() requires { prompt: "..." }');
    }
    return ipcRequest('ai.generateImage', {
      prompt,
      model: options.model,
      size: options.size,
      quality: options.quality,
      n: options.n,
    }, AI_TIMEOUT_MS);
  },

  /**
   * Convert text to speech using 2Bot AI.
   * Credits are automatically deducted from the user's wallet.
   *
   * @param {object} options - Speech synthesis options
   * @param {string} options.text - Text to convert to speech
   * @param {string} [options.model='2bot-ai-voice-pro'] - 2Bot AI model ID
   * @param {string} [options.voice='alloy'] - Voice: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer'
   * @param {string} [options.format='mp3'] - Audio format: 'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm'
   * @param {number} [options.speed=1.0] - Speed: 0.25 to 4.0
   * @returns {Promise<{ audioUrl?: string, audioBase64?: string, format: string, characterCount: number, creditsUsed: number }>}
   *
   * @example
   * const result = await sdk.ai.speak({ text: 'Hello from 2Bot!' });
   * console.log(result.audioUrl);
   */
  async speak(options) {
    const text = options && options.text;
    if (!text || typeof text !== 'string') {
      throw new Error('sdk.ai.speak() requires { text: "..." }');
    }
    return ipcRequest('ai.speak', {
      text,
      model: options.model,
      voice: options.voice,
      format: options.format,
      speed: options.speed,
    }, AI_TIMEOUT_MS);
  },
};

// ===========================================
// Gateway API (unified: Telegram, AI, and Custom gateways)
// ===========================================

const gateway = {
  /**
   * List all gateways (Telegram bots, AI providers, and custom gateways).
   * Returns connected gateways belonging to the user.
   * @returns {Promise<Array<{ id: string, name: string, type: string, url?: string, active?: boolean }>>}
   */
  async list() {
    return ipcRequest('gateway.list', {});
  },

  /**
   * @deprecated Custom gateways are now created via the UI (Gateways → Add Gateway).
   * Select the gateway in your plugin's configuration instead.
   * @param {object} _options
   * @returns {Promise<never>}
   */
  async create(_options) {
    throw new Error(
      'sdk.gateway.create() is deprecated. '
      + 'Create gateways via the UI (Gateways → Add Gateway), '
      + 'then select the gateway in your plugin configuration.'
    );
  },

  /**
   * @deprecated Gateway removal is now managed via the UI.
   * @param {string} _name
   * @returns {Promise<never>}
   */
  async remove(_name) {
    throw new Error(
      'sdk.gateway.remove() is deprecated. '
      + 'Manage gateways via the UI (Gateways page).'
    );
  },

  /**
   * Execute an action on a gateway.
   *
   * For Telegram gateways: calls the Telegram Bot API directly from the
   * container through the egress proxy. The bot token is fetched once from
   * the platform and cached.
   *
   * For other gateway types: relays through the platform via IPC (legacy).
   *
   * @param {string} gatewayId - Gateway ID (from gateway.list or event.gatewayId)
   * @param {string} action - Action name (e.g., 'sendMessage')
   * @param {*} params - Action-specific parameters
   * @returns {Promise<*>} Action result
   *
   * @example
   * await sdk.gateway.execute(event.gatewayId, 'sendMessage', {
   *   chat_id: 12345,
   *   text: 'Hello!',
   * });
   */
  async execute(gatewayId, action, params) {
    // Circuit breaker — reject immediately if gateway is in OPEN state
    const circuit = circuitAllows(gatewayId);
    if (!circuit.allowed) {
      throw new Error(
        `Gateway ${gatewayId} circuit is OPEN — too many consecutive failures. ` +
        `Calls will resume automatically after cooldown.`
      );
    }

    // Phase 1: Direct Telegram API call from the container
    let creds;
    try {
      creds = await getGatewayCredentials(gatewayId);
    } catch (credErr) {
      // Cannot fetch credentials (e.g., platform disconnected) — fall back to IPC
      console.error('[plugin-sdk] Credential fetch failed, using IPC relay:', credErr.message);
      return ipcRequest('gateway.execute', { gatewayId, action, params });
    }

    if (creds?.type === 'TELEGRAM_BOT' && creds.botToken) {
      // Rate limit outbound calls to prevent Telegram 429s
      const chatId = params?.chat_id ?? params?.chatId ?? null;
      await acquireSendToken(gatewayId, 'TELEGRAM_BOT', chatId);

      const result = await telegramApiCall(creds.botToken, action, params);
      if (!result.ok) {
        // If rate limited (429), the telegramApiCall already handles retries.
        // If unauthorized, clear cached credentials (token may have been rotated)
        if (result.error_code === 401) {
          credentialCache.delete(gatewayId);
        }
        // Update rate limiter on 429 that exhausted retries
        if (result.error_code === 429) {
          handle429(gatewayId, result.parameters?.retry_after || 5);
        }

        // Track failure for circuit breaker (skip 401 — that's a config issue, not an outage)
        if (result.error_code !== 401) {
          circuitFailure(gatewayId, `Telegram ${result.error_code}: ${result.description || 'unknown'}`);
        }

        const errMsg = result.description || JSON.stringify(result);
        throw new Error(`Telegram API error [${result.error_code || 'unknown'}]: ${errMsg}`);
      }

      // Success — reset circuit breaker
      circuitSuccess(gatewayId);
      return result.result;
    }

    // Non-Telegram gateway or missing token — relay through platform
    // Apply generic rate limiting for non-Telegram platforms
    if (creds?.type) {
      const chatId = params?.channel_id ?? params?.channel ?? params?.chat_id ?? null;
      await acquireSendToken(gatewayId, creds.type, chatId);
    }

    try {
      const ipcResult = await ipcRequest('gateway.execute', { gatewayId, action, params });
      circuitSuccess(gatewayId);
      return ipcResult;
    } catch (ipcErr) {
      circuitFailure(gatewayId, ipcErr.message);
      throw ipcErr;
    }
  },

  /**
   * Get credentials for a gateway (for advanced use cases).
   * Returns the gateway type and any tokens needed for direct API calls.
   *
   * @param {string} gatewayId
   * @returns {Promise<{ type: string, botToken?: string }>}
   */
  async getCredentials(gatewayId) {
    return getGatewayCredentials(gatewayId);
  },
};

// ===========================================
// SDK Module Export
// ===========================================

/**
 * The SDK object — used as both a namespace and for event handler registration.
 *
 * Event-driven pattern:
 *   const sdk = require('/bridge-agent/plugin-sdk');
 *   sdk.onEvent(async (event) => { ... });
 *
 * Legacy pattern (still works):
 *   const { storage, gateway } = require('/bridge-agent/plugin-sdk');
 */
const sdk = {
  storage,
  gateway,
  ai,
  database,
  config,

  /**
   * Check if the current event is from a workflow step execution.
   * When true, the plugin is running as a service (input → output) inside a workflow.
   *
   * @param {object} event - The event object passed to onEvent handler
   * @returns {boolean} True if the event is a workflow step execution
   */
  isWorkflowStep(event) {
    return !!(event && event._workflow);
  },

  /**
   * Get the resolved input mapping data for this workflow step.
   * Returns undefined if the event is not a workflow step.
   *
   * @param {object} event - The event object passed to onEvent handler
   * @returns {*} The resolved input data from workflow step configuration
   */
  getWorkflowInput(event) {
    return event && event._workflow ? event._workflow.input : undefined;
  },

  /**
   * Get the output from the previous workflow step.
   * Returns undefined if this is the first step or not a workflow event.
   *
   * @param {object} event - The event object passed to onEvent handler
   * @returns {*} The output from the previous step in the workflow
   */
  getWorkflowPreviousOutput(event) {
    return event && event._workflow ? event._workflow.previousOutput : undefined;
  },

  /**
   * Fetch a URL from inside the container.
   * Automatically routes through the egress proxy. Supports GET, POST, PUT, DELETE, etc.
   * Domains must be whitelisted in Workspace → Network → Allowed Domains.
   *
   * @param {string} url - The URL to fetch
   * @param {object} [options] - { method, headers, body, timeout }
   * @returns {Promise<FetchResponse>} Response with .ok, .status, .json(), .text(), .buffer()
   *
   * @example
   * const res = await sdk.fetch('https://api.example.com/data');
   * const data = await res.json();
   */
  fetch: sdkFetch,

  /** @deprecated Use the UI to manage gateways. sdk.gateway.list/execute/getCredentials still work. */
  webhook: {
    create: () => gateway.create(),
    list: () => gateway.list(),
    remove: () => gateway.remove(),
  },

  /**
   * Register a handler for incoming events (messages, callbacks, etc.).
   * The platform pushes Telegram webhook events directly to this handler.
   * Can be called multiple times — all handlers will run for each event.
   *
   * @param {function(event: object): Promise<void>} handler
   *   event.type - 'telegram.message' | 'telegram.callback' | 'manual.trigger' | etc.
   *   event.data - The full event payload (Telegram update data, etc.)
   *   event.gatewayId - The gateway that received this event
   */
  onEvent(handler) {
    eventHandlers.push(handler);
    // Schedule buffer flush on next tick — gives all onEvent calls in the module
    // a chance to register before we start dispatching buffered events.
    if (!handlersReady) {
      setTimeout(flushEventBuffer, 0);
    }
  },

  /** Called once after plugin is first installed */
  onInstall(handler) {
    handlers.install = handler;
  },

  /** Called when plugin is uninstalled */
  onUninstall(handler) {
    handlers.uninstall = handler;
  },

  /** Called when plugin is enabled (after being disabled) */
  onEnable(handler) {
    handlers.enable = handler;
  },

  /** Called when plugin is disabled */
  onDisable(handler) {
    handlers.disable = handler;
  },
};

module.exports = sdk;
