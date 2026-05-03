/**
 * Log Collector
 * 
 * Centralized logging service for the workspace container.
 * Captures logs from all services, stores recent entries in memory,
 * and emits events for real-time streaming to the platform.
 * 
 * Log levels: debug, info, warn, error
 * Ring buffer: keeps last N entries in memory for query API.
 */

'use strict';

const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');

class LogCollector extends EventEmitter {
  constructor({ workspaceDir, maxEntries = 2000, logFile = null }) {
    super();

    this.workspaceDir = workspaceDir;
    this.maxEntries = maxEntries;

    /** Circular buffer for recent log entries (O(1) push, no shift) */
    this._buffer = new Array(maxEntries);
    this._head = 0;   // Next write position
    this._count = 0;  // Number of entries currently stored

    /** Counter for unique log IDs */
    this.nextId = 1;

    // Optional file logging
    this.logStream = null;
    if (logFile) {
      const logPath = path.join(workspaceDir, logFile);
      const logDir = path.dirname(logPath);
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
      this.logStream = fs.createWriteStream(logPath, { flags: 'a' });
    }
  }

  /**
   * Add a log entry
   * @param {'debug'|'info'|'warn'|'error'} level
   * @param {string} source - Service name (file-manager, plugin-runner, etc.)
   * @param {string} message - Log message
   * @param {Object} [meta] - Optional metadata
   */
  log(level, source, message, meta = null) {
    const now = new Date().toISOString();
    const entry = {
      id: this.nextId++,
      timestamp: now,
      createdAt: now,
      level,
      source,
      message,
      ...(meta ? { meta } : {}),
    };

    // Add to circular buffer (O(1), no array shifting)
    this._buffer[this._head] = entry;
    this._head = (this._head + 1) % this.maxEntries;
    if (this._count < this.maxEntries) this._count++;

    // Write to log file if configured
    if (this.logStream && !this.logStream.destroyed) {
      this.logStream.write(JSON.stringify(entry) + '\n');
    }

    // Emit for real-time WebSocket streaming
    this.emit('log', entry);

    // Also write to stdout/stderr for docker logs
    const formatted = `[${entry.timestamp}] [${level.toUpperCase()}] [${source}] ${message}`;
    if (level === 'error') {
      process.stderr.write(formatted + '\n');
    } else if (level !== 'debug') {
      process.stdout.write(formatted + '\n');
    }
  }

  /**
   * Convenience methods
   */
  debug(source, message, meta) { this.log('debug', source, message, meta); }
  info(source, message, meta) { this.log('info', source, message, meta); }
  warn(source, message, meta) { this.log('warn', source, message, meta); }
  error(source, message, meta) { this.log('error', source, message, meta); }

  /**
   * Return entries in chronological order from the circular buffer.
   * @returns {Array<LogEntry>}
   */
  _entries() {
    if (this._count === 0) return [];
    if (this._count < this.maxEntries) {
      // Buffer not yet full — entries are 0..count-1
      return this._buffer.slice(0, this._count);
    }
    // Buffer is full — oldest is at _head, newest is at _head-1
    return this._buffer.slice(this._head).concat(this._buffer.slice(0, this._head));
  }

  /**
   * Query log entries with optional filters
   * @param {Object} options
   * @param {string} [options.level] - Filter by level
   * @param {string} [options.source] - Filter by source
   * @param {number} [options.limit=100] - Max entries to return
   * @param {number} [options.since] - Only entries with ID > since
   * @param {string} [options.search] - Text search in message
   * @returns {Array<LogEntry>}
   */
  query({ level, source, limit = 100, since, search } = {}) {
    let results = this._entries();

    if (since) {
      results = results.filter(e => e.id > since);
    }

    if (level) {
      results = results.filter(e => e.level === level);
    }

    if (source) {
      results = results.filter(e => e.source === source);
    }

    if (search) {
      const lowerSearch = search.toLowerCase();
      results = results.filter(e =>
        e.message.toLowerCase().includes(lowerSearch)
      );
    }

    // Return last N entries (most recent)
    if (results.length > limit) {
      results = results.slice(-limit);
    }

    return results;
  }

  /**
   * Get log stats
   */
  stats() {
    const entries = this._entries();
    const counts = { debug: 0, info: 0, warn: 0, error: 0 };
    for (const entry of entries) {
      counts[entry.level] = (counts[entry.level] || 0) + 1;
    }
    return {
      totalEntries: this._count,
      maxEntries: this.maxEntries,
      counts,
      oldestId: entries[0]?.id || null,
      newestId: entries[entries.length - 1]?.id || null,
    };
  }

  /**
   * Clear all log entries
   */
  clear() {
    this._buffer = new Array(this.maxEntries);
    this._head = 0;
    this._count = 0;
  }

  /**
   * Create a scoped logger for a specific service
   * Returns an object with debug/info/warn/error methods pre-bound to the source name
   * @param {string} source
   */
  scoped(source) {
    return {
      debug: (msg, meta) => this.debug(source, msg, meta),
      info: (msg, meta) => this.info(source, msg, meta),
      warn: (msg, meta) => this.warn(source, msg, meta),
      error: (msg, meta) => this.error(source, msg, meta),
    };
  }

  /**
   * Shutdown — flush and close log file
   */
  shutdown() {
    if (this.logStream && !this.logStream.destroyed) {
      this.logStream.end();
    }
  }
}

module.exports = { LogCollector };
