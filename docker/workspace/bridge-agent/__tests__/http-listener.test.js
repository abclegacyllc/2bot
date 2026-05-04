/**
 * Smoke tests for the bridge-agent user-facing HTTP listener (Phase 7.3).
 *
 * Exercises the listener end-to-end against a fake "platform" HTTP server
 * standing in for /internal/http-route-dispatch. Covers:
 *   - happy path GET → JSON body + correct upstream payload
 *   - POST with JSON body → body forwarded + rawBodyBase64 captured
 *   - missing X-2bot-Project-Id and no fallback env → 400
 *   - upstream 502 / network error → caller gets 502
 *   - subdomain extraction from Host header
 *
 * Run with:
 *   node --test docker/workspace/bridge-agent/__tests__/http-listener.test.js
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const { buildRequestHandler, extractSubdomain } = require('../http-listener');

const silentLog = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  fatal: () => {},
};

/**
 * Start a fake platform server that captures the next dispatch request and
 * returns the configured response. Returns { url, getCaptured, close }.
 */
function startFakePlatform(handler) {
  return new Promise((resolve) => {
    let captured = null;

    const server = http.createServer((req, res) => {
      let raw = '';
      req.on('data', (c) => { raw += c.toString('utf8'); });
      req.on('end', () => {
        let parsed = null;
        try { parsed = raw ? JSON.parse(raw) : null; } catch { /* keep raw */ }
        captured = { method: req.method, path: req.url, headers: req.headers, body: parsed, raw };
        handler(captured, res);
      });
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve({
        host: '127.0.0.1',
        port: addr.port,
        getCaptured: () => captured,
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}

/**
 * Issue a request to the listener and return { status, headers, body }.
 */
function fetchListener(port, opts) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: opts.path || '/',
        method: opts.method || 'GET',
        headers: opts.headers || {},
        timeout: 5000,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      },
    );
    req.on('error', reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

function startListenerWith(platform, { defaultProjectId = null, bridgeToken = 'test-token' } = {}) {
  const handler = buildRequestHandler({
    platformHost: platform.host,
    platformPort: platform.port,
    getBridgeToken: () => bridgeToken,
    getDefaultProjectId: () => defaultProjectId,
    log: silentLog,
  });
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      Promise.resolve().then(() => handler(req, res)).catch((err) => {
        if (!res.headersSent) {
          res.writeHead(500); res.end(String(err && err.message || err));
        }
      });
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

test('extractSubdomain pulls leading label from a 3+ label host', () => {
  assert.equal(extractSubdomain('alice-todo.2bot.org'), 'alice-todo');
  assert.equal(extractSubdomain('alice.2bot.org:443'), 'alice');
  assert.equal(extractSubdomain('localhost'), null);
  assert.equal(extractSubdomain('2bot.org'), null);
  assert.equal(extractSubdomain(''), null);
  assert.equal(extractSubdomain(undefined), null);
});

test('GET happy path → forwards request and returns dispatched response', async () => {
  const platform = await startFakePlatform((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      data: {
        status: 200,
        headers: { 'content-type': 'application/json', 'x-route-id': 'r1' },
        body: { ok: true },
      },
    }));
  });

  const listener = await startListenerWith(platform, { defaultProjectId: 'project-default' });
  try {
    const resp = await fetchListener(listener.address().port, {
      method: 'GET',
      path: '/hello?name=world',
      headers: { host: 'alice-todo.2bot.org' },
    });

    assert.equal(resp.status, 200);
    assert.deepEqual(JSON.parse(resp.body), { ok: true });
    assert.equal(resp.headers['x-route-id'], 'r1');

    const cap = platform.getCaptured();
    assert.equal(cap.method, 'POST');
    assert.equal(cap.path, '/internal/http-route-dispatch');
    assert.equal(cap.headers['x-bridge-token'], 'test-token');
    assert.equal(cap.body.projectId, 'project-default');
    assert.equal(cap.body.method, 'GET');
    assert.equal(cap.body.path, '/hello');
    assert.deepEqual(cap.body.query, { name: 'world' });
    assert.equal(cap.body.subdomain, 'alice-todo');
  } finally {
    await new Promise((r) => listener.close(r));
    await platform.close();
  }
});

test('POST JSON body → forwarded with rawBodyBase64 + decoded body', async () => {
  const platform = await startFakePlatform((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      data: { status: 201, headers: {}, body: 'created' },
    }));
  });

  const listener = await startListenerWith(platform, { defaultProjectId: 'project-x' });
  try {
    const payload = JSON.stringify({ a: 1 });
    const resp = await fetchListener(listener.address().port, {
      method: 'POST',
      path: '/api/echo',
      headers: {
        host: 'svc.2bot.org',
        'content-type': 'application/json',
        'content-length': String(Buffer.byteLength(payload)),
      },
      body: payload,
    });

    assert.equal(resp.status, 201);
    assert.equal(resp.body, 'created');

    const cap = platform.getCaptured();
    assert.deepEqual(cap.body.body, { a: 1 });
    assert.equal(
      Buffer.from(cap.body.rawBodyBase64, 'base64').toString('utf8'),
      payload,
    );
  } finally {
    await new Promise((r) => listener.close(r));
    await platform.close();
  }
});

test('header X-2bot-Project-Id wins over default env', async () => {
  const platform = await startFakePlatform((_req, res) => {
    res.writeHead(200);
    res.end(JSON.stringify({ success: true, data: { status: 200, headers: {}, body: null } }));
  });

  const listener = await startListenerWith(platform, { defaultProjectId: 'env-default' });
  try {
    await fetchListener(listener.address().port, {
      method: 'GET',
      path: '/x',
      headers: { host: 'svc.2bot.org', 'x-2bot-project-id': 'header-project' },
    });
    assert.equal(platform.getCaptured().body.projectId, 'header-project');
  } finally {
    await new Promise((r) => listener.close(r));
    await platform.close();
  }
});

test('missing project id (no header, no env) → 400', async () => {
  const platform = await startFakePlatform((_req, res) => {
    res.writeHead(200);
    res.end(JSON.stringify({ success: true, data: { status: 200, headers: {}, body: null } }));
  });

  const listener = await startListenerWith(platform, { defaultProjectId: null });
  try {
    const resp = await fetchListener(listener.address().port, {
      method: 'GET',
      path: '/x',
      headers: { host: 'svc.2bot.org' },
    });
    assert.equal(resp.status, 400);
    assert.match(resp.body, /NO_PROJECT/);
    assert.equal(platform.getCaptured(), null);
  } finally {
    await new Promise((r) => listener.close(r));
    await platform.close();
  }
});

test('missing bridge token → 503 NOT_READY', async () => {
  const platform = await startFakePlatform((_req, res) => {
    res.writeHead(200);
    res.end(JSON.stringify({ success: true, data: { status: 200, headers: {}, body: null } }));
  });

  const listener = await new Promise((resolve) => {
    const handler = buildRequestHandler({
      platformHost: platform.host,
      platformPort: platform.port,
      getBridgeToken: () => null,
      getDefaultProjectId: () => 'p1',
      log: silentLog,
    });
    const s = http.createServer((req, res) => {
      Promise.resolve().then(() => handler(req, res)).catch(() => {
        if (!res.headersSent) { res.writeHead(500); res.end(); }
      });
    });
    s.listen(0, '127.0.0.1', () => resolve(s));
  });

  try {
    const resp = await fetchListener(listener.address().port, {
      method: 'GET',
      path: '/x',
      headers: { host: 'svc.2bot.org' },
    });
    assert.equal(resp.status, 503);
    assert.match(resp.body, /NOT_READY/);
  } finally {
    await new Promise((r) => listener.close(r));
    await platform.close();
  }
});

test('upstream returns error envelope → 502 BAD_GATEWAY', async () => {
  const platform = await startFakePlatform((_req, res) => {
    res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: { code: 'INTERNAL_ERROR', message: 'boom' } }));
  });

  const listener = await startListenerWith(platform, { defaultProjectId: 'p1' });
  try {
    const resp = await fetchListener(listener.address().port, {
      method: 'GET',
      path: '/x',
      headers: { host: 'svc.2bot.org' },
    });
    assert.equal(resp.status, 502);
    assert.match(resp.body, /BAD_GATEWAY/);
  } finally {
    await new Promise((r) => listener.close(r));
    await platform.close();
  }
});

test('upstream 404 (feature flag off) → caller sees 404', async () => {
  const platform = await startFakePlatform((_req, res) => {
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: { code: 'NOT_FOUND', message: 'Feature disabled' } }));
  });

  const listener = await startListenerWith(platform, { defaultProjectId: 'p1' });
  try {
    const resp = await fetchListener(listener.address().port, {
      method: 'GET',
      path: '/x',
      headers: { host: 'svc.2bot.org' },
    });
    assert.equal(resp.status, 404);
  } finally {
    await new Promise((r) => listener.close(r));
    await platform.close();
  }
});
