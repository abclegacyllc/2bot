/**
 * 2Bot Bridge Agent - Entry Point
 * 
 * Runs inside each user's workspace container.
 * Provides a WebSocket server on port 9000 that the 2Bot platform
 * connects to for all workspace operations.
 * 
 * Also serves a simple HTTP health endpoint on the same port.
 * 
 * Protocol:
 *   Platform → Bridge: { id, action, payload }
 *   Bridge → Platform: { id, success, data?, error? }
 *   Bridge → Platform (events): { event, data }
 */

'use strict';

const http = require('http');
const path = require('path');
const { WebSocketServer } = require('ws');
const { FileManager } = require('./file-manager');
const { PluginRunner } = require('./plugin-runner');
const { GitService } = require('./git-service');
const { PackageManager } = require('./package-manager');
const { TerminalService } = require('./terminal-service');
const { LogCollector } = require('./log-collector');
const { HealthMonitor } = require('./health');
const { LocalStore } = require('./local-store');

// ===========================================
// Configuration
// ===========================================

const PORT = parseInt(process.env.BRIDGE_PORT || '9000', 10);
const WORKSPACE_DIR = process.env.WORKSPACE_DIR || '/workspace';
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const AUTH_TOKEN = process.env.BRIDGE_AUTH_TOKEN || null; // Set by platform when creating container

// Webhook secret tokens are fetched per-gateway from the REST credentials endpoint.
// Cache: gatewayId → { token: string | null, fetchedAt: number }
const webhookSecretTokenCache = new Map();
const SECRET_TOKEN_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// ===========================================
// Logger (lightweight, no dependencies)
// ===========================================

const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3, fatal: 4 };
const currentLevel = LOG_LEVELS[LOG_LEVEL] ?? 1;

const log = {
  debug: (...args) => currentLevel <= 0 && console.log('[DEBUG]', new Date().toISOString(), ...args),
  info: (...args) => currentLevel <= 1 && console.log('[INFO]', new Date().toISOString(), ...args),
  warn: (...args) => currentLevel <= 2 && console.warn('[WARN]', new Date().toISOString(), ...args),
  error: (...args) => currentLevel <= 3 && console.error('[ERROR]', new Date().toISOString(), ...args),
  fatal: (...args) => currentLevel <= 4 && console.error('[FATAL]', new Date().toISOString(), ...args),
};

// ===========================================
// Initialize Services
// ===========================================

const logCollector = new LogCollector({ workspaceDir: WORKSPACE_DIR });
const fileManager = new FileManager({ workspaceDir: WORKSPACE_DIR, log, logCollector });
const gitService = new GitService({ workspaceDir: WORKSPACE_DIR, log, logCollector });
const packageManager = new PackageManager({ workspaceDir: WORKSPACE_DIR, log, logCollector });
const terminalService = new TerminalService({ workspaceDir: WORKSPACE_DIR, log });
const healthMonitor = new HealthMonitor({ workspaceDir: WORKSPACE_DIR, log });

// Local SQLite storage for offline-capable plugin storage
// Default quota configurable via STORAGE_QUOTA_MB env var (default: 50, 0 = unlimited)
// Per-plugin quotas are set dynamically via storage.setQuota from the platform
const defaultQuotaMb = parseInt(process.env.STORAGE_QUOTA_MB || '50', 10);
const localStore = new LocalStore({
  dbPath: path.join(WORKSPACE_DIR, '.2bot', 'storage.db'),
  log,
  defaultQuotaMb,
});

// ===========================================
// IPC Relay — Plugin ↔ Platform
// ===========================================

/** Pending IPC requests waiting for platform response. Map<requestId, { resolve, reject, timer }> */
const pendingIpcRequests = new Map();

/**
 * Send an IPC request to the platform and wait for a response.
 * Used by plugin-runner when a child process needs storage/gateway access.
 *
 * @param {string} pluginFile - Plugin file path (e.g., 'plugins/echo.js')
 * @param {string} method - IPC method (e.g., 'storage.get', 'gateway.execute')
 * @param {object} data - Method-specific data
 * @param {number} [timeoutMs=30000] - Timeout in ms
 * @returns {Promise<unknown>} The result from the platform
 */
function sendIpcToPlatform(pluginFile, method, data, timeoutMs = 30_000) {
  return new Promise((resolve, reject) => {
    if (!platformWs || platformWs.readyState !== 1) {
      reject(new Error('Platform not connected — cannot relay IPC'));
      return;
    }

    const id = `ipc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const timer = setTimeout(() => {
      pendingIpcRequests.delete(id);
      reject(new Error(`IPC request timeout (${timeoutMs}ms): ${method}`));
    }, timeoutMs);

    pendingIpcRequests.set(id, { resolve, reject, timer });

    // Send as ipcRequest to platform
    platformWs.send(JSON.stringify({
      ipcRequest: true,
      id,
      pluginFile,
      method,
      data: data || {},
    }));

    log.debug(`IPC request sent: ${method} id=${id} plugin=${pluginFile}`);
  });
}

/**
 * Handle an IPC response from the platform (matches a pending request).
 * Called from the WebSocket message handler.
 *
 * @param {object} message - { id, ipcResponse: true, success, result?, error? }
 * @returns {boolean} true if this was an IPC response
 */
function handleIpcResponse(message) {
  if (!message.ipcResponse || !message.id) return false;

  const pending = pendingIpcRequests.get(message.id);
  if (!pending) {
    log.warn(`IPC response for unknown request: ${message.id}`);
    return true; // Consumed but no pending request
  }

  pendingIpcRequests.delete(message.id);
  clearTimeout(pending.timer);

  if (message.success) {
    pending.resolve(message.result);
  } else {
    pending.reject(new Error(message.error || 'IPC request failed'));
  }

  log.debug(`IPC response received: id=${message.id} success=${message.success}`);
  return true;
}

// Initialize plugin runner with IPC relay function and local storage
const pluginRunner = new PluginRunner({
  workspaceDir: WORKSPACE_DIR,
  log,
  logCollector,
  sendIpcToPlatform,
  localStore,
});

// ===========================================
// Storage Sync Engine
// ===========================================
// Periodically pushes dirty local storage entries to the platform
// (Redis) via WebSocket IPC. Also handles maintenance (TTL cleanup).

const SYNC_INTERVAL_MS = 30_000;          // Sync every 30 seconds
const MAINTENANCE_INTERVAL_MS = 5 * 60_000; // Cleanup every 5 minutes
let syncTimer = null;
let maintenanceTimer = null;
let syncInProgress = false;

/**
 * Push all dirty local storage entries to the platform.
 * Uses the existing sendIpcToPlatform to replay set/delete operations.
 */
async function syncDirtyEntries() {
  if (syncInProgress) return;
  if (!platformWs || platformWs.readyState !== 1) return;

  const dirtyEntries = localStore.getDirtyEntries();
  if (dirtyEntries.length === 0) return;

  syncInProgress = true;
  log.info(`Storage sync: ${dirtyEntries.length} dirty entries to push`);

  let synced = 0;
  let failed = 0;

  for (const entry of dirtyEntries) {
    try {
      if (entry.deleted) {
        // Push delete to server
        await sendIpcToPlatform(entry.pluginFile, 'storage.delete', { key: entry.key });
      } else {
        // Calculate remaining TTL for the server
        const syncData = { key: entry.key, value: entry.value };
        if (entry.ttlAt) {
          const remainingMs = entry.ttlAt - Date.now();
          if (remainingMs <= 0) {
            // Already expired — delete on server too
            await sendIpcToPlatform(entry.pluginFile, 'storage.delete', { key: entry.key });
            localStore.clearDirty(entry.pluginFile, entry.key);
            localStore.resetSyncFailures(entry.pluginFile, entry.key);
            synced++;
            continue;
          }
          syncData.ttlSeconds = Math.ceil(remainingMs / 1000);
        }
        await sendIpcToPlatform(entry.pluginFile, 'storage.set', syncData);
      }
      localStore.clearDirty(entry.pluginFile, entry.key);
      localStore.resetSyncFailures(entry.pluginFile, entry.key);
      synced++;
    } catch (err) {
      failed++;
      log.debug(`Storage sync failed for ${entry.pluginFile}:${entry.key}: ${err.message}`);
      // Track sync failures per entry
      localStore.incrementSyncFailures(entry.pluginFile, entry.key);
      // Don't clear dirty flag — will retry next cycle
      // If WS dropped mid-sync, stop trying
      if (!platformWs || platformWs.readyState !== 1) {
        log.warn('Storage sync aborted — WS disconnected');
        break;
      }
    }
  }

  // Cleanup synced tombstones
  localStore.removeSyncedTombstones();

  syncInProgress = false;
  if (synced > 0 || failed > 0) {
    log.info(`Storage sync complete: ${synced} synced, ${failed} failed`);
  }
}

/** Start periodic sync and maintenance timers */
function startSyncEngine() {
  stopSyncEngine();
  syncTimer = setInterval(() => syncDirtyEntries().catch((err) => {
    log.error('Storage sync error:', err.message);
    syncInProgress = false;
  }), SYNC_INTERVAL_MS);
  maintenanceTimer = setInterval(() => {
    try { localStore.maintenance(); } catch (err) { log.error('Storage maintenance error:', err.message); }
  }, MAINTENANCE_INTERVAL_MS);
  log.info('Storage sync engine started');
  // Trigger an immediate sync
  syncDirtyEntries().catch(() => {});
}

/** Stop sync and maintenance timers */
function stopSyncEngine() {
  if (syncTimer) { clearInterval(syncTimer); syncTimer = null; }
  if (maintenanceTimer) { clearInterval(maintenanceTimer); maintenanceTimer = null; }
}

/**
 * Warm the local cache by pulling all existing keys from the server (Redis)
 * for each running plugin. This prevents cold cache misses on first use
 * after a container restart.
 *
 * Non-blocking — runs in background, failures are logged but don't break anything.
 */
async function warmCache() {
  const running = pluginRunner.list().filter(p => p.status === 'running');
  if (running.length === 0) {
    log.info('Cache warm: no running plugins to warm');
    return;
  }

  log.info(`Cache warm: pulling keys for ${running.length} running plugin(s)`);
  let totalKeys = 0;

  for (const proc of running) {
    try {
      const data = await sendIpcToPlatform(proc.file, 'storage.dump', {}, 15_000);
      if (data && typeof data === 'object') {
        const entries = Object.entries(data);
        for (const [key, value] of entries) {
          localStore.setClean(proc.file, key, value);
        }
        totalKeys += entries.length;
        if (entries.length > 0) {
          log.info(`Cache warm: loaded ${entries.length} keys for ${proc.file}`);
        }
      }
    } catch (err) {
      log.warn(`Cache warm failed for ${proc.file}: ${err.message}`);
      // Continue with other plugins — non-fatal
    }
  }

  log.info(`Cache warm complete: ${totalKeys} total keys loaded across ${running.length} plugin(s)`);
}

// ===========================================
// Action Router
// ===========================================

/** Map bridge actions to handler functions */
const actionHandlers = {
  // File operations
  'file.list': (payload) => fileManager.list(payload.path, payload.recursive),
  'file.read': (payload) => fileManager.read(payload.path),
  'file.write': (payload) => fileManager.write(payload.path, payload.content, payload.createDirs),
  'file.writeMulti': (payload) => fileManager.writeMulti(payload.files),
  'file.delete': (payload) => fileManager.delete(payload.path),
  'file.mkdir': (payload) => fileManager.mkdir(payload.path),
  'file.rename': (payload) => fileManager.rename(payload.oldPath, payload.newPath),
  'file.upload': (payload) => fileManager.upload(payload.path, payload.data, payload.encoding),
  'file.download': (payload) => fileManager.download(payload.path),
  'file.stat': (payload) => fileManager.stat(payload.path),

  // Plugin operations
  'plugin.start': (payload) => {
    // Set per-plugin quota if provided by platform
    if (payload.storageQuotaMb !== undefined) {
      localStore.setQuota(payload.file, payload.storageQuotaMb);
    }
    return pluginRunner.start(payload.file, payload.env);
  },
  'plugin.stop': (payload) => pluginRunner.stop(payload.file || payload.fileOrPid, payload.force),
  'plugin.restart': (payload) => pluginRunner.restart(payload.file, payload.env),
  'plugin.list': () => pluginRunner.list(),
  'plugin.logs': (payload) => pluginRunner.getLogs(payload.file, payload.lines),
  'plugin.validate': (payload) => pluginRunner.validate(payload.file),
  'plugin.event': (payload) => {
    log.debug(`plugin.event received: file=${payload.file} type=${payload.event?.type}`);
    return pluginRunner.pushEvent(payload.file, payload.event);
  },

  // Git operations
  'git.clone': (payload) => gitService.clone(payload.url, payload.targetDir, payload.branch, payload.depth, payload.credentials),
  'git.pull': (payload) => gitService.pull(payload.dir || payload.directory, payload.credentials),
  'git.status': (payload) => gitService.status(payload.dir),

  // Package operations
  'package.install': (payload) => packageManager.install(payload.packages, payload.dev, payload.cwd),
  'package.uninstall': (payload) => packageManager.uninstall(payload.packages, payload.cwd),
  'package.list': (payload) => packageManager.list(payload.cwd),
  'package.audit': (payload) => packageManager.audit(payload.cwd),

  // Terminal operations (special — needs ws reference for streaming)
  'terminal.create': null,  // Handled specially in message handler
  'terminal.resize': null,
  'terminal.close': null,

  // System operations
  'system.stats': () => healthMonitor.getStats(),
  'system.health': () => ({ ...healthMonitor.healthCheck(), status: 'healthy' }),
  'system.logs': (payload) => logCollector.query(payload || {}),

  // Storage operations (platform-initiated)
  'storage.stats': () => ({
    quota: localStore.getQuotaInfo(),
    plugins: localStore.getStats(),
  }),
  'storage.clearPlugin': (payload) => {
    if (!payload.pluginFile) throw new Error('storage.clearPlugin requires "pluginFile"');
    return localStore.clearPlugin(payload.pluginFile);
  },
  'storage.setQuota': (payload) => {
    if (!payload.pluginFile) throw new Error('storage.setQuota requires "pluginFile"');
    const quotaMb = typeof payload.quotaMb === 'number' ? payload.quotaMb : 50;
    localStore.setQuota(payload.pluginFile, quotaMb);
    return { pluginFile: payload.pluginFile, quotaMb };
  },
};

// ===========================================
// HTTP Server (health + webhook endpoints)
// ===========================================

/**
 * Collect request body as a Buffer.
 * @param {import('http').IncomingMessage} req
 * @param {number} maxBytes
 * @returns {Promise<Buffer>}
 */
function collectBody(req, maxBytes = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        req.destroy();
        reject(new Error('Body too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/**
 * Parse URL and extract route params.
 * Returns { matched, gatewayId } or null.
 */
function matchWebhookRoute(url) {
  // Match: /webhook/telegram/<uuid-like-id>
  const m = url.match(/^\/webhook\/telegram\/([a-z0-9_-]+)$/i);
  return m ? { gatewayId: m[1] } : null;
}

/**
 * Fetch the webhook secret token for a gateway from the REST credentials endpoint.
 * Caches the result for SECRET_TOKEN_CACHE_TTL.
 *
 * @param {string} gatewayId
 * @returns {Promise<string|null>} The secret token or null if not configured
 */
async function getWebhookSecretToken(gatewayId) {
  const cached = webhookSecretTokenCache.get(gatewayId);
  if (cached && Date.now() - cached.fetchedAt < SECRET_TOKEN_CACHE_TTL) {
    return cached.token;
  }

  try {
    const bridgeToken = process.env.BRIDGE_AUTH_TOKEN;
    if (!bridgeToken) {
      log.warn({ gatewayId }, 'No BRIDGE_AUTH_TOKEN — cannot fetch webhook secret token');
      return null;
    }

    const apiHost = process.env.CREDENTIAL_API_HOST || '172.17.0.1';
    const apiPort = parseInt(process.env.CREDENTIAL_API_PORT || '3002', 10);

    const data = await new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: apiHost,
          port: apiPort,
          path: `/internal/credentials/${gatewayId}`,
          method: 'GET',
          headers: { 'X-Bridge-Token': bridgeToken, Accept: 'application/json' },
          timeout: 5000,
        },
        (res) => {
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => {
            try {
              resolve(JSON.parse(Buffer.concat(chunks).toString()));
            } catch {
              reject(new Error('Invalid JSON from credentials endpoint'));
            }
          });
          res.on('error', reject);
        },
      );
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
      req.end();
    });

    const token = (data && data.success && data.data?.webhookSecretToken) || null;
    webhookSecretTokenCache.set(gatewayId, { token, fetchedAt: Date.now() });
    return token;
  } catch (err) {
    log.warn({ gatewayId, error: err.message }, 'Failed to fetch webhook secret token');
    // If we had a previous cached value, keep using it
    if (cached) return cached.token;
    return null;
  }
}

const httpServer = http.createServer(async (req, res) => {
  // ── Health check ──
  if (req.url === '/health' && req.method === 'GET') {
    const health = healthMonitor.healthCheck();
    const isHealthy = health.status === 'healthy';
    res.writeHead(isHealthy ? 200 : 503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ healthy: isHealthy, ...health }));
    return;
  }

  // ── Telegram webhook (direct from nginx) ──
  const route = req.method === 'POST' ? matchWebhookRoute(req.url) : null;
  if (route) {
    try {
      // 1. Validate Telegram secret token (fetched per-gateway)
      const expectedToken = await getWebhookSecretToken(route.gatewayId);
      if (expectedToken) {
        const headerToken = req.headers['x-telegram-bot-api-secret-token'];
        if (headerToken !== expectedToken) {
          log.warn({ gatewayId: route.gatewayId }, 'Webhook secret token mismatch');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Invalid secret token' }));
          return;
        }
      }

      // 2. Parse body
      const body = await collectBody(req);
      let update;
      try {
        update = JSON.parse(body.toString());
      } catch {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Invalid JSON' }));
        return;
      }

      // 3. Validate update
      if (!update || typeof update.update_id !== 'number') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Invalid update payload' }));
        return;
      }

      log.info({ gatewayId: route.gatewayId, updateId: update.update_id }, 'Webhook received directly');

      // 4. Determine event type from raw Telegram update
      let eventType = 'telegram.unknown';
      if (update.message) eventType = 'telegram.message';
      else if (update.callback_query) eventType = 'telegram.callback';
      else if (update.edited_message) eventType = 'telegram.edited_message';
      else if (update.channel_post) eventType = 'telegram.channel_post';
      else if (update.edited_channel_post) eventType = 'telegram.edited_channel_post';
      else if (update.inline_query) eventType = 'telegram.inline_query';
      else if (update.chosen_inline_result) eventType = 'telegram.chosen_inline_result';
      else if (update.my_chat_member) eventType = 'telegram.my_chat_member';
      else if (update.chat_member) eventType = 'telegram.chat_member';
      else if (update.chat_join_request) eventType = 'telegram.chat_join_request';

      // 5. Build event envelope (same format as platform → bridge → plugin)
      //    data = raw Telegram update (plugins receive snake_case fields directly)
      const event = {
        type: eventType,
        data: update,
        gatewayId: route.gatewayId,
      };

      // 6. Push to all running plugins
      const running = pluginRunner.list().filter(p => p.status === 'running');
      let pushed = 0;
      for (const proc of running) {
        const result = pluginRunner.pushEvent(proc.file, event);
        if (result.success) pushed++;
      }

      log.info({ gatewayId: route.gatewayId, eventType, pushed, total: running.length }, 'Webhook routed to plugins');

      // Emit inbound traffic log to platform for recording
      emitEvent('traffic.inbound', {
        timestamp: new Date().toISOString(),
        domain: 'api.telegram.org',
        url: req.url,
        method: 'POST',
        httpStatus: 200,
        bytesTransferred: body.length,
        sourceType: 'telegram',
        gatewayId: route.gatewayId,
        eventType,
        pluginsDelivered: pushed,
      });

      // Always 200 to Telegram
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, data: { received: true, pushed } }));
    } catch (err) {
      log.error({ error: err.message }, 'Webhook handler error');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Internal error' }));
    }
    return;
  }

  // Custom gateway events no longer arrive via HTTP proxy.
  // They flow through the WebSocket IPC path:
  //   webhook.ts → handleCustomGatewayWebhook() → routeEventToPlugins() → pluginEvent
  // This is the same unified pipeline used by Telegram webhooks.

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

// ===========================================
// WebSocket Server
// ===========================================

const wss = new WebSocketServer({ server: httpServer, path: '/ws', maxPayload: 10 * 1024 * 1024 /* 10MB */ });

/** Currently connected platform client (only one connection allowed) */
let platformWs = null;

/**
 * Send an event to the platform (unsolicited push)
 */
function emitEvent(event, data) {
  if (platformWs && platformWs.readyState === 1 /* OPEN */) {
    platformWs.send(JSON.stringify({ event, data }));
  }
}

// Wire up event emitters from services
pluginRunner.on('started', (data) => emitEvent('plugin.started', data));
pluginRunner.on('stopped', (data) => emitEvent('plugin.stopped', data));
pluginRunner.on('crashed', (data) => emitEvent('plugin.crashed', data));
pluginRunner.on('log', (data) => emitEvent('plugin.log', data));

logCollector.on('log', (entry) => emitEvent('plugin.log', entry));

healthMonitor.on('oom', (data) => emitEvent('system.oom', data));
healthMonitor.on('disk-full', (data) => emitEvent('system.disk-full', data));

/** Track last platform activity timestamp */
let platformLastActivity = 0;

/** Ping interval for heartbeat */
let pingInterval = null;

/** Start heartbeat pinging to detect dead platform connections */
function startHeartbeat(ws) {
  stopHeartbeat();
  platformLastActivity = Date.now();

  ws.on('pong', () => {
    platformLastActivity = Date.now();
  });

  pingInterval = setInterval(() => {
    if (!ws || ws.readyState !== 1 /* OPEN */) {
      stopHeartbeat();
      return;
    }

    // If no activity (including pong) for 60s, terminate
    if (Date.now() - platformLastActivity > 60_000) {
      log.warn('Platform connection stale (no pong) — terminating');
      ws.terminate();
      stopHeartbeat();
      return;
    }

    ws.ping();
  }, 30_000);
}

function stopHeartbeat() {
  if (pingInterval) {
    clearInterval(pingInterval);
    pingInterval = null;
  }
}

wss.on('connection', (ws, req) => {
  log.info('Platform connected', { ip: req.socket.remoteAddress });

  // Auth check: first message must be auth token (if configured)
  let authenticated = !AUTH_TOKEN; // If no token configured, skip auth

  // Platform connection logic: Always accept the NEW connection and drop the old one.
  // This handles platform restarts (e.g., during development) where the old connection
  // might still be technically "open" but abandoned by the previous process.
  if (platformWs) {
    log.warn('Replacing existing platform connection with new client');
    try {
      // Close old connection with custom code 4002 (Service Restart)
      platformWs.close(4002, 'Replaced by new connection');
    } catch (e) {
      // Ignore errors closing a potentially dead socket
    }
    stopHeartbeat();
    stopSyncEngine();
    platformWs = null;
  }

  platformWs = ws;
  platformLastActivity = Date.now();

  ws.on('message', async (raw) => {
    platformLastActivity = Date.now();
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      ws.send(JSON.stringify({ id: null, success: false, error: 'Invalid JSON' }));
      return;
    }

    // Handle auth if required
    if (!authenticated) {
      if (msg.action === 'auth' && msg.payload?.token === AUTH_TOKEN) {
        authenticated = true;
        ws.send(JSON.stringify({ id: msg.id, success: true, data: { authenticated: true } }));
        log.info('Platform authenticated');
        startHeartbeat(ws);
        startSyncEngine();
        // Warm local cache from server (background, non-blocking)
        warmCache().catch((err) => log.warn('Cache warm error:', err.message));
        return;
      }
      ws.send(JSON.stringify({ id: msg.id, success: false, error: 'Unauthorized — send auth token first' }));
      return;
    }

    const { id, action, payload = {} } = msg;

    // Check if this is an IPC response from the platform
    if (handleIpcResponse(msg)) {
      return;
    }

    // Terminal actions need special handling (streaming over WebSocket)
    if (action === 'terminal.create') {
      try {
        const sessionId = terminalService.create(payload.cols, payload.rows, ws);
        ws.send(JSON.stringify({ id, success: true, data: { sessionId } }));
      } catch (err) {
        ws.send(JSON.stringify({ id, success: false, error: err.message }));
      }
      return;
    }
    if (action === 'terminal.resize') {
      try {
        terminalService.resize(payload.sessionId, payload.cols, payload.rows);
        ws.send(JSON.stringify({ id, success: true }));
      } catch (err) {
        ws.send(JSON.stringify({ id, success: false, error: err.message }));
      }
      return;
    }
    if (action === 'terminal.input') {
      try {
        terminalService.write(payload.sessionId, payload.data);
        // No response needed for input — output comes via events
      } catch (err) {
        ws.send(JSON.stringify({ id, success: false, error: err.message }));
      }
      return;
    }
    if (action === 'terminal.close') {
      try {
        terminalService.close(payload.sessionId);
        ws.send(JSON.stringify({ id, success: true }));
      } catch (err) {
        ws.send(JSON.stringify({ id, success: false, error: err.message }));
      }
      return;
    }

    // Standard action routing
    const handler = actionHandlers[action];
    if (!handler) {
      ws.send(JSON.stringify({ id, success: false, error: `Unknown action: ${action}` }));
      return;
    }

    try {
      const data = await handler(payload);
      ws.send(JSON.stringify({ id, success: true, data }));
    } catch (err) {
      log.error(`Action ${action} failed:`, err.message);
      ws.send(JSON.stringify({ id, success: false, error: err.message }));
    }
  });

  ws.on('close', (code, reason) => {
    log.info('Platform disconnected', { code, reason: reason?.toString() });
    // Only null out platformWs if this WS is still the current connection.
    // When a new connection replaces the old one, this close handler fires
    // asynchronously — we must NOT null out the new connection reference.
    if (platformWs === ws) {
      platformWs = null;
      stopHeartbeat();
      stopSyncEngine();
      // Close all terminal sessions when platform disconnects
      terminalService.closeAll();
    }
  });

  ws.on('error', (err) => {
    log.error('WebSocket error:', err.message);
  });
});

// ===========================================
// Startup
// ===========================================

httpServer.listen(PORT, '0.0.0.0', () => {
  log.info(`2Bot Bridge Agent started`);
  log.info(`  WebSocket: ws://0.0.0.0:${PORT}/ws`);
  log.info(`  Health:    http://0.0.0.0:${PORT}/health`);
  log.info(`  Workspace: ${WORKSPACE_DIR}`);
  log.info(`  Auth:      ${AUTH_TOKEN ? 'required' : 'disabled'}`);
});

// ===========================================
// Graceful Shutdown
// ===========================================

async function shutdown(signal) {
  log.info(`Received ${signal}, shutting down gracefully...`);

  // Stop sync engine and flush any remaining dirty entries
  stopSyncEngine();
  try {
    await syncDirtyEntries();
  } catch {
    log.warn('Final storage sync failed — dirty entries will sync on next start');
  }

  // Stop all running plugins
  await pluginRunner.stopAll();

  // Close all terminal sessions
  terminalService.closeAll();

  // Stop health monitoring
  healthMonitor.stop();

  // Close local storage database
  localStore.close();

  // Close WebSocket server
  wss.close(() => {
    httpServer.close(() => {
      log.info('Bridge agent stopped');
      process.exit(0);
    });
  });

  // Force exit after 10 seconds
  setTimeout(() => {
    log.warn('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Catch uncaught errors
process.on('uncaughtException', (err) => {
  log.fatal('Uncaught exception:', err.message, err.stack);
  emitEvent('plugin.crashed', { error: err.message, source: 'bridge' });
});

process.on('unhandledRejection', (reason) => {
  log.error('Unhandled rejection:', reason);
});
