/**
 * Plugin FS Prelude — Per-Plugin Filesystem Boundary (Phase 5.2)
 *
 * Loaded into every plugin child process via `--require` BEFORE the
 * plugin's own code. Wraps Node's `fs` and `fs/promises` modules to
 * deny cross-plugin filesystem access while preserving the access
 * the plugin legitimately needs (its own dir, node_modules, system
 * libs).
 *
 * Threat model:
 *   - A plugin authored or compromised by Author A tries to read or
 *     write files belonging to a plugin authored by Author B running
 *     in the SAME workspace container.
 *   - Defense: any path that resolves under `<WORKSPACE_DIR>/plugins/<other>`
 *     or under `<WORKSPACE_DIR>/.2bot/` is rejected with `EACCES`.
 *   - This is best-effort userland enforcement. A determined attacker
 *     with native bindings (e.g. `bindings`, `node-gyp`) could call the
 *     raw syscalls. Container-level cgroups, capability drops, and the
 *     RLIMITs from Phase 3.3 still apply at the kernel layer.
 *
 * Activation:
 *   - Disabled if `PLUGIN_FS_PRELUDE_ENABLED=false`.
 *   - Disabled if `PLUGIN_DIR` is not set (e.g. running outside the
 *     plugin-runner spawn path).
 *
 * @module bridge-agent/plugin-fs-prelude
 */

/* eslint-disable @typescript-eslint/no-require-imports */
'use strict';

if (process.env.PLUGIN_FS_PRELUDE_ENABLED === 'false') {
  // Operator-disabled. Do nothing.
  return;
}

const path = require('path');
const fs = require('fs');

const PLUGIN_DIR = process.env.PLUGIN_DIR ? path.resolve(process.env.PLUGIN_DIR) : '';
const PLUGIN_SLUG = process.env.PLUGIN_SLUG || '';
const WORKSPACE_DIR = path.resolve(process.env.WORKSPACE_DIR || '/workspace');

if (!PLUGIN_DIR) {
  // No per-plugin scope — running as a single-file plugin or outside
  // the plugin-runner. Skip enforcement.
  return;
}

const PLUGINS_ROOT = path.join(WORKSPACE_DIR, 'plugins');
const BRIDGE_INTERNAL = path.join(WORKSPACE_DIR, '.2bot');

/**
 * Resolve any path-like input (string, Buffer, URL, fd) to an absolute
 * filesystem path. Returns null for fd-based access (numeric file
 * descriptors are checked at open() time).
 */
function toAbsolute(p) {
  if (typeof p === 'number') return null; // fd — already opened, can't re-check
  if (Buffer.isBuffer(p)) p = p.toString('utf8');
  if (p && typeof p === 'object' && p.href) {
    // URL object
    try {
      const url = require('url');
      p = url.fileURLToPath(p);
    } catch {
      return null;
    }
  }
  if (typeof p !== 'string') return null;
  return path.resolve(p);
}

/**
 * Decide whether `absPath` is permitted for this plugin.
 * Rules (deny-list):
 *   1. DENY anything under WORKSPACE_DIR/plugins/<X>/ where X !== this plugin's dir name.
 *   2. DENY anything under WORKSPACE_DIR/.2bot/ (bridge internals: tokens, dbs, storage).
 *   3. ALLOW everything else (node_modules, system libs, /tmp, the plugin's own dir).
 */
function isAllowed(absPath) {
  if (!absPath) return true;

  // Bridge internal: blanket deny.
  if (absPath === BRIDGE_INTERNAL || absPath.startsWith(BRIDGE_INTERNAL + path.sep)) {
    return false;
  }

  // Inside the plugins/ tree: must be inside THIS plugin's dir.
  if (absPath.startsWith(PLUGINS_ROOT + path.sep) || absPath === PLUGINS_ROOT) {
    return absPath === PLUGIN_DIR || absPath.startsWith(PLUGIN_DIR + path.sep);
  }

  // Outside plugins/ tree (node_modules, /usr, /etc, /tmp, /proc, etc.) — allow.
  return true;
}

function makeError(p, syscall) {
  const err = new Error(
    `EACCES: cross-plugin filesystem access blocked by plugin-fs-prelude (plugin=${PLUGIN_SLUG || 'unknown'}, path=${p})`,
  );
  err.code = 'EACCES';
  err.errno = -13;
  err.syscall = syscall;
  err.path = String(p);
  return err;
}

/**
 * Methods on `fs` that take a path as the first argument.
 * Two flavors: callback (last arg is fn) and sync.
 */
const PATH_METHODS = [
  'access', 'accessSync',
  'appendFile', 'appendFileSync',
  'chmod', 'chmodSync',
  'chown', 'chownSync',
  'copyFile', 'copyFileSync',
  'createReadStream',
  'createWriteStream',
  'exists', 'existsSync',
  'lchmod', 'lchmodSync',
  'lchown', 'lchownSync',
  'lstat', 'lstatSync',
  'lutimes', 'lutimesSync',
  'mkdir', 'mkdirSync',
  'mkdtemp', 'mkdtempSync',
  'open', 'openSync',
  'opendir', 'opendirSync',
  'readdir', 'readdirSync',
  'readFile', 'readFileSync',
  'readlink', 'readlinkSync',
  'realpath', 'realpathSync',
  'rm', 'rmSync',
  'rmdir', 'rmdirSync',
  'stat', 'statSync',
  'statfs', 'statfsSync',
  'symlink', 'symlinkSync',
  'truncate', 'truncateSync',
  'unlink', 'unlinkSync',
  'utimes', 'utimesSync',
  'writeFile', 'writeFileSync',
];

/**
 * Methods on `fs` that take TWO paths (rename, link, symlink dest, copyFile).
 */
const TWO_PATH_METHODS = [
  'rename', 'renameSync',
  'link', 'linkSync',
  // copyFile is single-source pre-checked above; second-path also needs check
];

function wrapSinglePath(target, name) {
  const original = target[name];
  if (typeof original !== 'function') return;

  target[name] = function patched(...args) {
    const abs = toAbsolute(args[0]);
    if (abs && !isAllowed(abs)) {
      const err = makeError(args[0], name);
      // Sync flavor: throw. Async-callback flavor: invoke the callback.
      if (name.endsWith('Sync')) throw err;
      const last = args[args.length - 1];
      if (typeof last === 'function') {
        return process.nextTick(() => last(err));
      }
      // exists() (legacy) takes a callback that receives boolean — treat as not-exists.
      if (name === 'exists') {
        return process.nextTick(() => last && last(false));
      }
      throw err;
    }
    return original.apply(this, args);
  };
}

function wrapTwoPath(target, name) {
  const original = target[name];
  if (typeof original !== 'function') return;
  target[name] = function patched(...args) {
    const a = toAbsolute(args[0]);
    const b = toAbsolute(args[1]);
    if ((a && !isAllowed(a)) || (b && !isAllowed(b))) {
      const err = makeError(a && !isAllowed(a) ? args[0] : args[1], name);
      if (name.endsWith('Sync')) throw err;
      const last = args[args.length - 1];
      if (typeof last === 'function') return process.nextTick(() => last(err));
      throw err;
    }
    return original.apply(this, args);
  };
}

// --- Patch fs (callback + sync) ---
for (const m of PATH_METHODS) wrapSinglePath(fs, m);
for (const m of TWO_PATH_METHODS) wrapTwoPath(fs, m);

// --- Patch fs.promises ---
const fsp = fs.promises;
const PROMISE_PATH_METHODS = [
  'access', 'appendFile', 'chmod', 'chown', 'copyFile',
  'lchmod', 'lchown', 'lstat', 'lutimes',
  'mkdir', 'mkdtemp', 'open', 'opendir',
  'readdir', 'readFile', 'readlink', 'realpath',
  'rm', 'rmdir', 'stat', 'statfs',
  'symlink', 'truncate', 'unlink', 'utimes',
  'writeFile',
];
const PROMISE_TWO_PATH = ['rename', 'link'];

function wrapPromiseSinglePath(target, name) {
  const original = target[name];
  if (typeof original !== 'function') return;
  target[name] = async function patched(...args) {
    const abs = toAbsolute(args[0]);
    if (abs && !isAllowed(abs)) throw makeError(args[0], name);
    return original.apply(this, args);
  };
}
function wrapPromiseTwoPath(target, name) {
  const original = target[name];
  if (typeof original !== 'function') return;
  target[name] = async function patched(...args) {
    const a = toAbsolute(args[0]);
    const b = toAbsolute(args[1]);
    if (a && !isAllowed(a)) throw makeError(args[0], name);
    if (b && !isAllowed(b)) throw makeError(args[1], name);
    return original.apply(this, args);
  };
}
for (const m of PROMISE_PATH_METHODS) wrapPromiseSinglePath(fsp, m);
for (const m of PROMISE_TWO_PATH) wrapPromiseTwoPath(fsp, m);

// --- Best-effort: patch require('node:fs/promises') alias ---
try {
  const fspAlias = require('node:fs/promises');
  if (fspAlias && fspAlias !== fsp) {
    for (const m of PROMISE_PATH_METHODS) wrapPromiseSinglePath(fspAlias, m);
    for (const m of PROMISE_TWO_PATH) wrapPromiseTwoPath(fspAlias, m);
  }
} catch {
  // Older Node — node: prefix not supported.
}

// Mark prelude active so tests / health endpoint can detect it.
process.env.PLUGIN_FS_PRELUDE_ACTIVE = '1';
