/**
 * Plugin Runner Service
 * 
 * Manages plugin processes inside the workspace container.
 * Each plugin runs as a child process (fork) with its own stdout/stderr.
 * Emits events for plugin lifecycle (started, stopped, crashed, log).
 */

/* eslint-disable @typescript-eslint/no-require-imports */
'use strict';

const { fork, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const EventEmitter = require('events');
const Database = require('better-sqlite3');
const { resolvePlugin, validateManifest } = require('./plugin-manifest');

/**
 * Sanitize a plugin file path into a safe filename for per-plugin DBs.
 * @param {string} pluginFile
 * @returns {string}
 */
function sanitizeDbName(pluginFile) {
  return pluginFile.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_{2,}/g, '_');
}

class PluginRunner extends EventEmitter {
  constructor({ workspaceDir, log, logCollector, sendIpcToPlatform, localStore }) {
    super();
    this.workspaceDir = workspaceDir;
    this.log = log;
    this.logCollector = logCollector;

    /** Callback to relay IPC requests to the platform via bridge agent */
    this.sendIpcToPlatform = sendIpcToPlatform || null;

    /** Local SQLite storage for offline-capable plugin storage */
    this.localStore = localStore || null;

    /** Map<string, PluginProcess> — keyed by file path */
    this.processes = new Map();

    /** Per-plugin SQLite databases for the database API */
    this._pluginDbs = new Map();

    /** Directory for per-plugin databases */
    this._pluginDbDir = path.join(workspaceDir, '.2bot', 'plugin-dbs');

    /** Maximum concurrent running plugins per container (env-configurable) */
    this.maxPlugins = parseInt(process.env.MAX_PLUGINS_PER_CONTAINER || '50', 10);

    // ── Per-Plugin Resource Monitor ──
    // Checks memory usage every 10s and auto-restarts plugins that exceed hard limits
    /** Soft memory limit (MB) — warn user */
    this.memorySoftLimitMb = parseInt(process.env.PLUGIN_MEMORY_SOFT_LIMIT_MB || '256', 10);
    /** Hard memory limit (MB) — auto-restart */
    this.memoryHardLimitMb = parseInt(process.env.PLUGIN_MEMORY_HARD_LIMIT_MB || '512', 10);
    /** Track restart counts to prevent restart-loops */
    this._resourceRestarts = new Map(); // file → { count, firstAt, lastAt }
    /** Max auto-restarts within the cooldown window before giving up */
    this._maxResourceRestarts = 3;
    /** Cooldown window (ms) — reset restart count after this period */
    this._resourceRestartWindow = 5 * 60 * 1000; // 5 minutes

    this._resourceMonitorInterval = setInterval(() => {
      this._checkPluginResources();
    }, 10_000);
    this._resourceMonitorInterval.unref();
  }

  /**
   * Start a plugin as a child process
   * @param {string} file - Plugin file path relative to workspace
   * @param {object} env - Optional environment variables
   */
  async start(file, env = {}) {
    // Check concurrent plugin limit
    const runningCount = [...this.processes.values()].filter(p => p.status === 'running').length;
    if (runningCount >= this.maxPlugins) {
      throw new Error(`Maximum concurrent plugins reached (${this.maxPlugins})`);
    }

    const normalizedFile = file.startsWith('/') ? file.slice(1) : file;

    // ── Resolve plugin (single file or directory with manifest) ──
    const resolved = resolvePlugin(this.workspaceDir, normalizedFile);
    if (!resolved) {
      throw new Error(`Plugin not found or invalid: ${file} — if this is a directory, ensure it contains a plugin.json or index.js`);
    }

    const { entryFile, cwd: pluginCwd, manifest, isDirectory } = resolved;

    // Path traversal prevention — entry must be within workspace
    if (!entryFile.startsWith(this.workspaceDir)) {
      throw new Error(`Plugin file must be within workspace directory: ${file}`);
    }

    // TypeScript detection — needed before pre-flight check
    const isTypeScript = /\.tsx?$/.test(entryFile);

    // Pre-flight syntax check — only for JavaScript files
    // TypeScript files are validated by tsx at runtime
    if (!isTypeScript) {
      try {
        execSync(`node --check "${entryFile}"`, { encoding: 'utf-8', timeout: 10000, stdio: 'pipe' });
      } catch (err) {
        const stderr = (err.stderr || err.message || '').toString();
        const syntaxMatch = stderr.match(/SyntaxError:\s*(.+)/);
        const msg = syntaxMatch ? syntaxMatch[1] : 'Syntax error in plugin file';
        throw new Error(`Plugin has syntax errors and cannot start: ${msg}`);
      }
    }

    // Check if already running
    if (this.processes.has(normalizedFile)) {
      const existing = this.processes.get(normalizedFile);
      if (existing.status === 'running') {
        this.log.info(`Plugin already running: ${normalizedFile} (PID: ${existing.pid})`);
        return { pid: existing.pid, file: normalizedFile, alreadyRunning: true };
      }
      // If stopped/error, clean up old entry
      this.processes.delete(normalizedFile);
    }

    // Fork the plugin as a child process
    // TypeScript files (.ts, .tsx) use tsx loader; JS files use native fork
    let child;

    // CWD: for directory plugins, run inside the plugin directory
    //       for single-file plugins, run inside the workspace root
    const childCwd = pluginCwd;

    if (isTypeScript) {
      // Use tsx to execute TypeScript files via fork() for IPC support
      // (spawn without 'ipc' in stdio breaks process.send() for SDK features)
      // Strip bridge auth token from child env (security: plugins must not access it)
      const { BRIDGE_AUTH_TOKEN: _tsToken, ...safeEnvTs } = process.env;
      const tsxBin = path.join(__dirname, 'node_modules', '.bin', 'tsx');
      child = fork(tsxBin, [entryFile], {
        cwd: childCwd,
        env: {
          ...safeEnvTs,
          ...env,
          PLUGIN_FILE: normalizedFile,
          PLUGIN_ENTRY: manifest.entry,
          PLUGIN_SLUG: manifest.slug,
          PLUGIN_DIR: isDirectory ? pluginCwd : '',
          WORKSPACE_DIR: this.workspaceDir,
        },
        stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      });
    } else {
      // Strip bridge auth token from child env (security: plugins must not access it)
      const { BRIDGE_AUTH_TOKEN: _jsToken, ...safeEnvJs } = process.env;
      child = fork(entryFile, [], {
        cwd: childCwd,
        env: {
          ...safeEnvJs,
          ...env,
          PLUGIN_FILE: normalizedFile,
          PLUGIN_ENTRY: manifest.entry,
          PLUGIN_SLUG: manifest.slug,
          PLUGIN_DIR: isDirectory ? pluginCwd : '',
          WORKSPACE_DIR: this.workspaceDir,
        },
        stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
        // Resource limits are handled at the Docker container level
      });
    }

    const pluginProcess = {
      file: normalizedFile,
      name: manifest.name || path.basename(normalizedFile, path.extname(normalizedFile)),
      pid: child.pid,
      status: 'running',
      startedAt: new Date().toISOString(),
      isDirectory,
      manifest,
      cwd: pluginCwd,
      child,
      logs: [],
      gatewayId: env.PLUGIN_GATEWAY_ID || null,
    };

    this.processes.set(normalizedFile, pluginProcess);

    // Capture stdout
    child.stdout.on('data', (data) => {
      const line = data.toString().trim();
      if (line) {
        this._addLog(normalizedFile, 'info', line);
      }
    });

    // Capture stderr
    child.stderr.on('data', (data) => {
      const line = data.toString().trim();
      if (line) {
        this._addLog(normalizedFile, 'error', line);
      }
    });

    // Handle IPC messages from forked child processes (storage, gateway calls)
    if (child.send && typeof child.on === 'function') {
      child.on('message', (msg) => {
        if (msg && msg.type === 'ipc.request' && msg.id && msg.method) {
          this._handleChildIpc(normalizedFile, child, msg);
        }
      });
    }

    // Handle exit
    child.on('exit', (code, signal) => {
      const proc = this.processes.get(normalizedFile);
      if (proc) {
        const crashed = code !== 0 && code !== null;
        proc.status = crashed ? 'error' : 'stopped';
        proc.exitCode = code;
        proc.stoppedAt = new Date().toISOString();
        proc.child = null;

        // Close per-plugin database if open
        this._closePluginDb(normalizedFile);

        if (crashed) {
          proc.lastError = `Exited with code ${code}${signal ? ` (signal: ${signal})` : ''}`;
          this.log.error(`Plugin crashed: ${normalizedFile} — code=${code} signal=${signal}`);
          this.logCollector.log('error', 'plugin', `Plugin crashed: ${normalizedFile} (code ${code})`, { pluginFile: normalizedFile });
          this.emit('crashed', {
            file: normalizedFile,
            pid: proc.pid,
            exitCode: code,
            signal,
            error: proc.lastError,
          });
        } else {
          this.log.info(`Plugin stopped: ${normalizedFile} (code ${code})`);
          this.logCollector.log('info', 'plugin', `Plugin stopped: ${normalizedFile}`, { pluginFile: normalizedFile });
          this.emit('stopped', { file: normalizedFile, pid: proc.pid, exitCode: code });
        }
      }
    });

    child.on('error', (err) => {
      const proc = this.processes.get(normalizedFile);
      if (proc) {
        proc.status = 'error';
        proc.lastError = err.message;
        proc.child = null;
      }
      this.log.error(`Plugin error: ${normalizedFile} — ${err.message}`);
      this.emit('crashed', { file: normalizedFile, error: err.message });
    });

    this.log.info(`Plugin started: ${normalizedFile} (PID: ${child.pid})`);
    this.logCollector.log('info', 'plugin', `Plugin started: ${normalizedFile} (PID: ${child.pid})`, { pluginFile: normalizedFile });
    this.emit('started', { file: normalizedFile, pid: child.pid });

    return {
      file: normalizedFile,
      pid: child.pid,
      status: 'running',
      startedAt: pluginProcess.startedAt,
    };
  }

  /**
   * Stop a running plugin
   * @param {string|number} fileOrPid - File path or PID
   * @param {boolean} force - Use SIGKILL instead of SIGTERM
   */
  async stop(fileOrPid, force = false) {
    const proc = this._findProcess(fileOrPid);
    if (!proc) {
      throw new Error(`Plugin not found: ${fileOrPid}`);
    }

    if (proc.status !== 'running' || !proc.child) {
      throw new Error(`Plugin not running: ${proc.file}`);
    }

    const signal = force ? 'SIGKILL' : 'SIGTERM';
    proc.child.kill(signal);

    // Wait up to 5 seconds for graceful shutdown
    if (!force) {
      await new Promise((resolve) => {
        const timeout = setTimeout(() => {
          // Force kill if still alive
          if (proc.child) {
            proc.child.kill('SIGKILL');
          }
          resolve();
        }, 5000);

        proc.child.once('exit', () => {
          clearTimeout(timeout);
          resolve();
        });
      });
    }

    return { file: proc.file, stopped: true };
  }

  /**
   * Restart a plugin (stop + start)
   * @param {string|number} fileOrPid - File path or PID
   * @param {object} env - Optional environment variables
   */
  async restart(fileOrPid, env = {}) {
    // Resolve PID to file path if needed
    const proc = this._findProcess(fileOrPid);
    const normalizedFile = proc
      ? proc.file
      : (typeof fileOrPid === 'string' && fileOrPid.startsWith('/') ? fileOrPid.slice(1) : String(fileOrPid));

    if (proc && proc.status === 'running') {
      await this.stop(normalizedFile);
      // Small delay for cleanup
      await new Promise((r) => setTimeout(r, 500));
    }

    return this.start(normalizedFile, env);
  }

  /**
   * List all plugin processes
   */
  list() {
    const result = [];
    for (const [, proc] of this.processes) {
      result.push({
        file: proc.file,
        name: proc.name,
        pid: proc.pid,
        status: proc.status,
        startedAt: proc.startedAt,
        stoppedAt: proc.stoppedAt,
        lastError: proc.lastError,
        isDirectory: proc.isDirectory || false,
        manifest: proc.manifest || null,
        gatewayId: proc.gatewayId || null,
        uptimeSeconds: proc.status === 'running' && proc.startedAt
          ? Math.floor((Date.now() - new Date(proc.startedAt).getTime()) / 1000)
          : undefined,
        memoryMb: proc.status === 'running' && proc.pid
          ? this._getProcessMemory(proc.pid)
          : undefined,
      });
    }
    return result;
  }

  /**
   * Get recent logs for a specific plugin
   */
  getLogs(file, lines = 100) {
    const normalizedFile = file.startsWith('/') ? file.slice(1) : file;
    const proc = this.processes.get(normalizedFile);
    if (!proc) {
      throw new Error(`Plugin not found: ${file}`);
    }
    return proc.logs.slice(-lines);
  }

  /**
   * Validate a plugin file or directory (pre-flight check).
   * Runs manifest validation (for directories), Node.js syntax check, and custom lint rules.
   *
   * @param {string} file - Plugin file or directory path relative to workspace
   * @returns {{ valid: boolean, problems: Array<{ severity: 'error'|'warning'|'info', message: string, line?: number, column?: number }> }}
   */
  validate(file) {
    const normalizedFile = file.startsWith('/') ? file.slice(1) : file;
    const fullPath = path.resolve(this.workspaceDir, normalizedFile);

    if (!fullPath.startsWith(this.workspaceDir)) {
      return { valid: false, problems: [{ severity: 'error', message: 'Plugin must be within workspace directory' }] };
    }

    // ── Resolve via manifest (works for both files and directories) ──
    const resolved = resolvePlugin(this.workspaceDir, normalizedFile);
    const problems = [];

    if (!resolved) {
      // resolvePlugin returned null — check if it's a directory for better error
      const stat = fs.existsSync(fullPath) && fs.statSync(fullPath);
      if (stat && stat.isDirectory()) {
        const dirProblems = validateManifest(this.workspaceDir, normalizedFile);
        return { valid: false, problems: dirProblems.problems.length > 0 ? dirProblems.problems : [{ severity: 'error', message: `Plugin directory invalid: ${normalizedFile}` }] };
      }
      return { valid: false, problems: [{ severity: 'error', message: `Plugin not found: ${normalizedFile}` }] };
    }

    const entryFullPath = resolved.entryFile;

    // For directory plugins, also validate the manifest
    if (resolved.isDirectory) {
      const manifestResult = validateManifest(this.workspaceDir, normalizedFile);
      problems.push(...manifestResult.problems);
    }

    // Read entry file source code for linting
    let code;
    try {
      code = fs.readFileSync(entryFullPath, 'utf-8');
    } catch (err) {
      return { valid: false, problems: [...problems, { severity: 'error', message: `Cannot read entry file: ${err.message}` }] };
    }

    // 1. Node.js syntax check (--check) — only for JavaScript files
    // TypeScript files have their own type checking; node --check rejects valid TS syntax
    const isTypeScriptFile = /\.tsx?$/.test(entryFullPath);
    if (!isTypeScriptFile) {
      try {
        execSync(`node --check "${entryFullPath}"`, { encoding: 'utf-8', timeout: 10000, stdio: 'pipe' });
      } catch (err) {
        const stderr = (err.stderr || err.message || '').toString();
        const lines = stderr.split('\n').filter(Boolean);
        let errorLine = null;
        const entryBasename = path.basename(entryFullPath);
        const lineMatch = stderr.match(new RegExp(entryBasename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ':(\\d+)'));
        if (lineMatch) errorLine = parseInt(lineMatch[1], 10);

        const syntaxMatch = stderr.match(/SyntaxError:\s*(.+)/);
        const msg = syntaxMatch ? syntaxMatch[1] : lines[lines.length - 1] || 'Syntax error';
        problems.push({ severity: 'error', message: msg, line: errorLine });
      }
    }

    // 2. Custom lint checks on the source code
    const codeLines = code.split('\n');

    for (let i = 0; i < codeLines.length; i++) {
      const line = codeLines[i];
      const lineNum = i + 1;

      // Check for require of non-existent local modules
      const requireMatch = line.match(/require\s*\(\s*['"](\.\/.+?)['"]\s*\)/);
      if (requireMatch) {
        const reqPath = requireMatch[1];
        const resolvedReq = path.resolve(path.dirname(entryFullPath), reqPath);
        const candidates = [resolvedReq, resolvedReq + '.js', resolvedReq + '.json', resolvedReq + '/index.js'];
        if (!candidates.some(c => fs.existsSync(c))) {
          problems.push({ severity: 'error', message: `Cannot find module '${reqPath}'`, line: lineNum });
        }
      }

      // Check for accidental await in non-async context at top level
      if (line.match(/^\s*await\s+/) && !line.match(/^\s*(\/\/|\/\*|\*)/)) {
        let insideAsync = false;
        for (let j = i - 1; j >= 0; j--) {
          if (codeLines[j].match(/async\s+(function|=>|\()/)) {
            insideAsync = true;
            break;
          }
          if (codeLines[j].match(/^(function|const|let|var|module\.exports)/)) break;
        }
        if (!insideAsync) {
          problems.push({ severity: 'warning', message: 'Top-level await used — plugins run as CommonJS; wrap in an async function', line: lineNum });
        }
      }

      // Check for process.exit
      if (line.match(/process\.exit\s*\(/) && !line.match(/^\s*(\/\/|\/\*|\*)/)) {
        problems.push({ severity: 'warning', message: 'process.exit() will terminate the plugin — consider throwing an error or returning instead', line: lineNum });
      }
    }

    // 3. Check for missing plugin-sdk require
    if (!code.includes("require('/bridge-agent/plugin-sdk')") && !code.includes("require(\"/bridge-agent/plugin-sdk\")")) {
      problems.push({ severity: 'info', message: 'Plugin does not import the plugin-sdk — most plugins need gateway/storage access via require(\'/bridge-agent/plugin-sdk\')' });
    }

    // 4. Check for infinite loops without await/sleep (dangerous)
    if (code.match(/while\s*\(\s*true\s*\)/)) {
      if (!code.match(/await\s+/) && !code.match(/setTimeout|setInterval|sleep/)) {
        problems.push({ severity: 'warning', message: 'Infinite loop detected without await/sleep — this will block the event loop and freeze the plugin' });
      }
    }

    const valid = !problems.some(p => p.severity === 'error');
    return { valid, problems };
  }

  /**
   * Push an event to a running plugin via IPC.
   * Used for event-driven plugins that register an onEvent handler.
   * Does NOT fork a new process — sends to the existing child.
   * Waits for the plugin to process the event and return a result.
   *
   * @param {string} file - Plugin file path relative to workspace
   * @param {object} event - The event object to deliver
   * @param {number} [timeoutMs=30000] - Timeout in milliseconds
   * @returns {Promise<{ success: boolean, output?: unknown, error?: string }>}
   */
  pushEvent(file, event, timeoutMs = 30000) {
    const normalizedFile = file.startsWith('/') ? file.slice(1) : file;
    const proc = this.processes.get(normalizedFile);

    if (!proc) {
      return Promise.resolve({ success: false, error: `Plugin not found: ${file}` });
    }

    if (proc.status !== 'running' || !proc.child || !proc.child.connected) {
      return Promise.resolve({ success: false, error: `Plugin not running or IPC disconnected: ${file}` });
    }

    // Filter by eventTypes — if the plugin declares which events it handles,
    // skip events that don't match (avoids wasting CPU on irrelevant events)
    const eventType = event?.type;
    const declaredTypes = proc.manifest?.eventTypes;
    if (eventType && Array.isArray(declaredTypes) && declaredTypes.length > 0) {
      if (!declaredTypes.includes(eventType)) {
        this.log.debug(`Skipping event ${eventType} for plugin ${normalizedFile} (not in eventTypes: ${declaredTypes.join(', ')})`);
        return Promise.resolve({ success: true, output: null, skipped: true });
      }
    }

    return new Promise((resolve) => {
      const child = proc.child;

      const onMessage = (msg) => {
        if (msg && msg.type === 'plugin.event.result') {
          clearTimeout(timer);
          child.removeListener('message', onMessage);
          if (msg.success) {
            resolve({ success: true, output: msg.output ?? null });
          } else {
            resolve({ success: false, error: msg.error || 'Plugin event handler failed' });
          }
        }
      };

      const timer = setTimeout(() => {
        child.removeListener('message', onMessage);
        this.log.warn(`Plugin event timeout (${timeoutMs}ms): ${normalizedFile}`);
        resolve({ success: true, output: null });
      }, timeoutMs);

      child.on('message', onMessage);

      try {
        const sent = child.send({ type: 'plugin.event', event });
        this.log.debug(`Event pushed to plugin: ${normalizedFile} (type: ${event?.type || 'unknown'}) send=${sent} connected=${child.connected}`);
        if (!sent) {
          clearTimeout(timer);
          child.removeListener('message', onMessage);
          resolve({ success: false, error: 'Failed to send event to plugin process' });
        }
      } catch (err) {
        clearTimeout(timer);
        child.removeListener('message', onMessage);
        this.log.error(`Failed to push event to plugin ${normalizedFile}: ${err.message}`);
        resolve({ success: false, error: err.message });
      }
    });
  }

  /**
   * Stop all running plugins (for graceful shutdown)
   */
  async stopAll() {
    // Stop resource monitor
    if (this._resourceMonitorInterval) {
      clearInterval(this._resourceMonitorInterval);
      this._resourceMonitorInterval = null;
    }
    const promises = [];
    for (const [, proc] of this.processes) {
      if (proc.status === 'running' && proc.child) {
        promises.push(this.stop(proc.file).catch(() => {}));
      }
    }
    await Promise.all(promises);
  }

  /**
   * Find process by file path or PID
   */
  _findProcess(fileOrPid) {
    if (typeof fileOrPid === 'number') {
      for (const [, proc] of this.processes) {
        if (proc.pid === fileOrPid) return proc;
      }
      return null;
    }

    const normalized = fileOrPid.startsWith('/') ? fileOrPid.slice(1) : fileOrPid;
    return this.processes.get(normalized) || null;
  }

  /**
   * Add a log entry for a plugin
   */
  _addLog(file, level, message) {
    const proc = this.processes.get(file);
    if (!proc) return;

    const entry = {
      level,
      source: 'plugin',
      message,
      pluginFile: file,
      createdAt: new Date().toISOString(),
    };

    // Keep last 500 logs per plugin in memory
    proc.logs.push(entry);
    if (proc.logs.length > 500) {
      proc.logs = proc.logs.slice(-500);
    }

    // Also send to log collector
    this.logCollector.log(level, 'plugin', message, { pluginFile: file });

    // Emit log event for real-time streaming
    this.emit('log', entry);
  }

  /**
   * Get memory usage of a process (best-effort)
   */
  _getProcessMemory(pid) {
    try {
      // Linux: read from /proc
      const status = fs.readFileSync(`/proc/${pid}/status`, 'utf-8');
      const match = status.match(/VmRSS:\s+(\d+)\s+kB/);
      if (match) {
        return Math.round(parseInt(match[1], 10) / 1024);
      }
    } catch {
      // Process may have exited
    }
    return undefined;
  }

  /**
   * Periodic resource check for all running plugins.
   * - Soft limit exceeded → emit warning (logged, surfaced in dashboard)
   * - Hard limit exceeded → auto-restart with cooldown protection
   */
  _checkPluginResources() {
    for (const [file, proc] of this.processes) {
      if (proc.status !== 'running' || !proc.pid) continue;

      const memMb = this._getProcessMemory(proc.pid);
      if (memMb === null || memMb === undefined) continue;

      // Hard limit — auto-restart
      if (memMb > this.memoryHardLimitMb) {
        this.log.error(
          `Plugin ${file} exceeded hard memory limit: ${memMb}MB > ${this.memoryHardLimitMb}MB`
        );
        this._addLog(file, 'error',
          `RESOURCE_EXCEEDED: Memory ${memMb}MB exceeds hard limit ${this.memoryHardLimitMb}MB — restarting`
        );

        // Check restart cooldown to prevent restart-loops
        const restartInfo = this._resourceRestarts.get(file) || { count: 0, firstAt: 0, lastAt: 0 };
        const now = Date.now();

        // Reset counter if outside window
        if (now - restartInfo.firstAt > this._resourceRestartWindow) {
          restartInfo.count = 0;
          restartInfo.firstAt = now;
        }

        if (restartInfo.count >= this._maxResourceRestarts) {
          this.log.error(
            `Plugin ${file} hit ${this._maxResourceRestarts} resource restarts within ` +
            `${this._resourceRestartWindow / 1000}s — stopping permanently`
          );
          this._addLog(file, 'error',
            `Plugin stopped permanently: exceeded memory limit ${this._maxResourceRestarts} times in 5 minutes`
          );
          this.emit('resource_exceeded', {
            file,
            pid: proc.pid,
            memoryMb: memMb,
            action: 'stopped',
            reason: 'restart_loop',
          });
          this.stop(file, true).catch(() => {}); // Force kill
          continue;
        }

        restartInfo.count++;
        restartInfo.lastAt = now;
        if (restartInfo.count === 1) restartInfo.firstAt = now;
        this._resourceRestarts.set(file, restartInfo);

        this.emit('resource_exceeded', {
          file,
          pid: proc.pid,
          memoryMb: memMb,
          action: 'restarting',
          restartCount: restartInfo.count,
        });

        this.restart(file).catch((err) => {
          this.log.error(`Failed to auto-restart plugin ${file}: ${err.message}`);
        });
        continue;
      }

      // Soft limit — warn
      if (memMb > this.memorySoftLimitMb) {
        this.log.warn(
          `Plugin ${file} approaching memory limit: ${memMb}MB > ${this.memorySoftLimitMb}MB soft limit`
        );
        this._addLog(file, 'warn',
          `RESOURCE_WARNING: Memory usage ${memMb}MB exceeds soft limit ${this.memorySoftLimitMb}MB`
        );
        this.emit('resource_warning', {
          file,
          pid: proc.pid,
          memoryMb: memMb,
          softLimitMb: this.memorySoftLimitMb,
          hardLimitMb: this.memoryHardLimitMb,
        });
      }
    }
  }

  /**
   * Handle an IPC request from a forked child process.
   * Storage methods are handled locally via SQLite (local-store).
   * All other methods relay to the platform via WebSocket.
   *
   * Protocol from child: { type: 'ipc.request', id, method, data }
   * Protocol to child:   { type: 'ipc.response', id, success, result?, error? }
   *
   * @param {string} pluginFile - Normalized plugin file path
   * @param {ChildProcess} child - The child process
   * @param {object} msg - IPC message from the child
   */
  async _handleChildIpc(pluginFile, child, msg) {
    const { id, method, data } = msg;

    // Handle storage methods locally via SQLite
    if (method && method.startsWith('storage.') && this.localStore) {
      try {
        const result = await this._handleStorageLocally(pluginFile, method, data);
        if (child.send) {
          child.send({ type: 'ipc.response', id, success: true, result });
        }
      } catch (err) {
        if (child.send) {
          child.send({ type: 'ipc.response', id, success: false, error: err.message || 'Local storage error' });
        }
      }
      return;
    }

    // Intercept database.* methods — handled entirely locally with per-plugin SQLite
    if (method && method.startsWith('database.')) {
      try {
        const result = this._handleDatabaseLocally(pluginFile, method, data);
        if (child.send) {
          child.send({ type: 'ipc.response', id, success: true, result });
        }
      } catch (err) {
        if (child.send) {
          child.send({ type: 'ipc.response', id, success: false, error: err.message || 'Database error' });
        }
      }
      return;
    }

    if (!this.sendIpcToPlatform) {
      // No platform IPC relay available — respond with error
      if (child.send) {
        child.send({ type: 'ipc.response', id, success: false, error: 'IPC not available — platform not connected' });
      }
      return;
    }

    try {
      const result = await this.sendIpcToPlatform(pluginFile, method, data);
      if (child.send) {
        child.send({ type: 'ipc.response', id, success: true, result });
      }
    } catch (err) {
      if (child.send) {
        child.send({ type: 'ipc.response', id, success: false, error: err.message || 'IPC request failed' });
      }
    }
  }

  /**
   * Handle a storage.* method using local SQLite.
   * On cache miss, falls back to server IPC if WS is connected.
   *
   * @param {string} pluginFile
   * @param {string} method
   * @param {object} data
   * @returns {Promise<*>}
   */
  async _handleStorageLocally(pluginFile, method, data) {
    const store = this.localStore;

    switch (method) {
      case 'storage.get': {
        const key = data.key;
        if (!key) throw new Error('storage.get requires "key"');

        let val = store.get(pluginFile, key);
        if (val === undefined) {
          // Cache miss — try to fetch from server
          val = await this._fetchFromServer(pluginFile, method, data);
          if (val !== null && val !== undefined) {
            store.setClean(pluginFile, key, val);
          }
          return val ?? null;
        }
        return val;
      }

      case 'storage.set': {
        const { key, value, ttlSeconds } = data;
        if (!key) throw new Error('storage.set requires "key"');
        store.set(pluginFile, key, value, ttlSeconds);
        return null;
      }

      case 'storage.delete': {
        const key = data.key;
        if (!key) throw new Error('storage.delete requires "key"');
        store.delete(pluginFile, key);
        return null;
      }

      case 'storage.has': {
        const key = data.key;
        if (!key) throw new Error('storage.has requires "key"');

        const localResult = store.has(pluginFile, key);
        if (localResult === undefined) {
          // Cache miss — try server
          const serverResult = await this._fetchFromServer(pluginFile, method, data);
          return serverResult ?? false;
        }
        return localResult;
      }

      case 'storage.increment': {
        const key = data.key;
        if (!key) throw new Error('storage.increment requires "key"');

        // Check if key exists locally
        const existing = store.get(pluginFile, key);
        if (existing === undefined) {
          // Cache miss — try to get current value from server first
          const serverVal = await this._fetchFromServer(pluginFile, 'storage.get', { key });
          if (serverVal !== null && serverVal !== undefined) {
            store.setClean(pluginFile, key, serverVal);
          }
        }
        // Now increment locally
        return store.increment(pluginFile, key, data.by ?? 1);
      }

      case 'storage.keys': {
        const pattern = data.pattern || '*';
        // Local keys may be incomplete. Try server first if available,
        // then merge with local additions.
        let serverKeys = [];
        try {
          if (this.sendIpcToPlatform) {
            serverKeys = await this.sendIpcToPlatform(pluginFile, method, data) || [];
          }
        } catch {
          // WS down — use local only
        }
        const localKeys = store.keys(pluginFile, pattern);
        // Merge and deduplicate
        const allKeys = new Set([...serverKeys, ...localKeys]);
        return [...allKeys];
      }

      case 'storage.getMany': {
        const keys = data.keys;
        if (!keys || !Array.isArray(keys)) throw new Error('storage.getMany requires "keys" array');

        const result = {};
        const missingKeys = [];

        // Check local cache first
        for (const key of keys) {
          const val = store.get(pluginFile, key);
          if (val === undefined) {
            missingKeys.push(key);
          } else {
            result[key] = val;
          }
        }

        // Fetch missing from server
        if (missingKeys.length > 0) {
          let _fetched = false;
          try {
            if (this.sendIpcToPlatform) {
              const serverResult = await this.sendIpcToPlatform(pluginFile, method, { keys: missingKeys });
              _fetched = true;
              if (serverResult && typeof serverResult === 'object') {
                for (const [k, v] of Object.entries(serverResult)) {
                  result[k] = v;
                  if (v !== null && v !== undefined) {
                    store.setClean(pluginFile, k, v);
                  }
                }
              }
            }
          } catch {
            // WS down or error
          }
          // Fill any still-missing keys with null
          for (const key of missingKeys) {
            if (!(key in result)) result[key] = null;
          }
        }
        return result;
      }

      case 'storage.setMany': {
        const entries = data.entries;
        if (!entries || !Array.isArray(entries)) throw new Error('storage.setMany requires "entries" array');
        store.setMany(pluginFile, entries);
        return null;
      }

      case 'storage.clear': {
        // Clear all local keys for this plugin
        const deleted = store.clearPlugin(pluginFile);
        // Also clear server-side keys via IPC (fire-and-forget)
        try {
          if (this.sendIpcToPlatform) {
            await this.sendIpcToPlatform(pluginFile, 'storage.clearPlugin', {});
          }
        } catch {
          // Server sync will eventually clean up
          this.log.warn({ pluginFile }, 'storage.clear: server-side cleanup failed, will retry on sync');
        }
        return deleted;
      }

      default:
        throw new Error(`Unknown storage method: ${method}`);
    }
  }

  /**
   * Try to fetch a value from the server via IPC.
   * Returns the value or null if WS is down.
   *
   * @param {string} pluginFile
   * @param {string} method
   * @param {object} data
   * @returns {Promise<*>}
   */
  async _fetchFromServer(pluginFile, method, data) {
    if (!this.sendIpcToPlatform) return null;
    try {
      return await this.sendIpcToPlatform(pluginFile, method, data);
    } catch {
      return null; // WS down or error
    }
  }

  // ─── Per-Plugin SQL Database ────────────────────────────────────────

  /**
   * Blocked SQL keywords/patterns to prevent sandbox escape.
   * @type {RegExp}
   */
  static BLOCKED_SQL = /\b(ATTACH|DETACH|LOAD_EXTENSION|PRAGMA\s+database_list)\b/i;

  /**
   * Lazily open (or create) a per-plugin SQLite database.
   * Databases are stored at /workspace/.2bot/plugin-dbs/<safe-name>.db
   * and use WAL mode for performance.
   *
   * @param {string} pluginFile
   * @returns {import('better-sqlite3').Database}
   */
  _getPluginDb(pluginFile) {
    if (this._pluginDbs.has(pluginFile)) {
      return this._pluginDbs.get(pluginFile);
    }

    // Ensure directory exists
    fs.mkdirSync(this._pluginDbDir, { recursive: true });

    const safeName = sanitizeDbName(pluginFile);
    const dbPath = path.join(this._pluginDbDir, `${safeName}.db`);

    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    this._pluginDbs.set(pluginFile, db);
    this.log.info({ pluginFile, dbPath }, 'Opened per-plugin database');
    return db;
  }

  /**
   * Close a per-plugin database (called on plugin stop).
   * @param {string} pluginFile
   */
  _closePluginDb(pluginFile) {
    const db = this._pluginDbs.get(pluginFile);
    if (db) {
      try { db.close(); } catch { /* ignore */ }
      this._pluginDbs.delete(pluginFile);
      this.log.info({ pluginFile }, 'Closed per-plugin database');
    }
  }

  /**
   * Delete a per-plugin database file from disk.
   * Closes the connection first if open, then removes the .db file.
   * @param {string} pluginFile
   * @returns {{ deleted: boolean, path: string }}
   */
  deletePluginDb(pluginFile) {
    this._closePluginDb(pluginFile);
    const safeName = sanitizeDbName(pluginFile);
    const dbPath = path.join(this._pluginDbDir, `${safeName}.db`);
    try {
      if (fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath);
        // Also remove WAL/SHM files if they exist
        try { fs.unlinkSync(`${dbPath}-wal`); } catch { /* ignore */ }
        try { fs.unlinkSync(`${dbPath}-shm`); } catch { /* ignore */ }
        this.log.info({ pluginFile, dbPath }, 'Deleted per-plugin database');
        return { deleted: true, path: dbPath };
      }
      return { deleted: false, path: dbPath };
    } catch (err) {
      this.log.warn({ pluginFile, dbPath, error: err.message }, 'Failed to delete per-plugin database');
      return { deleted: false, path: dbPath };
    }
  }

  /**
   * Handle database.* IPC methods locally using per-plugin SQLite.
   * All operations are synchronous (better-sqlite3 is sync).
   *
   * @param {string} pluginFile
   * @param {string} method  - 'database.run' | 'database.query' | 'database.get'
   * @param {object} data    - { sql: string, params?: any[] }
   * @returns {*}
   */
  _handleDatabaseLocally(pluginFile, method, data) {
    // database.migrate doesn't need sql param
    if (method === 'database.migrate') {
      return this._runMigrations(pluginFile);
    }

    const { sql, params } = data || {};
    if (!sql || typeof sql !== 'string') {
      throw new Error('database: "sql" is required and must be a string');
    }

    // Security: block dangerous statements
    if (PluginRunner.BLOCKED_SQL.test(sql)) {
      throw new Error('database: statement not allowed (ATTACH, DETACH, LOAD_EXTENSION are blocked)');
    }

    const db = this._getPluginDb(pluginFile);
    const args = Array.isArray(params) ? params : [];

    switch (method) {
      case 'database.run': {
        const info = db.prepare(sql).run(...args);
        return { changes: info.changes, lastInsertRowid: Number(info.lastInsertRowid) };
      }

      case 'database.query': {
        return db.prepare(sql).all(...args);
      }

      case 'database.get': {
        return db.prepare(sql).get(...args) || null;
      }

      default:
        throw new Error(`Unknown database method: ${method}`);
    }
  }

  /**
   * Run pending SQL migrations from a plugin's migrations/ directory.
   * Creates a _migrations tracking table, reads *.sql files sorted by name,
   * and executes each new migration inside a transaction.
   *
   * @param {string} pluginFile
   * @returns {{ applied: string[], alreadyRun: string[] }}
   */
  _runMigrations(pluginFile) {
    const proc = this.processes.get(pluginFile);
    if (!proc) {
      throw new Error('database.migrate: plugin not found (must be running)');
    }

    // Determine migrations directory
    let migrationsDir;
    if (proc.isDirectory && proc.cwd) {
      migrationsDir = path.join(proc.cwd, 'migrations');
    } else {
      // Single-file plugin: look for a sibling migrations/ folder
      // e.g. plugins/my-bot.js → plugins/my-bot/migrations/
      const base = path.basename(pluginFile, path.extname(pluginFile));
      migrationsDir = path.join(this.workspaceDir, path.dirname(pluginFile), base, 'migrations');
    }

    if (!fs.existsSync(migrationsDir)) {
      return { applied: [], alreadyRun: [], message: 'No migrations/ directory found' };
    }

    // Read migration files (sorted alphabetically)
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    if (files.length === 0) {
      return { applied: [], alreadyRun: [], message: 'No .sql files in migrations/' };
    }

    const db = this._getPluginDb(pluginFile);

    // Ensure _migrations tracking table exists
    db.exec(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Get already-applied migrations
    const applied = db.prepare('SELECT name FROM _migrations').all().map(r => r.name);
    const alreadyRun = [];
    const newlyApplied = [];

    for (const file of files) {
      if (applied.includes(file)) {
        alreadyRun.push(file);
        continue;
      }

      // Read and execute migration inside a transaction
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8').trim();
      if (!sql) {
        this.log.warn({ pluginFile, migration: file }, 'Empty migration file, skipping');
        continue;
      }

      // Security check
      if (PluginRunner.BLOCKED_SQL.test(sql)) {
        throw new Error(`Migration ${file}: blocked SQL statement (ATTACH, DETACH, LOAD_EXTENSION are not allowed)`);
      }

      const runInTransaction = db.transaction(() => {
        db.exec(sql);
        db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(file);
      });

      runInTransaction();
      newlyApplied.push(file);
      this.log.info({ pluginFile, migration: file }, 'Migration applied');
    }

    this.log.info({ pluginFile, applied: newlyApplied.length, skipped: alreadyRun.length }, 'Migrations complete');
    return { applied: newlyApplied, alreadyRun };
  }
}

module.exports = { PluginRunner };
