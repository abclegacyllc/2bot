/**
 * Terminal Service
 * 
 * Manages PTY (pseudo-terminal) sessions inside the workspace container.
 * Uses node-pty to spawn bash shells and streams output via WebSocket.
 * 
 * Each terminal session is a separate bash process with its own PTY.
 */

'use strict';

let pty;
try {
  pty = require('node-pty');
} catch {
  // node-pty may not be available (needs native compilation)
  // Fall back to a simple exec-based approach
  pty = null;
}

const crypto = require('crypto');

class TerminalService {
  constructor({ workspaceDir, log }) {
    this.workspaceDir = workspaceDir;
    this.log = log;

    /** Map<string, TerminalSession> */
    this.sessions = new Map();

    // Maximum concurrent terminal sessions per container
    this.maxSessions = 4;
  }

  /**
   * Create a new terminal session
   * @param {number} cols - Terminal width in columns
   * @param {number} rows - Terminal height in rows
   * @param {WebSocket} ws - WebSocket to stream output to
   * @returns {string} Session ID
   */
  create(cols = 80, rows = 24, ws = null) {
    if (this.sessions.size >= this.maxSessions) {
      throw new Error(`Maximum terminal sessions reached (${this.maxSessions})`);
    }

    const sessionId = crypto.randomUUID();

    if (pty) {
      // Use node-pty for full PTY support (arrow keys, colors, vim, etc.)
      // Allowlist env vars — never spread process.env (leaks BRIDGE_AUTH_TOKEN etc.)
      const shell = pty.spawn('bash', [], {
        name: 'xterm-256color',
        cols,
        rows,
        cwd: this.workspaceDir,
        env: {
          PATH: process.env.PATH || '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
          LANG: process.env.LANG || 'C.UTF-8',
          TERM: 'xterm-256color',
          HOME: this.workspaceDir,
          USER: process.env.USER || 'node',
          SHELL: '/bin/bash',
          NODE_VERSION: process.env.NODE_VERSION || '',
          PS1: '\\[\\033[01;32m\\]workspace\\[\\033[00m\\]:\\[\\033[01;34m\\]\\w\\[\\033[00m\\]$ ',
        },
      });

      const session = {
        id: sessionId,
        pty: shell,
        ws,
        cols,
        rows,
        createdAt: new Date().toISOString(),
      };

      // Stream PTY output to WebSocket
      shell.onData((data) => {
        if (ws && ws.readyState === 1) {
          ws.send(JSON.stringify({
            event: 'terminal.output',
            data: { sessionId, output: data },
          }));
        }
      });

      shell.onExit(({ exitCode, signal }) => {
        this.log.info(`Terminal session ${sessionId} exited (code=${exitCode}, signal=${signal})`);
        if (ws && ws.readyState === 1) {
          ws.send(JSON.stringify({
            event: 'terminal.exit',
            data: { sessionId, exitCode, signal },
          }));
        }
        this.sessions.delete(sessionId);
      });

      this.sessions.set(sessionId, session);
    } else {
      // Fallback: no PTY support — simple non-interactive mode
      this.log.warn('node-pty not available — terminal will run in non-interactive mode');

      const { spawn } = require('child_process');
      const shell = spawn('bash', ['-i'], {
        cwd: this.workspaceDir,
        env: {
          ...process.env,
          TERM: 'dumb',
          HOME: this.workspaceDir,
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const session = {
        id: sessionId,
        process: shell,
        ws,
        cols,
        rows,
        createdAt: new Date().toISOString(),
        isPtyFallback: true,
      };

      shell.stdout.on('data', (data) => {
        if (ws && ws.readyState === 1) {
          ws.send(JSON.stringify({
            event: 'terminal.output',
            data: { sessionId, output: data.toString() },
          }));
        }
      });

      shell.stderr.on('data', (data) => {
        if (ws && ws.readyState === 1) {
          ws.send(JSON.stringify({
            event: 'terminal.output',
            data: { sessionId, output: data.toString() },
          }));
        }
      });

      shell.on('exit', (code, signal) => {
        this.log.info(`Terminal session ${sessionId} exited (code=${code}, signal=${signal})`);
        if (ws && ws.readyState === 1) {
          ws.send(JSON.stringify({
            event: 'terminal.exit',
            data: { sessionId, exitCode: code, signal },
          }));
        }
        this.sessions.delete(sessionId);
      });

      this.sessions.set(sessionId, session);
    }

    this.log.info(`Terminal session created: ${sessionId} (${cols}x${rows})`);
    return sessionId;
  }

  /**
   * Write input to a terminal session
   * @param {string} sessionId - Session ID
   * @param {string} data - Input data
   */
  write(sessionId, data) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Terminal session not found: ${sessionId}`);
    }

    if (session.pty) {
      session.pty.write(data);
    } else if (session.process) {
      session.process.stdin.write(data);
    }
  }

  /**
   * Resize a terminal session
   * @param {string} sessionId - Session ID
   * @param {number} cols - New width
   * @param {number} rows - New height
   */
  resize(sessionId, cols, rows) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Terminal session not found: ${sessionId}`);
    }

    session.cols = cols;
    session.rows = rows;

    if (session.pty) {
      session.pty.resize(cols, rows);
    }
    // No resize support for fallback mode
  }

  /**
   * Close a terminal session
   * @param {string} sessionId - Session ID
   */
  close(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    if (session.pty) {
      session.pty.kill();
    } else if (session.process) {
      session.process.kill('SIGTERM');
      setTimeout(() => {
        try { session.process.kill('SIGKILL'); } catch {}
      }, 3000);
    }

    this.sessions.delete(sessionId);
    this.log.info(`Terminal session closed: ${sessionId}`);
  }

  /**
   * Close all terminal sessions (for shutdown)
   */
  closeAll() {
    for (const [id] of this.sessions) {
      this.close(id);
    }
  }

  /**
   * List active terminal sessions
   */
  list() {
    const result = [];
    for (const [, session] of this.sessions) {
      result.push({
        id: session.id,
        cols: session.cols,
        rows: session.rows,
        createdAt: session.createdAt,
        isPtyFallback: !!session.isPtyFallback,
      });
    }
    return result;
  }
}

module.exports = { TerminalService };
