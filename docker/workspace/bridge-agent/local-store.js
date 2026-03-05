/**
 * LocalStore — SQLite-backed key-value storage for plugins
 *
 * Provides container-local storage so plugins can read/write without
 * a real-time WebSocket connection to the platform. Dirty writes are
 * synced to the server (Redis) in the background when the WS is available.
 *
 * Architecture:
 *   - Local-first: all reads/writes go to SQLite
 *   - Cache-fill on miss: if key not in SQLite and WS is up, fetch from server
 *   - Dirty tracking: writes are marked dirty=1, synced by the sync engine
 *   - Tombstones: deletes are kept as deleted=1 + dirty=1 until synced
 *   - TTL: tracked as absolute unix-ms timestamps, expired rows cleaned periodically
 *
 * Keys are namespaced by plugin_file to match the server-side per-plugin isolation.
 */

'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

class LocalStore {
  /**
   * @param {object} opts
   * @param {string} opts.dbPath - Path to the SQLite database file
   * @param {object} [opts.log]  - Logger with .info/.debug/.warn/.error
   * @param {number} [opts.defaultQuotaMb=50] - Default quota for plugins without explicit quota (0 = unlimited)
   */
  constructor({ dbPath, log, defaultQuotaMb }) {
    this.log = log || console;
    this.defaultQuotaBytes = (defaultQuotaMb !== undefined ? defaultQuotaMb : 50) * 1024 * 1024;
    /** Per-plugin quota overrides: pluginFile → bytes (0 = unlimited) */
    this.pluginQuotas = new Map();

    // Ensure directory exists
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);

    // Performance pragmas
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('busy_timeout = 5000');

    // Create schema
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS kv (
        plugin_file    TEXT    NOT NULL,
        key            TEXT    NOT NULL,
        value          TEXT,
        ttl_at         INTEGER,
        dirty          INTEGER NOT NULL DEFAULT 0,
        deleted        INTEGER NOT NULL DEFAULT 0,
        updated_at     INTEGER NOT NULL,
        sync_failures  INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (plugin_file, key)
      )
    `);

    // Index for dirty scan (used by sync engine)
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_kv_dirty ON kv (dirty) WHERE dirty = 1
    `);

    // Run schema migration for existing databases (add sync_failures if missing)
    try {
      this.db.exec('ALTER TABLE kv ADD COLUMN sync_failures INTEGER NOT NULL DEFAULT 0');
    } catch {
      // Column already exists — ignore
    }

    // Prepared statements
    this._stmts = {
      get: this.db.prepare(
        'SELECT value, ttl_at, deleted FROM kv WHERE plugin_file = ? AND key = ?'
      ),

      set: this.db.prepare(`
        INSERT INTO kv (plugin_file, key, value, ttl_at, dirty, deleted, updated_at)
        VALUES (?, ?, ?, ?, 1, 0, ?)
        ON CONFLICT(plugin_file, key) DO UPDATE SET
          value      = excluded.value,
          ttl_at     = excluded.ttl_at,
          dirty      = 1,
          deleted    = 0,
          updated_at = excluded.updated_at
      `),

      setClean: this.db.prepare(`
        INSERT INTO kv (plugin_file, key, value, ttl_at, dirty, deleted, updated_at)
        VALUES (?, ?, ?, ?, 0, 0, ?)
        ON CONFLICT(plugin_file, key) DO UPDATE SET
          value      = excluded.value,
          ttl_at     = excluded.ttl_at,
          dirty      = 0,
          deleted    = 0,
          updated_at = excluded.updated_at
        WHERE kv.dirty = 0 OR excluded.updated_at >= kv.updated_at
      `),

      del: this.db.prepare(`
        INSERT INTO kv (plugin_file, key, value, ttl_at, dirty, deleted, updated_at)
        VALUES (?, ?, NULL, NULL, 1, 1, ?)
        ON CONFLICT(plugin_file, key) DO UPDATE SET
          value      = NULL,
          ttl_at     = NULL,
          dirty      = 1,
          deleted    = 1,
          updated_at = excluded.updated_at
      `),

      has: this.db.prepare(
        'SELECT 1 FROM kv WHERE plugin_file = ? AND key = ? AND deleted = 0 AND (ttl_at IS NULL OR ttl_at > ?)'
      ),

      keys: this.db.prepare(
        'SELECT key FROM kv WHERE plugin_file = ? AND key LIKE ? AND deleted = 0 AND (ttl_at IS NULL OR ttl_at > ?)'
      ),

      getDirty: this.db.prepare(
        'SELECT plugin_file, key, value, ttl_at, deleted FROM kv WHERE dirty = 1'
      ),

      clearDirty: this.db.prepare(
        'UPDATE kv SET dirty = 0 WHERE plugin_file = ? AND key = ?'
      ),

      removeTombstones: this.db.prepare(
        'DELETE FROM kv WHERE deleted = 1 AND dirty = 0'
      ),

      cleanExpired: this.db.prepare(
        'DELETE FROM kv WHERE ttl_at IS NOT NULL AND ttl_at <= ? AND dirty = 0'
      ),

      clearPlugin: this.db.prepare(
        'DELETE FROM kv WHERE plugin_file = ?'
      ),

      dbSize: this.db.prepare(
        'SELECT page_count * page_size AS size FROM pragma_page_count(), pragma_page_size()'
      ),

      incrementSyncFailures: this.db.prepare(
        'UPDATE kv SET sync_failures = sync_failures + 1 WHERE plugin_file = ? AND key = ?'
      ),

      resetSyncFailures: this.db.prepare(
        'UPDATE kv SET sync_failures = 0 WHERE plugin_file = ? AND key = ?'
      ),

      pluginStats: this.db.prepare(
        `SELECT plugin_file, COUNT(*) as key_count, SUM(LENGTH(value)) as total_bytes
         FROM kv WHERE deleted = 0 GROUP BY plugin_file`
      ),

      pluginSize: this.db.prepare(
        `SELECT COALESCE(SUM(LENGTH(value)), 0) as total_bytes
         FROM kv WHERE plugin_file = ? AND deleted = 0`
      ),
    };

    this.log.info('LocalStore initialized:', dbPath);
  }

  // ===========================================
  // Core Operations
  // ===========================================

  /**
   * Get a value from local storage.
   * Returns the parsed value, null (for tombstones), or undefined (not cached).
   *
   * @param {string} pluginFile
   * @param {string} key
   * @returns {*} value, null, or undefined (cache miss)
   */
  get(pluginFile, key) {
    const row = this._stmts.get.get(pluginFile, key);
    if (!row) return undefined; // Not in local cache

    // Check TTL
    if (row.ttl_at && row.ttl_at <= Date.now()) {
      // Expired — clean up if not dirty, return cache miss
      return undefined;
    }

    // Tombstoned (deleted)
    if (row.deleted) return null;

    // Parse value
    try {
      return JSON.parse(row.value);
    } catch {
      return null;
    }
  }

  /**
   * Set a value in local storage. Marks as dirty for sync.
   * Checks per-plugin quota before writing.
   *
   * @param {string} pluginFile
   * @param {string} key
   * @param {*} value - Will be JSON.stringify'd
   * @param {number} [ttlSeconds] - Optional TTL in seconds
   * @throws {Error} If storage quota exceeded
   */
  set(pluginFile, key, value, ttlSeconds) {
    const quotaBytes = this._getQuotaBytes(pluginFile);
    if (quotaBytes > 0) {
      const size = this.getPluginSize(pluginFile);
      if (size >= quotaBytes) {
        const usedMb = Math.round(size / 1024 / 1024 * 100) / 100;
        const maxMb = Math.round(quotaBytes / 1024 / 1024);
        throw new Error(`Storage quota exceeded for ${pluginFile} (${usedMb}MB / ${maxMb}MB). Delete unused keys or increase quota in plugin settings.`);
      }
    }
    const now = Date.now();
    const ttlAt = ttlSeconds && ttlSeconds > 0 ? now + (ttlSeconds * 1000) : null;
    this._stmts.set.run(pluginFile, key, JSON.stringify(value), ttlAt, now);
  }

  /**
   * Delete a key. Creates a tombstone marked dirty for sync.
   *
   * @param {string} pluginFile
   * @param {string} key
   */
  delete(pluginFile, key) {
    this._stmts.del.run(pluginFile, key, Date.now());
  }

  /**
   * Check if a key exists (non-expired, non-deleted).
   * Returns true/false if cached, undefined if not in local store.
   *
   * @param {string} pluginFile
   * @param {string} key
   * @returns {boolean|undefined}
   */
  has(pluginFile, key) {
    const row = this._stmts.has.get(pluginFile, key, Date.now());
    // If key exists in our DB but not found by this query, it could be
    // expired/deleted/or truly not present. Check if it's a cache miss:
    const rawRow = this._stmts.get.get(pluginFile, key);
    if (!rawRow) return undefined; // Not in cache at all
    return !!row; // true if found by the filtered query, false if expired/deleted
  }

  /**
   * Increment a numeric value. Creates the key with value `by` if it doesn't exist.
   * Always marks dirty. Returns the new value.
   *
   * @param {string} pluginFile
   * @param {string} key
   * @param {number} [by=1]
   * @returns {number}
   */
  increment(pluginFile, key, by = 1) {
    const existing = this.get(pluginFile, key);
    let current = 0;
    if (existing !== undefined && existing !== null) {
      current = typeof existing === 'number' ? existing : parseInt(existing, 10) || 0;
    }
    const newValue = current + by;
    this.set(pluginFile, key, newValue);
    return newValue;
  }

  /**
   * Get keys matching a glob pattern.
   * Converts glob wildcards to SQL LIKE pattern.
   * Only returns keys that are in the local cache.
   *
   * @param {string} pluginFile
   * @param {string} [pattern='*']
   * @returns {string[]}
   */
  keys(pluginFile, pattern = '*') {
    // Convert glob pattern to SQL LIKE
    const likePattern = pattern
      .replace(/%/g, '\\%')
      .replace(/_/g, '\\_')
      .replace(/\*/g, '%')
      .replace(/\?/g, '_');

    const rows = this._stmts.keys.all(pluginFile, likePattern, Date.now());
    return rows.map((r) => r.key);
  }

  /**
   * Get multiple keys at once.
   * Returns an object with the cached values. Keys not in cache have value undefined.
   *
   * @param {string} pluginFile
   * @param {string[]} keys
   * @returns {Record<string, *>}
   */
  getMany(pluginFile, keys) {
    const result = {};
    for (const key of keys) {
      result[key] = this.get(pluginFile, key);
    }
    return result;
  }

  /**
   * Set multiple keys at once. All marked dirty.
   * Checks quota once before the batch.
   *
   * @param {string} pluginFile
   * @param {Array<{key: string, value: *, ttlSeconds?: number}>} entries
   * @throws {Error} If storage quota exceeded
   */
  setMany(pluginFile, entries) {
    const quotaBytes = this._getQuotaBytes(pluginFile);
    if (quotaBytes > 0) {
      const size = this.getPluginSize(pluginFile);
      if (size >= quotaBytes) {
        const usedMb = Math.round(size / 1024 / 1024 * 100) / 100;
        const maxMb = Math.round(quotaBytes / 1024 / 1024);
        throw new Error(`Storage quota exceeded for ${pluginFile} (${usedMb}MB / ${maxMb}MB). Delete unused keys or increase quota in plugin settings.`);
      }
    }
    const txn = this.db.transaction(() => {
      for (const entry of entries) {
        if (!entry.key) continue;
        this.set(pluginFile, entry.key, entry.value, entry.ttlSeconds);
      }
    });
    txn();
  }

  /**
   * Cache a server response without marking dirty.
   * Used to seed local cache from server fetches.
   * Won't overwrite local dirty writes (newer wins).
   *
   * @param {string} pluginFile
   * @param {string} key
   * @param {*} value
   * @param {number} [ttlSeconds]
   */
  setClean(pluginFile, key, value, ttlSeconds) {
    const now = Date.now();
    const ttlAt = ttlSeconds && ttlSeconds > 0 ? now + (ttlSeconds * 1000) : null;
    this._stmts.setClean.run(pluginFile, key, JSON.stringify(value), ttlAt, now);
  }

  // ===========================================
  // Sync Support
  // ===========================================

  /**
   * Get all dirty entries for sync to server.
   *
   * @returns {Array<{pluginFile: string, key: string, value: *, ttlAt: number|null, deleted: boolean}>}
   */
  getDirtyEntries() {
    const rows = this._stmts.getDirty.all();
    return rows.map((row) => ({
      pluginFile: row.plugin_file,
      key: row.key,
      value: row.deleted ? null : (row.value ? JSON.parse(row.value) : null),
      ttlAt: row.ttl_at,
      deleted: !!row.deleted,
    }));
  }

  /**
   * Clear the dirty flag for a specific entry after successful sync.
   *
   * @param {string} pluginFile
   * @param {string} key
   */
  clearDirty(pluginFile, key) {
    this._stmts.clearDirty.run(pluginFile, key);
  }

  /**
   * Remove synced tombstones (deleted=1, dirty=0).
   */
  removeSyncedTombstones() {
    this._stmts.removeTombstones.run();
  }

  /**
   * Clean up expired entries that have already been synced (dirty=0).
   */
  cleanExpired() {
    this._stmts.cleanExpired.run(Date.now());
  }

  /**
   * Run all maintenance tasks: expire old entries, remove synced tombstones.
   */
  maintenance() {
    this.cleanExpired();
    this.removeSyncedTombstones();
  }

  // ===========================================
  // Quota & Stats
  // ===========================================

  /**
   * Get the current SQLite database size in bytes.
   * @returns {number}
   */
  getSize() {
    const row = this._stmts.dbSize.get();
    return row ? row.size : 0;
  }

  /**
   * Get per-plugin stats (key count and total value bytes).
   * @returns {Array<{pluginFile: string, keyCount: number, totalBytes: number, quotaMb: number}>}
   */
  getStats() {
    const rows = this._stmts.pluginStats.all();
    return rows.map((r) => ({
      pluginFile: r.plugin_file,
      keyCount: r.key_count,
      totalBytes: r.total_bytes || 0,
      quotaMb: Math.round(this._getQuotaBytes(r.plugin_file) / 1024 / 1024),
    }));
  }

  /**
   * Get total data size for a specific plugin in bytes.
   * @param {string} pluginFile
   * @returns {number}
   */
  getPluginSize(pluginFile) {
    const row = this._stmts.pluginSize.get(pluginFile);
    return row ? row.total_bytes : 0;
  }

  /**
   * Get quota info (overall DB + per-plugin defaults).
   * @returns {{ dbSizeBytes: number, dbSizeMb: number, defaultQuotaMb: number, plugins: Array }}
   */
  getQuotaInfo() {
    const dbSize = this.getSize();
    return {
      dbSizeBytes: dbSize,
      dbSizeMb: Math.round(dbSize / 1024 / 1024 * 100) / 100,
      defaultQuotaMb: Math.round(this.defaultQuotaBytes / 1024 / 1024),
      plugins: this.getStats(),
    };
  }

  /**
   * Set quota for a specific plugin (instant, no restart needed).
   * @param {string} pluginFile
   * @param {number} quotaMb - Quota in MB (0 = unlimited)
   */
  setQuota(pluginFile, quotaMb) {
    const bytes = (quotaMb || 0) * 1024 * 1024;
    this.pluginQuotas.set(pluginFile, bytes);
    this.log.info(`Quota set for ${pluginFile}: ${quotaMb}MB`);
  }

  /**
   * Get effective quota bytes for a plugin.
   * Checks per-plugin override first, then falls back to default.
   * @param {string} pluginFile
   * @returns {number} Quota in bytes (0 = unlimited)
   * @private
   */
  _getQuotaBytes(pluginFile) {
    if (this.pluginQuotas.has(pluginFile)) {
      return this.pluginQuotas.get(pluginFile);
    }
    return this.defaultQuotaBytes;
  }

  // ===========================================
  // Plugin Cleanup
  // ===========================================

  /**
   * Delete ALL storage entries for a specific plugin.
   * Used when a plugin is uninstalled/removed.
   *
   * @param {string} pluginFile
   * @returns {{ deleted: number }}
   */
  clearPlugin(pluginFile) {
    const info = this._stmts.clearPlugin.run(pluginFile);
    this.log.info(`LocalStore: cleared ${info.changes} entries for plugin ${pluginFile}`);
    return { deleted: info.changes };
  }

  // ===========================================
  // Sync Failure Tracking
  // ===========================================

  /**
   * Increment sync failure count for a specific entry.
   * @param {string} pluginFile
   * @param {string} key
   */
  incrementSyncFailures(pluginFile, key) {
    this._stmts.incrementSyncFailures.run(pluginFile, key);
  }

  /**
   * Reset sync failure count after a successful sync.
   * @param {string} pluginFile
   * @param {string} key
   */
  resetSyncFailures(pluginFile, key) {
    this._stmts.resetSyncFailures.run(pluginFile, key);
  }

  /**
   * Close the database. Call on shutdown.
   */
  close() {
    try {
      this.db.close();
      this.log.info('LocalStore closed');
    } catch (err) {
      this.log.error('LocalStore close error:', err.message);
    }
  }
}

module.exports = { LocalStore };
