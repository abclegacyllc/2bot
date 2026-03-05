/**
 * Plugin Manifest Resolver
 *
 * Supports two plugin layouts:
 *
 * 1. **Single-file (legacy)** — `plugins/my-bot.js`
 *    No manifest needed; the file IS the entry point.
 *
 * 2. **Directory-based** — `plugins/my-bot/plugin.json` + `index.js`
 *    The directory MUST contain a `plugin.json` manifest that declares
 *    the entry file and plugin metadata.
 *
 * Manifest schema (`plugin.json`):
 * ```json
 * {
 *   "name": "My Bot",
 *   "slug": "my-bot",
 *   "version": "1.0.0",
 *   "entry": "index.js",
 *   "description": "A cool bot",
 *   "category": "utility"
 * }
 * ```
 *
 * - `name`    (required) — Human-readable plugin name
 * - `slug`    (required) — URL-safe identifier (a-z, 0-9, dashes)
 * - `version` (optional) — Semver string, defaults to "0.0.0"
 * - `entry`   (optional) — Entry file relative to plugin dir, defaults to "index.js"
 * - `description` (optional) — Short description
 * - `category`    (optional) — Plugin category
 *
 * @module plugin-manifest
 */

'use strict';

const fs = require('fs');
const path = require('path');

const MANIFEST_FILENAME = 'plugin.json';
const DEFAULT_ENTRY = 'index.js';
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;

/**
 * Resolve a plugin path to its manifest and entry file.
 *
 * Given a path that is either:
 *   - A file (e.g. `plugins/my-bot.js`) → single-file plugin
 *   - A directory (e.g. `plugins/my-bot/`) → directory plugin with manifest
 *
 * Returns a resolved manifest object or null if invalid.
 *
 * @param {string} workspaceDir - Absolute path to the workspace root
 * @param {string} pluginPath   - Plugin path relative to workspace (or absolute)
 * @returns {{ entryFile: string, manifest: object, isDirectory: boolean } | null}
 *
 * The returned `entryFile` is always an absolute path ready to be forked.
 * The returned `manifest` contains at minimum `{ name, slug }`.
 */
function resolvePlugin(workspaceDir, pluginPath) {
  // Normalize: strip leading slash
  const normalized = pluginPath.startsWith('/') ? pluginPath.slice(1) : pluginPath;
  const fullPath = path.resolve(workspaceDir, normalized);

  // Security: must stay within workspace
  if (!fullPath.startsWith(workspaceDir)) {
    return null;
  }

  // Check what's on disk
  let stat;
  try {
    stat = fs.statSync(fullPath);
  } catch {
    return null; // doesn't exist
  }

  // ── Single-file plugin ──────────────────────────────────
  if (stat.isFile()) {
    const ext = path.extname(fullPath);
    const baseName = path.basename(fullPath, ext);
    return {
      entryFile: fullPath,
      cwd: path.dirname(fullPath),
      manifest: {
        name: baseName,
        slug: baseName.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
        version: '0.0.0',
        entry: path.basename(fullPath),
      },
      isDirectory: false,
    };
  }

  // ── Directory-based plugin ──────────────────────────────
  if (stat.isDirectory()) {
    const manifestPath = path.join(fullPath, MANIFEST_FILENAME);

    if (!fs.existsSync(manifestPath)) {
      // No manifest — try to find a default entry file anyway
      const defaultEntry = path.join(fullPath, DEFAULT_ENTRY);
      if (!fs.existsSync(defaultEntry)) {
        return null; // no manifest AND no index.js → not a plugin
      }
      // Implicit manifest from directory name
      const dirName = path.basename(fullPath);
      return {
        entryFile: defaultEntry,
        cwd: fullPath,
        manifest: {
          name: dirName,
          slug: dirName.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
          version: '0.0.0',
          entry: DEFAULT_ENTRY,
        },
        isDirectory: true,
      };
    }

    // Read and validate manifest
    const result = readManifest(manifestPath, fullPath);
    return result;
  }

  return null;
}

/**
 * Read, parse, and validate a plugin.json manifest file.
 *
 * @param {string} manifestPath - Absolute path to plugin.json
 * @param {string} pluginDir    - Absolute path to the plugin directory
 * @returns {{ entryFile: string, cwd: string, manifest: object, isDirectory: true } | null}
 */
function readManifest(manifestPath, pluginDir) {
  let raw;
  try {
    raw = fs.readFileSync(manifestPath, 'utf-8');
  } catch (err) {
    return null;
  }

  let json;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    return null;
  }

  if (!json || typeof json !== 'object') {
    return null;
  }

  // ── Required fields ──
  if (!json.name || typeof json.name !== 'string') {
    return null;
  }
  if (!json.slug || typeof json.slug !== 'string') {
    return null;
  }
  if (!SLUG_PATTERN.test(json.slug)) {
    return null;
  }

  // ── Optional fields with defaults ──
  const entry = (typeof json.entry === 'string' && json.entry) ? json.entry : DEFAULT_ENTRY;
  const version = (typeof json.version === 'string' && json.version) ? json.version : '0.0.0';
  const description = typeof json.description === 'string' ? json.description : '';
  const category = typeof json.category === 'string' ? json.category : '';

  // Resolve entry file — MUST be within the plugin directory
  const entryFile = path.resolve(pluginDir, entry);
  if (!entryFile.startsWith(pluginDir)) {
    return null; // path traversal attempt
  }

  if (!fs.existsSync(entryFile)) {
    return null; // entry file doesn't exist
  }

  return {
    entryFile,
    cwd: pluginDir,
    manifest: {
      name: json.name,
      slug: json.slug,
      version,
      entry,
      description,
      category,
    },
    isDirectory: true,
  };
}

/**
 * Validate a plugin.json manifest and return detailed problems.
 * Unlike resolvePlugin (which returns null on failure), this returns
 * structured problem messages suitable for the validate endpoint.
 *
 * @param {string} workspaceDir - Absolute path to the workspace root
 * @param {string} pluginDir    - Plugin directory path relative to workspace
 * @returns {{ valid: boolean, manifest: object|null, problems: Array<{ severity: string, message: string }> }}
 */
function validateManifest(workspaceDir, pluginDir) {
  const normalized = pluginDir.startsWith('/') ? pluginDir.slice(1) : pluginDir;
  const fullDir = path.resolve(workspaceDir, normalized);
  const manifestPath = path.join(fullDir, MANIFEST_FILENAME);
  const problems = [];

  if (!fs.existsSync(fullDir)) {
    return { valid: false, manifest: null, problems: [{ severity: 'error', message: `Plugin directory not found: ${normalized}` }] };
  }

  if (!fs.existsSync(manifestPath)) {
    // Check for fallback index.js
    const defaultEntry = path.join(fullDir, DEFAULT_ENTRY);
    if (fs.existsSync(defaultEntry)) {
      problems.push({ severity: 'info', message: `No ${MANIFEST_FILENAME} found — using implicit manifest from directory name` });
      return { valid: true, manifest: null, problems };
    }
    return { valid: false, manifest: null, problems: [{ severity: 'error', message: `Missing ${MANIFEST_FILENAME} and no ${DEFAULT_ENTRY} found in ${normalized}` }] };
  }

  // Parse JSON
  let raw, json;
  try {
    raw = fs.readFileSync(manifestPath, 'utf-8');
  } catch (err) {
    return { valid: false, manifest: null, problems: [{ severity: 'error', message: `Cannot read ${MANIFEST_FILENAME}: ${err.message}` }] };
  }
  try {
    json = JSON.parse(raw);
  } catch (err) {
    return { valid: false, manifest: null, problems: [{ severity: 'error', message: `Invalid JSON in ${MANIFEST_FILENAME}: ${err.message}` }] };
  }

  if (!json || typeof json !== 'object') {
    return { valid: false, manifest: null, problems: [{ severity: 'error', message: `${MANIFEST_FILENAME} must be a JSON object` }] };
  }

  // Validate fields
  if (!json.name || typeof json.name !== 'string') {
    problems.push({ severity: 'error', message: 'Missing required field: "name" (string)' });
  }
  if (!json.slug || typeof json.slug !== 'string') {
    problems.push({ severity: 'error', message: 'Missing required field: "slug" (string, lowercase alphanumeric with dashes)' });
  } else if (!SLUG_PATTERN.test(json.slug)) {
    problems.push({ severity: 'error', message: `Invalid slug "${json.slug}" — must be lowercase alphanumeric with dashes (e.g., "my-bot")` });
  }

  if (json.entry && typeof json.entry !== 'string') {
    problems.push({ severity: 'error', message: '"entry" must be a string (relative file path)' });
  }
  if (json.version && typeof json.version !== 'string') {
    problems.push({ severity: 'warning', message: '"version" should be a string (e.g., "1.0.0")' });
  }

  // Check entry file exists
  const entry = (typeof json.entry === 'string' && json.entry) ? json.entry : DEFAULT_ENTRY;
  const entryFile = path.resolve(fullDir, entry);
  if (!entryFile.startsWith(fullDir)) {
    problems.push({ severity: 'error', message: `Entry file "${entry}" escapes plugin directory — path traversal not allowed` });
  } else if (!fs.existsSync(entryFile)) {
    problems.push({ severity: 'error', message: `Entry file not found: ${entry}` });
  }

  const valid = !problems.some(p => p.severity === 'error');
  return { valid, manifest: valid ? json : null, problems };
}

module.exports = {
  resolvePlugin,
  readManifest,
  validateManifest,
  MANIFEST_FILENAME,
  DEFAULT_ENTRY,
};
