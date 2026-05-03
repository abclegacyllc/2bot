/**
 * MCP Manager (Bridge Agent side)
 *
 * Manages MCP stdio server child processes running INSIDE the workspace container.
 * Each logical session can have multiple MCP servers identified by a serverSessionId.
 *
 * JSON-RPC 2.0 over stdin/stdout — the MCP wire protocol.
 *
 * bridge actions handled by this module (registered in actionHandlers):
 *   mcp.spawn      — fork a new MCP server process
 *   mcp.listTools  — send tools/list JSON-RPC and return the tools array
 *   mcp.call       — send tools/call JSON-RPC and return the text result
 *   mcp.kill       — terminate a running MCP server process
 */

'use strict';

const { spawn } = require('child_process');

class MCPManager {
  /**
   * @param {{ log: object }} options
   */
  constructor({ log }) {
    this.log = log;

    /**
     * Active MCP server processes.
     * Key: serverSessionId (string)
     * Value: { proc: ChildProcess, buffer: string, pending: Map<number, {resolve, reject}>, nextId: number }
     */
    this.servers = new Map();
  }

  // ---------------------------------------------------------------------------
  // Public bridge action handlers
  // ---------------------------------------------------------------------------

  /**
   * Spawn a new MCP stdio server process.
   *
   * @param {{ serverSessionId: string, command: string, args: string[], env?: object }} payload
   * @returns {Promise<{ serverSessionId: string, ok: boolean }>}
   */
  async spawn(payload) {
    const { serverSessionId, command, args = [], env = {} } = payload;

    if (!serverSessionId) throw new Error('mcp.spawn: serverSessionId is required');
    if (!command) throw new Error('mcp.spawn: command is required');
    if (this.servers.has(serverSessionId)) {
      this.log.warn(`mcp.spawn: session ${serverSessionId} already exists — killing first`);
      await this.kill({ serverSessionId });
    }

    // Allowlisted environment — never inherit process.env
    const safeEnv = {
      PATH: process.env.PATH || '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
      HOME: process.env.HOME || '/root',
      TMPDIR: '/tmp',
      ...env,                 // user-supplied extras (validated by platform before sending)
    };

    const proc = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: process.env.WORKSPACE_DIR || '/workspace',
      env: safeEnv,
    });

    const session = {
      proc,
      buffer: '',
      pending: new Map(),
      nextId: 1,
    };

    this.servers.set(serverSessionId, session);

    // Accumulate stdout and dispatch complete JSON-RPC messages
    proc.stdout.on('data', (chunk) => {
      session.buffer += chunk.toString('utf8');
      this._drainBuffer(serverSessionId, session);
    });

    proc.stderr.on('data', (data) => {
      this.log.debug(`[mcp:${serverSessionId}] stderr: ${data.toString().trim()}`);
    });

    proc.on('exit', (code, signal) => {
      this.log.info(`[mcp:${serverSessionId}] process exited code=${code} signal=${signal}`);
      // Reject all pending requests
      for (const [, { reject }] of session.pending) {
        reject(new Error(`MCP server exited (code=${code})`));
      }
      this.servers.delete(serverSessionId);
    });

    // Send initialize request
    await this._sendRequest(serverSessionId, session, 'initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: '2bot-bridge', version: '1.0.0' },
    });

    // Send initialized notification (no response expected)
    this._sendNotification(session, 'notifications/initialized', {});

    this.log.info(`[mcp:${serverSessionId}] spawned and initialized`);
    return { serverSessionId, ok: true };
  }

  /**
   * List all tools exposed by an MCP server.
   *
   * @param {{ serverSessionId: string }} payload
   * @returns {Promise<Array<{ name: string, description: string, inputSchema: object }>>}
   */
  async listTools(payload) {
    const { serverSessionId } = payload;
    const session = this._getSession(serverSessionId);

    const result = await this._sendRequest(serverSessionId, session, 'tools/list', {});
    return result.tools ?? [];
  }

  /**
   * Call a tool on an MCP server.
   *
   * @param {{ serverSessionId: string, name: string, args: object }} payload
   * @returns {Promise<string>} text result
   */
  async call(payload) {
    const { serverSessionId, name, args = {} } = payload;
    if (!name) throw new Error('mcp.call: name is required');

    const session = this._getSession(serverSessionId);

    const result = await this._sendRequest(serverSessionId, session, 'tools/call', {
      name,
      arguments: args,
    });

    // MCP tools/call returns { content: Array<{ type, text }>, isError? }
    if (result.isError) {
      const errText = (result.content ?? [])
        .filter(c => c.type === 'text')
        .map(c => c.text)
        .join('\n');
      throw new Error(`MCP tool error: ${errText || 'unknown error'}`);
    }

    return (result.content ?? [])
      .filter(c => c.type === 'text')
      .map(c => c.text)
      .join('\n');
  }

  /**
   * Kill an MCP server process.
   *
   * @param {{ serverSessionId: string }} payload
   */
  async kill(payload) {
    const { serverSessionId } = payload;
    const session = this.servers.get(serverSessionId);
    if (!session) return { ok: true, note: 'not running' };

    session.proc.kill('SIGTERM');
    // Give it 2 s to exit gracefully, then SIGKILL
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        session.proc.kill('SIGKILL');
        resolve(undefined);
      }, 2000);
      session.proc.once('exit', () => {
        clearTimeout(timer);
        resolve(undefined);
      });
    });

    this.servers.delete(serverSessionId);
    this.log.info(`[mcp:${serverSessionId}] killed`);
    return { ok: true };
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  _getSession(serverSessionId) {
    const session = this.servers.get(serverSessionId);
    if (!session) throw new Error(`mcp: no active session '${serverSessionId}'`);
    return session;
  }

  /**
   * Parse newline-delimited JSON messages from stdout buffer.
   */
  _drainBuffer(serverSessionId, session) {
    const lines = session.buffer.split('\n');
    session.buffer = lines.pop(); // last partial line stays in buffer

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let msg;
      try {
        msg = JSON.parse(trimmed);
      } catch {
        this.log.debug(`[mcp:${serverSessionId}] non-JSON stdout: ${trimmed}`);
        continue;
      }

      if (typeof msg.id !== 'undefined' && session.pending.has(msg.id)) {
        const { resolve, reject } = session.pending.get(msg.id);
        session.pending.delete(msg.id);
        if (msg.error) {
          reject(new Error(msg.error.message ?? JSON.stringify(msg.error)));
        } else {
          resolve(msg.result ?? {});
        }
      }
    }
  }

  /**
   * Send a JSON-RPC request and return a Promise that resolves with the result.
   */
  _sendRequest(serverSessionId, session, method, params) {
    return new Promise((resolve, reject) => {
      const id = session.nextId++;
      const message = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';

      const timeout = setTimeout(() => {
        session.pending.delete(id);
        reject(new Error(`mcp: timeout waiting for response to '${method}' (${serverSessionId})`));
      }, 30_000);

      session.pending.set(id, {
        resolve: (r) => { clearTimeout(timeout); resolve(r); },
        reject: (e) => { clearTimeout(timeout); reject(e); },
      });

      try {
        session.proc.stdin.write(message);
      } catch (err) {
        session.pending.delete(id);
        clearTimeout(timeout);
        reject(err);
      }
    });
  }

  /**
   * Send a JSON-RPC notification (no response expected).
   */
  _sendNotification(session, method, params) {
    const message = JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n';
    session.proc.stdin.write(message);
  }
}

module.exports = { MCPManager };
