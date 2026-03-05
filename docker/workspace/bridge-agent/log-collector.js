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

    /** @type {Array<LogEntry>} Ring buffer of recent log entries */
    this.entries = [];

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

    // Add to ring buffer
    this.entries.push(entry);
    if (this.entries.length > this.maxEntries) {
      this.entries.shift();
    }

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
    let results = this.entries;

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
    const counts = { debug: 0, info: 0, warn: 0, error: 0 };
    for (const entry of this.entries) {
      counts[entry.level] = (counts[entry.level] || 0) + 1;
    }
    return {
      totalEntries: this.entries.length,
      maxEntries: this.maxEntries,
      counts,
      oldestId: this.entries[0]?.id || null,
      newestId: this.entries[this.entries.length - 1]?.id || null,
    };
  }

  /**
   * Clear all log entries
   */
  clear() {
    this.entries = [];
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
