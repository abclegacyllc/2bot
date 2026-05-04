/**
 * HTTP Listener — user-facing HTTP server for HTTP_ROUTE resources
 *
 * Phase 7.3: each workspace container can expose a separate HTTP server
 * on a dedicated port. Inbound requests (forwarded by nginx based on the
 * `*.2bot.org` subdomain map) are proxied to the platform's
 * `POST /internal/http-route-dispatch` endpoint, which resolves the route,
 * verifies inbound auth, dispatches an `http.request` PluginEvent, and
 * returns a `{status, headers, body}` response shape that we forward back
 * to the original caller.
 *
 * Tenancy:
 *   - The `X-2bot-Project-Id` header (set by nginx via the apps-routes.map)
 *     identifies the project. Falls back to `WORKSPACE_DEFAULT_PROJECT_ID`
 *     for local development without nginx.
 *   - The platform endpoint enforces that the calling container's user owns
 *     the project — we never trust the header for tenancy alone.
 *
 * Limits:
 *   - Maximum request body size: 10 MB (matches the WebSocket payload cap).
 *   - Upstream call timeout: 30s.
 *
 * @module bridge-agent/http-listener
 */

'use strict';

const http = require('http');

const MAX_BODY_BYTES = 10 * 1024 * 1024; // 10 MB
const UPSTREAM_TIMEOUT_MS = 30_000;

/**
 * Read a request body up to a max size, returning a Buffer.
 * Resolves with `null` on size overflow (caller should respond 413).
 *
 * @param {http.IncomingMessage} req
 * @param {number} maxBytes
 * @returns {Promise<Buffer | null>}
 */
function readRequestBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let oversized = false;

    req.on('data', (chunk) => {
      if (oversized) return;
      size += chunk.length;
      if (size > maxBytes) {
        oversized = true;
        // Drain the rest so the socket can close cleanly.
        req.resume();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (oversized) {
        resolve(null);
      } else {
        resolve(Buffer.concat(chunks));
      }
    });
    req.on('error', reject);
  });
}

/**
 * Parse a `Host` header and return the leading subdomain label.
 * Returns null when the host has fewer than 3 labels (e.g. a bare IP or
 * a two-label domain like `localhost`).
 *
 * @param {string | undefined} hostHeader
 * @returns {string | null}
 */
function extractSubdomain(hostHeader) {
  if (!hostHeader || typeof hostHeader !== 'string') return null;
  const host = hostHeader.split(':')[0]; // strip port
  const labels = host.split('.');
  if (labels.length < 3) return null;
  return labels[0] || null;
}

/**
 * Forward the proxied response back to the original HTTP caller.
 * Strips hop-by-hop headers and ensures `Content-Length` is correct.
 *
 * @param {http.ServerResponse} res
 * @param {{status: number, headers: Record<string,string|string[]>, body: unknown}} dispatched
 */
function writeDispatchedResponse(res, dispatched) {
  const status = Number(dispatched.status) || 200;
  const headers = { ...(dispatched.headers || {}) };

  // Hop-by-hop headers must not be forwarded.
  delete headers['connection'];
  delete headers['keep-alive'];
  delete headers['proxy-authenticate'];
  delete headers['proxy-authorization'];
  delete headers['te'];
  delete headers['trailers'];
  delete headers['transfer-encoding'];
  delete headers['upgrade'];

  let bodyBuf;
  if (dispatched.body == null) {
    bodyBuf = Buffer.alloc(0);
  } else if (Buffer.isBuffer(dispatched.body)) {
    bodyBuf = dispatched.body;
  } else if (typeof dispatched.body === 'string') {
    bodyBuf = Buffer.from(dispatched.body, 'utf8');
  } else {
    bodyBuf = Buffer.from(JSON.stringify(dispatched.body), 'utf8');
    if (!headers['content-type'] && !headers['Content-Type']) {
      headers['content-type'] = 'application/json; charset=utf-8';
    }
  }

  // Always set a correct Content-Length so the response is well-formed.
  headers['content-length'] = String(bodyBuf.length);

  res.writeHead(status, headers);
  res.end(bodyBuf);
}

/**
 * Send a JSON error response.
 *
 * @param {http.ServerResponse} res
 * @param {number} status
 * @param {string} code
 * @param {string} message
 */
function sendError(res, status, code, message) {
  const body = Buffer.from(JSON.stringify({ error: { code, message } }), 'utf8');
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(body.length),
  });
  res.end(body);
}

/**
 * POST the captured request to the platform's dispatch endpoint and resolve
 * with the parsed `{status, headers, body}` payload.
 *
 * @param {object} cfg
 * @param {string} cfg.platformHost
 * @param {number} cfg.platformPort
 * @param {string} cfg.bridgeToken
 * @param {object} cfg.payload
 * @returns {Promise<{status:number,headers:Record<string,string|string[]>,body:unknown}>}
 */
function postToDispatch({ platformHost, platformPort, bridgeToken, payload }) {
  return new Promise((resolve, reject) => {
    const json = Buffer.from(JSON.stringify(payload), 'utf8');
    const req = http.request(
      {
        hostname: platformHost,
        port: platformPort,
        path: '/internal/http-route-dispatch',
        method: 'POST',
        headers: {
          'X-Bridge-Token': bridgeToken,
          'Content-Type': 'application/json',
          'Content-Length': String(json.length),
          Accept: 'application/json',
        },
        timeout: UPSTREAM_TIMEOUT_MS,
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          let parsed;
          try {
            parsed = JSON.parse(raw);
          } catch {
            reject(new Error(`Invalid JSON from dispatch (status=${res.statusCode})`));
            return;
          }
          if (parsed && parsed.success === true && parsed.data) {
            resolve(parsed.data);
          } else if (res.statusCode === 404) {
            // Feature flag disabled or no route. Surface as 404 to caller.
            resolve({ status: 404, headers: { 'content-type': 'application/json' }, body: { error: 'not_found' } });
          } else {
            const code = (parsed && parsed.error && parsed.error.code) || 'DISPATCH_FAILED';
            const message = (parsed && parsed.error && parsed.error.message) || `dispatch failed (status=${res.statusCode})`;
            reject(new Error(`${code}: ${message}`));
          }
        });
        res.on('error', reject);
      },
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Upstream dispatch timeout'));
    });
    req.write(json);
    req.end();
  });
}

/**
 * Build the request listener used by the user-facing HTTP server.
 *
 * @param {object} opts
 * @param {string} opts.platformHost
 * @param {number} opts.platformPort
 * @param {() => string | null} opts.getBridgeToken - lazy getter so token rotation works
 * @param {() => string | null} opts.getDefaultProjectId
 * @param {object} opts.log
 * @returns {(req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>}
 */
function buildRequestHandler({ platformHost, platformPort, getBridgeToken, getDefaultProjectId, log }) {
  return async function handle(req, res) {
    try {
      const bridgeToken = getBridgeToken();
      if (!bridgeToken) {
        sendError(res, 503, 'NOT_READY', 'Bridge token not configured');
        return;
      }

      // Resolve project: header (set by nginx) wins; fallback to env default.
      const headerProjectId = req.headers['x-2bot-project-id'];
      const projectId =
        (typeof headerProjectId === 'string' && headerProjectId.length > 0
          ? headerProjectId
          : null) || getDefaultProjectId();

      if (!projectId) {
        sendError(res, 400, 'NO_PROJECT', 'X-2bot-Project-Id header missing and no default configured');
        return;
      }

      const rawBody = await readRequestBody(req, MAX_BODY_BYTES);
      if (rawBody === null) {
        sendError(res, 413, 'PAYLOAD_TOO_LARGE', `Request body exceeds ${MAX_BODY_BYTES} bytes`);
        return;
      }

      // Normalize URL: separate path from query for the dispatcher.
      // req.url is always present on incoming server requests.
      const urlObj = new URL(req.url || '/', 'http://internal.local');
      const pathOnly = urlObj.pathname || '/';

      /** @type {Record<string, string | string[]>} */
      const query = {};
      for (const [k, v] of urlObj.searchParams.entries()) {
        const existing = query[k];
        if (existing === undefined) {
          query[k] = v;
        } else if (Array.isArray(existing)) {
          existing.push(v);
        } else {
          query[k] = [existing, v];
        }
      }

      // Try to JSON-decode the body when content-type advertises it; otherwise
      // pass the raw body through as a UTF-8 string for plugins that want it.
      const ct = String(req.headers['content-type'] || '').toLowerCase();
      let bodyForPlugin = null;
      if (rawBody.length > 0) {
        if (ct.includes('application/json')) {
          try {
            bodyForPlugin = JSON.parse(rawBody.toString('utf8'));
          } catch {
            bodyForPlugin = rawBody.toString('utf8');
          }
        } else if (ct.includes('text/') || ct.includes('application/x-www-form-urlencoded')) {
          bodyForPlugin = rawBody.toString('utf8');
        } else {
          bodyForPlugin = null; // binary — only the rawBodyBase64 is forwarded
        }
      }

      const subdomain = extractSubdomain(req.headers['host']);
      const remoteIp =
        (req.headers['x-forwarded-for'] && String(req.headers['x-forwarded-for']).split(',')[0].trim()) ||
        req.socket?.remoteAddress ||
        null;

      const payload = {
        projectId,
        method: req.method || 'GET',
        path: pathOnly,
        headers: req.headers,
        query,
        body: bodyForPlugin,
        rawBodyBase64: rawBody.length > 0 ? rawBody.toString('base64') : undefined,
        remoteIp,
        subdomain,
      };

      const dispatched = await postToDispatch({
        platformHost,
        platformPort,
        bridgeToken,
        payload,
      });

      writeDispatchedResponse(res, dispatched);
    } catch (err) {
      log.error('http-listener dispatch failed:', err && err.message ? err.message : err);
      if (!res.headersSent) {
        sendError(res, 502, 'BAD_GATEWAY', 'Upstream dispatch failed');
      } else {
        try { res.destroy(); } catch { /* ignore */ }
      }
    }
  };
}

/**
 * Start the user-facing HTTP listener. Returns the `http.Server` instance
 * (or `null` when no port is configured).
 *
 * @param {object} opts
 * @param {number} opts.port - 0 disables the listener
 * @param {string} opts.platformHost
 * @param {number} opts.platformPort
 * @param {() => string | null} opts.getBridgeToken
 * @param {() => string | null} opts.getDefaultProjectId
 * @param {object} opts.log
 * @returns {http.Server | null}
 */
function startHttpListener({ port, platformHost, platformPort, getBridgeToken, getDefaultProjectId, log }) {
  if (!port || port <= 0) {
    log.info('http-listener disabled (WORKSPACE_HTTP_PORT not set)');
    return null;
  }

  const handler = buildRequestHandler({
    platformHost,
    platformPort,
    getBridgeToken,
    getDefaultProjectId,
    log,
  });

  const server = http.createServer((req, res) => {
    // Best-effort: never let an uncaught error crash the bridge process.
    Promise.resolve()
      .then(() => handler(req, res))
      .catch((err) => {
        log.error('http-listener unhandled error:', err && err.message ? err.message : err);
        if (!res.headersSent) {
          try { sendError(res, 500, 'INTERNAL', 'Internal error'); } catch { /* ignore */ }
        }
      });
  });

  server.on('error', (err) => {
    log.error(`http-listener server error on port ${port}:`, err.message);
  });

  server.listen(port, '0.0.0.0', () => {
    log.info(`  HTTP user-facing: http://0.0.0.0:${port} → ${platformHost}:${platformPort}/internal/http-route-dispatch`);
  });

  return server;
}

module.exports = {
  startHttpListener,
  // Exported for unit tests:
  buildRequestHandler,
  extractSubdomain,
  writeDispatchedResponse,
};
